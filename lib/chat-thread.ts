/**
 * One thread model for every chat in the app: the creator thread (messages
 * table, one per creator and company) and manager chats (manager_messages:
 * team DMs and channels). Screens render ChatMessage rows and never see the
 * table they came from. The open thread listens for inserts over Realtime
 * (migration 122) and polls behind that as a fallback.
 */
import {
  getManagerChat,
  listManagerMessages,
  markChatRead,
  sendManagerMessage,
  signedChatUrl,
  uploadManagerChatMedia,
  formatVoiceDuration,
} from './manager-messages-api';
import {
  listThread,
  markCreatorThreadRead,
  parseMessageMedia,
  sendMediaMessage,
  sendMessage,
  signedChatMediaUrl,
} from './messages-api';
import type { PostEvent, PostSummary } from './post-event-labels';
import { listCreatorPostEvents, listPostSummaries, startOfCurrentWeekIso } from './post-events';
import { supabase } from './supabase';

export type ChatTarget =
  | { kind: 'creator'; creatorId: string }
  | { kind: 'manager'; chatId: string };

export type ChatPost = {
  assignmentId: string;
  title: string;
  format: 'Reel' | 'Slideshow';
  typeLabel: string;
  attempt: number;
  mediaPath: string | null;
  mediaFormat: 'video' | 'photo_carousel';
  status: string;
};

export type ChatMedia = {
  kind: 'image' | 'video' | 'voice';
  path: string;
  bucket: 'videos' | 'manager-chat';
  /** "0:34" for video and voice. */
  len: string | null;
};

export type ChatMessage = {
  id: string;
  authorId: string | null;
  authorName: string;
  mine: boolean;
  text: string;
  /** ISO time. */
  at: string;
  media: ChatMedia | null;
  post: ChatPost | null;
  /** A post event (take sent, approved, changes requested) drawn as a card with this label. */
  eventLabel: string | null;
  /** Optimistic row waiting for the server. */
  pending?: boolean;
  failed?: boolean;
};

export function chatTargetKey(target: ChatTarget): string {
  return target.kind === 'creator' ? `creator:${target.creatorId}` : `chat:${target.chatId}`;
}

export function toChatPost(s: PostSummary): ChatPost {
  return {
    assignmentId: s.assignmentId,
    title: s.title,
    format: s.format === 'photo_carousel' ? 'Slideshow' : 'Reel',
    typeLabel: s.typeLabel,
    attempt: s.attempt,
    mediaPath: s.mediaPath,
    mediaFormat: s.format,
    status: s.status,
  };
}

const EVENT_KINDS = new Set<PostEvent['kind']>(['submitted', 'sent_back', 'approved', 'live']);

async function loadCreatorThread(companyId: string, meId: string, creatorId: string): Promise<ChatMessage[]> {
  const [messages, { events, summaries }] = await Promise.all([
    listThread(companyId, creatorId),
    listCreatorPostEvents(companyId, creatorId, startOfCurrentWeekIso()),
  ]);
  const missing = messages.flatMap((m) => {
    const id = m.postRef?.assignmentId;
    return id && !summaries.has(id) ? [id] : [];
  });
  if (missing.length > 0) {
    for (const [id, summary] of await listPostSummaries(companyId, missing)) summaries.set(id, summary);
  }
  const rows: ChatMessage[] = messages.map((m) => {
    const { media, text } = parseMessageMedia(m.body);
    const summary = m.postRef?.assignmentId ? summaries.get(m.postRef.assignmentId) : undefined;
    return {
      id: `m:${m.id}`,
      authorId: m.authorId,
      authorName: m.authorId === meId ? 'You' : m.authorName,
      mine: m.authorId === meId,
      text,
      at: m.createdAt,
      media: media ? { kind: media.media, path: media.url, bucket: 'videos', len: media.len ?? null } : null,
      post: summary ? toChatPost(summary) : null,
      eventLabel: null,
    };
  });
  for (const e of events) {
    if (!EVENT_KINDS.has(e.kind)) continue;
    const summary = summaries.get(e.assignmentId);
    if (!summary) continue;
    rows.push({
      id: `e:${e.id}`,
      authorId: e.authorId,
      authorName: e.authorId === meId ? 'You' : e.authorName,
      mine: e.authorId === meId,
      text: '',
      at: e.at,
      media: null,
      post: toChatPost(summary),
      eventLabel: e.label,
    });
  }
  return rows.sort((a, b) => a.at.localeCompare(b.at));
}

async function loadManagerThread(companyId: string, meId: string, chatId: string): Promise<ChatMessage[]> {
  const messages = await listManagerMessages(chatId);
  const ids = messages.flatMap((m) => (m.postRef?.assignmentId ? [m.postRef.assignmentId] : []));
  const summaries = ids.length ? await listPostSummaries(companyId, ids) : new Map<string, PostSummary>();
  return messages.map((m) => {
    const summary = m.postRef?.assignmentId ? summaries.get(m.postRef.assignmentId) : undefined;
    const text = m.body.trim() || (m.forwardLabel ?? '');
    return {
      id: `m:${m.id}`,
      authorId: m.authorId,
      authorName: m.authorId === meId ? 'You' : m.authorName,
      mine: m.authorId === meId,
      text,
      at: m.createdAt,
      media:
        m.mediaKind && m.mediaPath
          ? { kind: m.mediaKind, path: m.mediaPath, bucket: 'manager-chat', len: m.voiceDurationMs ? formatVoiceDuration(m.voiceDurationMs) : null }
          : null,
      post: summary ? toChatPost(summary) : null,
      eventLabel: null,
    };
  });
}

export function loadChatThread(companyId: string, meId: string, target: ChatTarget): Promise<ChatMessage[]> {
  return target.kind === 'creator'
    ? loadCreatorThread(companyId, meId, target.creatorId)
    : loadManagerThread(companyId, meId, target.chatId);
}

export async function sendChatMessage(params: {
  companyId: string;
  meId: string;
  target: ChatTarget;
  text: string;
  assignmentId?: string;
}): Promise<void> {
  const { companyId, meId, target, text, assignmentId } = params;
  if (target.kind === 'creator') {
    await sendMessage({ companyId, creatorId: target.creatorId, authorId: meId, body: text, assignmentId });
    return;
  }
  await sendManagerMessage({ companyId, chatId: target.chatId, authorId: meId, body: text, assignmentId: assignmentId ?? null });
}

export async function sendChatMedia(params: {
  companyId: string;
  meId: string;
  target: ChatTarget;
  localUri: string;
  mime: string;
  video: boolean;
  durationMs?: number | null;
  caption: string;
}): Promise<void> {
  const { companyId, meId, target, localUri, mime, video, durationMs, caption } = params;
  if (target.kind === 'creator') {
    await sendMediaMessage({
      companyId,
      creatorId: target.creatorId,
      authorId: meId,
      media: video ? 'video' : 'image',
      localUri,
      contentType: mime,
      durationMs: durationMs ?? null,
      caption: caption.trim() || undefined,
    });
    return;
  }
  const ext = mime === 'video/quicktime' ? 'mov' : mime === 'video/mp4' ? 'mp4' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const path = await uploadManagerChatMedia({ companyId, chatId: target.chatId, localUri, mime, ext });
  await sendManagerMessage({
    companyId,
    chatId: target.chatId,
    authorId: meId,
    body: caption.trim(),
    mediaKind: video ? 'video' : 'image',
    mediaPath: path,
    voiceDurationMs: null,
  });
}

export function markChatThreadRead(params: { companyId: string; meId: string; target: ChatTarget }): Promise<void> {
  const { companyId, meId, target } = params;
  return target.kind === 'creator'
    ? markCreatorThreadRead({ companyId, creatorId: target.creatorId, profileId: meId })
    : markChatRead(target.chatId, meId);
}

/** Signed URL for a chat attachment; both buckets are private. */
export function chatMediaUrl(media: ChatMedia): Promise<string> {
  return media.bucket === 'videos' ? signedChatMediaUrl(media.path) : signedChatUrl(media.path);
}

/** Realtime: fires on every insert into the open thread. Needs the tables on the realtime publication (migration 122). */
export function subscribeChatThread(target: ChatTarget, onInsert: () => void): () => void {
  const table = target.kind === 'creator' ? 'messages' : 'manager_messages';
  const filter = target.kind === 'creator' ? `creator_id=eq.${target.creatorId}` : `chat_id=eq.${target.chatId}`;
  const channel = supabase
    .channel(`thread-${chatTargetKey(target)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, () => onInsert())
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export type ManagerChatHeader = {
  kind: 'dm' | 'channel' | 'brief';
  name: string;
  meta: string;
  otherId: string | null;
  otherRole: string | null;
};

/** Header facts for a manager chat: the other person for a DM, "#name" and the head count for a channel. */
export async function loadManagerChatHeader(companyId: string, meId: string, chatId: string): Promise<ManagerChatHeader | null> {
  const chat = await getManagerChat(companyId, meId, chatId);
  if (!chat) return null;
  if (chat.kind === 'dm') {
    return { kind: 'dm', name: chat.otherName ?? 'Chat', meta: chat.otherRole === 'creator' ? 'Creator' : roleWord(chat.otherRole), otherId: chat.otherId, otherRole: chat.otherRole };
  }
  const name = chat.isGeneral ? '#general' : `#${chat.name ?? 'channel'}`;
  return { kind: chat.kind, name, meta: `${chat.memberCount} people`, otherId: null, otherRole: null };
}

function roleWord(role: string | null): string {
  if (role === 'company_admin') return 'Company admin';
  if (role === 'platform_admin') return 'Platform admin';
  return 'Campaign manager';
}

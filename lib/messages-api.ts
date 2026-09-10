import { supabase } from './supabase';
import type { Database } from './types';

export type MessageRow = Database['public']['Tables']['messages']['Row'];

/** Inline post reference carried by a message via brief_id or assignment_id. */
export type MessagePostRef = {
  assignmentId: string | null;
  briefId: string;
  title: string;
  format: string;
};

export type ThreadMessage = {
  id: string;
  creatorId: string;
  authorId: string;
  authorName: string;
  fromCreator: boolean;
  body: string;
  createdAt: string;
  postRef: MessagePostRef | null;
};

type BriefRef = { id: string; title: string; format: string } | null;

type MessageJoinRow = MessageRow & {
  author: { id: string; full_name: string | null } | null;
  brief: BriefRef;
  assignment: { id: string; briefs: BriefRef } | null;
};

const THREAD_SELECT =
  '*, author:author_id ( id, full_name ), brief:brief_id ( id, title, format ), assignment:assignment_id ( id, briefs:brief_id ( id, title, format ) )';

function toPostRef(row: MessageJoinRow): MessagePostRef | null {
  if (row.assignment?.briefs) {
    return {
      assignmentId: row.assignment.id,
      briefId: row.assignment.briefs.id,
      title: row.assignment.briefs.title,
      format: row.assignment.briefs.format,
    };
  }
  if (row.brief) {
    return {
      assignmentId: null,
      briefId: row.brief.id,
      title: row.brief.title,
      format: row.brief.format,
    };
  }
  return null;
}

/** The one thread for a creator, oldest first. */
export async function listThread(
  companyId: string,
  creatorId: string,
): Promise<ThreadMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(THREAD_SELECT)
    .eq('company_id', companyId)
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as MessageJoinRow[]).map((row) => ({
    id: row.id,
    creatorId: row.creator_id,
    authorId: row.author_id,
    authorName: row.author?.full_name?.trim() || 'Someone',
    fromCreator: row.author_id === row.creator_id,
    body: row.body,
    createdAt: row.created_at,
    postRef: toPostRef(row),
  }));
}

export type CreatorInboxRow = {
  creatorId: string;
  name: string;
  preview: string;
  lastMessageAt: string | null;
  /** Messages from the creator after my read marker. */
  unread: number;
};

/**
 * One row per creator on the roster, newest conversation first, creators
 * with no messages yet after that by name. `meId` scopes the read marker and
 * the "You:" preview prefix.
 */
export async function listCreatorInbox(
  companyId: string,
  meId?: string,
): Promise<CreatorInboxRow[]> {
  const [
    { data: creators, error: creatorsError },
    { data: recent, error: recentError },
    { data: reads, error: readsError },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('company_id', companyId)
      .or('role.eq.creator,can_create.eq.true'),
    supabase
      .from('messages')
      .select('creator_id, author_id, body, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1000),
    meId !== undefined
      ? supabase
          .from('message_reads')
          .select('creator_id, last_read_at')
          .eq('company_id', companyId)
          .eq('profile_id', meId)
      : Promise.resolve({ data: [] as { creator_id: string; last_read_at: string }[], error: null }),
  ]);
  if (creatorsError) throw creatorsError;
  if (recentError) throw recentError;
  if (readsError) throw readsError;

  const lastRead = new Map((reads ?? []).map((r) => [r.creator_id, r.last_read_at]));
  const latest = new Map<string, { body: string; createdAt: string; mine: boolean }>();
  const unreadByCreator = new Map<string, number>();
  for (const row of recent ?? []) {
    if (!latest.has(row.creator_id)) {
      latest.set(row.creator_id, {
        body: row.body,
        createdAt: row.created_at,
        mine: meId !== undefined && row.author_id === meId,
      });
    }
    if (meId === undefined || row.author_id === meId) continue;
    if (row.author_id !== row.creator_id) continue;
    const at = lastRead.get(row.creator_id);
    if (at !== undefined && row.created_at <= at) continue;
    unreadByCreator.set(row.creator_id, (unreadByCreator.get(row.creator_id) ?? 0) + 1);
  }

  const rows = (creators ?? []).map((c): CreatorInboxRow => {
    const last = latest.get(c.id);
    const { media, text } = last ? parseMessageMedia(last.body) : { media: null, text: '' };
    const bit = text.trim() || (media ? (media.media === 'video' ? 'Video' : 'Photo') : '');
    const preview = last?.mine && bit ? `You: ${bit}` : bit;
    return {
      creatorId: c.id,
      name: c.full_name?.trim() || 'Creator',
      preview,
      lastMessageAt: last?.createdAt ?? null,
      unread: unreadByCreator.get(c.id) ?? 0,
    };
  });

  return rows.sort((a, b) => {
    if (a.lastMessageAt && b.lastMessageAt) return a.lastMessageAt < b.lastMessageAt ? 1 : -1;
    if (a.lastMessageAt) return -1;
    if (b.lastMessageAt) return 1;
    return a.name.localeCompare(b.name);
  });
}

// Media messages (design handoff, chat attachments). The messages table has
// no media columns, so the payload rides in body as a one-line JSON header:
// "[[media]]{json}\ncaption". Encode and decode both live here.

const MEDIA_PREFIX = '[[media]]';

/** Media carried by a message: storage path in the videos bucket plus, for video, a duration label. */
export type MessageMedia = {
  media: 'image' | 'video';
  url: string;
  len?: string;
};

function lenLabel(durationMs: number): string {
  const total = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Split a message body into its media header (if any) and the caption text. */
export function parseMessageMedia(body: string): {
  media: MessageMedia | null;
  text: string;
} {
  if (!body.startsWith(MEDIA_PREFIX)) return { media: null, text: body };
  const newline = body.indexOf('\n');
  const head = newline === -1 ? body : body.slice(0, newline);
  const text = newline === -1 ? '' : body.slice(newline + 1);
  try {
    const raw: unknown = JSON.parse(head.slice(MEDIA_PREFIX.length));
    if (raw !== null && typeof raw === 'object') {
      const candidate = raw as { media?: unknown; url?: unknown; len?: unknown };
      if (
        (candidate.media === 'image' || candidate.media === 'video') &&
        typeof candidate.url === 'string'
      ) {
        return {
          media: {
            media: candidate.media,
            url: candidate.url,
            ...(typeof candidate.len === 'string' ? { len: candidate.len } : {}),
          },
          text,
        };
      }
    }
  } catch {
    // Not a media header after all; treat the whole body as text.
  }
  return { media: null, text: body };
}

const MEDIA_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Upload a picked photo or video to the videos bucket, then send it as a media message. */
export async function sendMediaMessage(params: {
  companyId: string;
  creatorId: string;
  authorId: string;
  media: 'image' | 'video';
  localUri: string;
  contentType: string;
  durationMs?: number | null;
  caption?: string;
  assignmentId?: string;
}): Promise<void> {
  const response = await fetch(params.localUri);
  if (!response.ok) throw new Error('Could not read the file');
  const blob = await response.blob();

  const ext =
    MEDIA_EXT[params.contentType] ?? (params.media === 'video' ? 'mp4' : 'jpg');
  const path = `${params.companyId}/chat/${params.creatorId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('videos')
    .upload(path, blob, { contentType: params.contentType, upsert: false });
  if (uploadError) throw uploadError;

  const media: MessageMedia = {
    media: params.media,
    url: path,
    ...(params.media === 'video' && params.durationMs
      ? { len: lenLabel(params.durationMs) }
      : {}),
  };
  const caption = params.caption?.trim() ?? '';
  const { error } = await supabase.from('messages').insert({
    company_id: params.companyId,
    creator_id: params.creatorId,
    author_id: params.authorId,
    assignment_id: params.assignmentId ?? null,
    body: `${MEDIA_PREFIX}${JSON.stringify(media)}${caption ? `\n${caption}` : ''}`,
  });
  if (error) throw error;

  void supabase.functions.invoke('notify', {
    body: {
      creator_id: params.creatorId,
      event: 'message',
      preview: caption
        ? caption.slice(0, 120)
        : params.media === 'video'
          ? 'Sent a video'
          : 'Sent a photo',
    },
  });
}

/** Signed URL for a chat media path (videos bucket is private). */
export async function signedChatMediaUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('videos')
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/** Move my read marker for a creator thread to now. */
export async function markCreatorThreadRead(params: {
  companyId: string;
  creatorId: string;
  profileId: string;
}): Promise<void> {
  const { error } = await supabase.from('message_reads').upsert({
    company_id: params.companyId,
    creator_id: params.creatorId,
    profile_id: params.profileId,
    last_read_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Creator-thread messages from creators after my read markers, company wide. */
export async function unreadCreatorMessageCount(
  companyId: string,
  meId: string,
): Promise<number> {
  const rows = await listCreatorInbox(companyId, meId);
  return rows.reduce((sum, r) => sum + r.unread, 0);
}

/** Every message about one post, oldest first. */
export async function listPostThread(companyId: string, assignmentId: string): Promise<ThreadMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(THREAD_SELECT)
    .eq('company_id', companyId)
    .eq('assignment_id', assignmentId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as MessageJoinRow[]).map((row) => ({
    id: row.id,
    creatorId: row.creator_id,
    authorId: row.author_id,
    authorName: row.author?.full_name?.trim() || 'Someone',
    fromCreator: row.author_id === row.creator_id,
    body: row.body,
    createdAt: row.created_at,
    postRef: toPostRef(row),
  }));
}

export async function sendMessage(params: {
  companyId: string;
  creatorId: string;
  authorId: string;
  body: string;
  briefId?: string;
  assignmentId?: string;
}): Promise<void> {
  const { error } = await supabase.from('messages').insert({
    company_id: params.companyId,
    creator_id: params.creatorId,
    author_id: params.authorId,
    body: params.body,
    brief_id: params.briefId ?? null,
    assignment_id: params.assignmentId ?? null,
  });
  if (error) throw error;

  // notify routes by caller role: creator author -> admins, admin -> creator.
  void supabase.functions.invoke('notify', {
    body: {
      creator_id: params.creatorId,
      event: 'message',
      preview: params.body.trim().slice(0, 120) || 'Shared a post',
    },
  });
}

export async function isCreatorThreadMuted(
  creatorId: string,
  profileId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('chat_mutes')
    .select('creator_id')
    .eq('creator_id', creatorId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function setCreatorThreadMuted(params: {
  creatorId: string;
  profileId: string;
  companyId: string;
  muted: boolean;
}): Promise<void> {
  if (params.muted) {
    const { error } = await supabase.from('chat_mutes').insert({
      creator_id: params.creatorId,
      profile_id: params.profileId,
      company_id: params.companyId,
    });
    if (error && error.code !== '23505') throw error;
    return;
  }
  const { error } = await supabase
    .from('chat_mutes')
    .delete()
    .eq('creator_id', params.creatorId)
    .eq('profile_id', params.profileId);
  if (error) throw error;
}

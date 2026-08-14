import { listCampaignManagers, listCampaigns } from './briefs-api';
import { supabase } from './supabase';
import type { Database } from './types';

type MessageRow = Database['public']['Tables']['manager_messages']['Row'];

export type ManagerChatKind = 'brief' | 'dm';

export type InboxRow = {
  chatId: string;
  title: string;
  preview: string;
  timeLabel: string;
  unread: number;
  kind: ManagerChatKind;
  campaignId?: string;
  otherName?: string;
};

export type ManagerChatInfo = {
  id: string;
  kind: ManagerChatKind;
  title: string;
  campaignId: string | null;
  otherId: string | null;
  otherName: string | null;
};

export type ManagerMessagePostRef = {
  assignmentId: string | null;
  briefId: string;
  title: string;
};

export type ManagerMessage = {
  id: string;
  chatId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  replyTo: { authorName: string; snippet: string } | null;
  forwardLabel: string | null;
  postRef: ManagerMessagePostRef | null;
  mediaKind: 'image' | 'video' | 'voice' | null;
  mediaPath: string | null;
  voiceDurationMs: number | null;
  reactions: { emoji: string; count: number; profileIds: string[] }[];
};

export type SendManagerMessageInput = {
  companyId: string;
  chatId: string;
  authorId: string;
  body?: string;
  replyToId?: string | null;
  forwardLabel?: string | null;
  assignmentId?: string | null;
  briefId?: string | null;
  mediaKind?: 'image' | 'video' | 'voice' | null;
  mediaPath?: string | null;
  voiceDurationMs?: number | null;
};

type BriefRef = {
  id: string;
  title: string;
  post_types: { label: string } | { label: string }[] | null;
} | null;

type MessageJoinRow = MessageRow & {
  author: { full_name: string | null } | { full_name: string | null }[] | null;
  reply_to:
    | {
        body: string;
        media_kind: string | null;
        forward_label: string | null;
        author: { full_name: string | null } | { full_name: string | null }[] | null;
      }
    | {
        body: string;
        media_kind: string | null;
        forward_label: string | null;
        author: { full_name: string | null } | { full_name: string | null }[] | null;
      }[]
    | null;
  brief: BriefRef;
  assignment: { id: string; briefs: BriefRef } | { id: string; briefs: BriefRef }[] | null;
  reactions:
    | { emoji: string; profile_id: string }[]
    | { emoji: string; profile_id: string }
    | null;
};

type LatestJoin = {
  chat_id: string;
  author_id: string;
  body: string;
  created_at: string;
  media_kind: string | null;
  forward_label: string | null;
  author: { full_name: string | null } | { full_name: string | null }[] | null;
};

const MESSAGE_SELECT =
  'id, chat_id, company_id, author_id, body, created_at, reply_to_id, forward_label, assignment_id, brief_id, media_kind, media_path, voice_duration_ms, author:author_id ( full_name ), reply_to:reply_to_id ( body, media_kind, forward_label, author:author_id ( full_name ) ), brief:brief_id ( id, title, post_types ( label ) ), assignment:assignment_id ( id, briefs:brief_id ( id, title, post_types ( label ) ) ), reactions:manager_message_reactions ( emoji, profile_id )';

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function firstName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Manager';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function displayName(
  author: { full_name: string | null } | { full_name: string | null }[] | null,
): string {
  return asOne(author)?.full_name?.trim() || 'Manager';
}

function asKind(value: string): ManagerChatKind | null {
  if (value === 'brief' || value === 'dm') return value;
  return null;
}

function asMediaKind(value: string | null): 'image' | 'video' | 'voice' | null {
  if (value === 'image' || value === 'video' || value === 'voice') return value;
  return null;
}

function weekNumbers(
  campaigns: { id: string; drop_date: string | null }[],
): Map<string, number> {
  const numberById = new Map<string, number>();
  [...campaigns]
    .sort((a, b) => ((a.drop_date ?? '') < (b.drop_date ?? '') ? -1 : 1))
    .forEach((c, i) => numberById.set(c.id, i + 1));
  return numberById;
}

export function briefChatTitle(weekNumber: number): string {
  return `Week ${weekNumber} brief`;
}

export function inboxTimeLabel(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function bubbleTimeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatVoiceDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function snippetOf(row: {
  body: string;
  media_kind: string | null;
  forward_label: string | null;
}): string {
  if (row.media_kind === 'voice') return 'Voice note';
  if (row.media_kind === 'image') return row.body.trim() || 'Photo';
  if (row.media_kind === 'video') return row.body.trim() || 'Video';
  if (row.forward_label) return row.forward_label;
  const text = row.body.trim();
  if (text.length > 72) return `${text.slice(0, 71)}…`;
  return text;
}

function previewText(
  row: {
    author_id: string;
    body: string;
    media_kind: string | null;
    forward_label: string | null;
    authorName: string;
  },
  myId: string,
): string {
  const mine = row.author_id === myId;
  const name = mine ? 'You' : firstName(row.authorName);
  if (row.media_kind === 'voice') return `${name} sent a voice note`;
  if (row.forward_label) {
    return mine ? `You: ${row.forward_label}` : row.forward_label;
  }
  if (row.media_kind === 'image') {
    const caption = row.body.trim();
    const bit = caption.length > 0 ? caption : 'Sent a photo';
    return mine ? `You: ${bit}` : bit;
  }
  if (row.media_kind === 'video') {
    const caption = row.body.trim();
    const bit = caption.length > 0 ? caption : 'Sent a video';
    return mine ? `You: ${bit}` : bit;
  }
  const body = row.body.trim();
  if (body.length === 0) return '';
  return mine ? `You: ${body}` : body;
}

function postRefTitle(brief: NonNullable<BriefRef>): string {
  const typeLabel = asOne(brief.post_types)?.label?.trim();
  if (typeLabel && !brief.title.includes(typeLabel)) {
    return `${brief.title} · ${typeLabel}`;
  }
  return brief.title;
}

function toPostRef(row: MessageJoinRow): ManagerMessagePostRef | null {
  const assignment = asOne(row.assignment);
  const assignedBrief = assignment ? asOne(assignment.briefs) : null;
  if (assignment && assignedBrief) {
    return {
      assignmentId: assignment.id,
      briefId: assignedBrief.id,
      title: postRefTitle(assignedBrief),
    };
  }
  const brief = asOne(row.brief);
  if (brief) {
    return {
      assignmentId: null,
      briefId: brief.id,
      title: postRefTitle(brief),
    };
  }
  return null;
}

function groupReactions(
  raw: MessageJoinRow['reactions'],
): ManagerMessage['reactions'] {
  const list = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
  const byEmoji = new Map<string, string[]>();
  for (const row of list) {
    const ids = byEmoji.get(row.emoji) ?? [];
    ids.push(row.profile_id);
    byEmoji.set(row.emoji, ids);
  }
  return [...byEmoji.entries()].map(([emoji, profileIds]) => ({
    emoji,
    count: profileIds.length,
    profileIds,
  }));
}

async function currentProfile(): Promise<{ id: string; company_id: string } | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const user = data.user;
  if (!user) return null;
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, company_id')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.company_id) return null;
  return { id: profile.id, company_id: profile.company_id };
}

export async function getOrCreateBriefChat(
  companyId: string,
  campaignId: string,
): Promise<string> {
  const { data: existing, error: selectError } = await supabase
    .from('manager_chats')
    .select('id')
    .eq('company_id', companyId)
    .eq('kind', 'brief')
    .eq('campaign_id', campaignId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing.id;

  const { data: created, error: insertError } = await supabase
    .from('manager_chats')
    .insert({ company_id: companyId, kind: 'brief', campaign_id: campaignId })
    .select('id')
    .single();
  if (!insertError && created) return created.id;

  const { data: raced, error: raceError } = await supabase
    .from('manager_chats')
    .select('id')
    .eq('company_id', companyId)
    .eq('kind', 'brief')
    .eq('campaign_id', campaignId)
    .maybeSingle();
  if (raceError) throw raceError;
  if (raced) return raced.id;
  throw insertError ?? new Error('Could not open this brief chat');
}

export async function getOrCreateDm(
  companyId: string,
  myId: string,
  otherId: string,
): Promise<string> {
  if (myId === otherId) throw new Error('Cannot message yourself');
  const userA = myId < otherId ? myId : otherId;
  const userB = myId < otherId ? otherId : myId;

  const { data: existing, error: selectError } = await supabase
    .from('manager_chats')
    .select('id')
    .eq('company_id', companyId)
    .eq('kind', 'dm')
    .eq('user_a', userA)
    .eq('user_b', userB)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing.id;

  const { data: created, error: insertError } = await supabase
    .from('manager_chats')
    .insert({
      company_id: companyId,
      kind: 'dm',
      user_a: userA,
      user_b: userB,
    })
    .select('id')
    .single();
  if (!insertError && created) return created.id;

  const { data: raced, error: raceError } = await supabase
    .from('manager_chats')
    .select('id')
    .eq('company_id', companyId)
    .eq('kind', 'dm')
    .eq('user_a', userA)
    .eq('user_b', userB)
    .maybeSingle();
  if (raceError) throw raceError;
  if (raced) return raced.id;
  throw insertError ?? new Error('Could not open this chat');
}

export async function getManagerChat(
  companyId: string,
  myId: string,
  chatId: string,
): Promise<ManagerChatInfo | null> {
  const { data, error } = await supabase
    .from('manager_chats')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', chatId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const kind = asKind(data.kind);
  if (!kind) return null;

  if (kind === 'brief') {
    const campaigns = await listCampaigns();
    const numbers = weekNumbers(campaigns);
    const weekNumber = data.campaign_id
      ? (numbers.get(data.campaign_id) ?? 1)
      : 1;
    return {
      id: data.id,
      kind,
      title: briefChatTitle(weekNumber),
      campaignId: data.campaign_id,
      otherId: null,
      otherName: null,
    };
  }

  const otherId = data.user_a === myId ? data.user_b : data.user_a;
  const managers = await listCampaignManagers(companyId);
  const other = otherId
    ? managers.find((m) => m.id === otherId)
    : undefined;
  return {
    id: data.id,
    kind,
    title: other?.name ?? 'Manager',
    campaignId: null,
    otherId,
    otherName: other?.name ?? 'Manager',
  };
}

export async function listManagerInbox(
  companyId: string,
  myId: string,
): Promise<{ briefChats: InboxRow[]; dms: InboxRow[]; unread: number }> {
  const [campaigns, managers] = await Promise.all([
    listCampaigns(),
    listCampaignManagers(companyId),
  ]);
  const numbers = weekNumbers(campaigns);
  const others = managers.filter((m) => m.id !== myId);

  const briefPairs = await Promise.all(
    campaigns.map(async (campaign) => ({
      campaign,
      chatId: await getOrCreateBriefChat(companyId, campaign.id),
    })),
  );
  const dmPairs = await Promise.all(
    others.map(async (manager) => ({
      manager,
      chatId: await getOrCreateDm(companyId, myId, manager.id),
    })),
  );

  const chatIds = [...briefPairs.map((p) => p.chatId), ...dmPairs.map((p) => p.chatId)];
  if (chatIds.length === 0) {
    return { briefChats: [], dms: [], unread: 0 };
  }

  const [{ data: messages, error: msgError }, { data: reads, error: readError }] =
    await Promise.all([
      supabase
        .from('manager_messages')
        .select(
          'chat_id, author_id, body, created_at, media_kind, forward_label, author:author_id ( full_name )',
        )
        .eq('company_id', companyId)
        .in('chat_id', chatIds)
        .order('created_at', { ascending: false }),
      supabase
        .from('manager_chat_reads')
        .select('chat_id, last_read_at')
        .eq('profile_id', myId)
        .in('chat_id', chatIds),
    ]);
  if (msgError) throw msgError;
  if (readError) throw readError;

  const lastRead = new Map(
    (reads ?? []).map((row) => [row.chat_id, row.last_read_at]),
  );
  const latest = new Map<string, LatestJoin>();
  const unreadByChat = new Map<string, number>();
  for (const raw of (messages ?? []) as LatestJoin[]) {
    if (!latest.has(raw.chat_id)) latest.set(raw.chat_id, raw);
    if (raw.author_id === myId) continue;
    const at = lastRead.get(raw.chat_id);
    if (at !== undefined && raw.created_at <= at) continue;
    unreadByChat.set(raw.chat_id, (unreadByChat.get(raw.chat_id) ?? 0) + 1);
  }

  const toRow = (
    chatId: string,
    title: string,
    kind: ManagerChatKind,
    extra: { campaignId?: string; otherName?: string },
  ): InboxRow => {
    const last = latest.get(chatId);
    const authorName = last ? displayName(last.author) : '';
    return {
      chatId,
      title,
      preview: last
        ? previewText(
            {
              author_id: last.author_id,
              body: last.body,
              media_kind: last.media_kind,
              forward_label: last.forward_label,
              authorName,
            },
            myId,
          )
        : '',
      timeLabel: last ? inboxTimeLabel(last.created_at) : '',
      unread: unreadByChat.get(chatId) ?? 0,
      kind,
      ...extra,
    };
  };

  const briefChats = briefPairs
    .map(({ campaign, chatId }) =>
      toRow(chatId, briefChatTitle(numbers.get(campaign.id) ?? 1), 'brief', {
        campaignId: campaign.id,
      }),
    )
    .sort((a, b) => {
      const na = numbers.get(a.campaignId ?? '') ?? 0;
      const nb = numbers.get(b.campaignId ?? '') ?? 0;
      return nb - na;
    });

  const dms = dmPairs
    .map(({ manager, chatId }) =>
      toRow(chatId, manager.name, 'dm', { otherName: manager.name }),
    )
    .sort((a, b) => {
      const ta = latest.get(a.chatId)?.created_at ?? '';
      const tb = latest.get(b.chatId)?.created_at ?? '';
      if (ta !== tb) return ta < tb ? 1 : -1;
      return a.title.localeCompare(b.title);
    });

  const unread = [...unreadByChat.values()].reduce((sum, n) => sum + n, 0);
  return { briefChats, dms, unread };
}

export async function unreadManagerMessageCount(): Promise<number> {
  const me = await currentProfile();
  if (!me) return 0;

  const { data: chats, error: chatError } = await supabase
    .from('manager_chats')
    .select('id')
    .eq('company_id', me.company_id);
  if (chatError) throw chatError;
  const chatIds = (chats ?? []).map((c) => c.id);
  if (chatIds.length === 0) return 0;

  const [{ data: reads, error: readError }, { data: messages, error: msgError }] =
    await Promise.all([
      supabase
        .from('manager_chat_reads')
        .select('chat_id, last_read_at')
        .eq('profile_id', me.id)
        .in('chat_id', chatIds),
      supabase
        .from('manager_messages')
        .select('chat_id, created_at')
        .eq('company_id', me.company_id)
        .in('chat_id', chatIds)
        .neq('author_id', me.id),
    ]);
  if (readError) throw readError;
  if (msgError) throw msgError;

  const lastRead = new Map(
    (reads ?? []).map((row) => [row.chat_id, row.last_read_at]),
  );
  let unread = 0;
  for (const row of messages ?? []) {
    const at = lastRead.get(row.chat_id);
    if (at === undefined || row.created_at > at) unread += 1;
  }
  return unread;
}

export async function listManagerMessages(
  chatId: string,
): Promise<ManagerMessage[]> {
  const { data: chat, error: chatError } = await supabase
    .from('manager_chats')
    .select('id, company_id')
    .eq('id', chatId)
    .maybeSingle();
  if (chatError) throw chatError;
  if (!chat) return [];

  const { data, error } = await supabase
    .from('manager_messages')
    .select(MESSAGE_SELECT)
    .eq('company_id', chat.company_id)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  return ((data ?? []) as unknown as MessageJoinRow[]).map((row) => {
    const reply = asOne(row.reply_to);
    return {
      id: row.id,
      chatId: row.chat_id,
      authorId: row.author_id,
      authorName: displayName(row.author),
      body: row.body,
      createdAt: row.created_at,
      replyTo: reply
        ? {
            authorName: displayName(reply.author),
            snippet: snippetOf(reply),
          }
        : null,
      forwardLabel: row.forward_label,
      postRef: toPostRef(row),
      mediaKind: asMediaKind(row.media_kind),
      mediaPath: row.media_path,
      voiceDurationMs: row.voice_duration_ms,
      reactions: groupReactions(row.reactions),
    };
  });
}

export async function sendManagerMessage(
  input: SendManagerMessageInput,
): Promise<void> {
  const { error } = await supabase.from('manager_messages').insert({
    company_id: input.companyId,
    chat_id: input.chatId,
    author_id: input.authorId,
    body: input.body ?? '',
    reply_to_id: input.replyToId ?? null,
    forward_label: input.forwardLabel ?? null,
    assignment_id: input.assignmentId ?? null,
    brief_id: input.briefId ?? null,
    media_kind: input.mediaKind ?? null,
    media_path: input.mediaPath ?? null,
    voice_duration_ms: input.voiceDurationMs ?? null,
  });
  if (error) throw error;
}

export async function uploadManagerChatMedia(params: {
  companyId: string;
  localUri: string;
  mime: string;
  ext: string;
}): Promise<string> {
  const response = await fetch(params.localUri);
  if (!response.ok) throw new Error('Could not read the file');
  const blob = await response.blob();
  const path = `${params.companyId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${params.ext}`;
  const { error } = await supabase.storage.from('manager-chat').upload(path, blob, {
    contentType: params.mime,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function signedChatUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('manager-chat')
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function toggleReaction(
  messageId: string,
  profileId: string,
  emoji: string,
): Promise<void> {
  const { data: message, error: messageError } = await supabase
    .from('manager_messages')
    .select('id, company_id')
    .eq('id', messageId)
    .maybeSingle();
  if (messageError) throw messageError;
  if (!message) throw new Error('Message not found');

  const { data: existing, error: selectError } = await supabase
    .from('manager_message_reactions')
    .select('message_id')
    .eq('message_id', messageId)
    .eq('profile_id', profileId)
    .eq('emoji', emoji)
    .maybeSingle();
  if (selectError) throw selectError;

  if (existing) {
    const { error } = await supabase
      .from('manager_message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('profile_id', profileId)
      .eq('emoji', emoji);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('manager_message_reactions').insert({
    message_id: messageId,
    profile_id: profileId,
    emoji,
  });
  if (error) throw error;
}

export async function markChatRead(
  chatId: string,
  profileId: string,
): Promise<void> {
  const { data: chat, error: chatError } = await supabase
    .from('manager_chats')
    .select('id, company_id')
    .eq('id', chatId)
    .maybeSingle();
  if (chatError) throw chatError;
  if (!chat) return;

  const { error } = await supabase.from('manager_chat_reads').upsert({
    chat_id: chatId,
    profile_id: profileId,
    last_read_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export { firstName as firstNameOf };

export function managerChatMeta(
  myId: string,
  managers: { id: string; name: string }[],
): string {
  const others = managers
    .filter((m) => m.id !== myId)
    .map((m) => firstName(m.name));
  const names = ['You', ...others];
  if (names.length === 1) return 'You';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

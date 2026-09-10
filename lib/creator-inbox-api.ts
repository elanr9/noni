import { previewText } from './manager-messages-api';
import { parseMessageMedia } from './messages-api';
import { supabase } from './supabase';

export type CreatorChannelRow = {
  chatId: string;
  name: string;
  preview: string;
  lastMessageAt: string | null;
  unread: number;
};

export type CreatorTeamThread = {
  preview: string;
  lastMessageAt: string | null;
  unread: number;
};

export type CreatorInbox = {
  team: CreatorTeamThread;
  channels: CreatorChannelRow[];
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

function authorName(author: LatestJoin['author']): string {
  const one = Array.isArray(author) ? author[0] : author;
  return one?.full_name?.trim() || 'Someone';
}

/** The creator's one thread with the team: newest message and manager messages after my read marker. */
async function loadTeamThread(companyId: string, meId: string): Promise<CreatorTeamThread> {
  const [{ data: latest, error: latestError }, { data: read, error: readError }] =
    await Promise.all([
      supabase
        .from('messages')
        .select('author_id, body, created_at')
        .eq('company_id', companyId)
        .eq('creator_id', meId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('message_reads')
        .select('last_read_at')
        .eq('creator_id', meId)
        .eq('profile_id', meId)
        .maybeSingle(),
    ]);
  if (latestError) throw latestError;
  if (readError) throw readError;

  let unreadQuery = supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('creator_id', meId)
    .neq('author_id', meId);
  if (read?.last_read_at) unreadQuery = unreadQuery.gt('created_at', read.last_read_at);
  const { count, error: countError } = await unreadQuery;
  if (countError) throw countError;

  let preview = '';
  if (latest) {
    const { media, text } = parseMessageMedia(latest.body);
    const bit = text.trim() || (media ? (media.media === 'video' ? 'Video' : 'Photo') : '');
    preview = latest.author_id === meId && bit ? `You: ${bit}` : bit;
  }
  return { preview, lastMessageAt: latest?.created_at ?? null, unread: count ?? 0 };
}

/** Channels the creator can read (RLS: all_creators channels of the company), newest first. */
export async function listCreatorChannels(
  companyId: string,
  meId: string,
): Promise<CreatorChannelRow[]> {
  const { data: chats, error: chatsError } = await supabase
    .from('manager_chats')
    .select('id, name, created_at')
    .eq('company_id', companyId)
    .eq('kind', 'channel');
  if (chatsError) throw chatsError;
  const list = chats ?? [];
  if (list.length === 0) return [];
  const chatIds = list.map((c) => c.id);

  const [{ data: messages, error: msgError }, { data: reads, error: readError }] =
    await Promise.all([
      supabase
        .from('manager_messages')
        .select(
          'chat_id, author_id, body, created_at, media_kind, forward_label, author:author_id ( full_name )',
        )
        .eq('company_id', companyId)
        .in('chat_id', chatIds)
        .order('created_at', { ascending: false })
        .limit(200 * chatIds.length),
      supabase
        .from('manager_chat_reads')
        .select('chat_id, last_read_at')
        .eq('profile_id', meId)
        .in('chat_id', chatIds),
    ]);
  if (msgError) throw msgError;
  if (readError) throw readError;

  const lastRead = new Map((reads ?? []).map((r) => [r.chat_id, r.last_read_at]));
  const latest = new Map<string, LatestJoin>();
  const unreadByChat = new Map<string, number>();
  for (const raw of (messages ?? []) as unknown as LatestJoin[]) {
    if (!latest.has(raw.chat_id)) latest.set(raw.chat_id, raw);
    if (raw.author_id === meId) continue;
    const at = lastRead.get(raw.chat_id);
    if (at !== undefined && raw.created_at <= at) continue;
    unreadByChat.set(raw.chat_id, (unreadByChat.get(raw.chat_id) ?? 0) + 1);
  }

  return list
    .map((c): CreatorChannelRow => {
      const last = latest.get(c.id);
      return {
        chatId: c.id,
        name: c.name ?? 'channel',
        preview: last
          ? previewText({ ...last, authorName: authorName(last.author) }, meId, true)
          : 'No messages yet',
        lastMessageAt: last?.created_at ?? c.created_at,
        unread: unreadByChat.get(c.id) ?? 0,
      };
    })
    .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
}

export async function loadCreatorInbox(companyId: string, meId: string): Promise<CreatorInbox> {
  const [team, channels] = await Promise.all([
    loadTeamThread(companyId, meId),
    listCreatorChannels(companyId, meId),
  ]);
  return { team, channels };
}

/** Badge for the creator Messages tab: team thread plus channel unread. */
export async function unreadCreatorInboxCount(companyId: string, meId: string): Promise<number> {
  const inbox = await loadCreatorInbox(companyId, meId);
  return inbox.team.unread + inbox.channels.reduce((sum, c) => sum + c.unread, 0);
}

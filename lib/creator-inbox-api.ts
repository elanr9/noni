import { listCampaignManagers, listCampaigns } from './briefs-api';
import {
  briefChatTitle,
  getOrCreateBriefChat,
  getOrCreateDm,
  previewText,
  weekNumbers,
} from './manager-messages-api';
import { parseMessageMedia } from './messages-api';
import { supabase } from './supabase';

export type CreatorChannelRow = {
  chatId: string;
  name: string;
  preview: string;
  lastMessageAt: string | null;
  unread: number;
};

export type CreatorDmRow = {
  chatId: string;
  managerId: string;
  name: string;
  preview: string;
  lastMessageAt: string | null;
  unread: number;
};

export type CreatorBriefChatRow = {
  chatId: string;
  campaignId: string;
  title: string;
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
  dms: CreatorDmRow[];
  briefs: CreatorBriefChatRow[];
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

type ChatActivity = {
  latest: Map<string, LatestJoin>;
  unreadByChat: Map<string, number>;
};

async function loadChatActivity(
  companyId: string,
  meId: string,
  chatIds: string[],
): Promise<ChatActivity> {
  const latest = new Map<string, LatestJoin>();
  const unreadByChat = new Map<string, number>();
  if (chatIds.length === 0) return { latest, unreadByChat };

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
  for (const raw of (messages ?? []) as unknown as LatestJoin[]) {
    if (!latest.has(raw.chat_id)) latest.set(raw.chat_id, raw);
    if (raw.author_id === meId) continue;
    const at = lastRead.get(raw.chat_id);
    if (at !== undefined && raw.created_at <= at) continue;
    unreadByChat.set(raw.chat_id, (unreadByChat.get(raw.chat_id) ?? 0) + 1);
  }
  return { latest, unreadByChat };
}

function chatPreview(last: LatestJoin | undefined, meId: string, group: boolean): string {
  if (!last) return 'No messages yet';
  return previewText({ ...last, authorName: authorName(last.author) }, meId, group);
}

function byRecency<T extends { lastMessageAt: string | null }>(a: T, b: T): number {
  return (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '');
}

/** Distinct campaigns the creator has at least one assignment on. */
async function myCampaignIds(companyId: string, meId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('assignments')
    .select('campaign_id')
    .eq('company_id', companyId)
    .eq('creator_id', meId)
    .not('campaign_id', 'is', null);
  if (error) throw error;
  return [...new Set((data ?? []).map((a) => a.campaign_id).filter((id): id is string => id !== null))];
}

export async function loadCreatorInbox(companyId: string, meId: string): Promise<CreatorInbox> {
  const [team, managers, campaigns, campaignIds, { data: channelRows, error: channelError }] =
    await Promise.all([
      loadTeamThread(companyId, meId),
      listCampaignManagers(companyId),
      listCampaigns(),
      myCampaignIds(companyId, meId),
      supabase
        .from('manager_chats')
        .select('id, name, created_at')
        .eq('company_id', companyId)
        .eq('kind', 'channel'),
    ]);
  if (channelError) throw channelError;
  const channelList = channelRows ?? [];

  const [dmPairs, briefPairs] = await Promise.all([
    Promise.all(
      managers
        .filter((m) => m.id !== meId)
        .map(async (manager) => ({ manager, chatId: await getOrCreateDm(companyId, meId, manager.id) })),
    ),
    Promise.all(
      campaignIds.map(async (campaignId) => ({
        campaignId,
        chatId: await getOrCreateBriefChat(companyId, campaignId),
      })),
    ),
  ]);

  const { latest, unreadByChat } = await loadChatActivity(companyId, meId, [
    ...dmPairs.map((p) => p.chatId),
    ...briefPairs.map((p) => p.chatId),
    ...channelList.map((c) => c.id),
  ]);
  const numbers = weekNumbers(campaigns);

  const dms = dmPairs
    .map(({ manager, chatId }): CreatorDmRow => {
      const last = latest.get(chatId);
      return {
        chatId,
        managerId: manager.id,
        name: manager.name,
        preview: chatPreview(last, meId, false),
        lastMessageAt: last?.created_at ?? null,
        unread: unreadByChat.get(chatId) ?? 0,
      };
    })
    .sort(byRecency);

  const briefs = briefPairs
    .map(({ campaignId, chatId }): CreatorBriefChatRow => {
      const last = latest.get(chatId);
      return {
        chatId,
        campaignId,
        title: briefChatTitle(numbers.get(campaignId) ?? 1),
        preview: chatPreview(last, meId, true),
        lastMessageAt: last?.created_at ?? null,
        unread: unreadByChat.get(chatId) ?? 0,
      };
    })
    .sort((a, b) => (numbers.get(b.campaignId) ?? 0) - (numbers.get(a.campaignId) ?? 0));

  const channels = channelList
    .map((c): CreatorChannelRow => {
      const last = latest.get(c.id);
      return {
        chatId: c.id,
        name: c.name ?? 'channel',
        preview: chatPreview(last, meId, true),
        lastMessageAt: last?.created_at ?? c.created_at,
        unread: unreadByChat.get(c.id) ?? 0,
      };
    })
    .sort(byRecency);

  return { team, dms, briefs, channels };
}

/** Badge for the creator Messages tab: team thread plus every chat's unread. */
export async function unreadCreatorInboxCount(companyId: string, meId: string): Promise<number> {
  const inbox = await loadCreatorInbox(companyId, meId);
  const sum = (rows: { unread: number }[]) => rows.reduce((total, r) => total + r.unread, 0);
  return inbox.team.unread + sum(inbox.dms) + sum(inbox.briefs) + sum(inbox.channels);
}

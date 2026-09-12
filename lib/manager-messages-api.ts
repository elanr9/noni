import { listCampaignManagers, listCampaigns } from './briefs-api';
import { supabase } from './supabase';
import type { Database } from './types';

type MessageRow = Database['public']['Tables']['manager_messages']['Row'];

export type ManagerChatKind = 'brief' | 'dm' | 'channel';

export type InboxRow = {
  chatId: string;
  title: string;
  preview: string;
  timeLabel: string;
  lastMessageAt: string | null;
  unread: number;
  kind: ManagerChatKind;
  campaignId?: string;
  otherId?: string;
  otherName?: string;
  otherRole?: string;
  /** Channels and brief chats: slug without the leading "#". */
  name?: string;
  memberCount?: number;
  allCreators?: boolean;
};

export type ManagerChatInfo = {
  id: string;
  kind: ManagerChatKind;
  title: string;
  campaignId: string | null;
  otherId: string | null;
  otherName: string | null;
  otherRole: string | null;
  /** Channels and brief chats: slug without the leading "#". */
  name: string | null;
  memberCount: number;
  allCreators: boolean;
  createdBy: string | null;
};

export type ChannelMember = {
  id: string;
  name: string;
  role: string;
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
  if (value === 'brief' || value === 'dm' || value === 'channel') return value;
  return null;
}

function asMediaKind(value: string | null): 'image' | 'video' | 'voice' | null {
  if (value === 'image' || value === 'video' || value === 'voice') return value;
  return null;
}

export function weekNumbers(
  campaigns: { id: string; drop_date: string | null }[],
): Map<string, number> {
  const numberById = new Map<string, number>();
  [...campaigns]
    .sort((a, b) => ((a.drop_date ?? '') < (b.drop_date ?? '') ? -1 : 1))
    .forEach((c, i) => numberById.set(c.id, i + 1));
  return numberById;
}

/** Brief chats render as channels: `#week-{n}-brief`. */
export function briefChannelName(weekNumber: number): string {
  return `week-${weekNumber}-brief`;
}

export function briefChatTitle(weekNumber: number): string {
  return `#${briefChannelName(weekNumber)}`;
}

/** Lowercase, spaces to hyphens, only a-z 0-9 and hyphens. */
export function slugifyChannelName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
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

/**
 * Inbox second line. DMs prefix only my own messages with "You:"; group chats
 * (channels, brief chats) prefix every author's first name.
 */
export function previewText(
  row: {
    author_id: string;
    body: string;
    media_kind: string | null;
    forward_label: string | null;
    authorName: string;
  },
  myId: string,
  prefixAuthor = false,
): string {
  const mine = row.author_id === myId;
  const name = mine ? 'You' : firstName(row.authorName);
  const withName = (bit: string): string =>
    mine || prefixAuthor ? `${name}: ${bit}` : bit;
  if (row.media_kind === 'voice') return `${name} sent a voice note`;
  if (row.forward_label) return withName(row.forward_label);
  if (row.media_kind === 'image') return withName(row.body.trim() || 'Photo');
  if (row.media_kind === 'video') return withName(row.body.trim() || 'Video');
  const body = row.body.trim();
  if (body.length === 0) return '';
  return withName(body);
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

type PersonJoin = { full_name: string | null; role: string } | { full_name: string | null; role: string }[] | null;

type DmRow = {
  id: string;
  user_a: string | null;
  user_b: string | null;
  profile_a: PersonJoin;
  profile_b: PersonJoin;
};

const DM_JOINS = 'profile_a:user_a ( full_name, role ), profile_b:user_b ( full_name, role )';
const DM_SELECT = `id, user_a, user_b, ${DM_JOINS}`;

function dmOther(row: DmRow, myId: string): { id: string; name: string; role: string } {
  const otherIsA = row.user_b === myId;
  const id = (otherIsA ? row.user_a : row.user_b) ?? '';
  const person = asOne(otherIsA ? row.profile_a : row.profile_b);
  const role = person?.role ?? 'campaign_manager';
  return {
    id,
    name: person?.full_name?.trim() || (role === 'creator' ? 'Creator' : 'Manager'),
    role,
  };
}

/** Creators with at least one assignment on the campaign, by campaign id. */
async function assignedCreatorsByCampaign(
  companyId: string,
  campaignIds: string[],
): Promise<Map<string, ChannelMember[]>> {
  const out = new Map<string, ChannelMember[]>();
  if (campaignIds.length === 0) return out;
  const { data, error } = await supabase
    .from('assignments')
    .select('campaign_id, creator_id, profiles:creator_id ( full_name, role )')
    .eq('company_id', companyId)
    .in('campaign_id', campaignIds);
  if (error) throw error;
  type Row = { campaign_id: string | null; creator_id: string; profiles: PersonJoin };
  for (const row of (data ?? []) as unknown as Row[]) {
    if (!row.campaign_id) continue;
    const list = out.get(row.campaign_id) ?? [];
    if (list.some((m) => m.id === row.creator_id)) continue;
    const p = asOne(row.profiles);
    list.push({ id: row.creator_id, name: p?.full_name?.trim() || 'Creator', role: p?.role ?? 'creator' });
    out.set(row.campaign_id, list);
  }
  return out;
}

/** Everyone in a brief chat: managers and the admin plus creators assigned to the campaign. */
export async function listBriefChatMembers(
  companyId: string,
  campaignId: string,
): Promise<ChannelMember[]> {
  const [managers, creators] = await Promise.all([
    listCampaignManagers(companyId),
    assignedCreatorsByCampaign(companyId, [campaignId]),
  ]);
  return [
    ...managers.map((m) => ({ id: m.id, name: m.name, role: 'campaign_manager' })),
    ...(creators.get(campaignId) ?? []),
  ];
}

export async function getManagerChat(
  companyId: string,
  myId: string,
  chatId: string,
): Promise<ManagerChatInfo | null> {
  const { data, error } = await supabase
    .from('manager_chats')
    .select(`*, ${DM_JOINS}`)
    .eq('company_id', companyId)
    .eq('id', chatId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const kind = asKind(data.kind);
  if (!kind) return null;

  if (kind === 'brief') {
    const [campaigns, members] = await Promise.all([
      listCampaigns(),
      data.campaign_id ? listBriefChatMembers(companyId, data.campaign_id) : Promise.resolve([]),
    ]);
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
      otherRole: null,
      name: briefChannelName(weekNumber),
      memberCount: members.length,
      allCreators: false,
      createdBy: null,
    };
  }

  if (kind === 'channel') {
    const members = await listChannelMembers(chatId);
    return {
      id: data.id,
      kind,
      title: `#${data.name ?? 'channel'}`,
      campaignId: null,
      otherId: null,
      otherName: null,
      otherRole: null,
      name: data.name,
      memberCount: members.length,
      allCreators: data.all_creators,
      createdBy: data.created_by,
    };
  }

  const other = dmOther(data as unknown as DmRow, myId);
  return {
    id: data.id,
    kind,
    title: other.name,
    campaignId: null,
    otherId: other.id,
    otherName: other.name,
    otherRole: other.role,
    name: null,
    memberCount: 2,
    allCreators: false,
    createdBy: null,
  };
}

type ChannelRow = {
  id: string;
  name: string | null;
  all_creators: boolean;
  created_at: string;
  created_by: string | null;
  members: { profile_id: string }[] | { profile_id: string } | null;
};

export async function listManagerInbox(
  companyId: string,
  myId: string,
): Promise<{
  briefChats: InboxRow[];
  dms: InboxRow[];
  channels: InboxRow[];
  unread: number;
}> {
  const [campaigns, managers, { data: channelRows, error: channelError }] = await Promise.all([
    listCampaigns(),
    listCampaignManagers(companyId),
    supabase
      .from('manager_chats')
      .select('id, name, all_creators, created_at, created_by, members:manager_chat_members ( profile_id )')
      .eq('company_id', companyId)
      .eq('kind', 'channel'),
  ]);
  if (channelError) throw channelError;
  const channelList = (channelRows ?? []) as unknown as ChannelRow[];
  const numbers = weekNumbers(campaigns);
  const others = managers.filter((m) => m.id !== myId);

  const [briefPairs, creatorsByCampaign] = await Promise.all([
    Promise.all(
      campaigns.map(async (campaign) => ({
        campaign,
        chatId: await getOrCreateBriefChat(companyId, campaign.id),
      })),
    ),
    assignedCreatorsByCampaign(companyId, campaigns.map((c) => c.id)),
  ]);
  await Promise.all(others.map((manager) => getOrCreateDm(companyId, myId, manager.id)));
  const { data: dmRows, error: dmError } = await supabase
    .from('manager_chats')
    .select(DM_SELECT)
    .eq('company_id', companyId)
    .eq('kind', 'dm')
    .or(`user_a.eq.${myId},user_b.eq.${myId}`);
  if (dmError) throw dmError;
  const dmPairs = ((dmRows ?? []) as unknown as DmRow[]).map((row) => ({
    other: dmOther(row, myId),
    chatId: row.id,
  }));

  const chatIds = [
    ...briefPairs.map((p) => p.chatId),
    ...dmPairs.map((p) => p.chatId),
    ...channelList.map((c) => c.id),
  ];
  if (chatIds.length === 0) {
    return { briefChats: [], dms: [], channels: [], unread: 0 };
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
    extra: {
      campaignId?: string;
      otherId?: string;
      otherName?: string;
      otherRole?: string;
      name?: string;
      memberCount?: number;
      allCreators?: boolean;
    },
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
            kind !== 'dm',
          )
        : '',
      timeLabel: last ? inboxTimeLabel(last.created_at) : '',
      lastMessageAt: last?.created_at ?? null,
      unread: unreadByChat.get(chatId) ?? 0,
      kind,
      ...extra,
    };
  };

  const briefChats = briefPairs
    .map(({ campaign, chatId }) => {
      const n = numbers.get(campaign.id) ?? 1;
      return toRow(chatId, briefChatTitle(n), 'brief', {
        campaignId: campaign.id,
        name: briefChannelName(n),
        memberCount: managers.length + (creatorsByCampaign.get(campaign.id)?.length ?? 0),
        allCreators: false,
      });
    })
    .sort((a, b) => {
      const na = numbers.get(a.campaignId ?? '') ?? 0;
      const nb = numbers.get(b.campaignId ?? '') ?? 0;
      return nb - na;
    });

  const byRecency = (a: InboxRow, b: InboxRow): number => {
    const ta = a.lastMessageAt ?? '';
    const tb = b.lastMessageAt ?? '';
    if (ta !== tb) return ta < tb ? 1 : -1;
    return a.title.localeCompare(b.title);
  };

  const dms = dmPairs
    .map(({ other, chatId }) =>
      toRow(chatId, other.name, 'dm', { otherId: other.id, otherName: other.name, otherRole: other.role }),
    )
    .sort(byRecency);

  const channels = channelList
    .map((c) => {
      const members = c.members == null ? [] : Array.isArray(c.members) ? c.members : [c.members];
      return toRow(c.id, `#${c.name ?? 'channel'}`, 'channel', {
        name: c.name ?? 'channel',
        memberCount: members.length,
        allCreators: c.all_creators,
      });
    })
    .map((row) => {
      const channel = channelList.find((c) => c.id === row.chatId);
      if (row.lastMessageAt !== null || channel === undefined) return row;
      const creator = others.find((m) => m.id === channel.created_by);
      const preview =
        channel.created_by === myId || creator === undefined
          ? 'You created this channel.'
          : `${firstName(creator.name)} created this channel.`;
      return { ...row, lastMessageAt: channel.created_at, timeLabel: inboxTimeLabel(channel.created_at), preview };
    })
    .sort(byRecency);

  const unread = [...unreadByChat.values()].reduce((sum, n) => sum + n, 0);
  return { briefChats, dms, channels, unread };
}

// --- Channels ---------------------------------------------------------------

export async function createChannel(params: {
  companyId: string;
  myId: string;
  name: string;
  memberIds: string[];
  allCreators: boolean;
}): Promise<string> {
  const name = slugifyChannelName(params.name);
  if (name.length === 0) throw new Error('Give the channel a name');
  const { data, error } = await supabase
    .from('manager_chats')
    .insert({
      company_id: params.companyId,
      kind: 'channel',
      name,
      all_creators: params.allCreators,
      created_by: params.myId,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error(`#${name} already exists`);
    throw error;
  }
  const ids = [...new Set([params.myId, ...params.memberIds])];
  const { error: memberError } = await supabase
    .from('manager_chat_members')
    .insert(ids.map((profile_id) => ({ chat_id: data.id, profile_id })));
  if (memberError) throw memberError;
  return data.id;
}

export async function listChannelMembers(chatId: string): Promise<ChannelMember[]> {
  const { data, error } = await supabase
    .from('manager_chat_members')
    .select('profile_id, profiles:profile_id ( id, full_name, role )')
    .eq('chat_id', chatId);
  if (error) throw error;
  type Row = {
    profile_id: string;
    profiles: { id: string; full_name: string | null; role: string } | { id: string; full_name: string | null; role: string }[] | null;
  };
  return ((data ?? []) as unknown as Row[])
    .map((row) => {
      const p = asOne(row.profiles);
      return {
        id: row.profile_id,
        name: p?.full_name?.trim() || 'Manager',
        role: p?.role ?? 'campaign_manager',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function addChannelMembers(chatId: string, profileIds: string[]): Promise<void> {
  if (profileIds.length === 0) return;
  const { error } = await supabase
    .from('manager_chat_members')
    .upsert(profileIds.map((profile_id) => ({ chat_id: chatId, profile_id })), {
      onConflict: 'chat_id,profile_id',
      ignoreDuplicates: true,
    });
  if (error) throw error;
}

export async function setChannelAllCreators(chatId: string, allCreators: boolean): Promise<void> {
  const { error } = await supabase
    .from('manager_chats')
    .update({ all_creators: allCreators })
    .eq('id', chatId)
    .eq('kind', 'channel');
  if (error) throw error;
}

export async function leaveChannel(chatId: string, profileId: string): Promise<void> {
  const { error } = await supabase
    .from('manager_chat_members')
    .delete()
    .eq('chat_id', chatId)
    .eq('profile_id', profileId);
  if (error) throw error;
}

/** Role label for a team member row: "Admin" or "Campaign manager". */
export function roleLabel(role: string): string {
  if (role === 'company_admin' || role === 'admin') return 'Admin';
  if (role === 'creator') return 'Creator';
  return 'Campaign manager';
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

  void supabase.functions.invoke('notify', {
    body: {
      event: 'manager_message',
      chat_id: input.chatId,
      preview: notifyPreview(input),
    },
  });
}

function notifyPreview(input: SendManagerMessageInput): string {
  const body = (input.body ?? '').trim();
  if (body.length > 0) return body.slice(0, 120);
  if (input.mediaKind === 'image') return 'Sent a photo';
  if (input.mediaKind === 'video') return 'Sent a video';
  if (input.mediaKind === 'voice') return 'Sent a voice note';
  if (input.assignmentId || input.briefId) return 'Shared a post';
  return 'New message';
}

export async function isChatMuted(
  chatId: string,
  profileId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('chat_mutes')
    .select('chat_id')
    .eq('chat_id', chatId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function setChatMuted(params: {
  chatId: string;
  profileId: string;
  companyId: string;
  muted: boolean;
}): Promise<void> {
  if (params.muted) {
    const { error } = await supabase.from('chat_mutes').insert({
      chat_id: params.chatId,
      profile_id: params.profileId,
      company_id: params.companyId,
    });
    if (error && error.code !== '23505') throw error;
    return;
  }
  const { error } = await supabase
    .from('chat_mutes')
    .delete()
    .eq('chat_id', params.chatId)
    .eq('profile_id', params.profileId);
  if (error) throw error;
}

export async function uploadManagerChatMedia(params: {
  companyId: string;
  chatId: string;
  localUri: string;
  mime: string;
  ext: string;
}): Promise<string> {
  const response = await fetch(params.localUri);
  if (!response.ok) throw new Error('Could not read the file');
  const blob = await response.blob();
  const path = `${params.companyId}/${params.chatId}/${Date.now()}-${Math.random()
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

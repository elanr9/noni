// The Messages inbox in one call (ANALYTICS_AND_MESSAGES_HANDOFF 2.7).
// Fans out to the review queue, creator threads, manager chats and the team
// roster so the screen only renders.

import { latestSubmissionsByAssignment, listAssignmentQueue } from './admin-api';
import { formatAge, formatLengthLabel } from './admin-queue-map';
import { listManagerInbox, roleLabel, type InboxRow } from './manager-messages-api';
import { listCreatorInbox } from './messages-api';
import { supabase } from './supabase';

export type QueueInboxRow = {
  assignmentId: string;
  submissionId: string | null;
  title: string;
  format: 'video' | 'photo_carousel';
  creatorId: string;
  creatorShort: string;
  typeLabel: string;
  lengthLabel: string;
  attempt: number;
  ageLabel: string;
  submittedAt: string;
  mediaPath: string | null;
};

export type DmInboxRow = {
  id: string;
  kind: 'creator' | 'member';
  /** Creator id for creators; chat id for team DMs. */
  targetId: string;
  personId: string;
  name: string;
  role: string | null;
  preview: string;
  lastMessageAt: string | null;
  timeLabel: string;
  unread: number;
  online: boolean;
};

export type Inbox = {
  queue: QueueInboxRow[];
  dms: DmInboxRow[];
  channels: InboxRow[];
  unreadTotal: number;
  team: TeamMember[];
  approvedCreatorCount: number;
};

export type TeamMember = { id: string; name: string; role: string; roleLabel: string };

export function shortName(full: string): string {
  const trimmed = full.trim();
  if (trimmed.length === 0) return 'Creator';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

/** Inbox row time: `14m ago`, `2h ago`, `Yesterday`, else a short date. */
export function inboxAge(iso: string | null): string {
  if (iso === null) return '';
  return formatAge(iso);
}

/** Campaign managers and the company admin, with role labels. */
export async function listTeam(companyId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('company_id', companyId)
    .in('role', ['campaign_manager', 'company_admin'])
    .order('full_name');
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.full_name?.trim() || 'Manager',
    role: p.role,
    roleLabel: roleLabel(p.role),
  }));
}

async function loadQueue(companyId: string): Promise<QueueInboxRow[]> {
  const queue = await listAssignmentQueue();
  const mine = queue.filter((a) => a.company_id === companyId);
  const subs = await latestSubmissionsByAssignment(mine.map((a) => a.id));
  const typeIds = [...new Set(mine.map((a) => a.briefs.post_type_id).filter((x): x is string => x !== null))];
  const labels = new Map<string, string>();
  if (typeIds.length > 0) {
    const { data, error } = await supabase.from('post_types').select('id, label').in('id', typeIds);
    if (error) throw error;
    for (const row of data ?? []) labels.set(row.id, row.label);
  }
  return mine
    .map((a): QueueInboxRow => {
      const submission = subs.get(a.id) ?? null;
      const format = a.briefs.format === 'photo_carousel' ? 'photo_carousel' : 'video';
      const submittedAt = submission?.created_at ?? a.created_at ?? new Date(0).toISOString();
      return {
        assignmentId: a.id,
        submissionId: submission?.id ?? null,
        title: a.briefs.title,
        format,
        creatorId: a.creator_id,
        creatorShort: shortName(a.profiles?.full_name ?? ''),
        typeLabel:
          (a.briefs.post_type_id !== null ? labels.get(a.briefs.post_type_id) : undefined) ??
          (format === 'video' ? 'Reel' : 'Slideshow'),
        lengthLabel: formatLengthLabel(format, submission?.duration_seconds, null),
        attempt: submission?.version ?? 1,
        ageLabel: formatAge(submittedAt),
        submittedAt,
        mediaPath: submission?.video_path ?? null,
      };
    })
    .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
}

export async function loadInbox(
  companyId: string,
  meId: string,
  online: ReadonlySet<string> = new Set(),
): Promise<Inbox> {
  const [queue, creators, manager, team, { count: approvedCount }] = await Promise.all([
    loadQueue(companyId),
    listCreatorInbox(companyId, meId),
    listManagerInbox(companyId, meId),
    listTeam(companyId),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .or('role.eq.creator,can_create.eq.true'),
  ]);

  const creatorDms: DmInboxRow[] = creators.map((c) => ({
    id: `creator:${c.creatorId}`,
    kind: 'creator',
    targetId: c.creatorId,
    personId: c.creatorId,
    name: c.name,
    role: null,
    preview: c.preview,
    lastMessageAt: c.lastMessageAt,
    timeLabel: inboxAge(c.lastMessageAt),
    unread: c.unread,
    online: online.has(c.creatorId),
  }));

  const memberDms: DmInboxRow[] = manager.dms.map((d) => {
    const member = team.find((t) => t.id === d.otherId);
    return {
      id: `dm:${d.chatId}`,
      kind: 'member',
      targetId: d.chatId,
      personId: d.otherId ?? d.chatId,
      name: d.otherName ?? d.title,
      role: member?.roleLabel ?? 'Campaign manager',
      preview: d.preview,
      lastMessageAt: d.lastMessageAt,
      timeLabel: inboxAge(d.lastMessageAt),
      unread: d.unread,
      online: false,
    };
  });

  const dms = [...creatorDms, ...memberDms].sort((a, b) => {
    if (a.lastMessageAt && b.lastMessageAt) return a.lastMessageAt < b.lastMessageAt ? 1 : -1;
    if (a.lastMessageAt) return -1;
    if (b.lastMessageAt) return 1;
    return a.name.localeCompare(b.name);
  });

  const channels = [...manager.channels, ...manager.briefChats]
    .map((c) => ({ ...c, timeLabel: inboxAge(c.lastMessageAt) }))
    .sort((a, b) => {
    const ta = a.lastMessageAt ?? '';
    const tb = b.lastMessageAt ?? '';
    if (ta !== tb) return ta < tb ? 1 : -1;
    return a.title.localeCompare(b.title);
  });

  const unreadTotal =
    creators.reduce((sum, c) => sum + c.unread, 0) +
    manager.dms.reduce((sum, d) => sum + d.unread, 0) +
    channels.reduce((sum, c) => sum + c.unread, 0);

  return {
    queue,
    dms,
    channels,
    unreadTotal,
    team,
    approvedCreatorCount: approvedCount ?? 0,
  };
}

/** Tab badge: creator thread unread + team DM unread + channel unread. */
export async function unreadInboxCount(): Promise<number> {
  const { data, error } = await supabase.rpc('unread_inbox_count');
  if (error) throw error;
  return data ?? 0;
}

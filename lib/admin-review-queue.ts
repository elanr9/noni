/**
 * The manager's Review queue for the active company: submitted posts, songs
 * waiting on approval and accounts pending review. One store so the Review
 * root, the per-creator queue, the post player and the tab badge agree, and
 * so an approval can drop an item optimistically and put it back on error.
 *
 *   const { posts, load, removePost } = useReviewQueue();
 *   const restore = removePost(id);   // optimistic
 *   try { await approve() } catch { restore(); toast.error(...) }
 */
import { create } from 'zustand';

import {
  latestSubmissionsByAssignment,
  listAssignmentQueue,
  listMusicApprovalQueue,
  submissionThumbPath,
  type MusicApprovalItem,
} from './admin-api';
import { formatAge, isEditing } from './admin-queue-map';
import { listAccountApprovalQueue, type AccountApprovalItem } from './creator-accounts-api';
import { supabase } from './supabase';

export type ReviewPost = {
  /** Assignment id. */
  id: string;
  creatorId: string;
  creatorName: string;
  title: string;
  format: 'Reel' | 'Slideshow';
  /** Storage path for the thumb (edited file once rendered, else the first clip or slide). */
  mediaPath: string | null;
  mediaFormat: 'video' | 'photo_carousel';
  /** Submission version; above 1 means a retake. */
  take: number;
  submittedAt: string | null;
  ageLabel: string;
};

export type ReviewCreatorGroup = {
  creatorId: string;
  name: string;
  photo: string | null;
  posts: ReviewPost[];
};

type Status = 'idle' | 'loading' | 'ready' | 'error';

type ReviewQueueState = {
  companyId: string | null;
  status: Status;
  error: string | null;
  posts: ReviewPost[];
  music: MusicApprovalItem[];
  /** Pending accounts first, then sent-back ones waiting on the creator. */
  accounts: AccountApprovalItem[];
  /** Signed avatar URL by creator id; null when the creator has no photo. */
  avatars: Record<string, string | null>;
  /** Creators on the roster (any account state); null until known. 0 means a brand-new company. */
  creatorCount: number | null;
  /** Loads (or reloads) the queue. `quiet` keeps the current lists on screen. */
  load: (companyId: string, opts?: { quiet?: boolean }) => Promise<void>;
  /** Removes a post now; call the returned function to put it back. */
  removePost: (id: string) => () => void;
  removeMusic: (assignmentId: string) => () => void;
  removeAccount: (accountId: string) => () => void;
};

/** Signed avatar URLs for creators in a company's roster. */
export async function creatorAvatars(companyId: string, creatorIds: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  if (creatorIds.length === 0) return out;
  const { data } = await supabase
    .from('company_roster')
    .select('id, avatar_path')
    .eq('company_id', companyId)
    .in('id', creatorIds);
  const rows = (data ?? []) as { id: string | null; avatar_path: string | null }[];
  const paths = rows.map((r) => r.avatar_path).filter((p): p is string => !!p);
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls } = await supabase.storage.from('avatars').createSignedUrls(paths, 3600);
    for (const e of urls ?? []) if (e.path && e.signedUrl) signed.set(e.path, e.signedUrl);
  }
  for (const id of creatorIds) out[id] = null;
  for (const r of rows) if (r.id) out[r.id] = r.avatar_path ? (signed.get(r.avatar_path) ?? null) : null;
  return out;
}

/** Creators on a company's roster, approved or not. */
export async function rosterCreatorCount(companyId: string): Promise<number> {
  const { count, error } = await supabase
    .from('company_roster')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .or('member_role.eq.creator,can_create.eq.true');
  if (error) throw error;
  return count ?? 0;
}

/** Puts `item` back at its old index (or the end) unless it is already there. */
function reinsert<T>(list: T[], item: T, index: number, same: (a: T) => boolean): T[] {
  if (list.some(same)) return list;
  const next = list.slice();
  next.splice(Math.min(index, next.length), 0, item);
  return next;
}

export const useReviewQueue = create<ReviewQueueState>((set, get) => ({
  companyId: null,
  status: 'idle',
  error: null,
  posts: [],
  music: [],
  accounts: [],
  avatars: {},
  creatorCount: null,

  async load(companyId, opts) {
    const switched = get().companyId !== companyId;
    if (switched) set({ companyId, posts: [], music: [], accounts: [], avatars: {}, creatorCount: null, status: 'loading', error: null });
    else if (!opts?.quiet) set({ status: 'loading', error: null });
    void rosterCreatorCount(companyId)
      .then((n) => {
        if (get().companyId === companyId) set({ creatorCount: n });
      })
      .catch(() => undefined);
    try {
      const [queue, music, accounts] = await Promise.all([
        listAssignmentQueue(companyId),
        listMusicApprovalQueue(companyId),
        listAccountApprovalQueue(companyId),
      ]);
      const subs = await latestSubmissionsByAssignment(queue.map((a) => a.id));
      const posts: ReviewPost[] = queue
        // A post still in the edit pass has nothing to watch yet; it shows up once the render lands.
        .filter((a) => !isEditing(subs.get(a.id) ?? null))
        .map((a) => {
          const sub = subs.get(a.id) ?? null;
          const slideshow = a.briefs.format === 'photo_carousel';
          return {
            id: a.id,
            creatorId: a.creator_id,
            creatorName: a.profiles?.full_name?.trim() || 'Creator',
            title: a.briefs.title,
            format: slideshow ? 'Slideshow' : 'Reel',
            mediaPath: sub ? submissionThumbPath(sub) : null,
            mediaFormat: slideshow ? 'photo_carousel' : 'video',
            take: sub?.version ?? 1,
            submittedAt: sub?.created_at ?? a.created_at,
            ageLabel: formatAge(sub?.created_at ?? a.created_at),
          };
        });
      const sortedAccounts = accounts
        .slice()
        .sort((a, b) => Number(a.status === 'needs_changes') - Number(b.status === 'needs_changes'));
      if (get().companyId !== companyId) return;
      set({ posts, music, accounts: sortedAccounts, status: 'ready', error: null });
      const ids = Array.from(
        new Set([
          ...posts.map((p) => p.creatorId),
          ...music.map((m) => m.assignment.creator_id),
          ...accounts.map((a) => a.creator_id),
        ]),
      );
      void creatorAvatars(companyId, ids)
        .then((avatars) => {
          if (get().companyId === companyId) set({ avatars: { ...get().avatars, ...avatars } });
        })
        .catch(() => undefined);
    } catch (e) {
      if (get().companyId !== companyId) return;
      set({ status: 'error', error: e instanceof Error ? e.message : 'Could not load the queue' });
    }
  },

  removePost(id) {
    const index = get().posts.findIndex((p) => p.id === id);
    const item = get().posts[index];
    if (!item) return () => undefined;
    set({ posts: get().posts.filter((p) => p.id !== id) });
    return () => set({ posts: reinsert(get().posts, item, index, (p) => p.id === id) });
  },

  removeMusic(assignmentId) {
    const index = get().music.findIndex((m) => m.assignment.id === assignmentId);
    const item = get().music[index];
    if (!item) return () => undefined;
    set({ music: get().music.filter((m) => m.assignment.id !== assignmentId) });
    return () => set({ music: reinsert(get().music, item, index, (m) => m.assignment.id === assignmentId) });
  },

  removeAccount(accountId) {
    const index = get().accounts.findIndex((a) => a.id === accountId);
    const item = get().accounts[index];
    if (!item) return () => undefined;
    set({ accounts: get().accounts.filter((a) => a.id !== accountId) });
    return () => set({ accounts: reinsert(get().accounts, item, index, (a) => a.id === accountId) });
  },
}));

/** Accounts a manager still has to decide (sent-back ones wait on the creator). */
export function pendingAccounts(accounts: AccountApprovalItem[]): AccountApprovalItem[] {
  return accounts.filter((a) => a.status !== 'needs_changes');
}

/** Everything the manager owes: the Review chip and the tab badge. */
export function reviewTotal(s: Pick<ReviewQueueState, 'posts' | 'music' | 'accounts'>): number {
  return s.posts.length + s.music.length + pendingAccounts(s.accounts).length;
}

/** One group per creator with posts waiting, oldest submission first inside, most waiting first. */
export function groupByCreator(posts: ReviewPost[], avatars: Record<string, string | null>): ReviewCreatorGroup[] {
  const groups = new Map<string, ReviewCreatorGroup>();
  for (const p of posts) {
    const g = groups.get(p.creatorId) ?? { creatorId: p.creatorId, name: p.creatorName, photo: avatars[p.creatorId] ?? null, posts: [] };
    g.posts.push(p);
    groups.set(p.creatorId, g);
  }
  const out = Array.from(groups.values());
  for (const g of out) g.posts.sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''));
  return out.sort((a, b) => b.posts.length - a.posts.length || a.name.localeCompare(b.name));
}

/** "Maya Lopez" to "Maya". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

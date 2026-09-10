import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { latestSubmissionsByAssignment } from './admin-api';
import { useAuth } from './auth';
import { supabase } from './supabase';
import type { Assignment, TaskStatus } from './tasks';
import { listMyAssignments, type AssignmentWithBrief } from './tasks-api';

/**
 * The single source of truth for every creator surface (FLOWS §"queue state
 * lives in the shell"). Home, Posts and Messages all derive from this list;
 * realtime changes on assignments propagate to all of them at once.
 */

/** Home status dot colors (README color coding). Admin keeps lib/tasks statusColor. */
export function statusDotColor(status: TaskStatus): string {
  switch (status) {
    case 'assigned':
      return '#8EC9F5';
    case 'recorded':
    case 'submitted':
    case 'changes_requested':
      return '#E08A16';
    case 'approved':
    case 'posted':
      return '#1F8F5F';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** Local-timezone YYYY-MM-DD, matching assignments.scheduled_date. */
export function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

/**
 * Posting times in America/New_York, set by the publish cron from how many
 * posts the creator has that day. slotIndex is the rank within the day.
 */
const SLOT_TIMES_BY_COUNT: Record<number, readonly string[]> = {
  1: ['12:00 PM'],
  2: ['12:00 PM', '6:00 PM'],
  3: ['10:00 AM', '2:00 PM', '7:00 PM'],
};

export function slotTimeLabel(slotIndex: number, totalThatDay: number): string {
  const times =
    SLOT_TIMES_BY_COUNT[Math.min(Math.max(totalThatDay, 1), 3)] ??
    SLOT_TIMES_BY_COUNT[3];
  const rank = Math.min(Math.max(slotIndex, 0), times.length - 1);
  return times[rank] ?? times[times.length - 1] ?? '12:00 PM';
}

const NY_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
});

/** Exact publish_at when Approve stamped it, else the slot rule above. */
export function publishTimeLabel(
  assignment: Pick<Assignment, 'slot_index' | 'publish_at'>,
  totalThatDay: number,
): string {
  if (assignment.publish_at !== null) {
    const d = new Date(assignment.publish_at);
    if (!Number.isNaN(d.getTime())) return NY_TIME.format(d);
  }
  return slotTimeLabel(assignment.slot_index, totalThatDay);
}

export function countOnDate(
  assignments: readonly Pick<Assignment, 'scheduled_date'>[],
  scheduledDate: string,
): number {
  return assignments.filter((a) => a.scheduled_date === scheduledDate).length;
}

const OPEN_STATUSES = new Set<TaskStatus>(['assigned', 'changes_requested']);

/** Past 8 weeks through next week. */
const WINDOW_PAST_DAYS = 56;
const WINDOW_FUTURE_DAYS = 7;

export type CreatorQueueCounts = {
  /** Today's changes_requested. */
  toFix: number;
  /** Today's not-yet-shot (assigned). */
  toShoot: number;
  totalToday: number;
};

export type CreatorQueueState = {
  assignments: AssignmentWithBrief[];
  /** assignment id -> latest submission's first media path (Reel or slide 1), for thumbs. */
  mediaPaths: Map<string, string>;
  loading: boolean;
  refetch: () => Promise<void>;
  /** Optimistic merge after a transition or swap; realtime confirms later. */
  applyLocal: (updated: Assignment | AssignmentWithBrief) => void;
  /** Today's assignments sorted by slot_index. */
  todayAssignments: AssignmentWithBrief[];
  assignmentsForDate: (date: string) => AssignmentWithBrief[];
  /** Everything in changes_requested, any day. */
  changesRequested: AssignmentWithBrief[];
  /** Today's open slots (assigned or changes_requested), sorted by slot_index. */
  openToday: AssignmentWithBrief[];
  counts: CreatorQueueCounts;
};

const CreatorQueueContext = createContext<CreatorQueueState | null>(null);

function windowBounds(): { from: string; to: string } {
  const from = new Date();
  from.setDate(from.getDate() - WINDOW_PAST_DAYS);
  const to = new Date();
  to.setDate(to.getDate() + WINDOW_FUTURE_DAYS);
  return { from: dayKey(from), to: dayKey(to) };
}

export function CreatorQueueProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const creatorId = profile?.id ?? null;
  const companyId = profile?.company_id ?? null;

  const [assignments, setAssignments] = useState<AssignmentWithBrief[]>([]);
  const [mediaPaths, setMediaPaths] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const refetchSeq = useRef(0);

  const refetch = useCallback(async () => {
    if (creatorId === null || companyId === null) {
      refetchSeq.current += 1;
      setAssignments([]);
      setMediaPaths(new Map());
      setLoading(false);
      return;
    }
    const seq = ++refetchSeq.current;
    try {
      const all = await listMyAssignments(companyId, creatorId);
      if (seq !== refetchSeq.current) return;
      const { from, to } = windowBounds();
      const inWindow = all.filter((a) => a.scheduled_date >= from && a.scheduled_date <= to);
      setAssignments(inWindow);
      void latestSubmissionsByAssignment(inWindow.map((a) => a.id))
        .then((subs) => {
          if (seq !== refetchSeq.current) return;
          setMediaPaths(new Map([...subs].map(([id, sub]) => [id, sub.video_path])));
        })
        .catch(() => undefined);
    } catch {
      // Keep the last good list; screens surface refresh errors themselves.
    } finally {
      if (seq === refetchSeq.current) setLoading(false);
    }
  }, [creatorId, companyId]);

  useEffect(() => {
    setLoading(true);
    void refetch();
  }, [refetch]);

  // F5: status changes propagate live to Home, Posts and Messages at once.
  useEffect(() => {
    if (creatorId === null) return;
    const channel = supabase
      .channel(`creator-queue-${creatorId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'assignments',
          filter: `creator_id=eq.${creatorId}`,
        },
        () => {
          void refetch();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [creatorId, refetch]);

  const applyLocal = useCallback((updated: Assignment | AssignmentWithBrief) => {
    setAssignments((prev) =>
      prev.map((a) => {
        if (a.id !== updated.id) return a;
        const briefs = 'briefs' in updated ? updated.briefs : a.briefs;
        return { ...a, ...updated, briefs };
      }),
    );
  }, []);

  const todayKey = dayKey(new Date());

  const todayAssignments = useMemo(
    () =>
      assignments
        .filter((a) => a.scheduled_date === todayKey)
        .sort((a, b) => a.slot_index - b.slot_index),
    [assignments, todayKey],
  );

  const assignmentsForDate = useCallback(
    (date: string) =>
      assignments
        .filter((a) => a.scheduled_date === date)
        .sort((a, b) => a.slot_index - b.slot_index),
    [assignments],
  );

  const changesRequested = useMemo(
    () => assignments.filter((a) => a.status === 'changes_requested'),
    [assignments],
  );

  const openToday = useMemo(
    () => todayAssignments.filter((a) => OPEN_STATUSES.has(a.status)),
    [todayAssignments],
  );

  const counts = useMemo<CreatorQueueCounts>(
    () => ({
      toFix: todayAssignments.filter((a) => a.status === 'changes_requested').length,
      toShoot: todayAssignments.filter((a) => a.status === 'assigned').length,
      totalToday: todayAssignments.length,
    }),
    [todayAssignments],
  );

  const value = useMemo<CreatorQueueState>(
    () => ({
      assignments,
      mediaPaths,
      loading,
      refetch,
      applyLocal,
      todayAssignments,
      assignmentsForDate,
      changesRequested,
      openToday,
      counts,
    }),
    [
      assignments,
      mediaPaths,
      loading,
      refetch,
      applyLocal,
      todayAssignments,
      assignmentsForDate,
      changesRequested,
      openToday,
      counts,
    ],
  );

  return (
    <CreatorQueueContext.Provider value={value}>
      {children}
    </CreatorQueueContext.Provider>
  );
}

export function useCreatorQueue(): CreatorQueueState {
  const ctx = useContext(CreatorQueueContext);
  if (ctx === null) {
    throw new Error('useCreatorQueue must be used inside CreatorQueueProvider');
  }
  return ctx;
}

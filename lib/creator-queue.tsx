import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

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
 * Display time for a slot. The schema has no per-slot time; these are the
 * design's canonical posting times (SCREENS §1 PostPager).
 */
const SLOT_TIMES = ['08:30', '13:00', '18:45'] as const;

export function slotTimeLabel(slotIndex: number): string {
  return SLOT_TIMES[slotIndex] ?? `Post ${slotIndex + 1}`;
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

  const [assignments, setAssignments] = useState<AssignmentWithBrief[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (creatorId === null) {
      setAssignments([]);
      setLoading(false);
      return;
    }
    try {
      const all = await listMyAssignments(creatorId);
      const { from, to } = windowBounds();
      setAssignments(
        all.filter((a) => a.scheduled_date >= from && a.scheduled_date <= to),
      );
    } catch {
      // Keep the last good list; screens surface refresh errors themselves.
    } finally {
      setLoading(false);
    }
  }, [creatorId]);

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

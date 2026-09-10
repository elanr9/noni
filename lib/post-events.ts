// Post history, derived at read time (ANALYTICS_AND_MESSAGES_HANDOFF 2.9).
// Nothing here is stored: assignments, submissions, review_events and posts
// are mapped onto the five card states plus plain review comments.

import {
  ASSIGNMENT_SELECT,
  buildPostEvents,
  toSummary,
  type AssignmentJoin,
  type PostEvent,
  type PostLite,
  type PostSummary,
  type ReviewEventLite,
  type SubmissionLite,
} from './post-event-labels';
import { supabase } from './supabase';

export * from './post-event-labels';

async function loadFor(
  assignments: AssignmentJoin[],
  inPostThread: boolean,
): Promise<{ events: PostEvent[]; summaries: Map<string, PostSummary> }> {
  if (assignments.length === 0) return { events: [], summaries: new Map() };
  const ids = assignments.map((a) => a.id);
  const [{ data: subs, error: subError }, { data: posts, error: postError }] = await Promise.all([
    supabase
      .from('submissions')
      .select('id, assignment_id, version, created_at, duration_seconds, segment_paths, video_path')
      .in('assignment_id', ids),
    supabase.from('posts').select('id, assignment_id, posted_at').in('assignment_id', ids),
  ]);
  if (subError) throw subError;
  if (postError) throw postError;

  const submissionIds = (subs ?? []).map((s) => s.id);
  const postIds = (posts ?? []).map((p) => p.id);
  const [{ data: reviews, error: reviewError }, { data: metrics, error: metricsError }] =
    await Promise.all([
      submissionIds.length > 0
        ? supabase
            .from('review_events')
            .select(
              'id, submission_id, author_id, action, note, notes, created_at, profiles!review_events_author_id_fkey ( full_name )',
            )
            .in('submission_id', submissionIds)
        : Promise.resolve({ data: [] as ReviewEventLite[], error: null }),
      postIds.length > 0
        ? supabase
            .from('post_metrics')
            .select('post_id, views, fetched_at')
            .in('post_id', postIds)
            .order('fetched_at', { ascending: false })
        : Promise.resolve({ data: [] as { post_id: string; views: number | null; fetched_at: string | null }[], error: null }),
    ]);
  if (reviewError) throw reviewError;
  if (metricsError) throw metricsError;

  const viewsByPost = new Map<string, number>();
  for (const m of metrics ?? []) {
    if (!viewsByPost.has(m.post_id) && m.views !== null) viewsByPost.set(m.post_id, m.views);
  }

  return buildPostEvents({
    assignments,
    submissions: (subs ?? []) as SubmissionLite[],
    reviewEvents: (reviews ?? []) as unknown as ReviewEventLite[],
    posts: (posts ?? []) as PostLite[],
    viewsByPost,
    managerNames: new Map(),
    inPostThread,
  });
}

/** Every event for one post, oldest first, plus the card summary. */
export async function listPostEvents(
  companyId: string,
  assignmentId: string,
): Promise<{ events: PostEvent[]; summary: PostSummary | null }> {
  const { data, error } = await supabase
    .from('assignments')
    .select(ASSIGNMENT_SELECT)
    .eq('company_id', companyId)
    .eq('id', assignmentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { events: [], summary: null };
  const { events, summaries } = await loadFor([data as unknown as AssignmentJoin], true);
  return { events, summary: summaries.get(assignmentId) ?? null };
}

/**
 * Events for every post of one creator. Assigned events are kept only for
 * assignments scheduled on or after `assignedSince` (current and next week)
 * so old threads are not flooded; every other event always shows.
 */
export async function listCreatorPostEvents(
  companyId: string,
  creatorId: string,
  assignedSince: string,
): Promise<{ events: PostEvent[]; summaries: Map<string, PostSummary> }> {
  const { data, error } = await supabase
    .from('assignments')
    .select(ASSIGNMENT_SELECT)
    .eq('company_id', companyId)
    .eq('creator_id', creatorId)
    .order('scheduled_date', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as AssignmentJoin[];
  const { events, summaries } = await loadFor(rows, false);
  const since = assignedSince.slice(0, 10);
  const kept = events.filter((e) => {
    if (e.kind !== 'assigned') return true;
    const summary = summaries.get(e.assignmentId);
    return summary !== undefined && summary.scheduledDate >= since;
  });
  return { events: kept, summaries };
}

/** Summaries only, for cards attached to plain messages. */
export async function listPostSummaries(
  companyId: string,
  assignmentIds: string[],
): Promise<Map<string, PostSummary>> {
  const ids = [...new Set(assignmentIds)];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from('assignments')
    .select(ASSIGNMENT_SELECT)
    .eq('company_id', companyId)
    .in('id', ids);
  if (error) throw error;
  const rows = (data ?? []) as unknown as AssignmentJoin[];
  const { data: subs, error: subError } = await supabase
    .from('submissions')
    .select('id, assignment_id, version, created_at, duration_seconds, segment_paths, video_path')
    .in('assignment_id', ids)
    .order('version', { ascending: false });
  if (subError) throw subError;
  const latest = new Map<string, SubmissionLite>();
  for (const s of (subs ?? []) as SubmissionLite[]) {
    if (s.assignment_id !== null && !latest.has(s.assignment_id)) latest.set(s.assignment_id, s);
  }
  return new Map(rows.map((a) => [a.id, toSummary(a, latest.get(a.id))]));
}

/** Monday of the current week as YYYY-MM-DD, the cutoff for assigned events. */
export function startOfCurrentWeekIso(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

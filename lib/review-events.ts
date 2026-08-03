import { supabase } from './supabase';

export type ReviewAction = 'approved' | 'changes_requested' | 'comment';

export type ReviewEvent = {
  id: string;
  submission_id: string;
  author_id: string;
  action: ReviewAction;
  note: string | null;
  created_at: string;
  profiles: { id: string; full_name: string | null; role: string } | null;
};

/** All review_events across every submission for a task, oldest first. */
export async function listTaskReviewEvents(
  taskId: string,
): Promise<ReviewEvent[]> {
  const { data: subs, error: subError } = await supabase
    .from('submissions')
    .select('id')
    .eq('task_id', taskId);
  if (subError) throw subError;
  const ids = (subs ?? []).map((s) => s.id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('review_events')
    .select('*, profiles!review_events_author_id_fkey ( id, full_name, role )')
    .in('submission_id', ids)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReviewEvent[];
}

/** All review_events across every submission for an assignment, oldest first. */
export async function listAssignmentReviewEvents(
  assignmentId: string,
): Promise<ReviewEvent[]> {
  const { data: subs, error: subError } = await supabase
    .from('submissions')
    .select('id')
    .eq('assignment_id', assignmentId);
  if (subError) throw subError;
  const ids = (subs ?? []).map((s) => s.id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('review_events')
    .select('*, profiles!review_events_author_id_fkey ( id, full_name, role )')
    .in('submission_id', ids)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReviewEvent[];
}

/** Plain comment — never flips a status. Notify prefers the assignment key. */
export async function insertComment(params: {
  submissionId: string;
  authorId: string;
  note: string;
  taskId?: string;
  assignmentId?: string;
}): Promise<void> {
  const note = params.note.trim();
  if (!note) throw new Error('Comment cannot be empty');

  const { error } = await supabase.from('review_events').insert({
    submission_id: params.submissionId,
    author_id: params.authorId,
    action: 'comment',
    note,
  });
  if (error) throw error;

  if (params.assignmentId !== undefined) {
    void supabase.functions.invoke('notify', {
      body: { assignment_id: params.assignmentId, event: 'comment' },
    });
  } else if (params.taskId !== undefined) {
    void supabase.functions.invoke('notify', {
      body: { task_id: params.taskId, event: 'comment' },
    });
  }
}

export function latestChangesNote(
  events: ReviewEvent[],
): string | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e.action === 'changes_requested' && e.note?.trim()) return e.note.trim();
  }
  return null;
}

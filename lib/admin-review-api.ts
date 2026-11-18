import { supabase } from './supabase';
import {
  latestSubmissionsByAssignment,
  listAssignmentQueue,
  type AssignmentQueueItem,
  type Submission,
} from './admin-api';
import { asNotes, parseNotes, type PostNote } from './post-event-labels';

/** One assignment as the review player needs it, whatever its status. */
export type ReviewTarget = {
  assignment: AssignmentQueueItem;
  submission: Submission | null;
  /** Signed avatar URL for the creator, when they set one. */
  creatorPhoto: string | null;
};

const SELECT = '*, briefs:brief_id (*), profiles:creator_id ( id, full_name, avatar_path )';

type Row = AssignmentQueueItem & { profiles: (AssignmentQueueItem['profiles'] & { avatar_path?: string | null }) | null };

async function signAvatar(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from('avatars').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** The assignment behind a review link plus its latest submission. Null when it is gone or not visible. */
export async function getAssignmentForReview(id: string): Promise<ReviewTarget | null> {
  const { data, error } = await supabase.from('assignments').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as Row;
  const [subs, creatorPhoto] = await Promise.all([
    latestSubmissionsByAssignment([row.id]),
    signAvatar(row.profiles?.avatar_path).catch(() => null),
  ]);
  return { assignment: row, submission: subs.get(row.id) ?? null, creatorPhoto };
}

/**
 * Submitted posts in the same company, optionally narrowed to one creator or
 * brief, oldest first. The player uses it to know what is left after a decision.
 */
export async function listReviewSiblings(params: {
  companyId: string;
  creatorId?: string;
  briefId?: string;
}): Promise<AssignmentQueueItem[]> {
  const all = await listAssignmentQueue();
  return all.filter(
    (a) =>
      a.company_id === params.companyId &&
      (params.creatorId === undefined || a.creator_id === params.creatorId) &&
      (params.briefId === undefined || a.brief_id === params.briefId),
  );
}

/** Notes from the latest send back on a submission, for the read-only changes view. */
export async function latestSentBackNotes(submissionId: string): Promise<PostNote[]> {
  const { data, error } = await supabase
    .from('review_events')
    .select('note, notes, action, created_at')
    .eq('submission_id', submissionId)
    .eq('action', 'changes_requested')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return [];
  return asNotes(data.notes) ?? parseNotes(data.note);
}

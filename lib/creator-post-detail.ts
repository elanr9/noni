/**
 * Everything the creator's post detail shows for one assignment: the post
 * and its brief, the latest submission (media, render state, sound) and the
 * manager's review notes, oldest first.
 */
import { parsePostAudio } from './edit-document';
import type { PostAudio } from './brief-library';
import { listAssignmentReviewEvents, type ReviewEvent } from './review-events';
import { supabase } from './supabase';
import { getAssignment, type AssignmentWithBrief } from './tasks-api';

export type CreatorPostSubmission = {
  id: string;
  version: number;
  createdAt: string | null;
  renderStatus: string | null;
  renderError: string | null;
  audio: PostAudio | null;
};

export type CreatorPostDetail = {
  assignment: AssignmentWithBrief;
  slideshow: boolean;
  submission: CreatorPostSubmission | null;
  /** Signed URLs: one video, or each slide in order. Empty before anything was sent. */
  media: string[];
  /** The edit is still being put together on the server; media shows the raw take. */
  rendering: boolean;
  events: ReviewEvent[];
};

type SubmissionRow = {
  id: string;
  version: number | null;
  created_at: string | null;
  video_path: string | null;
  segment_paths: string[] | null;
  render_status: string | null;
  render_error: string | null;
  audio: unknown;
};

async function signAll(paths: string[]): Promise<string[]> {
  const clean = paths.filter((p) => !!p);
  if (clean.length === 0) return [];
  const local = clean.filter((p) => !/^https?:/.test(p));
  const signed = new Map<string, string>();
  if (local.length) {
    const { data } = await supabase.storage.from('videos').createSignedUrls(local, 3600);
    for (const e of data ?? []) if (e.path && e.signedUrl) signed.set(e.path, e.signedUrl);
  }
  return clean.map((p) => (/^https?:/.test(p) ? p : (signed.get(p) ?? ''))).filter(Boolean);
}

export async function loadCreatorPostDetail(companyId: string, assignmentId: string): Promise<CreatorPostDetail | null> {
  const assignment = await getAssignment(companyId, assignmentId);
  if (!assignment) return null;
  const slideshow = assignment.briefs?.format === 'photo_carousel';

  const columns = 'id, version, created_at, video_path, segment_paths, render_status, render_error, audio';
  const subRes = assignment.submission_id
    ? await supabase.from('submissions').select(columns).eq('id', assignment.submission_id).maybeSingle()
    : await supabase.from('submissions').select(columns).eq('assignment_id', assignmentId).order('version', { ascending: false }).limit(1).maybeSingle();
  if (subRes.error) throw subRes.error;
  const row = (subRes.data ?? null) as SubmissionRow | null;

  const events = row ? await listAssignmentReviewEvents(assignmentId).catch(() => [] as ReviewEvent[]) : [];
  let media: string[] = [];
  let rendering = false;
  if (row) {
    const ready = row.render_status === 'ready';
    rendering = !ready && row.render_status !== 'failed';
    const segments = (row.segment_paths ?? []).filter((p): p is string => typeof p === 'string');
    const paths = slideshow ? (segments.length ? segments : row.video_path ? [row.video_path] : []) : ready && row.video_path ? [row.video_path] : segments.slice(0, 1).length ? segments.slice(0, 1) : row.video_path ? [row.video_path] : [];
    media = await signAll(paths).catch(() => []);
  }

  return {
    assignment,
    slideshow,
    submission: row
      ? { id: row.id, version: row.version ?? 1, createdAt: row.created_at, renderStatus: row.render_status, renderError: row.render_error, audio: parsePostAudio(row.audio) }
      : null,
    media,
    rendering,
    events,
  };
}

import { createVideoPlayer } from 'expo-video';

import { supabase } from './supabase';
import { transitionAssignment, transitionTask } from './tasks-api';
import type { Assignment, ContentTask, TaskStatus } from './tasks';

async function nextVersion(column: 'task_id' | 'assignment_id', id: string): Promise<number> {
  const { data, error } = await supabase
    .from('submissions')
    .select('version')
    .eq(column, id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data?.version ?? 0) + 1;
}

export type RecordedSegment = {
  uri: string;
  durationMs: number;
};

const PROBE_TIMEOUT_MS = 4_000;

/**
 * Real media duration of a recorded clip. The wall-clock durationMs from the
 * record screen includes camera start latency; overlay timing on the render
 * timeline is absolute, so probe the file itself and fall back to wall clock.
 */
export async function probeDurationMs(uri: string, fallbackMs: number): Promise<number> {
  const player = createVideoPlayer(uri);
  try {
    const seconds = await new Promise<number>((resolve) => {
      if (player.status === 'readyToPlay') {
        resolve(player.duration);
        return;
      }
      const timeout = setTimeout(() => resolve(0), PROBE_TIMEOUT_MS);
      const sub = player.addListener('statusChange', ({ status }) => {
        if (status === 'readyToPlay' || status === 'error') {
          clearTimeout(timeout);
          sub.remove();
          resolve(status === 'readyToPlay' ? player.duration : 0);
        }
      });
    });
    return seconds > 0 ? Math.round(seconds * 1000) : fallbackMs;
  } finally {
    player.release();
  }
}

/**
 * One submission_segments row per clip, slot order matching upload order.
 * brief_segment_id links each clip to its render manifest row when the brief
 * has segments; legacy briefs and content_tasks leave it null.
 */
async function insertSubmissionSegments(params: {
  companyId: string;
  submissionId: string;
  briefId: string | null;
  paths: string[];
  durationsMs: (number | null)[];
}): Promise<void> {
  const { companyId, submissionId, briefId, paths, durationsMs } = params;

  let briefSegmentIds: (string | null)[] = paths.map(() => null);
  if (briefId) {
    const { data, error } = await supabase
      .from('brief_segments')
      .select('id, slot_index')
      .eq('brief_id', briefId)
      .order('slot_index', { ascending: true });
    if (error) throw error;
    briefSegmentIds = paths.map((_p, i) => data?.[i]?.id ?? null);
  }

  const rows = paths.map((path, i) => ({
    company_id: companyId,
    submission_id: submissionId,
    brief_segment_id: briefSegmentIds[i],
    slot_index: i,
    storage_path: path,
    duration_ms: durationsMs[i],
    status: 'submitted',
  }));

  const { error } = await supabase.from('submission_segments').insert(rows);
  if (error) throw error;
}

/**
 * Kick the edit pass (stitch + overlays) for a freshly submitted video so the
 * finished file is ready by the time the admin reviews it. Fire and forget:
 * the function claims the job and keeps working after it responds, and the
 * admin review screen can restart a job that never landed.
 */
function startRender(submissionId: string): void {
  void supabase.functions
    .invoke('render-submission', { body: { submission_id: submissionId } })
    .catch(() => undefined);
}

export async function uploadClip(localUri: string, path: string): Promise<void> {
  const response = await fetch(localUri);
  if (!response.ok) {
    throw new Error('Could not read the recorded video');
  }
  const blob = await response.blob();

  const { error } = await supabase.storage.from('videos').upload(path, blob, {
    contentType: 'video/mp4',
    upsert: false,
  });
  if (error) throw error;
}

/**
 * Path for a kept clip uploaded between takes. Same videos bucket and
 * company/assignment folder the submit paths use; the draft prefix and
 * timestamp keep retakes from ever colliding with a versioned submit path.
 */
export function draftClipPath(
  companyId: string,
  assignmentId: string,
  slotIndex: number,
): string {
  return `${companyId}/${assignmentId}/draft-${slotIndex}-${Date.now()}.mp4`;
}

export async function submitRecording(params: {
  task: ContentTask;
  companyId: string;
  creatorId: string;
  segments: RecordedSegment[];
}): Promise<ContentTask> {
  const { task, companyId, creatorId, segments } = params;
  if (segments.length === 0) {
    throw new Error('Nothing recorded yet');
  }
  const version = await nextVersion('task_id', task.id);

  // Single clip keeps the spec path. Multi-segment clips get an ordered
  // suffix; render-submission stitches them into one video right after submit.
  const paths =
    segments.length === 1
      ? [`${companyId}/${task.id}/${version}.mp4`]
      : segments.map((_s, i) => `${companyId}/${task.id}/${version}-${i + 1}.mp4`);

  for (let i = 0; i < segments.length; i++) {
    await uploadClip(segments[i].uri, paths[i]);
  }

  const durationsMs = await Promise.all(
    segments.map((s) => probeDurationMs(s.uri, s.durationMs)),
  );
  const durationSeconds = Math.max(
    1,
    Math.round(durationsMs.reduce((sum, d) => sum + d, 0) / 1000),
  );

  const { data: submission, error: insertError } = await supabase
    .from('submissions')
    .insert({
      task_id: task.id,
      creator_id: creatorId,
      video_path: paths[0],
      segment_paths: paths,
      duration_seconds: durationSeconds,
      version,
    })
    .select('id')
    .single();

  if (insertError) throw insertError;

  await insertSubmissionSegments({
    companyId,
    submissionId: submission.id,
    briefId: null,
    paths,
    durationsMs,
  });

  let current: TaskStatus = task.status;
  let updated = task;

  if (current === 'assigned' || current === 'changes_requested') {
    updated = await transitionTask(task.id, current, 'recorded');
    current = 'recorded';
  }

  if (current === 'recorded') {
    updated = await transitionTask(task.id, 'recorded', 'submitted');
  }

  startRender(submission.id);
  return updated;
}

async function createAssignmentSubmission(params: {
  assignment: Assignment;
  companyId: string;
  creatorId: string;
  version: number;
  paths: string[];
  durationsMs: (number | null)[];
  durationSeconds: number | null;
  format: 'video' | 'photo';
}): Promise<Assignment> {
  const { assignment, companyId, creatorId, version, paths, durationsMs, durationSeconds } =
    params;

  const { data: submission, error: insertError } = await supabase
    .from('submissions')
    .insert({
      assignment_id: assignment.id,
      creator_id: creatorId,
      video_path: paths[0],
      segment_paths: paths,
      duration_seconds: durationSeconds,
      version,
      // Both formats go through the edit pass: videos stitch and burn
      // overlays, photos get the admin's text and pictures baked onto each
      // slide so the reviewed file is the posted file.
      render_status: 'queued',
    })
    .select('id')
    .single();

  if (insertError) throw insertError;

  await insertSubmissionSegments({
    companyId,
    submissionId: submission.id,
    briefId: assignment.brief_id,
    paths,
    durationsMs,
  });

  const { error: linkError } = await supabase
    .from('assignments')
    .update({ submission_id: submission.id })
    .eq('id', assignment.id);
  if (linkError) throw linkError;

  let current: TaskStatus = assignment.status;
  let updated = assignment;

  if (current === 'assigned' || current === 'changes_requested') {
    updated = await transitionAssignment(assignment.id, current, 'recorded');
    current = 'recorded';
  }

  if (current === 'recorded') {
    updated = await transitionAssignment(assignment.id, 'recorded', 'submitted');
  }

  startRender(submission.id);
  return updated;
}

/** A kept clip that already lives in the videos bucket (drafted per clip). */
export type UploadedClip = {
  slotIndex: number;
  storagePath: string;
  durationMs: number;
};

/**
 * Submit an assignment recording from clips uploaded clip by clip during the
 * per-clip flow. Nothing is re-uploaded: segment_paths point at the drafted
 * files. Status hops go through transitionAssignment as always.
 */
export async function submitAssignmentClips(params: {
  assignment: Assignment;
  companyId: string;
  creatorId: string;
  clips: UploadedClip[];
}): Promise<Assignment> {
  const { assignment, companyId, creatorId } = params;
  const clips = [...params.clips].sort((a, b) => a.slotIndex - b.slotIndex);
  if (clips.length === 0) {
    throw new Error('Nothing recorded yet');
  }

  const version = await nextVersion('assignment_id', assignment.id);
  const paths = clips.map((c) => c.storagePath);
  const durationsMs = clips.map((c) => c.durationMs);
  const durationSeconds = Math.max(
    1,
    Math.round(durationsMs.reduce((sum, d) => sum + d, 0) / 1000),
  );

  return createAssignmentSubmission({
    assignment,
    companyId,
    creatorId,
    version,
    paths,
    durationsMs,
    durationSeconds,
    format: 'video',
  });
}

export type PickedPhoto = {
  uri: string;
  mimeType: string | null;
};

function photoExtension(mimeType: string | null): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

async function uploadPhoto(photo: PickedPhoto, path: string): Promise<void> {
  const response = await fetch(photo.uri);
  if (!response.ok) {
    throw new Error('Could not read the selected photo');
  }
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from('videos')
    .upload(path, blob, {
      contentType: photo.mimeType ?? 'image/jpeg',
      upsert: false,
    });
  if (error) throw error;
}

/**
 * Static post submit: one photo per slide, in slide order, uploaded to the
 * videos bucket beside the video segments (migration 034 allows image mime
 * types there). segment_paths carry the image paths; post-approved posts
 * them as a photo carousel via Upload-Post's upload_photos endpoint.
 */
export async function submitAssignmentPhotos(params: {
  assignment: Assignment;
  companyId: string;
  creatorId: string;
  photos: PickedPhoto[];
}): Promise<Assignment> {
  const { assignment, companyId, creatorId, photos } = params;
  if (photos.length === 0) {
    throw new Error('No photos picked yet');
  }

  const version = await nextVersion('assignment_id', assignment.id);
  const paths = photos.map(
    (p, i) =>
      `${companyId}/${assignment.id}/${version}-slide-${i + 1}.${photoExtension(p.mimeType)}`,
  );

  for (let i = 0; i < photos.length; i++) {
    await uploadPhoto(photos[i], paths[i]);
  }

  return createAssignmentSubmission({
    assignment,
    companyId,
    creatorId,
    version,
    paths,
    durationsMs: paths.map(() => null),
    durationSeconds: null,
    format: 'photo',
  });
}

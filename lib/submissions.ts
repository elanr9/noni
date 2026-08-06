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
async function probeDurationMs(uri: string, fallbackMs: number): Promise<number> {
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
  durationsMs: number[];
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

async function uploadClip(localUri: string, path: string): Promise<void> {
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
  // suffix; post-approved stitches them into one video at approve time.
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

  return updated;
}

/**
 * Assignment flavor of submitRecording: same storage layout keyed on the
 * assignment id, submission linked via assignment_id, and every status hop
 * through transitionAssignment.
 */
export async function submitAssignmentRecording(params: {
  assignment: Assignment;
  companyId: string;
  creatorId: string;
  segments: RecordedSegment[];
}): Promise<Assignment> {
  const { assignment, companyId, creatorId, segments } = params;
  if (segments.length === 0) {
    throw new Error('Nothing recorded yet');
  }
  const version = await nextVersion('assignment_id', assignment.id);

  const paths =
    segments.length === 1
      ? [`${companyId}/${assignment.id}/${version}.mp4`]
      : segments.map(
          (_s, i) => `${companyId}/${assignment.id}/${version}-${i + 1}.mp4`,
        );

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
      assignment_id: assignment.id,
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

  return updated;
}

import { supabase } from './supabase';
import { transitionTask } from './tasks-api';
import type { ContentTask, TaskStatus } from './tasks';

async function nextVersion(taskId: string): Promise<number> {
  const { data, error } = await supabase
    .from('submissions')
    .select('version')
    .eq('task_id', taskId)
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
  const version = await nextVersion(task.id);

  // Single clip keeps the spec path. Multi-segment clips get an ordered
  // suffix; post-approved stitches them into one video at approve time.
  const paths =
    segments.length === 1
      ? [`${companyId}/${task.id}/${version}.mp4`]
      : segments.map((_s, i) => `${companyId}/${task.id}/${version}-${i + 1}.mp4`);

  for (let i = 0; i < segments.length; i++) {
    await uploadClip(segments[i].uri, paths[i]);
  }

  const durationSeconds = Math.max(
    1,
    Math.round(segments.reduce((sum, s) => sum + s.durationMs, 0) / 1000),
  );

  const { error: insertError } = await supabase.from('submissions').insert({
    task_id: task.id,
    creator_id: creatorId,
    video_path: paths[0],
    segment_paths: paths,
    duration_seconds: durationSeconds,
    version,
  });

  if (insertError) throw insertError;

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

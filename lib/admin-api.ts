import { supabase } from './supabase';
import { assertTransition, type ContentTask, type TaskStatus } from './tasks';
import type { Profile } from './profile';
import type { Database } from './types';

export type TrendItem = Database['public']['Tables']['trend_items']['Row'];

export type TaskDraft = {
  title: string;
  hook: string;
  script: string;
  caption: string;
  brief: string;
  format: 'video' | 'photo_carousel';
  estimatedSeconds: number;
};

export type Submission = {
  id: string;
  task_id: string;
  creator_id: string;
  video_path: string;
  duration_seconds: number | null;
  version: number | null;
  created_at: string | null;
};

export type QueueItem = ContentTask & {
  profiles: Pick<Profile, 'id' | 'full_name'> | null;
};

export async function listQueue(): Promise<QueueItem[]> {
  const { data, error } = await supabase
    .from('content_tasks')
    .select('*, profiles!content_tasks_assigned_to_fkey ( id, full_name )')
    .eq('status', 'submitted')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as QueueItem[];
}

export async function listAllTasks(): Promise<QueueItem[]> {
  const { data, error } = await supabase
    .from('content_tasks')
    .select('*, profiles!content_tasks_assigned_to_fkey ( id, full_name )')
    .order('due_date', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as QueueItem[];
}

export async function latestSubmission(
  taskId: string,
): Promise<Submission | null> {
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('task_id', taskId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Submission | null;
}

export async function signedVideoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('videos')
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function reviewTask(params: {
  task: ContentTask;
  submissionId: string;
  reviewerId: string;
  action: 'approved' | 'changes_requested';
  note: string | null;
}): Promise<ContentTask> {
  const { task, submissionId, reviewerId, action, note } = params;
  assertTransition(task.status, action);

  const { error: eventError } = await supabase.from('review_events').insert({
    submission_id: submissionId,
    reviewer_id: reviewerId,
    action,
    note,
  });
  if (eventError) throw eventError;

  const { data, error } = await supabase
    .from('content_tasks')
    .update({ status: action })
    .eq('id', task.id)
    .eq('status', task.status)
    .select('*')
    .single();
  if (error) throw error;

  void supabase.functions.invoke('notify', {
    body: { task_id: task.id, event: action },
  });

  if (action === 'approved') {
    const { data: postResult, error: postError } =
      await supabase.functions.invoke('post-approved', {
        body: { task_id: task.id },
      });
    if (postError) throw postError;
    const errMsg = (postResult as { error?: string } | null)?.error;
    if (errMsg) throw new Error(errMsg);
  }

  return data as ContentTask;
}

export type SocialConnectStatus = {
  profile: string | null;
  social_accounts: Record<string, unknown>;
  full_name?: string | null;
};

export type CreatorSocialStatus = {
  id: string;
  full_name: string | null;
  profile: string | null;
  social_accounts: Record<string, unknown>;
};

export async function getSocialConnectStatus(): Promise<SocialConnectStatus> {
  const { data, error } = await supabase.functions.invoke('social-connect', {
    body: { action: 'status' },
  });
  if (error) throw error;
  return data as SocialConnectStatus;
}

export async function getSocialConnectUrl(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('social-connect', {
    body: { action: 'connect_url' },
  });
  if (error) throw error;
  const payload = data as { access_url?: string; error?: string };
  if (payload.error) throw new Error(payload.error);
  if (!payload.access_url) throw new Error('No connect URL returned');
  return payload.access_url;
}

export async function listCreatorSocialStatus(): Promise<CreatorSocialStatus[]> {
  const { data, error } = await supabase.functions.invoke('social-connect', {
    body: { action: 'team_status' },
  });
  if (error) throw error;
  return ((data as { members?: CreatorSocialStatus[] }).members ?? []);
}

export async function listCreators(companyId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('company_id', companyId)
    .order('full_name');
  if (error) throw error;
  return data ?? [];
}

export async function createTask(params: {
  companyId: string;
  createdBy: string;
  assignedTo: string | null;
  title: string;
  script: string | null;
  caption: string | null;
  dueDate: string | null;
  inspirationTrendId?: string | null;
  brief?: string | null;
  format?: 'video' | 'photo_carousel';
  estimatedSeconds?: number | null;
}): Promise<ContentTask> {
  const { data, error } = await supabase
    .from('content_tasks')
    .insert({
      company_id: params.companyId,
      created_by: params.createdBy,
      assigned_to: params.assignedTo,
      title: params.title,
      script: params.script,
      caption: params.caption,
      due_date: params.dueDate,
      inspiration_trend_id: params.inspirationTrendId ?? null,
      brief: params.brief ?? null,
      format: params.format ?? 'video',
      estimated_seconds: params.estimatedSeconds ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as ContentTask;
}

export async function listTrends(): Promise<TrendItem[]> {
  const { data, error } = await supabase
    .from('trend_items')
    .select('*')
    .order('scraped_at', { ascending: false })
    .order('views', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function generateTaskDraft(
  trendId?: string,
): Promise<TaskDraft> {
  const { data, error } = await supabase.functions.invoke('generate-script', {
    body: trendId ? { trend_id: trendId } : {},
  });
  if (error) throw error;
  const draft = data as Partial<TaskDraft> & { error?: string };
  if (draft.error) throw new Error(draft.error);
  if (!draft.title || !draft.script || !draft.caption) {
    throw new Error('Generation came back incomplete');
  }
  return {
    title: draft.title,
    hook: draft.hook ?? '',
    script: draft.script,
    caption: draft.caption,
    brief: draft.brief ?? '',
    format: draft.format === 'photo_carousel' ? 'photo_carousel' : 'video',
    estimatedSeconds: draft.estimatedSeconds ?? 0,
  };
}

// Kicks off a background scrape; new trends land in trend_items minutes later.
export async function startTrendScrape(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('scrape-trends', {
    body: { source: 'manual' },
  });
  if (error) throw error;
  const result = data as { error?: string } | null;
  if (result?.error) throw new Error(result.error);
}

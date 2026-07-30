import { supabase } from './supabase';
import {
  assertTransition,
  type ContentTask,
  type TaskStatus,
} from './tasks';

export type InspirationTrend = {
  id: string;
  platform: string | null;
  source_url: string | null;
  author_handle: string | null;
  cover_url: string | null;
  views: number | null;
  why_it_works: string | null;
};

export type TaskWithTrend = ContentTask & {
  trend_items: InspirationTrend | null;
};

export type TaskWithPosts = ContentTask & {
  posts: Array<{
    id: string;
    platform: string | null;
    post_url: string | null;
    status: string | null;
    posted_at: string | null;
  }>;
};

const TREND_JOIN =
  'trend_items:inspiration_trend_id ( id, platform, source_url, author_handle, cover_url, views, why_it_works )';

export async function listMyTasks(userId: string): Promise<TaskWithTrend[]> {
  const { data, error } = await supabase
    .from('content_tasks')
    .select(`*, ${TREND_JOIN}`)
    .eq('assigned_to', userId)
    .order('due_date', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as TaskWithTrend[];
}

export async function getTask(taskId: string): Promise<TaskWithTrend | null> {
  const { data, error } = await supabase
    .from('content_tasks')
    .select(`*, ${TREND_JOIN}`)
    .eq('id', taskId)
    .maybeSingle();

  if (error) throw error;
  return data as TaskWithTrend | null;
}

export async function listMyPosts(userId: string): Promise<TaskWithPosts[]> {
  const { data, error } = await supabase
    .from('content_tasks')
    .select(
      `
      *,
      posts ( id, platform, post_url, status, posted_at )
    `,
    )
    .eq('assigned_to', userId)
    .in('status', ['submitted', 'changes_requested', 'approved', 'posted'])
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as TaskWithPosts[];
}

export async function transitionTask(
  taskId: string,
  from: TaskStatus,
  to: TaskStatus,
): Promise<ContentTask> {
  assertTransition(from, to);

  const { data, error } = await supabase
    .from('content_tasks')
    .update({ status: to })
    .eq('id', taskId)
    .eq('status', from)
    .select('*')
    .single();

  if (error) throw error;

  if (to === 'submitted') {
    void supabase.functions.invoke('notify', {
      body: { task_id: taskId, event: 'submitted' },
    });
  }

  return data as ContentTask;
}

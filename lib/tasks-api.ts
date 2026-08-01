import { RELEVANCE_THRESHOLD } from '../supabase/functions/_shared/relevance';
import { supabase } from './supabase';
import {
  assertTransition,
  type ContentTask,
  type TaskStatus,
} from './tasks';
import type { Database } from './types';

export type TrendItem = Database['public']['Tables']['trend_items']['Row'];

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

// Creator inspiration feed: gate-passing items ordered by relevance, not raw
// views. Ungated items (scored null, scraped before the gate) stay visible.
export async function listTrends(companyId: string): Promise<TrendItem[]> {
  const { data, error } = await supabase
    .from('trend_items')
    .select('*')
    .eq('company_id', companyId)
    .or(`relevance_score.is.null,relevance_score.gte.${RELEVANCE_THRESHOLD}`)
    .order('relevance_score', { ascending: false, nullsFirst: false })
    .order('views', { ascending: false, nullsFirst: false });

  if (error) throw error;
  return data ?? [];
}

/** Thumbs on a trend. Admin labels also join the golden set (see RPC). */
export async function labelTrend(
  trendId: string,
  label: 'keep' | 'kill' | null,
  reason?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('label_trend', {
    p_trend_id: trendId,
    p_label: label ?? undefined,
    p_reason: reason ?? undefined,
  });
  if (error) throw error;
}

/** Swap the task's content for a chosen trend. Status is untouched. */
export async function swapTaskTrend(
  taskId: string,
  trend: TrendItem,
): Promise<TaskWithTrend> {
  const patch: { brief: string | null; inspiration_trend_id: string; title?: string } = {
    brief: trend.why_it_works,
    inspiration_trend_id: trend.id,
  };
  if (trend.hook !== null) patch.title = trend.hook;

  const { data, error } = await supabase
    .from('content_tasks')
    .update(patch)
    .eq('id', taskId)
    .select(`*, ${TREND_JOIN}`)
    .single();

  if (error) throw error;
  return data as TaskWithTrend;
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

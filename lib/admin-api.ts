import { Image } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

import { supabase } from './supabase';
import { assertTransition, type Assignment, type ContentTask, type TaskStatus } from './tasks';
import { parseAssignmentMetrics, transitionAssignment, type Brief } from './tasks-api';
import type { ReviewEvent } from './review-events';
import type { Profile } from './profile';
import type { Database } from './types';

export type TrendItem = Database['public']['Tables']['trend_items']['Row'];
export type BrandDoc = Database['public']['Tables']['brand_docs']['Row'];
export type SourceAccount = Database['public']['Tables']['source_accounts']['Row'];

export type BrandDocKind = 'product_truth' | 'audience_niche' | 'voice' | 'learnings';

export type SourcingTerm = {
  term: string;
  kind: 'query' | 'hashtag';
  keepers: number;
  scrapes: number;
};

export type TaskDraft = {
  title: string;
  hook: string;
  script: string;
  caption: string;
  brief: string;
  format: 'video' | 'photo_carousel';
  estimatedSeconds: number;
};

export type Submission = Database['public']['Tables']['submissions']['Row'];

export type QueueItem = ContentTask & {
  profiles: Pick<Profile, 'id' | 'full_name'> | null;
};

export type AssignmentQueueItem = Assignment & {
  briefs: Brief;
  profiles: Pick<Profile, 'id' | 'full_name'> | null;
};

/** Submitted assignments joined to their brief and creator, newest first. */
export async function listAssignmentQueue(): Promise<AssignmentQueueItem[]> {
  const { data, error } = await supabase
    .from('assignments')
    .select('*, briefs:brief_id (*), profiles:creator_id ( id, full_name )')
    .eq('status', 'submitted')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AssignmentQueueItem[];
}

/** Assignments scheduled inside a date window, for the calendar grid. */
export async function listWeekAssignments(
  startIso: string,
  endIso: string,
): Promise<AssignmentQueueItem[]> {
  const { data, error } = await supabase
    .from('assignments')
    .select('*, briefs:brief_id (*), profiles:creator_id ( id, full_name )')
    .gte('scheduled_date', startIso)
    .lte('scheduled_date', endIso)
    .order('scheduled_date', { ascending: true })
    .order('slot_index', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AssignmentQueueItem[];
}

export async function countAssignmentsInFlight(): Promise<number> {
  const { count, error } = await supabase
    .from('assignments')
    .select('id', { count: 'exact', head: true })
    .in('status', ['assigned', 'recorded', 'changes_requested']);
  if (error) throw error;
  return count ?? 0;
}

/** Latest submission per assignment id (one query for the queue). */
export async function latestSubmissionsByAssignment(
  assignmentIds: string[],
): Promise<Map<string, Submission>> {
  const map = new Map<string, Submission>();
  if (assignmentIds.length === 0) return map;
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .in('assignment_id', assignmentIds)
    .order('version', { ascending: false });
  if (error) throw error;
  for (const row of data ?? []) {
    if (row.assignment_id !== null && !map.has(row.assignment_id)) {
      map.set(row.assignment_id, row as Submission);
    }
  }
  return map;
}

/**
 * Review an assignment submission. Status moves through transitionAssignment
 * only; notify and the post-approved pipeline are assignment-keyed.
 */
export async function reviewAssignment(params: {
  assignment: Assignment;
  submissionId: string;
  reviewerId: string;
  action: 'approved' | 'changes_requested';
  note: string | null;
}): Promise<Assignment> {
  const { assignment, submissionId, reviewerId, action, note } = params;

  const { error: eventError } = await supabase.from('review_events').insert({
    submission_id: submissionId,
    author_id: reviewerId,
    action,
    note,
  });
  if (eventError) throw eventError;

  const updated = await transitionAssignment(assignment.id, assignment.status, action);

  void supabase.functions.invoke('notify', {
    body: { assignment_id: assignment.id, event: action },
  });

  if (action === 'approved') {
    const { data: postResult, error: postError } =
      await supabase.functions.invoke('post-approved', {
        body: { assignment_id: assignment.id },
      });
    if (postError) throw postError;
    const errMsg = (postResult as { error?: string } | null)?.error;
    if (errMsg) throw new Error(errMsg);

    // The post is through Upload-Post: tell the creator, with deep links to
    // both platforms resolved server-side by notify.
    void supabase.functions.invoke('notify', {
      body: { assignment_id: assignment.id, event: 'post_live' },
    });
  }

  return updated;
}

export async function listQueue(): Promise<QueueItem[]> {
  const { data, error } = await supabase
    .from('content_tasks')
    .select('*, profiles!content_tasks_assigned_to_fkey ( id, full_name )')
    .eq('status', 'submitted')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as QueueItem[];
}

export async function getTask(taskId: string): Promise<QueueItem | null> {
  const { data, error } = await supabase
    .from('content_tasks')
    .select('*, profiles!content_tasks_assigned_to_fkey ( id, full_name )')
    .eq('id', taskId)
    .maybeSingle();
  if (error) throw error;
  return (data as QueueItem | null) ?? null;
}

/** Latest submission per task id (one query for the queue). */
export async function latestSubmissionsByTask(
  taskIds: string[],
): Promise<Map<string, Submission>> {
  const map = new Map<string, Submission>();
  if (taskIds.length === 0) return map;
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .in('task_id', taskIds)
    .order('version', { ascending: false });
  if (error) throw error;
  for (const row of data ?? []) {
    if (row.task_id !== null && !map.has(row.task_id)) {
      map.set(row.task_id, row as Submission);
    }
  }
  return map;
}

export async function countCreatorInFlight(): Promise<number> {
  const { count, error } = await supabase
    .from('content_tasks')
    .select('id', { count: 'exact', head: true })
    .in('status', ['assigned', 'recorded', 'changes_requested']);
  if (error) throw error;
  return count ?? 0;
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
    author_id: reviewerId,
    action,
    note,
  });
  if (eventError) throw eventError;

  // If the admin edited the generated draft before approving, store the diff
  // inside the snapshot. Rewrites are training signal for generation.
  if (action === 'approved' && task.original_draft) {
    const original = task.original_draft as {
      script?: string | null;
      caption?: string | null;
    };
    const scriptChanged = (original.script ?? null) !== task.script;
    const captionChanged = (original.caption ?? null) !== task.caption;
    if (scriptChanged || captionChanged) {
      await supabase
        .from('content_tasks')
        .update({
          original_draft: {
            ...original,
            approved_diff: {
              script_before: scriptChanged ? original.script ?? null : undefined,
              script_after: scriptChanged ? task.script : undefined,
              caption_before: captionChanged ? original.caption ?? null : undefined,
              caption_after: captionChanged ? task.caption : undefined,
            },
          },
        })
        .eq('id', task.id);
    }
  }

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

    void supabase.functions.invoke('notify', {
      body: { task_id: task.id, event: 'post_live' },
    });
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

export async function updateTask(params: {
  id: string;
  title?: string;
  script?: string | null;
  caption?: string | null;
  hook?: string | null;
  assignedTo?: string | null;
  dueDate?: string | null;
  format?: 'video' | 'photo_carousel';
}): Promise<void> {
  const { error } = await supabase
    .from('content_tasks')
    .update({
      ...(params.title !== undefined ? { title: params.title } : {}),
      ...(params.script !== undefined ? { script: params.script } : {}),
      ...(params.caption !== undefined ? { caption: params.caption } : {}),
      ...(params.hook !== undefined ? { hook: params.hook } : {}),
      ...(params.assignedTo !== undefined
        ? { assigned_to: params.assignedTo }
        : {}),
      ...(params.dueDate !== undefined ? { due_date: params.dueDate } : {}),
      ...(params.format !== undefined ? { format: params.format } : {}),
    })
    .eq('id', params.id);
  if (error) throw error;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('content_tasks').delete().eq('id', id);
  if (error) throw error;
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
  generated?: boolean;
  hook?: string | null;
}): Promise<ContentTask> {
  const { data, error } = await supabase
    .from('content_tasks')
    .insert({
      company_id: params.companyId,
      created_by: params.createdBy,
      assigned_to: params.assignedTo,
      // Manual admin creation is its own review: released immediately. The
      // weekly batch pipeline (Workstream D/E1) inserts 'in_review' instead.
      planning_status: 'scheduled',
      title: params.title,
      script: params.script,
      caption: params.caption,
      hook: params.hook ?? null,
      due_date: params.dueDate,
      inspiration_trend_id: params.inspirationTrendId ?? null,
      brief: params.brief ?? null,
      format: params.format ?? 'video',
      estimated_seconds: params.estimatedSeconds ?? null,
      original_draft: params.generated
        ? {
            title: params.title,
            script: params.script,
            caption: params.caption,
            brief: params.brief ?? null,
          }
        : null,
      generation_meta: params.generated
        ? {
            source: 'admin_generate',
            archetype: 'trend_adaptation',
            source_trend_id: params.inspirationTrendId ?? null,
          }
        : null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as ContentTask;
}

// Admins see everything, including below-threshold items, so kills can be
// labeled and rescued. Ordered by gate score, not raw views.
export async function listTrends(): Promise<TrendItem[]> {
  const { data, error } = await supabase
    .from('trend_items')
    .select('*')
    .order('relevance_score', { ascending: false, nullsFirst: false })
    .order('views', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function setTaskFeedback(
  taskId: string,
  feedback: 1 | -1 | null,
  reason?: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('content_tasks')
    .update({ feedback, feedback_reason: reason ?? null })
    .eq('id', taskId);
  if (error) throw error;
}

export async function listBrandDocs(): Promise<BrandDoc[]> {
  const { data, error } = await supabase.from('brand_docs').select('*');
  if (error) throw error;
  return data ?? [];
}

export async function saveBrandDoc(
  companyId: string,
  kind: BrandDocKind,
  content: string,
): Promise<void> {
  const { error } = await supabase.from('brand_docs').upsert(
    {
      company_id: companyId,
      kind,
      content,
      human_edited: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'company_id,kind' },
  );
  if (error) throw error;
}

/** Cheap OpenAI cleanup of a Product or Audience doc. Returns cleaned markdown. */
export async function cleanupBrandDoc(
  kind: 'product_truth' | 'audience_niche',
  content: string,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('brand-ingest', {
    body: { action: 'cleanup_doc', kind, content },
  });
  if (error) throw error;
  const result = data as { error?: string; content?: string } | null;
  if (result?.error) throw new Error(result.error);
  if (!result?.content?.trim()) {
    throw new Error('Cleanup came back empty. Try again.');
  }
  return result.content;
}

export async function listSourceAccounts(): Promise<SourceAccount[]> {
  const { data, error } = await supabase
    .from('source_accounts')
    .select('*')
    .order('kind')
    .order('handle');
  if (error) throw error;
  return data ?? [];
}

export async function addSourceAccount(
  companyId: string,
  platform: 'tiktok' | 'instagram',
  handle: string,
): Promise<void> {
  const { error } = await supabase.from('source_accounts').upsert(
    {
      company_id: companyId,
      platform,
      handle: handle.replace(/^@/, '').trim(),
      kind: 'reference',
    },
    { onConflict: 'company_id,platform,handle', ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function setSourceAccountStatus(
  id: string,
  status: 'active' | 'muted',
): Promise<void> {
  const { error } = await supabase
    .from('source_accounts')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

export async function getSourcingTerms(companyId: string): Promise<SourcingTerm[]> {
  const { data, error } = await supabase
    .from('brand_profiles')
    .select('sourcing')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw error;
  const sourcing = (data?.sourcing ?? {}) as { terms?: SourcingTerm[] };
  return Array.isArray(sourcing.terms) ? sourcing.terms : [];
}

export async function removeSourcingTerm(
  companyId: string,
  kind: 'query' | 'hashtag',
  term: string,
): Promise<SourcingTerm[]> {
  const terms = (await getSourcingTerms(companyId)).filter(
    (t) => !(t.kind === kind && t.term === term),
  );
  const { error } = await supabase
    .from('brand_profiles')
    .update({ sourcing: { terms } })
    .eq('company_id', companyId);
  if (error) throw error;
  return terms;
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

// ---------------------------------------------------------------------------
// Milestone 5: creators leaderboard + brief-level analytics.
// Everything below reads assignments (the source of truth since migration 018).
// Revenue flows through attribution_links keyed by assignment_id, with
// task_id kept for links minted before the money milestone.

type AssignmentStatRow = {
  id: string;
  creator_id: string;
  brief_id: string;
  status: string;
  metrics: Assignment['metrics'];
  task_id: string | null;
};

function assignmentViews(metrics: Assignment['metrics']): {
  views: number;
  likes: number;
} {
  const parsed = parseAssignmentMetrics(metrics);
  return { views: parsed.views ?? 0, likes: parsed.likes ?? 0 };
}

type RevenueMaps = {
  byAssignment: Map<string, number>;
  byTask: Map<string, number>;
};

/** Revenue cents keyed by attribution link target (assignment or legacy task). */
async function fetchRevenueMaps(companyId: string): Promise<RevenueMaps> {
  const { data, error } = await supabase
    .from('revenue_events')
    .select('amount_cents, attribution_links(task_id, assignment_id)')
    .eq('company_id', companyId);
  if (error) throw error;
  const byAssignment = new Map<string, number>();
  const byTask = new Map<string, number>();
  for (const row of data ?? []) {
    const link = Array.isArray(row.attribution_links)
      ? row.attribution_links[0]
      : row.attribution_links;
    const cents = row.amount_cents ?? 0;
    if (link?.assignment_id) {
      byAssignment.set(
        link.assignment_id,
        (byAssignment.get(link.assignment_id) ?? 0) + cents,
      );
    } else if (link?.task_id) {
      byTask.set(link.task_id, (byTask.get(link.task_id) ?? 0) + cents);
    }
  }
  return { byAssignment, byTask };
}

function assignmentRevenue(maps: RevenueMaps, a: AssignmentStatRow): number {
  return (
    (maps.byAssignment.get(a.id) ?? 0) +
    (a.task_id ? maps.byTask.get(a.task_id) ?? 0 : 0)
  );
}

export type CreatorLeaderboardRow = {
  creatorId: string;
  creatorName: string;
  views: number;
  postsCompleted: number;
  /** approved / reviewed, 0..1. Null when nothing has been reviewed yet. */
  approvalRate: number | null;
  /** Positive wallet_ledger sum: bounties and bonuses credited. */
  earnedCents: number;
};

export async function fetchCreatorLeaderboard(
  companyId: string,
): Promise<CreatorLeaderboardRow[]> {
  const [
    { data: creators, error: creatorsError },
    { data: assignments, error: assignmentsError },
    { data: ledger, error: ledgerError },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('company_id', companyId)
      .eq('role', 'creator')
      .order('full_name'),
    supabase
      .from('assignments')
      .select('id, creator_id, brief_id, status, metrics, task_id')
      .eq('company_id', companyId),
    supabase
      .from('wallet_ledger')
      .select('creator_id, amount_cents')
      .eq('company_id', companyId)
      .gt('amount_cents', 0),
  ]);
  if (creatorsError) throw creatorsError;
  if (assignmentsError) throw assignmentsError;
  if (ledgerError) throw ledgerError;

  const rows = new Map<string, CreatorLeaderboardRow>(
    (creators ?? []).map((p) => [
      p.id,
      {
        creatorId: p.id,
        creatorName: p.full_name?.trim() || 'Creator',
        views: 0,
        postsCompleted: 0,
        approvalRate: null,
        earnedCents: 0,
      },
    ]),
  );

  const approved = new Map<string, number>();
  const reviewed = new Map<string, number>();
  for (const a of (assignments ?? []) as AssignmentStatRow[]) {
    const row = rows.get(a.creator_id);
    if (!row) continue;
    row.views += assignmentViews(a.metrics).views;
    if (a.status === 'posted') row.postsCompleted += 1;
    if (a.status === 'approved' || a.status === 'posted') {
      approved.set(a.creator_id, (approved.get(a.creator_id) ?? 0) + 1);
      reviewed.set(a.creator_id, (reviewed.get(a.creator_id) ?? 0) + 1);
    } else if (a.status === 'changes_requested') {
      reviewed.set(a.creator_id, (reviewed.get(a.creator_id) ?? 0) + 1);
    }
  }
  for (const [creatorId, reviewedCount] of reviewed) {
    const row = rows.get(creatorId);
    if (row && reviewedCount > 0) {
      row.approvalRate = (approved.get(creatorId) ?? 0) / reviewedCount;
    }
  }
  for (const entry of ledger ?? []) {
    const row = rows.get(entry.creator_id);
    if (row) row.earnedCents += entry.amount_cents;
  }

  return [...rows.values()].sort((a, b) => b.earnedCents - a.earnedCents);
}

export type BriefPerformance = {
  briefId: string;
  title: string;
  hook: string | null;
  format: string;
  creators: number;
  posted: number;
  views: number;
  likes: number;
  revenueCents: number;
};

export type BriefAnalytics = {
  totals: {
    views: number;
    likes: number;
    revenueCents: number;
    bountiesPaidCents: number;
  };
  briefs: BriefPerformance[];
  bestHooks: Array<{ hook: string; views: number; title: string }>;
  bestFormats: Array<{ format: string; views: number; posted: number }>;
  bestCreators: Array<{ creatorName: string; views: number; posted: number }>;
};

export async function fetchBriefAnalytics(
  companyId: string,
): Promise<BriefAnalytics> {
  const [
    { data: assignments, error: assignmentsError },
    { data: bounties, error: bountiesError },
    { data: profiles, error: profilesError },
    revenueMaps,
  ] = await Promise.all([
    supabase
      .from('assignments')
      .select(
        'id, creator_id, brief_id, status, metrics, task_id, briefs:brief_id ( id, title, hook, format )',
      )
      .eq('company_id', companyId),
    supabase
      .from('wallet_ledger')
      .select('amount_cents')
      .eq('company_id', companyId)
      .eq('kind', 'bounty_credit'),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('company_id', companyId),
    fetchRevenueMaps(companyId),
  ]);
  if (assignmentsError) throw assignmentsError;
  if (bountiesError) throw bountiesError;
  if (profilesError) throw profilesError;

  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name?.trim() || 'Creator']),
  );

  const byBrief = new Map<string, BriefPerformance & { creatorIds: Set<string> }>();
  const byFormat = new Map<string, { format: string; views: number; posted: number }>();
  const byCreator = new Map<string, { creatorName: string; views: number; posted: number }>();
  const totals = { views: 0, likes: 0, revenueCents: 0, bountiesPaidCents: 0 };

  type Row = AssignmentStatRow & {
    briefs: Pick<Brief, 'id' | 'title' | 'hook' | 'format'> | null;
  };
  for (const a of (assignments ?? []) as Row[]) {
    if (!a.briefs) continue;
    const { views, likes } = assignmentViews(a.metrics);
    const revenue = assignmentRevenue(revenueMaps, a);
    const posted = a.status === 'posted' ? 1 : 0;

    let brief = byBrief.get(a.brief_id);
    if (!brief) {
      brief = {
        briefId: a.brief_id,
        title: a.briefs.title,
        hook: a.briefs.hook,
        format: a.briefs.format,
        creators: 0,
        posted: 0,
        views: 0,
        likes: 0,
        revenueCents: 0,
        creatorIds: new Set<string>(),
      };
      byBrief.set(a.brief_id, brief);
    }
    brief.creatorIds.add(a.creator_id);
    brief.posted += posted;
    brief.views += views;
    brief.likes += likes;
    brief.revenueCents += revenue;

    const format = byFormat.get(a.briefs.format) ?? {
      format: a.briefs.format,
      views: 0,
      posted: 0,
    };
    format.views += views;
    format.posted += posted;
    byFormat.set(a.briefs.format, format);

    const creator = byCreator.get(a.creator_id) ?? {
      creatorName: nameById.get(a.creator_id) ?? 'Creator',
      views: 0,
      posted: 0,
    };
    creator.views += views;
    creator.posted += posted;
    byCreator.set(a.creator_id, creator);

    totals.views += views;
    totals.likes += likes;
    totals.revenueCents += revenue;
  }
  totals.bountiesPaidCents = (bounties ?? []).reduce(
    (sum, b) => sum + b.amount_cents,
    0,
  );

  const briefs = [...byBrief.values()]
    .map(({ creatorIds, ...rest }) => ({ ...rest, creators: creatorIds.size }))
    .sort((a, b) => b.views - a.views);

  return {
    totals,
    briefs,
    bestHooks: briefs
      .filter((b) => b.hook?.trim() && b.views > 0)
      .slice(0, 5)
      .map((b) => ({ hook: (b.hook as string).trim(), views: b.views, title: b.title })),
    bestFormats: [...byFormat.values()].sort((a, b) => b.views - a.views),
    bestCreators: [...byCreator.values()]
      .filter((c) => c.views > 0 || c.posted > 0)
      .sort((a, b) => b.views - a.views)
      .slice(0, 5),
  };
}

export type CreatorLedgerEntry = {
  id: string;
  kind: string;
  amountCents: number;
  note: string | null;
  createdAt: string;
};

export type CreatorDetail = {
  name: string;
  assignments: Array<Assignment & { briefs: Brief }>;
  events: ReviewEvent[];
  ledger: CreatorLedgerEntry[];
};

export async function fetchCreatorDetail(
  companyId: string,
  creatorId: string,
): Promise<CreatorDetail> {
  const [
    { data: profile, error: profileError },
    { data: assignments, error: assignmentsError },
    { data: subs, error: subsError },
    { data: ledger, error: ledgerError },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name')
      .eq('company_id', companyId)
      .eq('id', creatorId)
      .single(),
    supabase
      .from('assignments')
      .select('*, briefs:brief_id (*)')
      .eq('company_id', companyId)
      .eq('creator_id', creatorId)
      .order('scheduled_date', { ascending: false })
      .order('slot_index', { ascending: true }),
    supabase.from('submissions').select('id').eq('creator_id', creatorId),
    supabase
      .from('wallet_ledger')
      .select('id, kind, amount_cents, note, created_at')
      .eq('company_id', companyId)
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  if (profileError) throw profileError;
  if (assignmentsError) throw assignmentsError;
  if (subsError) throw subsError;
  if (ledgerError) throw ledgerError;

  const submissionIds = (subs ?? []).map((s) => s.id);
  let events: ReviewEvent[] = [];
  if (submissionIds.length > 0) {
    const { data, error } = await supabase
      .from('review_events')
      .select('*, profiles!review_events_author_id_fkey ( id, full_name, role )')
      .in('submission_id', submissionIds)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    events = (data ?? []) as ReviewEvent[];
  }

  return {
    name: profile.full_name?.trim() || 'Creator',
    assignments: (assignments ?? []) as Array<Assignment & { briefs: Brief }>,
    events,
    ledger: (ledger ?? []).map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      amountCents: entry.amount_cents,
      note: entry.note,
      createdAt: entry.created_at ?? '',
    })),
  };
}

export async function startMetricsPoll(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('poll-metrics', {
    body: { source: 'manual' },
  });
  if (error) throw error;
  const result = data as { error?: string } | null;
  if (result?.error) throw new Error(result.error);
}

export type ProductFeature = Database['public']['Tables']['product_features']['Row'];

export type ProductFeatureInput = {
  name: string;
  what_it_does: string;
  claim: string;
};

/** Non-rejected claims for the admin Features screen. RLS scopes by company. */
export async function listProductFeatures(): Promise<ProductFeature[]> {
  const { data, error } = await supabase
    .from('product_features')
    .select('*')
    .eq('rejected', false)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Admin-written claim: already approved, never pending. */
export async function addManualProductFeature(
  companyId: string,
  input: ProductFeatureInput,
): Promise<ProductFeature> {
  const { data, error } = await supabase
    .from('product_features')
    .insert({
      company_id: companyId,
      name: input.name.trim(),
      what_it_does: input.what_it_does.trim(),
      claim: input.claim.trim(),
      source: 'manual',
      approved: true,
      rejected: false,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Edit fields only; leaves approved untouched so typos do not yank a claim from the bank. */
export async function updateProductFeature(
  id: string,
  input: ProductFeatureInput,
): Promise<void> {
  const { error } = await supabase
    .from('product_features')
    .update({
      name: input.name.trim(),
      what_it_does: input.what_it_does.trim(),
      claim: input.claim.trim(),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function approveProductFeature(id: string): Promise<void> {
  const { error } = await supabase
    .from('product_features')
    .update({ approved: true, rejected: false })
    .eq('id', id);
  if (error) throw error;
}

/** Soft dismiss. Row stays so rescans and idempotency skip the name. */
export async function rejectProductFeature(id: string): Promise<void> {
  const { error } = await supabase
    .from('product_features')
    .update({ rejected: true, approved: false })
    .eq('id', id);
  if (error) throw error;
}

export type ProductType = 'software' | 'physical';

/** Steers ingest-features extraction. Defaults to software when missing. */
export async function getProductType(companyId: string): Promise<ProductType> {
  const { data, error } = await supabase
    .from('brand_profiles')
    .select('product_type')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw error;
  return data?.product_type === 'physical' ? 'physical' : 'software';
}

export async function setProductType(
  companyId: string,
  productType: ProductType,
): Promise<void> {
  const { data: existing, error: readError } = await supabase
    .from('brand_profiles')
    .select('id')
    .eq('company_id', companyId)
    .maybeSingle();
  if (readError) throw readError;

  if (existing) {
    const { error } = await supabase
      .from('brand_profiles')
      .update({
        product_type: productType,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('brand_profiles').insert({
    company_id: companyId,
    product_type: productType,
  });
  if (error) throw error;
}

const FEATURE_SHOT_BUCKET = 'feature-screenshots';
const FEATURE_SHOT_LONG_EDGE = 1600;

/** Client picker cap. Server allows 12; 150s idle timeout makes 7 the safe batch. */
export const FEATURE_INGEST_MAX_IMAGES = 7;

export type IngestFeaturesResult = {
  scanned: number;
  inserted: number;
  skipped_existing: number;
  dropped_over_cap: number;
};

async function downscaleFeatureShot(localUri: string): Promise<string> {
  const { width, height } = await new Promise<{ width: number; height: number }>(
    (resolve, reject) => {
      Image.getSize(
        localUri,
        (w, h) => resolve({ width: w, height: h }),
        (err) => reject(err ?? new Error('Could not read image size')),
      );
    },
  );
  const long = Math.max(width, height);
  const actions =
    long > FEATURE_SHOT_LONG_EDGE
      ? width >= height
        ? [{ resize: { width: FEATURE_SHOT_LONG_EDGE } }]
        : [{ resize: { height: FEATURE_SHOT_LONG_EDGE } }]
      : [];
  const result = await ImageManipulator.manipulateAsync(localUri, actions, {
    compress: 0.82,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return result.uri;
}

/** Downscale then upload under feature-screenshots/{company_id}/. Returns storage path. */
export async function uploadFeatureScreenshot(
  companyId: string,
  localUri: string,
): Promise<string> {
  const resizedUri = await downscaleFeatureShot(localUri);
  const response = await fetch(resizedUri);
  if (!response.ok) throw new Error('Could not read the screenshot');
  const blob = await response.blob();
  const path = `${companyId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage
    .from(FEATURE_SHOT_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

// --- Music approvals (slideshows only) -------------------------------------

export type MusicApprovalItem = {
  assignment: Assignment;
  briefTitle: string;
  creatorName: string;
  markedAt: string;
  /** Live post links, one per platform Upload-Post responded for. */
  postLinks: Array<{ platform: string; url: string }>;
};

/**
 * Slideshows where the creator tapped "Music added" and no admin has
 * approved yet. Approval unlocks earnings for that post (the gate itself is
 * enforced in poll-metrics bounty crediting).
 */
export async function listMusicApprovalQueue(
  companyId: string,
): Promise<MusicApprovalItem[]> {
  const { data, error } = await supabase
    .from('assignments')
    .select('*, briefs:brief_id ( id, title ), profiles:creator_id ( id, full_name )')
    .eq('company_id', companyId)
    .not('music_marked_by_creator_at', 'is', null)
    .is('music_approved_at', null)
    .order('music_marked_by_creator_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as Array<
    Assignment & {
      briefs: { id: string; title: string } | null;
      profiles: { id: string; full_name: string | null } | null;
    }
  >;
  if (rows.length === 0) return [];

  const { data: posts, error: postsError } = await supabase
    .from('posts')
    .select('assignment_id, platform, post_url')
    .in('assignment_id', rows.map((r) => r.id))
    .not('post_url', 'is', null);
  if (postsError) throw postsError;

  const linksByAssignment = new Map<string, Array<{ platform: string; url: string }>>();
  for (const p of posts ?? []) {
    if (p.assignment_id === null || p.post_url === null) continue;
    const list = linksByAssignment.get(p.assignment_id) ?? [];
    list.push({ platform: p.platform ?? 'post', url: p.post_url });
    linksByAssignment.set(p.assignment_id, list);
  }

  return rows.map((r) => ({
    assignment: r,
    briefTitle: r.briefs?.title ?? 'Post',
    creatorName: r.profiles?.full_name?.trim() || 'Creator',
    markedAt: r.music_marked_by_creator_at ?? '',
    postLinks: linksByAssignment.get(r.id) ?? [],
  }));
}

export async function approveMusic(params: {
  companyId: string;
  assignmentId: string;
  adminId: string;
}): Promise<void> {
  const { error } = await supabase
    .from('assignments')
    .update({
      music_approved_at: new Date().toISOString(),
      music_approved_by: params.adminId,
    })
    .eq('company_id', params.companyId)
    .eq('id', params.assignmentId);
  if (error) throw error;

  void supabase.functions.invoke('notify', {
    body: { assignment_id: params.assignmentId, event: 'music_approved' },
  });
}

// --- Creator post detail ----------------------------------------------------

export type PostPlatformStats = {
  platform: string;
  url: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
};

export type AssignmentPostDetail = {
  assignment: Assignment & { briefs: Brief };
  creatorName: string;
  submission: Submission | null;
  platforms: PostPlatformStats[];
  totals: { views: number; likes: number; comments: number; saves: number | null };
};

/**
 * One post for the creator profile: the video, caption, payout, and the
 * latest per-platform metrics. Saves stay null until poll-metrics writes
 * them; the UI shows a dash.
 */
export async function fetchAssignmentPostDetail(
  companyId: string,
  assignmentId: string,
): Promise<AssignmentPostDetail> {
  const [{ data: assignment, error: assignmentError }, subs] = await Promise.all([
    supabase
      .from('assignments')
      .select('*, briefs:brief_id (*), profiles:creator_id ( id, full_name )')
      .eq('company_id', companyId)
      .eq('id', assignmentId)
      .single(),
    latestSubmissionsByAssignment([assignmentId]),
  ]);
  if (assignmentError) throw assignmentError;
  const row = assignment as Assignment & {
    briefs: Brief;
    profiles: { id: string; full_name: string | null } | null;
  };

  const { data: posts, error: postsError } = await supabase
    .from('posts')
    .select('id, platform, post_url')
    .eq('assignment_id', assignmentId);
  if (postsError) throw postsError;

  const postIds = (posts ?? []).map((p) => p.id);
  const latestByPost = new Map<
    string,
    { views: number | null; likes: number | null; comments: number | null; saves: number | null }
  >();
  if (postIds.length > 0) {
    const { data: metrics, error: metricsError } = await supabase
      .from('post_metrics')
      .select('post_id, views, likes, comments, saves, fetched_at')
      .in('post_id', postIds)
      .order('fetched_at', { ascending: false });
    if (metricsError) throw metricsError;
    for (const m of metrics ?? []) {
      if (!latestByPost.has(m.post_id)) {
        latestByPost.set(m.post_id, {
          views: m.views,
          likes: m.likes,
          comments: m.comments,
          saves: m.saves,
        });
      }
    }
  }

  const platforms: PostPlatformStats[] = (posts ?? []).map((p) => {
    const m = latestByPost.get(p.id);
    return {
      platform: p.platform ?? 'post',
      url: p.post_url,
      views: m?.views ?? null,
      likes: m?.likes ?? null,
      comments: m?.comments ?? null,
      saves: m?.saves ?? null,
    };
  });

  const rollup = parseAssignmentMetrics(row.metrics);
  const sum = (pick: (p: PostPlatformStats) => number | null): number =>
    platforms.reduce((total, p) => total + (pick(p) ?? 0), 0);
  const anySaves = platforms.some((p) => p.saves !== null);

  return {
    assignment: row,
    creatorName: row.profiles?.full_name?.trim() || 'Creator',
    submission: subs.get(assignmentId) ?? null,
    platforms,
    totals: {
      views: platforms.length > 0 ? sum((p) => p.views) : rollup.views ?? 0,
      likes: platforms.length > 0 ? sum((p) => p.likes) : rollup.likes ?? 0,
      comments: sum((p) => p.comments),
      saves: anySaves ? sum((p) => p.saves) : null,
    },
  };
}

/** Draft pending claims from uploaded screenshot paths and/or a page URL. */
export async function ingestFeatures(params: {
  companyId: string;
  imageUrls?: string[];
  pageUrl?: string;
}): Promise<IngestFeaturesResult> {
  const { data, error } = await supabase.functions.invoke('ingest-features', {
    body: {
      company_id: params.companyId,
      image_urls: params.imageUrls,
      page_url: params.pageUrl,
    },
  });
  if (error) throw error;
  const result = data as Partial<IngestFeaturesResult> & { error?: string };
  if (result?.error) throw new Error(result.error);
  return {
    scanned: result.scanned ?? 0,
    inserted: result.inserted ?? 0,
    skipped_existing: result.skipped_existing ?? 0,
    dropped_over_cap: result.dropped_over_cap ?? 0,
  };
}

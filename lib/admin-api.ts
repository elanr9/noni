import { supabase } from './supabase';
import { assertTransition, type ContentTask, type TaskStatus } from './tasks';
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
  generated?: boolean;
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

/** Asks brand-ingest to draft the given docs from the site and socials. */
export async function draftBrandDocs(kinds: BrandDocKind[]): Promise<void> {
  const { data, error } = await supabase.functions.invoke('brand-ingest', {
    body: { docs: kinds },
  });
  if (error) throw error;
  const result = data as { error?: string } | null;
  if (result?.error) throw new Error(result.error);
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

export type AdminPostMetric = {
  postId: string;
  taskId: string;
  title: string;
  platform: string | null;
  postUrl: string | null;
  creatorId: string;
  creatorName: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  revenueCents: number;
  hook: string | null;
};

export type AdminCreatorMetric = {
  creatorId: string;
  creatorName: string;
  posts: number;
  views: number;
  revenueCents: number;
  bountyCents: number;
};

export type AdminBountyCredit = {
  id: string;
  createdAt: string;
  amountCents: number;
  creatorName: string;
  postTitle: string;
};

export type AdminAnalytics = {
  totals: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    revenueCents: number;
    bountyCreditsCents: number;
    bountyCreditsCount: number;
  };
  posts: AdminPostMetric[];
  byCreator: AdminCreatorMetric[];
  bestHooks: Array<{ hook: string; views: number; title: string }>;
  bountyCredits: AdminBountyCredit[];
};

function latestMetric(rows: Array<{
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  fetched_at: string | null;
}>): { views: number; likes: number; comments: number; shares: number } {
  let best: (typeof rows)[number] | null = null;
  let bestT = -Infinity;
  for (const row of rows) {
    if (!row.fetched_at) continue;
    const t = new Date(row.fetched_at).getTime();
    if (t > bestT) {
      best = row;
      bestT = t;
    }
  }
  return {
    views: best?.views ?? 0,
    likes: best?.likes ?? 0,
    comments: best?.comments ?? 0,
    shares: best?.shares ?? 0,
  };
}

export async function fetchAdminAnalytics(
  companyId: string,
): Promise<AdminAnalytics> {
  const [
    { data: posts, error: postsError },
    { data: revenue, error: revenueError },
    { data: credits, error: creditsError },
    { data: profiles, error: profilesError },
  ] = await Promise.all([
    supabase
      .from('posts')
      .select(
        `id, platform, post_url, task_id, status,
         post_metrics(views, likes, comments, shares, fetched_at),
         submissions!inner(creator_id),
         content_tasks!inner(id, title, company_id, script, inspiration_trend_id,
           trend_items(hook))`,
      )
      .eq('content_tasks.company_id', companyId)
      .order('posted_at', { ascending: false }),
    supabase
      .from('revenue_events')
      .select('amount_cents, attribution_links(task_id)')
      .eq('company_id', companyId),
    supabase
      .from('wallet_ledger')
      .select('id, created_at, amount_cents, creator_id, post_id, note')
      .eq('company_id', companyId)
      .eq('kind', 'bounty_credit')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('company_id', companyId),
  ]);
  if (postsError) throw postsError;
  if (revenueError) throw revenueError;
  if (creditsError) throw creditsError;
  if (profilesError) throw profilesError;

  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name?.trim() || 'Creator']),
  );

  const revenueByTask = new Map<string, number>();
  for (const row of revenue ?? []) {
    const link = Array.isArray(row.attribution_links)
      ? row.attribution_links[0]
      : row.attribution_links;
    const taskId = link?.task_id;
    if (!taskId) continue;
    revenueByTask.set(
      taskId,
      (revenueByTask.get(taskId) ?? 0) + (row.amount_cents ?? 0),
    );
  }

  const postRows: AdminPostMetric[] = [];
  const revenueShownForTask = new Set<string>();
  for (const raw of posts ?? []) {
    const submission = Array.isArray(raw.submissions)
      ? raw.submissions[0]
      : raw.submissions;
    const task = Array.isArray(raw.content_tasks)
      ? raw.content_tasks[0]
      : raw.content_tasks;
    if (!submission || !task) continue;
    const trend = Array.isArray(task.trend_items)
      ? task.trend_items[0]
      : task.trend_items;
    const metrics = latestMetric(raw.post_metrics ?? []);
    const hook =
      trend?.hook?.trim() ||
      (typeof task.script === 'string'
        ? task.script.split('\n').find((l: string) => l.trim())?.trim() ?? null
        : null);
    const taskRevenue = revenueByTask.get(task.id) ?? 0;
    const showRevenue =
      taskRevenue > 0 && !revenueShownForTask.has(task.id) ? taskRevenue : 0;
    if (showRevenue > 0) revenueShownForTask.add(task.id);
    postRows.push({
      postId: raw.id,
      taskId: task.id,
      title: task.title,
      platform: raw.platform,
      postUrl: raw.post_url,
      creatorId: submission.creator_id,
      creatorName: nameById.get(submission.creator_id) ?? 'Creator',
      views: metrics.views,
      likes: metrics.likes,
      comments: metrics.comments,
      shares: metrics.shares,
      revenueCents: showRevenue,
      hook,
    });
  }

  // Attribute task revenue once across platform rows for that task.
  const seenTaskRevenue = new Set<string>();
  const byCreatorMap = new Map<string, AdminCreatorMetric>();
  for (const post of postRows) {
    let creator = byCreatorMap.get(post.creatorId);
    if (!creator) {
      creator = {
        creatorId: post.creatorId,
        creatorName: post.creatorName,
        posts: 0,
        views: 0,
        revenueCents: 0,
        bountyCents: 0,
      };
      byCreatorMap.set(post.creatorId, creator);
    }
    creator.posts += 1;
    creator.views += post.views;
    if (!seenTaskRevenue.has(post.taskId)) {
      seenTaskRevenue.add(post.taskId);
      creator.revenueCents += post.revenueCents;
    }
  }

  const titleByPost = new Map(postRows.map((p) => [p.postId, p.title]));
  const bountyCredits: AdminBountyCredit[] = (credits ?? []).map((c) => {
    const creator = byCreatorMap.get(c.creator_id);
    if (creator) creator.bountyCents += c.amount_cents;
    return {
      id: c.id,
      createdAt: c.created_at ?? '',
      amountCents: c.amount_cents,
      creatorName: nameById.get(c.creator_id) ?? 'Creator',
      postTitle: (c.post_id && titleByPost.get(c.post_id)) || c.note || 'Post',
    };
  });

  // Bounty rows for creators with credits but no posts in list.
  for (const c of credits ?? []) {
    if (byCreatorMap.has(c.creator_id)) continue;
    byCreatorMap.set(c.creator_id, {
      creatorId: c.creator_id,
      creatorName: nameById.get(c.creator_id) ?? 'Creator',
      posts: 0,
      views: 0,
      revenueCents: 0,
      bountyCents: c.amount_cents,
    });
  }

  const totals = {
    views: postRows.reduce((s, p) => s + p.views, 0),
    likes: postRows.reduce((s, p) => s + p.likes, 0),
    comments: postRows.reduce((s, p) => s + p.comments, 0),
    shares: postRows.reduce((s, p) => s + p.shares, 0),
    revenueCents: [...revenueByTask.values()].reduce((s, n) => s + n, 0),
    bountyCreditsCents: bountyCredits.reduce((s, c) => s + c.amountCents, 0),
    bountyCreditsCount: bountyCredits.length,
  };

  const bestHooks = postRows
    .filter((p) => p.hook && p.views > 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, 5)
    .map((p) => ({ hook: p.hook as string, views: p.views, title: p.title }));

  return {
    totals,
    posts: postRows,
    byCreator: [...byCreatorMap.values()].sort((a, b) => b.views - a.views),
    bestHooks,
    bountyCredits,
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

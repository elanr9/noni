// Admin Create data layer: briefs and campaign_briefs CRUD plus publish.
// Everything is company_id scoped by RLS; writes are admin-only by policy.
// Assignment status never changes here; that stays in lib/tasks-api.ts.

import { supabase } from './supabase';
import type { Database } from './types';

export type Brief = Database['public']['Tables']['briefs']['Row'];
export type Campaign = Database['public']['Tables']['campaigns']['Row'];
export type CampaignBrief = Database['public']['Tables']['campaign_briefs']['Row'];

export type BriefFormat = 'video' | 'photo_carousel';

export type BriefDraft = {
  title: string;
  hook: string;
  script: string;
  caption: string;
  format: BriefFormat;
  why_it_works: string;
  example_url: string;
  example_transcript: string | null;
};

export type BriefInput = {
  title: string;
  format: BriefFormat;
  hook: string | null;
  script: string | null;
  caption: string | null;
  why_it_works: string | null;
  example_url: string | null;
  example_transcript: string | null;
};

export type CampaignBriefItem = CampaignBrief & { briefs: Brief };

/** URL in, editable draft out. Nothing is saved until createBrief. */
export async function ingestBrief(url: string): Promise<BriefDraft> {
  const { data, error } = await supabase.functions.invoke('ingest-brief', {
    body: { url },
  });
  if (error) throw error;
  const draft = data as Partial<BriefDraft> & { error?: string };
  if (draft.error) throw new Error(draft.error);
  if (!draft.title || !draft.script) {
    throw new Error('Draft came back incomplete');
  }
  return {
    title: draft.title,
    hook: draft.hook ?? '',
    script: draft.script,
    caption: draft.caption ?? '',
    format: draft.format === 'photo_carousel' ? 'photo_carousel' : 'video',
    why_it_works: draft.why_it_works ?? '',
    example_url: draft.example_url ?? url,
    example_transcript: draft.example_transcript ?? null,
  };
}

export async function createBrief(params: {
  companyId: string;
  createdBy: string;
  input: BriefInput;
}): Promise<Brief> {
  const { data, error } = await supabase
    .from('briefs')
    .insert({
      company_id: params.companyId,
      created_by: params.createdBy,
      title: params.input.title,
      format: params.input.format,
      hook: params.input.hook,
      script: params.input.script,
      caption: params.input.caption,
      why_it_works: params.input.why_it_works,
      example_url: params.input.example_url,
      example_transcript: params.input.example_transcript,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateBrief(
  id: string,
  patch: Partial<BriefInput>,
): Promise<void> {
  const { error } = await supabase.from('briefs').update(patch).eq('id', id);
  if (error) throw error;
}

/** Briefs are never deleted; the backlog is the moat. */
export async function archiveBrief(id: string): Promise<void> {
  const { error } = await supabase
    .from('briefs')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function createCampaign(params: {
  companyId: string;
  name: string;
  dropDate: string;
}): Promise<Campaign> {
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      company_id: params.companyId,
      name: params.name,
      drop_date: params.dropDate,
      status: 'draft',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function getLatestCampaign(): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .not('drop_date', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listCampaignBriefs(
  campaignId: string,
): Promise<CampaignBriefItem[]> {
  const { data, error } = await supabase
    .from('campaign_briefs')
    .select('*, briefs(*)')
    .eq('campaign_id', campaignId)
    .order('position', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CampaignBriefItem[];
}

export async function addBriefToCampaign(params: {
  campaignId: string;
  briefId: string;
  companyId: string;
  pinnedDay?: number | null;
}): Promise<void> {
  const { count, error: countError } = await supabase
    .from('campaign_briefs')
    .select('brief_id', { count: 'exact', head: true })
    .eq('campaign_id', params.campaignId);
  if (countError) throw countError;
  const { error } = await supabase.from('campaign_briefs').insert({
    campaign_id: params.campaignId,
    brief_id: params.briefId,
    company_id: params.companyId,
    pinned_day: params.pinnedDay ?? null,
    position: count ?? 0,
  });
  if (error) throw error;
}

export async function removeBriefFromCampaign(
  campaignId: string,
  briefId: string,
): Promise<void> {
  const { error } = await supabase
    .from('campaign_briefs')
    .delete()
    .eq('campaign_id', campaignId)
    .eq('brief_id', briefId);
  if (error) throw error;
}

export async function setPinnedDay(
  campaignId: string,
  briefId: string,
  pinnedDay: number | null,
): Promise<void> {
  const { error } = await supabase
    .from('campaign_briefs')
    .update({ pinned_day: pinnedDay })
    .eq('campaign_id', campaignId)
    .eq('brief_id', briefId);
  if (error) throw error;
}

export async function reorderCampaignBriefs(
  campaignId: string,
  orderedBriefIds: string[],
): Promise<void> {
  for (let i = 0; i < orderedBriefIds.length; i += 1) {
    const { error } = await supabase
      .from('campaign_briefs')
      .update({ position: i })
      .eq('campaign_id', campaignId)
      .eq('brief_id', orderedBriefIds[i]);
    if (error) throw error;
  }
}

/**
 * The backlog: briefs not attached to a published campaign (and not already
 * in the campaign being edited), never archived.
 */
export async function listBacklogBriefs(
  excludeCampaignId?: string,
): Promise<Brief[]> {
  const [{ data: links, error: linksError }, { data: briefs, error: briefsError }] =
    await Promise.all([
      supabase
        .from('campaign_briefs')
        .select('brief_id, campaign_id, campaigns!inner(status)'),
      supabase
        .from('briefs')
        .select('*')
        .is('archived_at', null)
        .order('created_at', { ascending: false }),
    ]);
  if (linksError) throw linksError;
  if (briefsError) throw briefsError;

  const taken = new Set<string>();
  for (const link of links ?? []) {
    const campaign = Array.isArray(link.campaigns)
      ? link.campaigns[0]
      : link.campaigns;
    if (campaign?.status === 'published' || link.campaign_id === excludeCampaignId) {
      taken.add(link.brief_id);
    }
  }
  return (briefs ?? []).filter((b) => !taken.has(b.id));
}

export type PublishResult = {
  creators: number;
  assignments_written: number;
  notified: number;
};

/** Publishes through the deployed publish-campaign function (shuffle + RPC). */
export async function publishCampaign(campaignId: string): Promise<PublishResult> {
  const { data, error } = await supabase.functions.invoke('publish-campaign', {
    body: { campaign_id: campaignId },
  });
  if (error) throw error;
  const result = data as Partial<PublishResult> & { error?: string };
  if (result.error) throw new Error(result.error);
  return {
    creators: result.creators ?? 0,
    assignments_written: result.assignments_written ?? 0,
    notified: result.notified ?? 0,
  };
}

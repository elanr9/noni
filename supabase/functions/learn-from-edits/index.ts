// The learning loop behind "fill with AI".
//
// Capture: for every published brief that has an AI snapshot and no diff yet,
// take the published version, diff it against the snapshot and store the
// result in brief_edit_diffs.
//
// Distill (company): for every company with unlearned diffs, hand the diffs
// plus the company's current rules to Claude and write back an updated rule
// set in ai_learnings. Rules the model retires go inactive.
//
// Distill (global, cron only): the same over every company's fresh diffs,
// generalised away from any one brand, into company_id null rules.
//
// Called by publish-campaign right after a publish ({ campaign_id, brief_ids })
// with the manager's JWT, and nightly by pg_cron ({ source: "cron" }).

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  adminClient,
  askClaude,
  authenticate,
  handleCors,
  jsonResponse,
  parseClaudeJson,
} from '../_shared/wp8.ts';
import {
  diffSnapshots,
  summarizeDiff,
  type BriefDiff,
  type LearningCategory,
  type Snapshot,
} from '../_shared/briefDiff.ts';

type Body = {
  source?: string;
  campaign_id?: string;
  brief_ids?: string[];
};

const CATEGORIES: LearningCategory[] = [
  'hook',
  'talking_points',
  'script',
  'caption',
  'hashtags',
  'cta',
  'overlay_text',
  'screenshots',
  'layout',
  'structure',
  'voice',
  'other',
];

const MIN_DIFFS_TO_DISTILL = 1;
const MAX_DIFFS_PER_COMPANY_RUN = 25;
const MAX_DIFFS_PER_GLOBAL_RUN = 80;
const MIN_COMPANIES_FOR_GLOBAL = 2;
const MAX_ACTIVE_RULES = 30;

type SnapshotRow = {
  id: string;
  company_id: string;
  brief_id: string;
  source_kind: string;
  post_type_key: string | null;
  snapshot: Snapshot;
};

type DiffRow = {
  id: string;
  company_id: string;
  post_type_key: string | null;
  source_kind: string;
  diff: BriefDiff;
  edit_ratio: number;
};

type LearningRow = {
  id: string;
  category: string;
  insight: string;
  confidence: number;
  evidence_count: number;
  examples: unknown;
  source_diff_ids: string[];
};

type ModelRule = {
  id?: string | null;
  category?: string;
  insight?: string;
  confidence?: number;
  evidence_diff_ids?: string[];
  example?: { before?: string; after?: string } | null;
};

type ModelAnswer = {
  rules?: ModelRule[];
  retire_ids?: string[];
};

// ---------------------------------------------------------------------------
// Capture

async function captureBrief(
  admin: SupabaseClient,
  snap: SnapshotRow,
  campaignId: string | null,
): Promise<boolean> {
  const { data: finalJson, error } = await admin.rpc('brief_snapshot_json', {
    p_brief_id: snap.brief_id,
  });
  if (error || !finalJson) return false;
  const final = finalJson as Snapshot;
  const diff = diffSnapshots(snap.snapshot, final);
  const { error: insertError } = await admin.from('brief_edit_diffs').upsert(
    {
      company_id: snap.company_id,
      brief_id: snap.brief_id,
      snapshot_id: snap.id,
      campaign_id: campaignId,
      post_type_key: snap.post_type_key,
      source_kind: snap.source_kind,
      final_snapshot: final,
      diff,
      changed_fields: diff.changed_fields,
      edit_ratio: diff.edit_ratio,
      published_at: new Date().toISOString(),
    },
    { onConflict: 'brief_id' },
  );
  return !insertError;
}

/** Briefs to capture: the given ids, else every published brief with a snapshot and no diff. */
async function captureTargets(
  admin: SupabaseClient,
  body: Body,
  companyId: string | null,
): Promise<Array<{ snap: SnapshotRow; campaignId: string | null }>> {
  let query = admin
    .from('brief_ai_snapshots')
    .select('id, company_id, brief_id, source_kind, post_type_key, snapshot');
  if (companyId) query = query.eq('company_id', companyId);
  if (body.brief_ids?.length) query = query.in('brief_id', body.brief_ids);
  const { data: snaps } = await query;
  if (!snaps?.length) return [];

  const briefIds = snaps.map((s) => s.brief_id);
  const [{ data: existing }, { data: assigned }] = await Promise.all([
    admin.from('brief_edit_diffs').select('brief_id').in('brief_id', briefIds),
    admin
      .from('assignments')
      .select('brief_id, campaign_id')
      .in('brief_id', briefIds),
  ]);
  const done = new Set((existing ?? []).map((r) => r.brief_id));
  const campaignByBrief = new Map<string, string | null>();
  for (const a of assigned ?? []) {
    if (!campaignByBrief.has(a.brief_id)) campaignByBrief.set(a.brief_id, a.campaign_id ?? null);
  }
  return (snaps as SnapshotRow[])
    .filter((s) => !done.has(s.brief_id))
    // Only published briefs count: publishing is the moment the manager
    // signed off, so an unassigned brief is still being edited.
    .filter((s) => body.brief_ids?.length || campaignByBrief.has(s.brief_id))
    .map((s) => ({ snap: s, campaignId: body.campaign_id ?? campaignByBrief.get(s.brief_id) ?? null }));
}

// ---------------------------------------------------------------------------
// Distill

function examplesOf(raw: unknown): Array<{ before: string; after: string }> {
  return Array.isArray(raw)
    ? (raw as Array<{ before?: unknown; after?: unknown }>)
        .filter((e) => typeof e.before === 'string' && typeof e.after === 'string')
        .map((e) => ({ before: String(e.before), after: String(e.after) }))
        .slice(0, 3)
    : [];
}

function rulesForModel(rules: LearningRow[]): string {
  if (!rules.length) return 'CURRENT RULES: none yet.';
  return `CURRENT RULES (keep, sharpen, merge or retire; reference by id):\n${rules
    .map(
      (r) =>
        `- id ${r.id} [${r.category}] confidence ${Number(r.confidence).toFixed(2)} evidence ${r.evidence_count}: ${r.insight}`,
    )
    .join('\n')}`;
}

function distillSystem(scope: 'company' | 'global'): string {
  const who =
    scope === 'company'
      ? 'one brand\'s campaign manager'
      : 'campaign managers at many different brands';
  const generalise =
    scope === 'global'
      ? ' These rules apply to every brand, so never mention a product, brand, feature name or niche; state what works for short form UGC in general.'
      : ' Rules may name this brand\'s products, features, audience and preferred phrasings.';
  return `You maintain the rule set an AI uses to write UGC post briefs (hook, talking points, script, caption, hashtags, on-screen text, screenshot choice and placement, layout) for TikTok and Instagram. Below are edits ${who} made to AI written posts before publishing them. Each edit is the manager telling the AI what it got wrong. Your job: turn the edits into a small set of precise, actionable rules so the next post needs fewer edits.${generalise}

How to think:
- A change repeated across posts is a rule. A single one-off change is at most a low confidence rule, and only if it reveals a clear preference.
- Say exactly what to do, not what was wrong. "Open the hook with the search phrase as a question" beats "hooks were weak".
- Prefer sharpening or merging an existing rule (return its id) over adding a near duplicate. Retire rules the new evidence contradicts.
- Confidence 0 to 1 reflects how many independent edits support the rule and how consistent they are. Never above 0.95.
- Keep the total under ${MAX_ACTIVE_RULES} rules. Fewer, sharper rules win.
- Categories: ${CATEGORIES.join(', ')}.

Answer with a single JSON object, no markdown fences, no preamble:
{"rules": [{"id": string | null, "category": string, "insight": string, "confidence": number, "evidence_diff_ids": string[], "example": {"before": string, "after": string} | null}], "retire_ids": string[]}
"id" is an existing rule id when you are updating it, null for a new rule. "example" is one short before/after pair copied verbatim from the edits (under 200 characters each) that best shows the rule, or null. "retire_ids" are existing rules to switch off.`;
}

async function applyRules(
  admin: SupabaseClient,
  companyId: string | null,
  existing: LearningRow[],
  answer: ModelAnswer,
  diffIds: string[],
): Promise<number> {
  const byId = new Map(existing.map((r) => [r.id, r]));
  const now = new Date().toISOString();
  let written = 0;
  const diffIdSet = new Set(diffIds);

  for (const rule of answer.rules ?? []) {
    const insight = rule.insight?.trim();
    if (!insight) continue;
    const category = CATEGORIES.includes(rule.category as LearningCategory)
      ? (rule.category as LearningCategory)
      : 'other';
    const confidence = Math.min(0.95, Math.max(0.05, Number(rule.confidence ?? 0.4)));
    const evidence = (rule.evidence_diff_ids ?? []).filter((id) => diffIdSet.has(id));
    const example =
      rule.example && typeof rule.example.before === 'string' && typeof rule.example.after === 'string'
        ? [{ before: rule.example.before.slice(0, 240), after: rule.example.after.slice(0, 240) }]
        : [];

    const prior = rule.id ? byId.get(rule.id) : undefined;
    if (prior) {
      const priorExamples = examplesOf(prior.examples);
      const { error } = await admin
        .from('ai_learnings')
        .update({
          category,
          insight,
          confidence,
          evidence_count: prior.evidence_count + evidence.length,
          examples: [...example, ...priorExamples].slice(0, 3),
          source_diff_ids: [...new Set([...prior.source_diff_ids, ...evidence])],
          active: true,
          updated_at: now,
        })
        .eq('id', prior.id);
      if (!error) written += 1;
      continue;
    }
    const { error } = await admin.from('ai_learnings').insert({
      company_id: companyId,
      category,
      insight,
      confidence,
      evidence_count: Math.max(1, evidence.length),
      examples: example,
      source_diff_ids: evidence,
      active: true,
    });
    if (!error) written += 1;
  }

  const retire = (answer.retire_ids ?? []).filter((id) => byId.has(id));
  if (retire.length) {
    await admin
      .from('ai_learnings')
      .update({ active: false, updated_at: now })
      .in('id', retire);
  }
  return written;
}

async function loadRules(admin: SupabaseClient, companyId: string | null): Promise<LearningRow[]> {
  let query = admin
    .from('ai_learnings')
    .select('id, category, insight, confidence, evidence_count, examples, source_diff_ids')
    .eq('active', true)
    .order('confidence', { ascending: false });
  query = companyId ? query.eq('company_id', companyId) : query.is('company_id', null);
  const { data } = await query;
  return (data ?? []) as LearningRow[];
}

async function distillCompany(admin: SupabaseClient, companyId: string): Promise<number> {
  const { data } = await admin
    .from('brief_edit_diffs')
    .select('id, company_id, post_type_key, source_kind, diff, edit_ratio')
    .eq('company_id', companyId)
    .is('learned_at', null)
    .order('published_at', { ascending: true })
    .limit(MAX_DIFFS_PER_COMPANY_RUN);
  const diffs = (data ?? []) as DiffRow[];
  if (diffs.length < MIN_DIFFS_TO_DISTILL) return 0;

  const [{ data: company }, rules] = await Promise.all([
    admin.from('companies').select('name').eq('id', companyId).single(),
    loadRules(admin, companyId),
  ]);

  const edits = diffs
    .map((d) => `diff_id ${d.id}\n${summarizeDiff(d.diff, d.post_type_key)}`)
    .join('\n\n');
  const user = [
    `Brand: ${company?.name ?? 'unknown'}`,
    rulesForModel(rules),
    `NEW EDITS (${diffs.length} posts):\n\n${edits}`,
  ].join('\n\n');

  const raw = await askClaude(distillSystem('company'), user, 4096);
  const answer = parseClaudeJson<ModelAnswer>(raw);
  const written = await applyRules(admin, companyId, rules, answer, diffs.map((d) => d.id));

  await admin
    .from('brief_edit_diffs')
    .update({ learned_at: new Date().toISOString() })
    .in('id', diffs.map((d) => d.id));
  return written;
}

async function distillGlobal(admin: SupabaseClient): Promise<number> {
  const { data } = await admin
    .from('brief_edit_diffs')
    .select('id, company_id, post_type_key, source_kind, diff, edit_ratio')
    .is('global_learned_at', null)
    .order('published_at', { ascending: true })
    .limit(MAX_DIFFS_PER_GLOBAL_RUN);
  const diffs = (data ?? []) as DiffRow[];
  const companies = new Set(diffs.map((d) => d.company_id));
  if (companies.size < MIN_COMPANIES_FOR_GLOBAL) return 0;

  const rules = await loadRules(admin, null);
  const edits = diffs
    .map((d) => `diff_id ${d.id}\n${summarizeDiff(d.diff, d.post_type_key)}`)
    .join('\n\n');
  const user = [
    `${diffs.length} edited posts across ${companies.size} brands.`,
    rulesForModel(rules),
    `NEW EDITS:\n\n${edits}`,
  ].join('\n\n');

  const raw = await askClaude(distillSystem('global'), user, 4096);
  const answer = parseClaudeJson<ModelAnswer>(raw);
  const written = await applyRules(admin, null, rules, answer, diffs.map((d) => d.id));

  await admin
    .from('brief_edit_diffs')
    .update({ global_learned_at: new Date().toISOString() })
    .in('id', diffs.map((d) => d.id));
  return written;
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);
  if (caller.kind === 'user' && caller.role !== 'campaign_manager') {
    return jsonResponse({ error: 'forbidden' }, 403);
  }
  const body = ((await req.json().catch(() => null)) ?? {}) as Body;
  const companyId = caller.kind === 'user' ? caller.companyId : null;

  try {
    const targets = await captureTargets(admin, body, companyId);
    let captured = 0;
    for (const t of targets) {
      if (await captureBrief(admin, t.snap, t.campaignId)) captured += 1;
    }

    const companies = companyId
      ? [companyId]
      : [...new Set(targets.map((t) => t.snap.company_id))];
    if (!companyId) {
      const { data: pending } = await admin
        .from('brief_edit_diffs')
        .select('company_id')
        .is('learned_at', null);
      for (const row of pending ?? []) companies.push(row.company_id);
    }
    let rulesWritten = 0;
    for (const id of new Set(companies)) {
      try {
        rulesWritten += await distillCompany(admin, id);
      } catch (e) {
        console.error(`learn-from-edits: company ${id} distill failed:`, e);
      }
    }

    let globalRules = 0;
    if (caller.kind === 'cron') {
      try {
        globalRules = await distillGlobal(admin);
      } catch (e) {
        console.error('learn-from-edits: global distill failed:', e);
      }
    }

    return jsonResponse({ captured, rules_written: rulesWritten, global_rules_written: globalRules });
  } catch (e) {
    console.error('learn-from-edits failed:', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'failed' }, 500);
  }
});

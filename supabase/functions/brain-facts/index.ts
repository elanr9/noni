// The Brain page's data: every record with where it came from, and the
// actions a person takes on them. Campaign managers and admins read; changes
// need a company admin or the manage_brand permission.
//
// POST { action: 'list' }
//   200 { groups: [{ entity_type, label, facts: FactView[] }], conflicts: Conflict[],
//         questions: Question[], coverage: number, missing: string[] }
//   FactView = BrainFact & { in_conflict: boolean, overdue: boolean,
//     source_details: [{ source_id, excerpt, kind, url, title, captured_at }] }
//   Groups with conflicts come first; inside a group, conflicting, disputed and
//   least certain records come first and confirmed ones last. Retired records
//   are left out unless { include_retired: true }.
// POST { action: 'confirm', fact_id }                         200 { fact }
// POST { action: 'edit', fact_id, title?, data? }             200 { fact }
// POST { action: 'reject', fact_id }                          200 { fact }
// POST { action: 'resolve_conflict', conflict_id, keep_fact_id: string | null }
//                                                             200 { fact: BrainFact | null }
// POST { action: 'add', entity_type, title, data, key? }      200 { fact, outcome }
// POST { action: 'answer_question', question_id, answer }     200 { ok: true, facts: BrainFact[], extract_error: string | null }
// POST { action: 'dismiss_question', question_id }            200 { ok: true }
// Errors: 4xx/5xx { error }.

import type { BrainFact, EntityType } from '../_shared/ai/contracts.ts';
import {
  addManualFact,
  answerQuestion,
  type BrainConflict,
  computeCoverage,
  confirmFact,
  editFact,
  embedPending,
  ENTITIES,
  ENTITY_TYPES,
  FACT_COLUMNS,
  overdue,
  rejectFact,
  resolveConflict,
  reviewOrder,
} from '../_shared/ai/brain.ts';
import { type BrainCaller, brainCaller, errorResponse, text } from '../_shared/ai/brainHttp.ts';
import { jsonResponse } from '../_shared/wp8.ts';

async function list({ admin, companyId, body }: BrainCaller): Promise<Response> {
  const statuses = ['inferred', 'confirmed', 'disputed', 'stale', ...(body.include_retired === true ? ['retired'] : [])];
  const [{ data: factRows, error }, { data: conflictRows }, { data: questions }] = await Promise.all([
    admin.from('brain_facts').select(FACT_COLUMNS).eq('company_id', companyId).in('status', statuses).limit(3000),
    admin.from('brain_conflicts').select('*').eq('company_id', companyId).is('resolved_at', null).order('detected_at', { ascending: false }),
    admin
      .from('brain_questions')
      .select('id, question, why, entity_type, asked_by, created_at')
      .eq('company_id', companyId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  if (error) return jsonResponse({ error: error.message }, 500);
  const facts = (factRows ?? []) as unknown as BrainFact[];
  const conflicts = (conflictRows ?? []) as BrainConflict[];
  const now = new Date();

  const sourceIds = [...new Set(facts.flatMap((f) => f.sources.map((s) => s.source_id)))];
  const sources = new Map<string, { kind: string; url: string | null; title: string | null; captured_at: string }>();
  for (let i = 0; i < sourceIds.length; i += 200) {
    const { data } = await admin
      .from('brain_sources')
      .select('id, kind, url, title, captured_at')
      .in('id', sourceIds.slice(i, i + 200));
    for (const s of data ?? []) sources.set(s.id as string, s as never);
  }

  const inConflict = new Set(conflicts.flatMap((c) => c.fact_ids));
  const ordered = reviewOrder(facts, inConflict, now).map((f) => ({
    ...f,
    in_conflict: inConflict.has(f.id),
    overdue: overdue(f, now),
    source_details: f.sources.map((ref) => ({ ...ref, ...(sources.get(ref.source_id) ?? { kind: 'manual', url: null, title: null, captured_at: null }) })),
  }));
  const groups = ENTITY_TYPES
    .map((type) => ({ entity_type: type, label: ENTITIES[type].label, facts: ordered.filter((f) => f.entity_type === type) }))
    .filter((g) => g.facts.length)
    // Stable sort: groups holding a conflict first, otherwise the declared order.
    .sort((a, b) => Number(b.facts.some((f) => f.in_conflict)) - Number(a.facts.some((f) => f.in_conflict)));

  return jsonResponse({ groups, conflicts, questions: questions ?? [], ...computeCoverage(facts, now) });
}

Deno.serve(async (req) => {
  const caller = await brainCaller(req);
  if (caller instanceof Response) return caller;
  const { admin, companyId, userId, body } = caller;
  const action = text(body.action) || 'list';
  try {
    if (action === 'list') return await list(caller);
    if (!caller.canWrite) return jsonResponse({ error: 'forbidden' }, 403);

    const factId = text(body.fact_id);
    const settle = () => embedPending(admin, companyId, { limit: 4 }).catch(() => 0);
    if (action === 'confirm' || action === 'edit' || action === 'reject') {
      if (!factId) return jsonResponse({ error: 'fact_id is required' }, 400);
      const fact = action === 'confirm'
        ? await confirmFact(admin, companyId, factId, userId)
        : action === 'reject'
        ? await rejectFact(admin, companyId, factId, userId)
        : await editFact(admin, companyId, factId, {
          title: text(body.title) || undefined,
          data: body.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : undefined,
        }, userId);
      await settle();
      return jsonResponse({ fact });
    }
    if (action === 'resolve_conflict') {
      const conflictId = text(body.conflict_id);
      if (!conflictId) return jsonResponse({ error: 'conflict_id is required' }, 400);
      const fact = await resolveConflict(admin, companyId, conflictId, text(body.keep_fact_id) || null, userId);
      await settle();
      return jsonResponse({ fact });
    }
    if (action === 'add') {
      const type = text(body.entity_type) as EntityType;
      if (!ENTITY_TYPES.includes(type)) return jsonResponse({ error: 'Unknown record type' }, 400);
      const outcome = await addManualFact(admin, companyId, {
        entity_type: type,
        title: text(body.title),
        data: body.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : {},
        key: text(body.key) || undefined,
      }, userId);
      await settle();
      return jsonResponse({ fact: outcome.fact, outcome: { action: outcome.action, reason: outcome.reason, conflict_id: outcome.conflictId } });
    }
    if (action === 'answer_question') {
      const questionId = text(body.question_id);
      if (!questionId) return jsonResponse({ error: 'question_id is required' }, 400);
      const { facts, extractError } = await answerQuestion(admin, companyId, questionId, text(body.answer), userId);
      return jsonResponse({ ok: true, facts, extract_error: extractError });
    }
    if (action === 'dismiss_question') {
      const questionId = text(body.question_id);
      if (!questionId) return jsonResponse({ error: 'question_id is required' }, 400);
      const { error } = await admin
        .from('brain_questions')
        .update({ status: 'dismissed', answered_by: userId, answered_at: new Date().toISOString() })
        .eq('company_id', companyId)
        .eq('id', questionId);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true });
    }
    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (err) {
    return errorResponse(err);
  }
});

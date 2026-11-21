// The onboarding survey: the ten founder questions (and one optional one for
// business software), each with a draft answer taken from the scan and the
// source it came from, so the person confirms or corrects instead of
// composing. Campaign managers and admins read; answering needs a company
// admin or the manage_brand permission.
//
// POST { action: 'get' }
//   200 { survey: { step, updated_at, completed_at },
//         questions: [{ key, question, hint, why, optional, accepts: string[],
//           suggestion: { text, fact_ids: string[], sources: [{ title, url, kind, excerpt }] } | null,
//           answer: { answer, answered_by, answered_at, fact_ids: string[] } | null }],
//         coverage: number, missing: string[] }
// POST { action: 'answer', key, answer, step?: number }
//   200 { answer: { answer, answered_by, answered_at, fact_ids }, facts: BrainFact[],
//         conflicts: number, extract_error: string | null, coverage, missing,
//         references: [{ url, stance: 'liked' | 'disliked' }] }
//   The answer is saved even when extract_error is set; its records arrive
//   with the next brain-ingest run. For the `voice` question, the TikTok and
//   Instagram links in the answer are analysed in the background after the
//   response; each one that can be read becomes a liked or disliked reference
//   in the brain (see _shared/ai/voiceReferences.ts). `references` lists them.
// POST { action: 'save_step', step: number }     200 { ok: true }
// POST { action: 'complete' }                    200 { completed_at, coverage, missing }
// POST { action: 'snapshot', rebuild?: boolean }  200 { snapshot: CompanySnapshot | null }
//   The short summary of the company (what it sells, who it is for, core
//   features, the viral one). Built when missing and there are records.
// POST { action: 'snapshot_settle', part, index?, decision: 'confirm'|'dismiss', title?, text? }
//   200 { snapshot }
// Errors: 4xx/5xx { error }.

import {
  buildCompanySnapshot,
  computeCoverage,
  loadCompanySnapshot,
  settleSnapshotItem,
  type SnapshotPart,
  loadLiveFacts,
  recordSurveyAnswer,
  type SurveyAnswer,
  type SurveySuggestion,
  SURVEY_QUESTIONS,
} from '../_shared/ai/brain.ts';
import { brainCaller, errorResponse, text } from '../_shared/ai/brainHttp.ts';
import { analyzeVoiceReferences, parseVoiceReferences } from '../_shared/ai/voiceReferences.ts';
import { jsonResponse } from '../_shared/wp8.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

Deno.serve(async (req) => {
  const caller = await brainCaller(req);
  if (caller instanceof Response) return caller;
  const { admin, companyId, userId, body } = caller;
  const action = text(body.action) || 'get';
  const coverage = async () => computeCoverage(await loadLiveFacts(admin, companyId), new Date());
  const nowIso = () => new Date().toISOString();
  try {
    if (action === 'get') {
      const { data: row } = await admin.from('brain_survey').select('*').eq('company_id', companyId).maybeSingle();
      const answers = (row?.answers ?? {}) as Record<string, SurveyAnswer>;
      const suggestions = (row?.suggestions ?? {}) as Record<string, SurveySuggestion>;
      return jsonResponse({
        survey: { step: row?.step ?? 0, updated_at: row?.updated_at ?? null, completed_at: row?.completed_at ?? null },
        questions: SURVEY_QUESTIONS.map((q) => ({
          key: q.key,
          question: q.question,
          hint: q.hint,
          why: q.why,
          optional: q.optional,
          accepts: q.accepts,
          suggestion: suggestions[q.key] ?? null,
          answer: answers[q.key] ?? null,
        })),
        ...(await coverage()),
      });
    }
    if (action === 'snapshot') {
      const existing = body.rebuild === true ? null : await loadCompanySnapshot(admin, companyId);
      if (existing) return jsonResponse({ snapshot: existing });
      if (!caller.canWrite) return jsonResponse({ snapshot: null });
      return jsonResponse({ snapshot: await buildCompanySnapshot(admin, companyId) });
    }
    if (!caller.canWrite) return jsonResponse({ error: 'forbidden' }, 403);

    if (action === 'answer') {
      const key = text(body.key);
      // The answer is stored before this returns; its records are made in the
      // background so the person moves on at once.
      const out = await recordSurveyAnswer(admin, companyId, key, text(body.answer), userId, {}, {
        background: (work) => EdgeRuntime.waitUntil(work),
      });
      if (typeof body.step === 'number') {
        await admin.from('brain_survey').update({ step: body.step, updated_at: nowIso() }).eq('company_id', companyId);
      }
      const references = key === 'voice' ? parseVoiceReferences(text(body.answer)) : [];
      if (references.length) {
        // Each analysis takes a minute or more; the answer does not wait for them.
        EdgeRuntime.waitUntil(
          analyzeVoiceReferences(admin, companyId, references, { surveySourceId: out.source.id, userId }).catch((e) =>
            console.error('brain-survey voice references failed:', e instanceof Error ? e.message : e)
          ),
        );
      }
      const { data: row } = await admin.from('brain_survey').select('answers').eq('company_id', companyId).maybeSingle();
      return jsonResponse({
        answer: ((row?.answers ?? {}) as Record<string, SurveyAnswer>)[key] ?? null,
        facts: out.facts,
        conflicts: out.conflicts,
        extract_error: out.extractError,
        references: references.map((r) => ({ url: r.url, stance: r.stance })),
        ...(await coverage()),
      });
    }
    if (action === 'snapshot_settle') {
      const part = text(body.part) as SnapshotPart;
      if (!['sells', 'audience', 'features', 'viral'].includes(part)) return jsonResponse({ error: 'Unknown part' }, 400);
      const decision = text(body.decision) === 'dismiss' ? 'dismiss' : 'confirm';
      const snapshot = await settleSnapshotItem(
        admin,
        companyId,
        {
          part,
          index: typeof body.index === 'number' ? body.index : undefined,
          action: decision,
          title: typeof body.title === 'string' ? body.title : undefined,
          text: typeof body.text === 'string' ? body.text : undefined,
        },
        userId,
      );
      return jsonResponse({ snapshot });
    }
    if (action === 'save_step') {
      if (typeof body.step !== 'number') return jsonResponse({ error: 'step is required' }, 400);
      const { error } = await admin
        .from('brain_survey')
        .upsert({ company_id: companyId, step: body.step, updated_at: nowIso() }, { onConflict: 'company_id' });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true });
    }
    if (action === 'complete') {
      const completedAt = nowIso();
      const { error } = await admin
        .from('brain_survey')
        .upsert({ company_id: companyId, completed_at: completedAt, updated_at: completedAt }, { onConflict: 'company_id' });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ completed_at: completedAt, ...(await coverage()) });
    }
    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (err) {
    return errorResponse(err);
  }
});

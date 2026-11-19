// Captures a raw learning signal as a brain source (see _shared/ai/signals.ts).
// Nothing is distilled here and no model is called.
//
// POST { signal: 'brief_edit', library_brief_id, brief_type, draft, saved }
//   Campaign managers. `draft` is the engine's plan as the app received it
//   ({ title, clips: [{ say, onScreen, cta }], caption, tags, hooks, angle }),
//   `saved` is the brief as saved ({ title, clips, caption, tags }).
// POST { signal: 'edit_plan', assignment_id, delta }
//   The creator who owns the post, or a manager of its company. `delta` is
//   lib/auto-edit.ts editPlanDelta(document) at submission.
// 200 { ok: true, source_id, created }   created false: the same signal was already stored
// Errors: 4xx/5xx { error }.

import { addSource } from '../_shared/ai/brain.ts';
import { briefEditSignal, editPlanSignal, renderSignal } from '../_shared/ai/signals.ts';
import { adminClient, authenticate, handleCors, jsonResponse } from '../_shared/wp8.ts';

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller || caller.kind !== 'user') return jsonResponse({ error: 'unauthorized' }, 401);
  if (!caller.companyId) return jsonResponse({ error: 'no active company' }, 400);
  const companyId = caller.companyId;
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;

  try {
    if (body.signal === 'brief_edit') {
      if (caller.role !== 'campaign_manager') return jsonResponse({ error: 'forbidden' }, 403);
      const libraryBriefId = text(body.library_brief_id, 80);
      if (!libraryBriefId || !body.draft || !body.saved) return jsonResponse({ error: 'library_brief_id, draft and saved are required' }, 400);
      const signal = briefEditSignal({ libraryBriefId, briefType: text(body.brief_type, 40) || 'Talking Head', draft: body.draft, saved: body.saved });
      if (!signal.clips.length) return jsonResponse({ error: 'the draft and the saved brief have no clips' }, 400);
      const { source, created } = await addSource(admin, {
        companyId,
        kind: 'manual',
        // A person chose every word of the saved side.
        tier: 1,
        title: `Brief edit: ${text((body.saved as { title?: unknown }).title, 120) || libraryBriefId}`,
        content: renderSignal(signal),
        meta: { signal: signal.signal, record: signal },
        createdBy: caller.userId,
        hashSalt: `signal:brief_edit:${libraryBriefId}`,
        skipExtract: true,
        noIndex: true,
      });
      return jsonResponse({ ok: true, source_id: source.id, created });
    }

    if (body.signal === 'edit_plan') {
      const assignmentId = text(body.assignment_id, 60);
      if (!assignmentId) return jsonResponse({ error: 'assignment_id is required' }, 400);
      const { data: assignment } = await admin
        .from('assignments')
        .select('id, company_id, creator_id, library_brief_id, briefs:brief_id ( format )')
        .eq('id', assignmentId)
        .maybeSingle();
      const row = assignment as { company_id: string; creator_id: string; library_brief_id: string | null; briefs: { format: string | null } | null } | null;
      if (!row || row.company_id !== companyId) return jsonResponse({ error: 'post not found' }, 404);
      if (row.creator_id !== caller.userId && caller.role !== 'campaign_manager') return jsonResponse({ error: 'forbidden' }, 403);
      const signal = editPlanSignal({ assignmentId, libraryBriefId: row.library_brief_id ?? null, format: row.briefs?.format ?? null, delta: body.delta });
      if (!signal) return jsonResponse({ error: 'delta is not an edit plan delta' }, 400);
      const { source, created } = await addSource(admin, {
        companyId,
        kind: 'manual',
        // What one creator did to one cut: evidence of taste, not a statement about the product.
        tier: 4,
        title: `Edit plan: post ${assignmentId}`,
        content: renderSignal(signal),
        meta: { signal: signal.signal, record: signal },
        createdBy: caller.userId,
        hashSalt: `signal:edit_plan:${assignmentId}`,
        skipExtract: true,
        noIndex: true,
      });
      return jsonResponse({ ok: true, source_id: source.id, created });
    }

    return jsonResponse({ error: 'Unknown signal' }, 400);
  } catch (e) {
    console.error('brain-signal failed', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'failed' }, 500);
  }
});

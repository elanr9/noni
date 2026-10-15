// Edit my video: the creator's raw takes of one reel in, an edited
// timeline out. Every take is transcribed (Deepgram, word timestamps), then
// Claude marks retakes and stumbles to cut, writes the hook and one header
// per tip on the word that starts it, and says when a feature recording
// should pop up. _shared/autoEdit.ts turns that into blocks and overlays on
// the output clock. Nothing renders here; the app applies the result to
// its edit document and the creator keeps editing.
//
// Body: { assignment_id, takes: [{ asset_id, storage_path, duration_ms, words? }],
//         features?: [{ id, title, description, kind: 'clip' | 'still' }],
//         mode?: 'words' }
// Reply: { takes: [{ asset_id, words }], blocks, texts, media, cut_ms, ai }
//
// A take that already carries words skips Deepgram: the app transcribes each
// take as soon as it uploads (mode 'words', which returns only the
// transcripts), so by the time the creator taps Done only the plan is left.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { askClaude, handleCors, jsonResponse, parseClaudeJson } from '../_shared/wp8.ts';
import { MANAGER_MEMBER_ROLES, memberRole } from '../_shared/membership.ts';
import { transcribeClip, type TranscriptWord } from '../_shared/cues.ts';
import {
  autoEditPrompt,
  buildAutoEdit,
  fallbackPlan,
  parsePlan,
  type AutoBrief,
  type AutoFeature,
  type AutoPlan,
  type AutoTake,
} from '../_shared/autoEdit.ts';

type BodyTake = { asset_id?: unknown; storage_path?: unknown; duration_ms?: unknown; words?: unknown };
type BodyFeature = { id?: unknown; title?: unknown; description?: unknown; kind?: unknown };
type Body = { assignment_id?: unknown; takes?: unknown; features?: unknown; mode?: unknown };

const SIGNED_URL_TTL_SECONDS = 600;
const MAX_TAKES = 20;
const MAX_FEATURES = 12;
const CLAUDE_TIMEOUT_MS = 35_000;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Words the app already has for a take; null when absent or malformed. */
function parseWords(raw: unknown): TranscriptWord[] | null {
  if (!Array.isArray(raw)) return null;
  const out: TranscriptWord[] = [];
  for (const w of raw) {
    if (typeof w !== 'object' || w === null) return null;
    const { w: text, s, e } = w as { w?: unknown; s?: unknown; e?: unknown };
    if (typeof text !== 'string' || typeof s !== 'number' || typeof e !== 'number') return null;
    out.push({ w: text, s: Math.round(s), e: Math.round(e) });
  }
  return out;
}

function slidePoints(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const s of raw) {
    if (typeof s !== 'object' || s === null) continue;
    const role = (s as { role?: unknown }).role;
    const text = str((s as { text?: unknown }).text);
    if (role === 'point' && text) out.push(text);
  }
  return out.slice(0, 10);
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const assignmentId = str(body?.assignment_id);
    const rawTakes = Array.isArray(body?.takes) ? (body!.takes as BodyTake[]) : [];
    if (!assignmentId || rawTakes.length === 0 || rawTakes.length > MAX_TAKES) {
      return jsonResponse({ error: 'expected { assignment_id, takes: [{ asset_id, storage_path, duration_ms }] }' }, 400);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const userId = (await admin.auth.getUser(token)).data?.user?.id ?? null;
    if (!userId) return jsonResponse({ error: 'unauthorized' }, 401);

    const { data: assignment } = await admin
      .from('assignments')
      .select('id, company_id, brief_id, creator_id')
      .eq('id', assignmentId)
      .maybeSingle();
    if (!assignment) return jsonResponse({ error: 'assignment not found' }, 404);
    const companyId = assignment.company_id as string;

    if (assignment.creator_id !== userId) {
      const { data: caller } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle();
      const role = caller?.role === 'admin' ? null : await memberRole(admin, userId, companyId);
      const allowed = caller?.role === 'admin' || (role !== null && MANAGER_MEMBER_ROLES.includes(role));
      if (!allowed) return jsonResponse({ error: 'forbidden' }, 403);
    }

    const takesIn: { assetId: string; path: string; durationMs: number; words: TranscriptWord[] | null }[] = [];
    for (const t of rawTakes) {
      const assetId = str(t.asset_id);
      const path = str(t.storage_path);
      const durationMs = typeof t.duration_ms === 'number' && t.duration_ms > 0 ? Math.round(t.duration_ms) : 0;
      if (!assetId || !path) return jsonResponse({ error: 'every take needs asset_id and storage_path' }, 400);
      if (!path.startsWith(`${companyId}/`)) return jsonResponse({ error: 'forbidden' }, 403);
      takesIn.push({ assetId, path, durationMs, words: parseWords(t.words) });
    }
    const wordsOnly = body?.mode === 'words';

    const features: AutoFeature[] = [];
    for (const f of Array.isArray(body?.features) ? (body!.features as BodyFeature[]) : []) {
      const id = str(f.id);
      const title = str(f.title);
      if (!id || !title) continue;
      features.push({ id, title, description: str(f.description) ?? '', kind: f.kind === 'clip' ? 'clip' : 'still' });
      if (features.length >= MAX_FEATURES) break;
    }

    const deepgramKey = Deno.env.get('DEEPGRAM_API_KEY');
    if (!deepgramKey) return jsonResponse({ error: 'DEEPGRAM_API_KEY not configured' }, 500);

    const briefId = (assignment.brief_id ?? null) as string | null;
    const [{ data: company }, { data: briefRow }] = await Promise.all([
      admin.from('companies').select('name').eq('id', companyId).maybeSingle(),
      briefId
        ? admin
            .from('briefs')
            .select('title, creator_note, cta, slides, post_types ( key, label )')
            .eq('id', briefId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const companyName = str(company?.name);
    const postType = (briefRow?.post_types ?? null) as { key?: string; label?: string } | null;
    const title = str(briefRow?.title);
    const brief: AutoBrief = {
      title: title && title !== 'Untitled post' ? title : '',
      postTypeKey: postType?.key ?? null,
      postTypeName: postType?.label ?? null,
      note: str(briefRow?.creator_note),
      cta: str(briefRow?.cta),
      points: slidePoints(briefRow?.slides),
      companyName,
    };

    // Transcribe every take at once; one that fails keeps its speech (no words, nothing cut).
    const keyterms = [companyName, ...features.map((f) => f.title)].filter((k): k is string => !!k).slice(0, 20);
    const takes: AutoTake[] = await Promise.all(
      takesIn.map(async (t) => {
        let words: TranscriptWord[] = t.words ?? [];
        if (t.words) return { assetId: t.assetId, durationMs: t.durationMs || (words.length ? words[words.length - 1].e + 500 : 0), words };
        try {
          const { data: signed } = await admin.storage.from('videos').createSignedUrl(t.path, SIGNED_URL_TTL_SECONDS);
          if (signed?.signedUrl) words = await transcribeClip({ url: signed.signedUrl, apiKey: deepgramKey, keyterms });
        } catch (e) {
          console.warn(`auto-edit: transcription failed for ${t.path}`, e);
        }
        const last = words[words.length - 1];
        const durationMs = t.durationMs || (last ? last.e + 500 : 0);
        return { assetId: t.assetId, durationMs, words };
      }),
    );

    if (wordsOnly) {
      return jsonResponse({
        takes: takes.map((t) => ({ asset_id: t.assetId, duration_ms: t.durationMs, words: t.words })),
        blocks: [],
        texts: [],
        media: [],
        cut_ms: 0,
        ai: false,
      });
    }

    let plan: AutoPlan = fallbackPlan(brief);
    let ai = false;
    if (takes.some((t) => t.words.length > 0)) {
      try {
        const { system, user } = autoEditPrompt(brief, takes, features);
        const text = await askClaude(system, user, 1500, { timeoutMs: CLAUDE_TIMEOUT_MS });
        const parsed = parsePlan(parseClaudeJson<unknown>(text), takes, features.map((f) => f.id));
        plan = { ...parsed, hook: parsed.hook ?? plan.hook };
        ai = true;
      } catch (e) {
        console.warn('auto-edit: plan failed, using the fallback', e);
      }
    }

    const result = buildAutoEdit(takes, plan);
    return jsonResponse({
      takes: takes.map((t) => ({ asset_id: t.assetId, duration_ms: t.durationMs, words: t.words })),
      blocks: result.blocks.map((b) => ({ asset_id: b.assetId, in_ms: b.inMs, out_ms: b.outMs })),
      texts: result.texts.map((t) => ({ role: t.role, text: t.text, start_ms: t.startMs, end_ms: t.endMs })),
      media: result.media.map((m) => ({ feature_id: m.featureId, start_ms: m.startMs, end_ms: m.endMs })),
      cut_ms: result.cutMs,
      ai,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});

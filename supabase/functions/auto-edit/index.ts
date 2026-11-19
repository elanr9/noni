// Auto edit: the creator's raw takes of one post in, an edit plan out. Every
// take is transcribed (Deepgram, word timestamps) unless the app already
// holds its words, then _shared/ai/editPlanner.ts plans the edit: which
// ranges to keep and in what order, punch-ins, speed, on-screen text timed
// to the words, product media, captions and the brief's sound. Nothing
// renders here; the app applies the plan to its edit document
// (lib/auto-edit.ts applyEditPlan) and the creator keeps editing.
//
// Body: { assignment_id,
//         takes: [{ asset_id, storage_path, duration_ms, words?, slot? }],
//         features?: [{ id, title, description, kind: 'clip' | 'still', duration_ms? }],
//         overlays?: [{ id, text, start_ms, end_ms, y }],   text already on the video
//         frames?: [{ asset_id, base64, media_type }],      optional still per take
//         mode?: 'words' }
// Reply: { takes: [{ asset_id, duration_ms, words }],
//          plan: EditPlan | null,            null only in mode 'words'
//          replace_overlay_ids, repairs, fallback_reason, sound_track, run_id,
//          media_assets: [{ id, title, kind, path }],   brain demo moments the plan may insert
//          unheard: [asset_id],                         takes that could not be transcribed
//          blocks, texts, media, cut_ms, ai }   the older flat fields, from the plan
//
// `ai` false with a `fallback_reason` means the model did not plan this edit
// and the plan is the plain trim from the word timings; the app says so.
//
// A take that already carries words skips Deepgram: mode 'words' returns
// only the transcripts, so the app can listen to each take as it uploads.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { handleCors, jsonResponse } from '../_shared/wp8.ts';
import { MANAGER_MEMBER_ROLES, memberRole } from '../_shared/membership.ts';
import { transcribeClip, type TranscriptWord } from '../_shared/cues.ts';
import type { LlmImage } from '../_shared/ai/llm.ts';
import { assembleBrainContext } from '../_shared/ai/brain.ts';
import { getReferenceAnalysis, renderReferenceForPrompt } from '../_shared/ai/reference.ts';
import { planEdit, type PlannerBrief, type PlannerInput, type PlannerMedia, type PlannerOverlay, type PlannerTake } from '../_shared/ai/editPlanner.ts';

type BodyTake = { asset_id?: unknown; storage_path?: unknown; duration_ms?: unknown; words?: unknown; slot?: unknown };
type BodyFeature = { id?: unknown; title?: unknown; description?: unknown; kind?: unknown; duration_ms?: unknown };
type BodyOverlay = { id?: unknown; text?: unknown; start_ms?: unknown; end_ms?: unknown; y?: unknown };
type BodyFrame = { asset_id?: unknown; base64?: unknown; media_type?: unknown };
type Body = { assignment_id?: unknown; takes?: unknown; features?: unknown; overlays?: unknown; frames?: unknown; mode?: unknown };

const SIGNED_URL_TTL_SECONDS = 600;
const MAX_TAKES = 20;
const MAX_FEATURES = 12;
const MAX_OVERLAYS = 40;
const MAX_FRAMES = 6;
const MAX_FRAME_BASE64 = 600_000;
const BRAIN_WAIT_MS = 8000;
const VIDEO_FILE = /\.(mp4|mov|m4v|webm)(\?|$)/i;
const FRAME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
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

/**
 * What the planner knows about the brief. A post made from a library brief
 * reads its script, on-screen text and sound from library_briefs; a post the
 * creator started on their own has only its title.
 */
async function loadBrief(
  admin: SupabaseClient,
  assignment: { brief_id: string | null; library_brief_id: string | null },
  productName: string | null,
): Promise<{ brief: PlannerBrief; link: string | null; track: Record<string, unknown> | null }> {
  const brief: PlannerBrief = { title: '', type: null, kind: null, notes: '', productName, clips: [], sound: null };
  if (assignment.library_brief_id) {
    const { data: row } = await admin
      .from('library_briefs')
      .select('title, type, kind, notes, link, audio, clips, g, lt')
      .eq('id', assignment.library_brief_id)
      .maybeSingle();
    if (row) {
      const g = rec(row.g);
      const lt = rec(row.lt);
      brief.title = str(row.title) ?? '';
      brief.type = str(row.type);
      brief.kind = str(row.kind);
      brief.notes = [str(row.notes), str(g?.notes)].filter(Boolean).join('\n');
      const clips = Array.isArray(row.clips) ? row.clips : Array.isArray(g?.clips) ? (g!.clips as unknown[]) : [];
      for (const c of clips) {
        const clip = rec(c);
        if (!clip) continue;
        brief.clips.push({ say: str(clip.text) ?? '', onScreen: str(clip.onScreen) ?? '', cta: clip.cta === true });
      }
      if (brief.clips.length === 0 && str(lt?.onScreen)) brief.clips.push({ say: '', onScreen: str(lt!.onScreen)!, cta: false });
      const audio = rec(row.audio) ?? rec(g?.audio);
      const track = audio && audio.mode !== 'none' ? rec(audio.track) : null;
      if (track && str(track.title)) brief.sound = { title: str(track.title)!, artist: str(track.artist) ?? '' };
      return { brief, link: str(row.link) ?? str(g?.link), track: brief.sound ? track : null };
    }
  }
  if (assignment.brief_id) {
    const { data: row } = await admin.from('briefs').select('title, creator_note').eq('id', assignment.brief_id).maybeSingle();
    const title = str(row?.title);
    brief.title = title && title !== 'Untitled post' && title !== 'New post' ? title : '';
    brief.notes = str(row?.creator_note) ?? '';
  }
  return { brief, link: null, track: null };
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
      .select('id, company_id, brief_id, library_brief_id, creator_id')
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

    const takesIn: { assetId: string; path: string; durationMs: number; words: TranscriptWord[] | null; slot: number | null }[] = [];
    for (const t of rawTakes) {
      const assetId = str(t.asset_id);
      const path = str(t.storage_path);
      const durationMs = typeof t.duration_ms === 'number' && t.duration_ms > 0 ? Math.round(t.duration_ms) : 0;
      const words = parseWords(t.words);
      // A take the app already heard needs no file; one it has not must be in this company's folder.
      if (!assetId || (!path && !words)) return jsonResponse({ error: 'every take needs asset_id and storage_path' }, 400);
      if (path && !path.startsWith(`${companyId}/`)) return jsonResponse({ error: 'forbidden' }, 403);
      const slot = num(t.slot);
      takesIn.push({ assetId, path: path ?? '', durationMs, words, slot: slot !== null && Number.isInteger(slot) && slot >= 0 ? slot : null });
    }
    const wordsOnly = body?.mode === 'words';

    const media: PlannerMedia[] = [];
    for (const f of Array.isArray(body?.features) ? (body!.features as BodyFeature[]) : []) {
      const id = str(f.id);
      const title = str(f.title);
      if (!id || !title) continue;
      const durationMs = num(f.duration_ms);
      media.push({ id, title, description: str(f.description) ?? '', kind: f.kind === 'clip' ? 'clip' : 'still', durationMs: durationMs && durationMs > 0 ? Math.round(durationMs) : null });
      if (media.length >= MAX_FEATURES) break;
    }

    const { data: company } = await admin.from('companies').select('name, settings').eq('id', companyId).maybeSingle();
    const companyName = str(company?.name);
    let productName = str(rec(company?.settings)?.product_name) ?? companyName;
    const briefLoad = wordsOnly
      ? null
      : loadBrief(admin, { brief_id: (assignment.brief_id ?? null) as string | null, library_brief_id: (assignment.library_brief_id ?? null) as string | null }, productName);

    // Started now so it runs while the takes are transcribed; the plan never waits on it past BRAIN_WAIT_MS.
    const brainLoad = briefLoad
      ? Promise.race([
          briefLoad.then((b) => assembleBrainContext(admin, { companyId, topic: b.brief.title || undefined, limit: 1 })).catch((e) => {
            console.warn('auto-edit: brain context not loaded', e);
            return null;
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), BRAIN_WAIT_MS)),
        ])
      : Promise.resolve(null);

    // Transcribe every take at once; one that fails keeps its speech (no words, nothing cut).
    const needsDeepgram = takesIn.some((t) => !t.words);
    const deepgramKey = Deno.env.get('DEEPGRAM_API_KEY');
    if (needsDeepgram && !deepgramKey) return jsonResponse({ error: 'DEEPGRAM_API_KEY not configured' }, 500);
    const keyterms = [productName, companyName, ...media.map((f) => f.title)].filter((k): k is string => !!k).slice(0, 20);
    const unheard: string[] = [];
    const takes: PlannerTake[] = await Promise.all(
      takesIn.map(async (t) => {
        let words: TranscriptWord[] = t.words ?? [];
        if (!t.words) {
          try {
            const { data: signed } = await admin.storage.from('videos').createSignedUrl(t.path, SIGNED_URL_TTL_SECONDS);
            if (!signed?.signedUrl) throw new Error('no signed url');
            words = await transcribeClip({ url: signed.signedUrl, apiKey: deepgramKey!, keyterms });
          } catch (e) {
            unheard.push(t.assetId);
            console.warn(`auto-edit: transcription failed for ${t.path}`, e);
          }
        }
        const last = words[words.length - 1];
        return { assetId: t.assetId, durationMs: t.durationMs || (last ? last.e + 500 : 0), words, scriptClip: t.slot };
      }),
    );
    const takesOut = takes.map((t) => ({ asset_id: t.assetId, duration_ms: t.durationMs, words: t.words }));

    if (wordsOnly) {
      return jsonResponse({ takes: takesOut, plan: null, unheard, replace_overlay_ids: [], repairs: [], fallback_reason: null, sound_track: null, run_id: null, media_assets: [], blocks: [], texts: [], media: [], cut_ms: 0, ai: false });
    }

    const overlays: PlannerOverlay[] = [];
    for (const o of Array.isArray(body?.overlays) ? (body!.overlays as BodyOverlay[]).slice(0, MAX_OVERLAYS) : []) {
      const id = str(o.id);
      const text = str(o.text);
      if (!id || !text) continue;
      overlays.push({ id, text, startMs: Math.max(0, num(o.start_ms) ?? 0), endMs: Math.max(0, num(o.end_ms) ?? 0), y: num(o.y) ?? 0.3 });
    }
    const frames: { assetId: string; image: LlmImage }[] = [];
    for (const f of Array.isArray(body?.frames) ? (body!.frames as BodyFrame[]).slice(0, MAX_FRAMES) : []) {
      const assetId = str(f.asset_id);
      const base64 = str(f.base64);
      const mediaType = FRAME_TYPES.find((t) => t === f.media_type);
      if (!assetId || !base64 || !mediaType || base64.length > MAX_FRAME_BASE64) continue;
      frames.push({ assetId, image: { base64, mediaType } });
    }

    const { brief, track, link } = await briefLoad!;

    // The company brain: what creators call the product, and demo moments with media in our own storage.
    const mediaAssets: { id: string; title: string; kind: 'clip' | 'still'; path: string }[] = [];
    try {
      const brain = await brainLoad;
      if (brain) {
        if (brain.productName && brain.productName !== 'the product') brief.productName = productName = brain.productName;
        for (const d of brain.demoMoments) {
          // The render reads storage paths only, so a moment whose media is an outside URL cannot be inserted.
          if (!d.media_url || /^https?:/i.test(d.media_url) || media.length >= MAX_FEATURES || media.some((m) => m.id === d.id)) continue;
          const kind = VIDEO_FILE.test(d.media_url) ? 'clip' : 'still';
          media.push({ id: d.id, title: d.title, description: [d.user_action, d.end_state].filter(Boolean).join('. '), kind, durationMs: null });
          mediaAssets.push({ id: d.id, title: d.title, kind, path: d.media_url });
        }
      }
    } catch (e) {
      console.warn('auto-edit: brain context not loaded', e);
    }
    // Script clips line up with takes only when the camera recorded clip by clip.
    if (brief.kind !== 'Guided') for (const t of takes) t.scriptClip = null;

    // The reference the brief was modelled on, when it has been analysed. Never starts an analysis.
    let reference: string | null = null;
    if (link) {
      try {
        const analysis = await getReferenceAnalysis(admin, companyId, link);
        if (analysis && analysis.media === 'video') reference = renderReferenceForPrompt(analysis);
      } catch (e) {
        console.warn('auto-edit: reference analysis not loaded', e);
      }
    }

    const input: PlannerInput = { companyId, takes, brief, media, reference, overlays, frames };
    const result = await planEdit(input);
    const { plan } = result;

    return jsonResponse({
      takes: takesOut,
      plan,
      unheard,
      replace_overlay_ids: result.replaceOverlayIds,
      repairs: result.repairs,
      fallback_reason: result.fallbackReason,
      sound_track: plan.sound.use_brief_track ? track : null,
      run_id: result.runId,
      media_assets: mediaAssets,
      // The older flat reply, for app builds that read it.
      blocks: plan.keeps.map((k) => ({ asset_id: k.asset_id, in_ms: k.in_ms, out_ms: k.out_ms })),
      texts: plan.texts.map((t) => ({ role: t.role === 'hook' ? 'hook' : 'header', text: t.text, start_ms: t.start_ms, end_ms: t.end_ms })),
      media: plan.inserts.map((m) => ({ feature_id: m.media_id, start_ms: m.start_ms, end_ms: m.end_ms })),
      cut_ms: plan.cut_ms,
      ai: plan.ai,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});

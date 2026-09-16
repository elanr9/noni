// Transcribes one recorded clip with Deepgram and places its on-screen text
// and media cues on the words that name them. Called by the creator app
// right after a clip is recorded, and by managers previewing a slot.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { askClaude, handleCors, jsonResponse } from '../_shared/wp8.ts';
import { MANAGER_MEMBER_ROLES, memberRole } from '../_shared/membership.ts';
import { placeCue, transcribeClip, type CueContext, type TranscriptWord } from '../_shared/cues.ts';

type Body = {
  assignment_id?: string;
  slot_index?: number;
  storage_path?: string;
  duration_ms?: number;
};

type TalkingPoint = { text?: string; is_product?: boolean };

type SegmentRow = {
  kind: string;
  overlay_text: string | null;
  talking_point_index: number | null;
  screenshot_url: string | null;
};

const SIGNED_URL_TTL_SECONDS = 600;
const UNKNOWN_DURATION_TAIL_MS = 500;
const MIN_KEYTERM_CHARS = 4;

function fileStem(path: string): string {
  const base = path.split('?')[0].split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return (dot > 0 ? base.slice(0, dot) : base).toLowerCase();
}

function isVideoPath(path: string): boolean {
  return /\.(mp4|mov)$/i.test(path.split('?')[0]);
}

function labelKeyterms(label: string | null): string[] {
  if (!label) return [];
  return label
    .replace(/^\s*\d+\s*[.):-]?\s*/, '')
    .split(/\s+/)
    .map((token) => token.replace(/[^A-Za-z0-9'-]/g, ''))
    .filter((token) => token.length >= MIN_KEYTERM_CHARS);
}

function talkingPointAt(raw: unknown, index: number | null): TalkingPoint | null {
  if (index === null || !Array.isArray(raw)) return null;
  const item: unknown = raw[index];
  return typeof item === 'object' && item !== null ? (item as TalkingPoint) : null;
}

async function mediaTitleForPath(
  admin: SupabaseClient,
  companyId: string,
  screenshotUrl: string,
): Promise<string | null> {
  const stem = fileStem(screenshotUrl);
  if (!stem) return null;
  const { data } = await admin
    .from('media_library')
    .select('path, title')
    .eq('company_id', companyId)
    .limit(500);
  const rows = (data ?? []) as Array<{ path: string; title: string | null }>;
  const match = rows.find((row) => fileStem(row.path) === stem);
  return match?.title ?? null;
}

function resolveDuration(bodyDuration: number | undefined, words: TranscriptWord[]): number {
  if (typeof bodyDuration === 'number' && Number.isFinite(bodyDuration) && bodyDuration > 0) {
    return Math.round(bodyDuration);
  }
  const last = words[words.length - 1];
  return last ? last.e + UNKNOWN_DURATION_TAIL_MS : 0;
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    if (
      !body?.assignment_id ||
      typeof body.slot_index !== 'number' ||
      !body.storage_path
    ) {
      return jsonResponse({ error: 'expected { assignment_id, slot_index, storage_path }' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    // Same internal path as render-submission: the service key acts as a manager.
    const internal = token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const userId = internal ? null : (await admin.auth.getUser(token)).data?.user?.id ?? null;
    if (!internal && !userId) return jsonResponse({ error: 'unauthorized' }, 401);

    const { data: assignment } = await admin
      .from('assignments')
      .select('id, company_id, brief_id, creator_id')
      .eq('id', body.assignment_id)
      .maybeSingle();
    if (!assignment) return jsonResponse({ error: 'assignment not found' }, 404);
    const companyId = assignment.company_id as string;

    const { data: caller } = userId
      ? await admin.from('profiles').select('role').eq('id', userId).maybeSingle()
      : { data: null };
    if (!internal && !caller) return jsonResponse({ error: 'forbidden' }, 403);
    const platformAdmin = caller?.role === 'admin';
    const isCreator = userId !== null && assignment.creator_id === userId;
    let isManager = internal;
    if (userId && !platformAdmin && !isCreator) {
      const role = await memberRole(admin, userId, companyId);
      isManager = role !== null && MANAGER_MEMBER_ROLES.includes(role);
    }
    if (!platformAdmin && !isCreator && !isManager) {
      return jsonResponse({ error: 'forbidden' }, 403);
    }
    if (!body.storage_path.startsWith(`${companyId}/`)) {
      return jsonResponse({ error: 'forbidden' }, 403);
    }

    const deepgramKey = Deno.env.get('DEEPGRAM_API_KEY');
    if (!deepgramKey) return jsonResponse({ error: 'DEEPGRAM_API_KEY not configured' }, 500);

    const briefId = (assignment.brief_id ?? null) as string | null;
    const [{ data: company }, { data: brief }, { data: segment }] = await Promise.all([
      admin.from('companies').select('name').eq('id', companyId).maybeSingle(),
      briefId
        ? admin.from('briefs').select('hook, talking_points, cta').eq('id', briefId).maybeSingle()
        : Promise.resolve({ data: null }),
      briefId
        ? admin
          .from('brief_segments')
          .select('kind, overlay_text, talking_point_index, screenshot_url')
          .eq('brief_id', briefId)
          .eq('slot_index', body.slot_index)
          .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const seg = (segment ?? null) as SegmentRow | null;
    const productName = ((company?.name as string | undefined) ?? '').trim() || null;
    const point = talkingPointAt(brief?.talking_points, seg?.talking_point_index ?? null);
    const pointText = point?.text?.trim() || null;

    let mediaKind: CueContext['media_kind'] = null;
    let mediaTitle: string | null = null;
    if (seg?.screenshot_url) {
      mediaKind = isVideoPath(seg.screenshot_url) ? 'recording' : 'screenshot';
      mediaTitle = await mediaTitleForPath(admin, companyId, seg.screenshot_url);
      if (!mediaTitle && point?.is_product) mediaTitle = pointText;
    }

    const { data: signed, error: signError } = await admin.storage
      .from('videos')
      .createSignedUrl(body.storage_path, SIGNED_URL_TTL_SECONDS);
    if (signError || !signed?.signedUrl) {
      return jsonResponse({ error: signError?.message ?? 'could not sign clip' }, 404);
    }

    const label = seg?.overlay_text ?? null;
    const keyterms = [...(productName ? [productName] : []), ...labelKeyterms(label)];
    let words: TranscriptWord[];
    try {
      words = await transcribeClip({ url: signed.signedUrl, apiKey: deepgramKey, keyterms });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonResponse({ error: message }, 502);
    }

    const ctx: CueContext = {
      kind: seg?.kind ?? 'point',
      label,
      point_text: pointText,
      media_title: mediaTitle,
      media_kind: mediaKind,
      product_name: productName,
      duration_ms: resolveDuration(body.duration_ms, words),
    };
    const cue = await placeCue(words, ctx, askClaude);
    return jsonResponse({ words, cue });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});

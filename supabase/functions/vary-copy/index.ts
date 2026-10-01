// Gives every creator on a brief their own wording. Identical captions and
// on-screen text landing on several accounts reads as a bot network to
// TikTok. For each brief in a campaign, one Claude call rewrites the caption
// and every overlay once per creator; results land in assignments.caption
// and assignment_segment_edits, which the render pass and post-approved
// already prefer over the brief. Rows that already carry a caption or a
// manual segment edit are left alone.

import { adminClient, askClaude, authenticate, handleCors, jsonResponse } from '../_shared/wp8.ts';

type Body = { campaign_id?: string };

type AssignmentRow = { id: string; creator_id: string; brief_id: string; caption: string | null };

type BriefRow = { id: string; company_id: string; title: string | null; caption: string | null };

type SegmentRow = {
  id: string;
  slot_index: number;
  kind: string;
  overlay_text: string | null;
  overlay_style: unknown;
  show_on_screen: boolean;
};

type Variant = { caption: string; segments: Record<string, { text?: string; boxes?: string[] }> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The text a segment actually renders: box texts when styled, else overlay_text. */
function segmentTexts(segment: SegmentRow): string[] {
  if (isRecord(segment.overlay_style) && Array.isArray(segment.overlay_style.boxes)) {
    return segment.overlay_style.boxes.flatMap((raw) =>
      isRecord(raw) && typeof raw.text === 'string' && raw.text.trim().length > 0 ? [raw.text] : [],
    );
  }
  const text = segment.overlay_text?.trim() ?? '';
  return text.length > 0 ? [text] : [];
}

function parseVariants(raw: string, count: number): Variant[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('vary-copy: no JSON array in reply');
  const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
  if (!Array.isArray(parsed) || parsed.length < count) {
    throw new Error(`vary-copy: expected ${count} variants`);
  }
  return parsed.slice(0, count).map((v) => {
    if (!isRecord(v) || typeof v.caption !== 'string') throw new Error('vary-copy: bad variant');
    const segments: Variant['segments'] = {};
    if (isRecord(v.segments)) {
      for (const [id, seg] of Object.entries(v.segments)) {
        if (!isRecord(seg)) continue;
        segments[id] = {
          ...(typeof seg.text === 'string' ? { text: seg.text } : {}),
          ...(Array.isArray(seg.boxes)
            ? { boxes: seg.boxes.filter((b): b is string => typeof b === 'string') }
            : {}),
        };
      }
    }
    return { caption: v.caption, segments };
  });
}

const SYSTEM = `You rewrite short form social copy so several creators can post the same idea without matching each other word for word.
Return only a JSON array, one object per requested variant, shape:
[{"caption": string, "segments": {"<segment_id>": {"text": string, "boxes": [string, ...]}}}]
Rules:
- Keep the meaning, the product claims and the call to action. Never invent features or numbers.
- Each variant must open with different words and use a different sentence structure from the original and from every other variant.
- Vary the hashtags: keep at most two in common with the original, reorder them, swap in close relatives.
- Keep every text within 20 percent of the original length so it still fits on screen.
- "boxes" must have exactly as many strings as the original boxes, in the same order. Omit "boxes" when the original has none. Omit "text" when the original has no overlay text.
- Casual creator voice, no emojis unless the original has them, no quotation marks around the copy.`;

function buildPrompt(brief: BriefRow, segments: SegmentRow[], count: number): string {
  const segmentLines = segments
    .map((s) => {
      const texts = segmentTexts(s);
      if (texts.length === 0) return null;
      const boxes = isRecord(s.overlay_style) && Array.isArray(s.overlay_style.boxes);
      return `- segment ${s.id} (${s.kind}): ${boxes ? `boxes ${JSON.stringify(texts)}` : `text ${JSON.stringify(texts[0])}`}`;
    })
    .filter((line): line is string => line !== null);
  return [
    `Give me ${count} variants.`,
    `Title: ${brief.title ?? ''}`,
    `Original caption: ${JSON.stringify(brief.caption ?? brief.title ?? '')}`,
    segmentLines.length > 0 ? `On-screen text by segment:\n${segmentLines.join('\n')}` : 'No on-screen text.',
  ].join('\n\n');
}

function applyBoxes(style: unknown, texts: string[]): unknown {
  if (!isRecord(style) || !Array.isArray(style.boxes)) return style;
  let i = 0;
  const boxes = style.boxes.map((raw) => {
    if (!isRecord(raw) || typeof raw.text !== 'string' || raw.text.trim().length === 0) return raw;
    const next = texts[i] ?? raw.text;
    i += 1;
    return { ...raw, text: next };
  });
  return { ...style, boxes };
}

async function varyBrief(
  admin: ReturnType<typeof adminClient>,
  brief: BriefRow,
  assignments: AssignmentRow[],
): Promise<number> {
  const pending = assignments.filter((a) => a.caption === null);
  if (pending.length === 0) return 0;
  const { data: segmentData } = await admin
    .from('brief_segments')
    .select('id, slot_index, kind, overlay_text, overlay_style, show_on_screen')
    .eq('brief_id', brief.id)
    .order('slot_index');
  const segments = ((segmentData ?? []) as SegmentRow[]).filter((s) => s.show_on_screen);

  // The first creator keeps the reviewed original; everyone after gets a variant.
  const keepsOriginal = assignments.every((a) => a.caption === null) ? pending[0] : null;
  const toVary = pending.filter((a) => a !== keepsOriginal);
  if (keepsOriginal) {
    await admin
      .from('assignments')
      .update({ caption: brief.caption ?? brief.title ?? 'New post' })
      .eq('id', keepsOriginal.id)
      .is('caption', null);
  }
  if (toVary.length === 0) return keepsOriginal ? 1 : 0;

  const reply = await askClaude(SYSTEM, buildPrompt(brief, segments, toVary.length), 4096, { tier: 'fast' });
  const variants = parseVariants(reply, toVary.length);

  let written = keepsOriginal ? 1 : 0;
  for (const [index, assignment] of toVary.entries()) {
    const variant = variants[index];
    const { data: updated } = await admin
      .from('assignments')
      .update({ caption: variant.caption })
      .eq('id', assignment.id)
      .is('caption', null)
      .select('id');
    if (!updated || updated.length === 0) continue;
    written += 1;

    const edits = segments.flatMap((segment) => {
      const change = variant.segments[segment.id];
      if (!change || segmentTexts(segment).length === 0) return [];
      const hasBoxes = isRecord(segment.overlay_style) && Array.isArray(segment.overlay_style.boxes);
      const style = hasBoxes && change.boxes ? applyBoxes(segment.overlay_style, change.boxes) : segment.overlay_style;
      const text = change.text ?? segment.overlay_text;
      // segmentsForAssignment only applies an edit whose overlay_style is set.
      return [
        {
          assignment_id: assignment.id,
          segment_id: segment.id,
          company_id: brief.company_id,
          overlay_style: style ?? {},
          overlay_text: text,
          show_on_screen: segment.show_on_screen,
        },
      ];
    });
    if (edits.length > 0) {
      await admin
        .from('assignment_segment_edits')
        .upsert(edits, { onConflict: 'assignment_id,segment_id', ignoreDuplicates: true });
    }
  }
  return written;
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.campaign_id) return jsonResponse({ error: 'expected { campaign_id }' }, 400);

  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);
  if (caller.kind === 'user' && caller.role !== 'campaign_manager') {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  try {
    const { data: campaign } = await admin
      .from('campaigns')
      .select('id, company_id')
      .eq('id', body.campaign_id)
      .maybeSingle();
    if (!campaign) return jsonResponse({ error: 'campaign not found' }, 404);
    if (caller.kind === 'user' && caller.companyId !== campaign.company_id) {
      return jsonResponse({ error: 'forbidden' }, 403);
    }

    const { data: assignmentData, error } = await admin
      .from('assignments')
      .select('id, creator_id, brief_id, caption')
      .eq('campaign_id', campaign.id)
      .eq('company_id', campaign.company_id)
      .order('created_at');
    if (error) throw new Error(error.message);
    const assignments = (assignmentData ?? []) as AssignmentRow[];
    const byBrief = new Map<string, AssignmentRow[]>();
    for (const a of assignments) byBrief.set(a.brief_id, [...(byBrief.get(a.brief_id) ?? []), a]);

    const { data: briefData } = await admin
      .from('briefs')
      .select('id, company_id, title, caption')
      .in('id', [...byBrief.keys()]);
    const briefs = (briefData ?? []) as BriefRow[];

    let written = 0;
    for (const brief of briefs) {
      try {
        written += await varyBrief(admin, brief, byBrief.get(brief.id) ?? []);
      } catch (e) {
        console.error('vary-copy brief failed:', brief.id, e);
      }
    }
    return jsonResponse({ briefs: briefs.length, assignments_varied: written });
  } catch (e) {
    console.error('vary-copy error:', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'vary-copy failed' }, 500);
  }
});

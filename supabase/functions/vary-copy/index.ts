// Gives every creator on a brief their own wording. Identical captions and
// on-screen text landing on several accounts reads as a bot network to
// TikTok. Captions are rewritten per creator in chunks, checked for
// distinctness, search phrase and hashtag rules, re-asked once when they
// fail, and written to assignments.caption and assignment_segment_edits,
// which the render pass and post-approved already prefer over the brief.

import { adminClient, askClaude, authenticate, handleCors, jsonResponse, softenDashes } from '../_shared/wp8.ts';
import {
  collisions,
  type HashtagRules,
  hashtagProblems,
  hashtagRules,
  phraseInFirstSentence,
} from '../_shared/copyVariance.ts';

type Body = {
  campaign_id?: string;
  brief_id?: string;
  assignment_ids?: string[];
  force?: boolean;
};

type AssignmentRow = { id: string; creator_id: string; brief_id: string; caption: string | null };

type BriefRow = {
  id: string;
  company_id: string;
  title: string | null;
  caption: string | null;
  search_phrase: string | null;
};

type SegmentRow = {
  id: string;
  slot_index: number;
  kind: string;
  overlay_text: string | null;
  overlay_style: unknown;
  show_on_screen: boolean;
};

type EditRow = {
  assignment_id: string;
  segment_id: string;
  text_y: number | null;
  show_on_screen: boolean | null;
  screenshot_x: number | null;
  screenshot_y: number | null;
  screenshot_width: number | null;
};

type Variant = { caption: string; segments: Record<string, { text?: string; boxes?: string[] }> };

type VaryResult = { varied: number; failed: string[]; problems: Record<string, string[]> };

type Rejection = { assignment: AssignmentRow; caption: string; problems: string[] };

type PromptContext = { taken: string[]; rules: HashtagRules; rejected: Rejection[] };

const CHUNK_SIZE = 4;
const MAX_JACCARD = 0.6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
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
          ...(typeof seg.text === 'string' ? { text: softenDashes(seg.text) } : {}),
          ...(Array.isArray(seg.boxes)
            ? { boxes: seg.boxes.filter((b): b is string => typeof b === 'string').map(softenDashes) }
            : {}),
        };
      }
    }
    return { caption: softenDashes(v.caption), segments };
  });
}

const SYSTEM = `You rewrite short form social copy so several creators can post the same idea without matching each other word for word.
Return only a JSON array, one object per requested variant, shape:
[{"caption": string, "segments": {"<segment_id>": {"text": string, "boxes": [string, ...]}}}]
Rules:
- Keep the meaning, the product claims and the call to action. Never invent features or numbers.
- Every caption must open with different words and use a different sentence structure from the original, from every other variant, and from every caption listed as already taken. Share as few words as possible with any of them.
- The search phrase must appear word for word inside the first sentence of every caption.
- Hashtags: use only tags from the allowed list, within the requested count, in a different order and a different subset per variant, and share no more than the allowed number of tags with the original caption. When the allowed list is empty, use no hashtags.
- Keep every text within 20 percent of the original length so it still fits on screen.
- "boxes" must have exactly as many strings as the original boxes, in the same order. Omit "boxes" when the original has none. Omit "text" when the original has no overlay text.
- Casual creator voice, no emojis unless the original has them, no quotation marks around the copy.
- Never use em dashes, en dashes or hyphenated compounds such as do-or-die. Use commas or the word to instead.`;

function buildPrompt(
  brief: BriefRow,
  segments: SegmentRow[],
  count: number,
  context: PromptContext,
): string {
  const segmentLines = segments
    .map((s) => {
      const texts = segmentTexts(s);
      if (texts.length === 0) return null;
      const boxes = isRecord(s.overlay_style) && Array.isArray(s.overlay_style.boxes);
      return `- segment ${s.id} (${s.kind}): ${boxes ? `boxes ${JSON.stringify(texts)}` : `text ${JSON.stringify(texts[0])}`}`;
    })
    .filter((line): line is string => line !== null);
  const { rules } = context;
  const allowedLine =
    rules.allowed.length > 0
      ? `Allowed hashtags: ${rules.allowed.map((tag) => `#${tag}`).join(' ')}`
      : 'Allowed hashtags: none, use no hashtags';
  const countLine =
    rules.max > 0
      ? `Hashtag count per caption: ${rules.min} to ${rules.max}${
          rules.maxOverlap !== null ? `, at most ${rules.maxOverlap} shared with the original caption` : ''
        }`
      : null;
  const takenBlock =
    context.taken.length > 0
      ? `Already taken, every variant must read clearly different from each of these:\n${context.taken
          .map((caption, i) => `${i + 1}. ${JSON.stringify(caption)}`)
          .join('\n')}`
      : null;
  const rejectedBlock =
    context.rejected.length > 0
      ? `These attempts were rejected. Write one fresh replacement for each, in the same order:\n${context.rejected
          .map((r, i) => `${i + 1}. ${JSON.stringify(r.caption)}\n   problems: ${r.problems.join('; ')}`)
          .join('\n')}`
      : null;
  return [
    `Give me ${count} variants.`,
    `Title: ${brief.title ?? ''}`,
    brief.search_phrase ? `Search phrase (word for word in the first sentence): ${JSON.stringify(brief.search_phrase)}` : null,
    `Original caption: ${JSON.stringify(brief.caption ?? brief.title ?? '')}`,
    allowedLine,
    countLine,
    takenBlock,
    rejectedBlock,
    segmentLines.length > 0 ? `On-screen text by segment:\n${segmentLines.join('\n')}` : 'No on-screen text.',
  ]
    .filter((block): block is string => block !== null)
    .join('\n\n');
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

async function writeSegmentEdits(
  admin: ReturnType<typeof adminClient>,
  brief: BriefRow,
  assignmentId: string,
  segments: SegmentRow[],
  variant: Variant,
): Promise<void> {
  const changed = segments.filter((s) => variant.segments[s.id] !== undefined && segmentTexts(s).length > 0);
  if (changed.length === 0) return;
  const { data: existingData } = await admin
    .from('assignment_segment_edits')
    .select('assignment_id, segment_id, text_y, show_on_screen, screenshot_x, screenshot_y, screenshot_width')
    .eq('assignment_id', assignmentId)
    .eq('company_id', brief.company_id)
    .in(
      'segment_id',
      changed.map((s) => s.id),
    );
  const existing = new Map(((existingData ?? []) as EditRow[]).map((row) => [row.segment_id, row]));
  const edits = changed.map((segment) => {
    const change = variant.segments[segment.id] ?? {};
    const hasBoxes = isRecord(segment.overlay_style) && Array.isArray(segment.overlay_style.boxes);
    const style = hasBoxes && change.boxes ? applyBoxes(segment.overlay_style, change.boxes) : segment.overlay_style;
    const prior = existing.get(segment.id);
    // segmentsForAssignment only applies an edit whose overlay_style is set.
    return {
      ...(prior ?? {}),
      assignment_id: assignmentId,
      segment_id: segment.id,
      company_id: brief.company_id,
      overlay_style: style ?? {},
      overlay_text: change.text ?? segment.overlay_text,
      show_on_screen: prior?.show_on_screen ?? segment.show_on_screen,
      updated_at: new Date().toISOString(),
    };
  });
  const { error } = await admin
    .from('assignment_segment_edits')
    .upsert(edits, { onConflict: 'assignment_id,segment_id' });
  if (error) console.error('vary-copy segment edits failed:', assignmentId, error.message);
}

async function varyBrief(
  admin: ReturnType<typeof adminClient>,
  brief: BriefRow,
  all: AssignmentRow[],
  targets: AssignmentRow[],
  force: boolean,
  bank: string[],
): Promise<VaryResult> {
  const pending = force ? targets : targets.filter((a) => a.caption === null);
  if (pending.length === 0) return { varied: 0, failed: [], problems: {} };
  const pendingIds = new Set(pending.map((a) => a.id));

  const { data: segmentData, error: segmentError } = await admin
    .from('brief_segments')
    .select('id, slot_index, kind, overlay_text, overlay_style, show_on_screen')
    .eq('brief_id', brief.id)
    .eq('company_id', brief.company_id)
    .order('slot_index');
  if (segmentError) throw new Error(segmentError.message);
  const segments = ((segmentData ?? []) as SegmentRow[]).filter((s) => s.show_on_screen);

  const original = brief.caption ?? brief.title ?? '';
  const rules = hashtagRules(bank, original);
  const existingCaptions = all.flatMap((a) =>
    !pendingIds.has(a.id) && a.caption !== null && a.caption.trim().length > 0 ? [a.caption] : [],
  );
  const taken = [original, ...existingCaptions];

  const accepted: Array<{ assignment: AssignmentRow; variant: Variant }> = [];
  const failed: string[] = [];
  const problems: Record<string, string[]> = {};

  const ask = async (batch: AssignmentRow[], rejected: Rejection[]): Promise<Variant[]> => {
    const context: PromptContext = {
      taken: [...taken, ...accepted.map((a) => a.variant.caption)],
      rules,
      rejected,
    };
    const reply = await askClaude(SYSTEM, buildPrompt(brief, segments, batch.length, context), 4096, {
      tier: 'fast',
    });
    return parseVariants(reply, batch.length);
  };

  const review = (assignment: AssignmentRow, variant: Variant): Rejection | null => {
    const others = [...taken, ...accepted.map((a) => a.variant.caption)];
    const problems = [
      ...collisions(variant.caption, others, { maxJaccard: MAX_JACCARD, ignorePhrase: brief.search_phrase }).map(
        (hit) => `too close to already taken ${JSON.stringify(hit)}`,
      ),
      ...(brief.search_phrase && !phraseInFirstSentence(variant.caption, brief.search_phrase)
        ? [`search phrase ${JSON.stringify(brief.search_phrase)} is missing from the first sentence`]
        : []),
      ...hashtagProblems(variant.caption, rules),
    ];
    if (problems.length > 0) return { assignment, caption: variant.caption, problems };
    accepted.push({ assignment, variant });
    return null;
  };

  for (const chunk of chunked(pending, CHUNK_SIZE)) {
    let rejected: Rejection[] = [];
    try {
      const variants = await ask(chunk, []);
      rejected = chunk.flatMap((assignment, i) => {
        const rejection = review(assignment, variants[i]);
        return rejection ? [rejection] : [];
      });
    } catch (e) {
      console.error('vary-copy chunk failed:', brief.id, e);
      for (const a of chunk) problems[a.id] = [e instanceof Error ? e.message : 'model call failed'];
      failed.push(...chunk.map((a) => a.id));
      continue;
    }
    if (rejected.length === 0) continue;
    try {
      const retry = await ask(
        rejected.map((r) => r.assignment),
        rejected,
      );
      for (const [i, rejection] of rejected.entries()) {
        const again = review(rejection.assignment, retry[i]);
        if (again) {
          console.error('vary-copy variant rejected twice:', rejection.assignment.id, again.problems);
          problems[rejection.assignment.id] = [...rejection.problems, ...again.problems];
          failed.push(rejection.assignment.id);
        }
      }
    } catch (e) {
      console.error('vary-copy re-ask failed:', brief.id, e);
      for (const r of rejected) problems[r.assignment.id] = [...r.problems, e instanceof Error ? e.message : 'model call failed'];
      failed.push(...rejected.map((r) => r.assignment.id));
    }
  }

  let varied = 0;
  for (const { assignment, variant } of accepted) {
    let update = admin
      .from('assignments')
      .update({ caption: variant.caption })
      .eq('id', assignment.id)
      .eq('company_id', brief.company_id);
    if (!force) update = update.is('caption', null);
    const { data: updated, error } = await update.select('id');
    if (error || !updated || updated.length === 0) {
      problems[assignment.id] = [error?.message ?? 'caption was already set'];
      failed.push(assignment.id);
      continue;
    }
    varied += 1;
    await writeSegmentEdits(admin, brief, assignment.id, segments, variant);
  }
  return { varied, failed, problems };
}

type Scope = {
  companyId: string;
  briefs: BriefRow[];
  assignmentsByBrief: Map<string, AssignmentRow[]>;
  targetsByBrief: Map<string, AssignmentRow[]>;
  force: boolean;
};

function groupByBrief(assignments: AssignmentRow[]): Map<string, AssignmentRow[]> {
  const byBrief = new Map<string, AssignmentRow[]>();
  for (const a of assignments) byBrief.set(a.brief_id, [...(byBrief.get(a.brief_id) ?? []), a]);
  return byBrief;
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.campaign_id && !body?.brief_id) {
    return jsonResponse({ error: 'expected { campaign_id } or { brief_id, assignment_ids?, force? }' }, 400);
  }

  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);
  if (caller.kind === 'user' && caller.role !== 'campaign_manager') {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  try {
    let scope: Scope;
    if (body.brief_id) {
      const { data: brief } = await admin
        .from('briefs')
        .select('id, company_id, title, caption, search_phrase')
        .eq('id', body.brief_id)
        .maybeSingle();
      if (!brief) return jsonResponse({ error: 'brief not found' }, 404);
      const briefRow = brief as BriefRow;
      if (caller.kind === 'user' && caller.companyId !== briefRow.company_id) {
        return jsonResponse({ error: 'forbidden' }, 403);
      }
      const { data: assignmentData, error } = await admin
        .from('assignments')
        .select('id, creator_id, brief_id, caption')
        .eq('brief_id', briefRow.id)
        .eq('company_id', briefRow.company_id)
        .order('created_at');
      if (error) throw new Error(error.message);
      const assignments = (assignmentData ?? []) as AssignmentRow[];
      const wanted = body.assignment_ids ? new Set(body.assignment_ids) : null;
      const targets = wanted ? assignments.filter((a) => wanted.has(a.id)) : assignments;
      scope = {
        companyId: briefRow.company_id,
        briefs: [briefRow],
        assignmentsByBrief: new Map([[briefRow.id, assignments]]),
        targetsByBrief: new Map([[briefRow.id, targets]]),
        force: body.force === true,
      };
    } else {
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
      const byBrief = groupByBrief((assignmentData ?? []) as AssignmentRow[]);
      const { data: briefData } = await admin
        .from('briefs')
        .select('id, company_id, title, caption, search_phrase')
        .eq('company_id', campaign.company_id)
        .in('id', [...byBrief.keys()]);
      scope = {
        companyId: campaign.company_id,
        briefs: (briefData ?? []) as BriefRow[],
        assignmentsByBrief: byBrief,
        targetsByBrief: byBrief,
        force: false,
      };
    }

    const { data: profile } = await admin
      .from('brand_profiles')
      .select('hashtag_bank')
      .eq('company_id', scope.companyId)
      .maybeSingle();
    const bank = Array.isArray(profile?.hashtag_bank)
      ? profile.hashtag_bank.filter((tag): tag is string => typeof tag === 'string')
      : [];

    let varied = 0;
    const failed: string[] = [];
    const problems: Record<string, string[]> = {};
    for (const brief of scope.briefs) {
      const all = scope.assignmentsByBrief.get(brief.id) ?? [];
      const targets = scope.targetsByBrief.get(brief.id) ?? [];
      try {
        const result = await varyBrief(admin, brief, all, targets, scope.force, bank);
        varied += result.varied;
        failed.push(...result.failed);
        Object.assign(problems, result.problems);
      } catch (e) {
        console.error('vary-copy brief failed:', brief.id, e);
        failed.push(...targets.filter((a) => scope.force || a.caption === null).map((a) => a.id));
      }
    }
    return jsonResponse({ varied, failed, problems });
  } catch (e) {
    console.error('vary-copy error:', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'vary-copy failed' }, 500);
  }
});

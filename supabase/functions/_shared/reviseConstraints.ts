// Manager constraints for chat revise. The manager's words ("give me 5
// points", "do not change the hook or the title") are extracted into a
// structured object once per turn, injected into the prompt, and then
// ENFORCED in code after generation: locked fields are restored verbatim, a
// wrong point count is a validation failure, and validation never flags a
// locked field (so a retry never rewrites it). Constraints accumulate across
// the conversation; the newest turn wins on conflict.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { askClaude, parseClaudeJson } from './wp8.ts';
import type { BriefDraftShape, TalkingPoint } from './validateBrief.ts';

/**
 * What part of the post the feedback is about. Anything but 'full' runs as a
 * targeted regeneration of that one part with the rest held verbatim.
 */
export type ReviseScope =
  | 'hook'
  | 'title'
  | 'caption'
  | 'cta'
  | 'point'
  | 'points'
  | 'search_phrase'
  | 'undo'
  | 'full';

export const LEARNING_CATEGORIES = [
  'hook', 'talking_points', 'script', 'caption', 'hashtags', 'cta',
  'overlay_text', 'screenshots', 'layout', 'structure', 'voice', 'other',
] as const;
export type LearningCategory = (typeof LEARNING_CATEGORIES)[number];

export type Remembered = { category: LearningCategory; insight: string };

export type ReviseConstraints = {
  scope: ReviseScope;
  /** Zero-based index when scope is 'point'. */
  pointIndex: number | null;
  /** Durable rules the manager stated ("we do not have a roster feature"), saved for every future post. */
  remember: Remembered[];
  pointCount: number | null;
  lockHook: boolean;
  lockTitle: boolean;
  lockCaption: boolean;
  lockSearchPhrase: boolean;
  /** Zero-based indexes into the current talking points to keep verbatim. */
  lockPointIndexes: number[];
  /** Durable instructions from earlier turns that still apply. */
  standingInstructions: string[];
};

export const EMPTY_CONSTRAINTS: ReviseConstraints = {
  scope: 'full',
  pointIndex: null,
  remember: [],
  pointCount: null,
  lockHook: false,
  lockTitle: false,
  lockCaption: false,
  lockSearchPhrase: false,
  lockPointIndexes: [],
  standingInstructions: [],
};

const EXTRACT_SYSTEM = `You read a campaign manager's feedback on a short form content brief and turn it into a work order. The brief has: a title, a hook (the opening line, also the title slide of a slideshow), numbered talking points (one of them is the product plug, whose sentence is the cta), a caption with hashtags, a search phrase. Answer with one JSON object only, no prose:
{"scope": "hook" | "title" | "caption" | "cta" | "point" | "points" | "search_phrase" | "undo" | "full", "point_index": number | null, "remember": [{"category": string, "insight": string}], "point_count": number | null, "lock_hook": boolean, "lock_title": boolean, "lock_caption": boolean, "lock_search_phrase": boolean, "lock_point_indexes": number[], "standing_instructions": string[]}
Rules:
- scope is the smallest part that fixes the newest turn. "the hook needs to be better", "no title slide", "the opening line is weak" is hook. "the title is wrong" is title. Caption or hashtag complaints are caption. Complaints about the plug, the product sentence, the cta, a made up feature or a wrong product claim are cta. One specific point ("point 3 is generic", "the second tip is wrong") is point with point_index (point 1 is index 0). Complaints about the points as a group, the count, the order, the substance of the body ("the points are generic", "give me 5 points") are points. Anything about the post as a whole, the tone everywhere, the topic, the angle, or "it all reads like AI slop" is full. When the newest turn also asks for a new point count, scope is points or full, never a smaller one. "Put it back", "go back to what I had", "undo that", "revert", "restore the original", "no you didn't, put it back" is undo: the manager wants the previous version back, nothing is rewritten.
- "Only change X" or "do not edit anything other than X" locks everything else. "Do not edit anything other than points 2 to 6" (or "slides 2 to 6") locks the hook, title, caption, search phrase and every point outside that range (here index 0). Slides and points are the same thing numbered from 1; on a slideshow "slide 1" may mean the title slide, treat "slides 2 to N" as points 1 to N minus 1 in one-based numbering, so lock_point_indexes names the zero-based indexes NOT in the range.
- remember: durable facts or rules the manager states that apply to every future post, not just this one ("we do not have a roster feature", "never say elite", "always talk to the athlete, not the parent", "do not do that again" about a specific mistake). Each is one plain sentence in the imperative or as a fact, with category one of: hook, talking_points, script, caption, hashtags, cta, overlay_text, screenshots, layout, structure, voice, other. A made up product feature is category cta ("Inkbound has no roster feature; never mention or invent one"). Empty when the feedback is only about this post.
- point_count: the exact number of talking points the manager asked for ("give me 5 points", "make it 4", "seven tips"), else null. Number words count. A number that is not about how many points there should be is ignored.
- lock_*: true when the manager said to keep, not change, not touch, or leave alone that part ("do not change the hook or the title", "keep the caption"). Also true when the manager wrote that part themselves this turn and said to use it as is.
- lock_point_indexes: zero-based indexes of points the manager said to keep as they are ("keep point 2", "the first point is good"); point 1 is index 0. Empty when none.
- standing_instructions: short imperative sentences restating every durable style or content instruction the manager gave in any turn ("explain each point as the mistake then the fix", "talk to freshmen, not parents"). Never include locks or the count here. Empty when none.
Later turns override earlier ones when they conflict (a later "actually make it 4 points" replaces an earlier 5). A lock stays in force until the manager explicitly asks to change that part.`;

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function parseCountWord(word: string): number | null {
  const n = Number(word);
  if (Number.isInteger(n)) return n;
  return NUMBER_WORDS[word.toLowerCase()] ?? null;
}

/** Deterministic fallback when the extraction call fails. */
export function regexConstraints(feedback: string): ReviseConstraints {
  const countMatch = feedback.match(
    /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s+(talking\s+)?(points?|tips?|steps?|reasons?|mistakes?|things)\b/i,
  );
  const count = countMatch ? parseCountWord(countMatch[1]) : null;
  const keep = /\b(don'?t|do not|never|without)\s+(chang|touch|rewrit|alter|mess)\w*\b[^.!?\n]*?\b/i;
  const keepPhrase = /\b(keep|leave)\b[^.!?\n]*?\b/i;
  const locked = (part: RegExp) => {
    const sentences = feedback.split(/[.!?\n]+/);
    return sentences.some(
      (s) => part.test(s) && (keep.test(s) || (keepPhrase.test(s) && /\b(same|as is|alone|it)\b/i.test(s))),
    );
  };
  return {
    scope: 'full',
    pointIndex: null,
    remember: [],
    pointCount: count !== null && count >= 1 && count <= 12 ? count : null,
    lockHook: locked(/\bhook\b/i),
    lockTitle: locked(/\btitle\b/i),
    lockCaption: locked(/\bcaption\b/i),
    lockSearchPhrase: locked(/\bsearch phrase\b/i),
    lockPointIndexes: [],
    standingInstructions: [],
  };
}

const SCOPES: ReviseScope[] = ['hook', 'title', 'caption', 'cta', 'point', 'points', 'search_phrase', 'undo', 'full'];

function parseRemembered(value: unknown): Remembered[] {
  if (!Array.isArray(value)) return [];
  const out: Remembered[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue;
    const { category, insight } = entry as { category?: unknown; insight?: unknown };
    if (typeof insight !== 'string' || !insight.trim()) continue;
    const cat = LEARNING_CATEGORIES.includes(category as LearningCategory)
      ? (category as LearningCategory)
      : 'other';
    out.push({ category: cat, insight: insight.trim().slice(0, 300) });
  }
  return out.slice(0, 5);
}

/**
 * Saves what the manager told the AI to remember. Rows land in ai_learnings
 * at full confidence, so every later generation for this company reads them
 * in its brand prefix. Duplicate insights are skipped.
 */
export async function rememberForCompany(
  admin: SupabaseClient,
  companyId: string,
  remembered: Remembered[],
): Promise<Remembered[]> {
  if (!remembered.length) return [];
  const { data: existing } = await admin
    .from('ai_learnings')
    .select('insight')
    .eq('company_id', companyId)
    .eq('active', true);
  const known = new Set(
    ((existing ?? []) as { insight: string }[]).map((r) => r.insight.trim().toLowerCase()),
  );
  const fresh = remembered.filter((r) => !known.has(r.insight.toLowerCase()));
  if (!fresh.length) return [];
  const { error } = await admin.from('ai_learnings').insert(
    fresh.map((r) => ({
      company_id: companyId,
      category: r.category,
      insight: r.insight,
      confidence: 1,
      evidence_count: 1,
      examples: [],
    })),
  );
  if (error) {
    console.error('ai_learnings insert failed:', error.message);
    return [];
  }
  return fresh;
}

function clampIndexes(value: unknown, pointCount: number): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < pointCount))];
}

/**
 * Extracts constraints from every manager turn so far plus the newest
 * feedback. One fast model call; regex on the newest feedback if it fails.
 */
export async function extractConstraints(
  managerTurns: string[],
  feedback: string,
  currentPointCount: number,
): Promise<ReviseConstraints> {
  const user = [
    ...managerTurns.map((t, i) => `Earlier turn ${i + 1}: ${t}`),
    `Newest turn: ${feedback}`,
    `The brief currently has ${currentPointCount} talking points.`,
  ].join('\n\n');
  try {
    const raw = await askClaude(EXTRACT_SYSTEM, user, 600, { tier: 'fast' });
    const parsed = parseClaudeJson<Record<string, unknown>>(raw);
    const count = parsed.point_count;
    const pointIndex =
      typeof parsed.point_index === 'number' &&
      Number.isInteger(parsed.point_index) &&
      parsed.point_index >= 0 &&
      parsed.point_index < currentPointCount
        ? parsed.point_index
        : null;
    const scopeRaw = parsed.scope;
    const scope: ReviseScope = SCOPES.includes(scopeRaw as ReviseScope)
      ? (scopeRaw as ReviseScope)
      : 'full';
    return {
      scope: scope === 'point' && pointIndex === null ? 'points' : scope,
      pointIndex,
      remember: parseRemembered(parsed.remember),
      pointCount:
        typeof count === 'number' && Number.isInteger(count) && count >= 1 && count <= 12
          ? count
          : null,
      lockHook: parsed.lock_hook === true,
      lockTitle: parsed.lock_title === true,
      lockCaption: parsed.lock_caption === true,
      lockSearchPhrase: parsed.lock_search_phrase === true,
      lockPointIndexes: clampIndexes(parsed.lock_point_indexes, currentPointCount),
      standingInstructions: Array.isArray(parsed.standing_instructions)
        ? parsed.standing_instructions
            .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
            .map((s) => s.trim())
            .slice(0, 8)
        : [],
    };
  } catch (error) {
    console.warn('constraint extraction fell back to regex:', error instanceof Error ? error.message : error);
    return regexConstraints(feedback);
  }
}

/** The values that must survive the rewrite, captured from the incoming draft. */
export type LockedValues = {
  hook: string | null;
  title: string | null;
  caption: string | null;
  /** Locked with the caption; the two are one field to the manager. */
  hashtags: string[] | null;
  searchPhrase: string | null;
  points: Array<{ index: number; point: TalkingPoint }>;
  /** Locked when the plug point is locked; the plug sentence lives in both. */
  cta: string | null;
  /** True when the plug point is among the locked points. */
  plugLocked: boolean;
};

export function captureLocked(
  draft: BriefDraftShape,
  chosenHook: string | null,
  constraints: ReviseConstraints,
): LockedValues {
  const points = constraints.lockPointIndexes
    .filter((i) => draft.talking_points[i]?.text)
    .map((i) => ({ index: i, point: draft.talking_points[i] }));
  const plugLocked = points.some((p) => p.point.is_product);
  return {
    hook: constraints.lockHook ? chosenHook?.trim() || null : null,
    title: constraints.lockTitle && draft.title.trim() ? draft.title.trim() : null,
    caption: constraints.lockCaption && draft.caption.trim() ? draft.caption : null,
    hashtags: constraints.lockCaption ? draft.hashtags : null,
    searchPhrase: constraints.lockSearchPhrase ? draft.search_phrase : null,
    points,
    cta: plugLocked ? draft.cta : null,
    plugLocked,
  };
}

/** True when every part of the post is locked: there is nothing to rewrite. */
export function everythingLocked(draft: BriefDraftShape, locked: LockedValues): boolean {
  const allPoints =
    draft.talking_points.length > 0 &&
    draft.talking_points.every((p, i) => !p.text || locked.points.some((l) => l.index === i));
  return (
    allPoints &&
    (locked.hook !== null || draft.hook_options.length === 0) &&
    (locked.title !== null || !draft.title.trim()) &&
    (locked.caption !== null || !draft.caption.trim())
  );
}

const PLUG_FAILURE = /\b(plug|cta|product point|is_product)\b/i;
const CAPTION_FAILURE = /\b(caption|hashtags?)\b/i;

/** Failures about a locked part are noise: a retry cannot change that part. */
export function failureAboutLockedPart(failure: string, locked: LockedValues): boolean {
  if (locked.plugLocked && PLUG_FAILURE.test(failure)) return true;
  if (locked.caption !== null && CAPTION_FAILURE.test(failure)) return true;
  return false;
}

/** What actually changed between the draft the manager sent and the one going back. */
export function changeReport(before: BriefDraftShape, beforeHook: string | null, after: BriefDraftShape): string {
  const same = (a: string | null | undefined, b: string | null | undefined) =>
    (a ?? '').replace(/\s+/g, ' ').trim() === (b ?? '').replace(/\s+/g, ' ').trim();
  const changed: string[] = [];
  const kept: string[] = [];
  (same(before.title, after.title) ? kept : changed).push('title');
  (same(beforeHook, after.hook_options[0]) ? kept : changed).push('hook');
  const pointNums: string[] = [];
  const max = Math.max(before.talking_points.length, after.talking_points.length);
  for (let i = 0; i < max; i++) {
    if (!same(before.talking_points[i]?.text, after.talking_points[i]?.text)) pointNums.push(String(i + 1));
  }
  if (before.talking_points.length !== after.talking_points.length) {
    changed.push(`points (now ${after.talking_points.length}, was ${before.talking_points.length})`);
  } else if (pointNums.length) {
    changed.push(pointNums.length === 1 ? `point ${pointNums[0]}` : `points ${pointNums.join(', ')}`);
  } else {
    kept.push('every point');
  }
  (same(before.cta, after.cta) ? kept : changed).push('plug sentence');
  (same(before.caption, after.caption) ? kept : changed).push('caption');
  const parts: string[] = [];
  parts.push(changed.length ? `Changed: ${changed.join(', ')}.` : 'Changed nothing.');
  if (kept.length) parts.push(`Untouched: ${kept.join(', ')}.`);
  return parts.join(' ');
}

/** Texts validation must never flag and compression must never touch. */
export function lockedTexts(locked: LockedValues): string[] {
  return [
    locked.hook,
    locked.title,
    locked.caption,
    ...locked.points.map((p) => p.point.text),
  ].filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
}

/** Lines appended to the revise message right after the newest feedback. */
export function constraintLines(
  constraints: ReviseConstraints,
  locked: LockedValues,
): string[] {
  const lines: string[] = [];
  const kept: string[] = [];
  if (locked.hook) kept.push(`the hook, exactly: ${locked.hook}`);
  if (locked.title) kept.push(`the title, exactly: ${locked.title}`);
  if (locked.caption) kept.push(`the caption, exactly: ${locked.caption}`);
  if (locked.searchPhrase) kept.push(`the search phrase, exactly: ${locked.searchPhrase}`);
  for (const { index, point } of locked.points) {
    kept.push(`talking point [${index}], exactly: ${point.text}`);
  }
  if (locked.cta !== null) kept.push(`the plug sentence (cta), exactly: ${locked.cta ?? '(none)'}`);
  if (kept.length) {
    lines.push(
      `LOCKED BY THE MANAGER (return these character for character; every rule below about hook shape, hook count, title shape or point length yields to this):\n${kept.map((k) => `- ${k}`).join('\n')}`,
    );
    if (locked.hook) {
      lines.push(
        `hook_options[0] is the locked hook verbatim with the highest score; the other 7 to 9 options are fresh alternatives the manager may ignore.`,
      );
    }
  }
  if (constraints.pointCount !== null) {
    lines.push(
      `REQUIRED POINT COUNT: the manager asked for exactly ${constraints.pointCount} talking points. point_count is ${constraints.pointCount} and talking_points has exactly ${constraints.pointCount} entries; this overrides the post type's range and any number in the source. If the title is a numbered list, it leads with ${constraints.pointCount}${locked.title ? ' unless the title is locked' : ''}.`,
    );
  }
  if (constraints.standingInstructions.length) {
    lines.push(
      `STANDING INSTRUCTIONS from earlier turns (still in force, apply them again):\n${constraints.standingInstructions.map((s) => `- ${s}`).join('\n')}`,
    );
  }
  return lines;
}

/** Restores locked values over the model's draft. Runs before validation. */
export function applyLocked(draft: BriefDraftShape, locked: LockedValues): BriefDraftShape {
  const next: BriefDraftShape = { ...draft };
  if (locked.hook) {
    const hook = locked.hook;
    const others = draft.hook_options.filter(
      (h) => h.trim().toLowerCase() !== hook.toLowerCase(),
    );
    next.hook_options = [hook, ...others].slice(0, 10);
  }
  if (locked.title) next.title = locked.title;
  if (locked.caption) next.caption = locked.caption;
  if (locked.hashtags) next.hashtags = locked.hashtags;
  if (locked.searchPhrase) next.search_phrase = locked.searchPhrase;
  if (locked.cta !== null) next.cta = locked.cta;
  if (locked.points.length) {
    const points = [...draft.talking_points];
    for (const { index, point } of locked.points) {
      if (index < points.length) points[index] = { ...point, edited_by_admin: true };
    }
    next.talking_points = points;
  }
  return next;
}

/** Failures the standard validator cannot know about: the manager's count. */
export function constraintFailures(
  draft: BriefDraftShape,
  constraints: ReviseConstraints,
): string[] {
  const failures: string[] = [];
  if (
    constraints.pointCount !== null &&
    draft.talking_points.length !== constraints.pointCount
  ) {
    failures.push(
      `the manager asked for exactly ${constraints.pointCount} talking points and you returned ${draft.talking_points.length}; write exactly ${constraints.pointCount}, each a real point, never padding and never merging`,
    );
  }
  return failures;
}

/** One plain sentence for the manager naming what was held fixed. */
export function keptNote(constraints: ReviseConstraints, locked: LockedValues): string | null {
  const parts: string[] = [];
  if (locked.hook) parts.push('the hook');
  if (locked.title) parts.push('the title');
  if (locked.caption) parts.push('the caption');
  if (locked.searchPhrase) parts.push('the search phrase');
  if (locked.points.length) {
    parts.push(
      locked.points.length === 1
        ? `point ${locked.points[0].index + 1}`
        : `points ${locked.points.map((p) => p.index + 1).join(', ')}`,
    );
  }
  const bits: string[] = [];
  if (parts.length) bits.push(`Kept ${parts.join(', ')} exactly as you had it.`);
  if (constraints.pointCount !== null) bits.push(`${constraints.pointCount} points as asked.`);
  return bits.length ? bits.join(' ') : null;
}

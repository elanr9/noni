// Structured comparison between the AI's version of a post and the version
// the campaign manager published. Both sides are brief_snapshot_json() output.

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type Snapshot = {
  brief: Record<string, Json>;
  post_type_key: string | null;
  segments: Array<Record<string, Json>>;
};

export type FieldChange = {
  /** Dotted path, e.g. "hook", "talking_points[2].text", "segments[3].screenshot_url". */
  field: string;
  category: LearningCategory;
  kind: 'edited' | 'added' | 'removed' | 'reordered' | 'chosen' | 'moved' | 'toggled';
  before: Json;
  after: Json;
  /** 0 = identical, 1 = fully rewritten. Text fields only. */
  distance?: number;
};

export type LearningCategory =
  | 'hook'
  | 'talking_points'
  | 'script'
  | 'caption'
  | 'hashtags'
  | 'cta'
  | 'overlay_text'
  | 'screenshots'
  | 'layout'
  | 'structure'
  | 'voice'
  | 'other';

export type BriefDiff = {
  changes: FieldChange[];
  changed_fields: string[];
  categories: LearningCategory[];
  /** Weighted 0..1 measure of how much the manager rewrote. */
  edit_ratio: number;
};

const TEXT_FIELDS: Array<{ key: string; category: LearningCategory; weight: number }> = [
  { key: 'title', category: 'other', weight: 0.5 },
  { key: 'hook', category: 'hook', weight: 2 },
  { key: 'script', category: 'script', weight: 3 },
  { key: 'caption', category: 'caption', weight: 1.5 },
  { key: 'cta', category: 'cta', weight: 1 },
  { key: 'search_phrase', category: 'structure', weight: 0.5 },
  { key: 'why_it_works', category: 'other', weight: 0.25 },
];

const SCALAR_FIELDS: Array<{ key: string; category: LearningCategory }> = [
  { key: 'format', category: 'structure' },
  { key: 'post_type_id', category: 'structure' },
  { key: 'point_count', category: 'structure' },
  { key: 'target_words', category: 'structure' },
  { key: 'subtitles', category: 'layout' },
  { key: 'subtitles_y', category: 'layout' },
  { key: 'text_style', category: 'layout' },
];

function str(v: Json | undefined): string {
  return typeof v === 'string' ? v : v === null || v === undefined ? '' : JSON.stringify(v);
}

function words(s: string): string[] {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean);
}

/** 1 - Dice coefficient on word bigrams (unigrams for short strings). */
export function textDistance(a: string, b: string): number {
  if (a.trim() === b.trim()) return 0;
  const wa = words(a);
  const wb = words(b);
  if (wa.length === 0 && wb.length === 0) return 0;
  if (wa.length === 0 || wb.length === 0) return 1;
  const grams = (w: string[]) =>
    w.length < 4 ? w : w.slice(0, -1).map((t, i) => `${t} ${w[i + 1]}`);
  const ga = grams(wa);
  const gb = new Map<string, number>();
  for (const g of grams(wb)) gb.set(g, (gb.get(g) ?? 0) + 1);
  let overlap = 0;
  for (const g of ga) {
    const n = gb.get(g);
    if (n) {
      overlap += 1;
      gb.set(g, n - 1);
    }
  }
  const dice = (2 * overlap) / (ga.length + grams(wb).length);
  return Math.min(1, Math.max(0, 1 - dice));
}

function sameJson(a: Json | undefined, b: Json | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

type Point = { id?: string; text?: string | null; is_product?: boolean };

function points(v: Json | undefined): Point[] {
  return Array.isArray(v)
    ? v.filter((p): p is { [k: string]: Json } => p !== null && typeof p === 'object' && !Array.isArray(p))
        .map((p) => ({
          id: typeof p.id === 'string' ? p.id : undefined,
          text: typeof p.text === 'string' ? p.text : null,
          is_product: p.is_product === true,
        }))
    : [];
}

function hookOptions(v: Json | undefined): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((h) =>
      typeof h === 'string'
        ? h
        : h !== null && typeof h === 'object' && !Array.isArray(h)
          ? str(h.text)
          : '',
    )
    .filter(Boolean);
}

function boxTexts(overlayStyle: Json | undefined): string[] {
  if (overlayStyle === null || typeof overlayStyle !== 'object' || Array.isArray(overlayStyle)) return [];
  const boxes = overlayStyle.boxes;
  if (!Array.isArray(boxes)) return [];
  return boxes.map((b) =>
    b !== null && typeof b === 'object' && !Array.isArray(b) ? str(b.text) : '',
  );
}

function boxGeometry(overlayStyle: Json | undefined): Json {
  if (overlayStyle === null || typeof overlayStyle !== 'object' || Array.isArray(overlayStyle)) return null;
  const boxes = overlayStyle.boxes;
  if (!Array.isArray(boxes)) return null;
  return boxes.map((b) => {
    if (b === null || typeof b !== 'object' || Array.isArray(b)) return null;
    const { text: _text, ...rest } = b;
    return rest;
  });
}

export function diffSnapshots(ai: Snapshot, final: Snapshot): BriefDiff {
  const changes: FieldChange[] = [];
  let weighted = 0;
  let totalWeight = 0;

  for (const f of TEXT_FIELDS) {
    const before = str(ai.brief[f.key]);
    const after = str(final.brief[f.key]);
    totalWeight += f.weight;
    if (before.trim() === after.trim()) continue;
    const distance = textDistance(before, after);
    weighted += distance * f.weight;
    changes.push({ field: f.key, category: f.category, kind: 'edited', before, after, distance });
  }

  for (const f of SCALAR_FIELDS) {
    if (sameJson(ai.brief[f.key], final.brief[f.key])) continue;
    changes.push({
      field: f.key,
      category: f.category,
      kind: 'toggled',
      before: ai.brief[f.key] ?? null,
      after: final.brief[f.key] ?? null,
    });
  }

  // Hook choice: did the manager pick a different option than the AI's top one?
  const aiOptions = hookOptions(ai.brief.hook_options);
  const finalHook = str(final.brief.hook);
  const aiHook = str(ai.brief.hook);
  if (finalHook && finalHook !== aiHook) {
    const idx = aiOptions.findIndex((h) => h.trim() === finalHook.trim());
    if (idx > 0) {
      changes.push({
        field: 'hook_options',
        category: 'hook',
        kind: 'chosen',
        before: aiHook,
        after: { chosen_index: idx, text: finalHook },
      });
    }
  }

  // Talking points: match by id, else by position.
  const aiPoints = points(ai.brief.talking_points);
  const finalPoints = points(final.brief.talking_points);
  totalWeight += 3;
  let pointDistance = 0;
  const matchedFinal = new Set<number>();
  aiPoints.forEach((p, i) => {
    let j = p.id ? finalPoints.findIndex((q, k) => q.id === p.id && !matchedFinal.has(k)) : -1;
    if (j === -1 && !matchedFinal.has(i) && finalPoints[i] && !finalPoints[i].id) j = i;
    if (j === -1) {
      changes.push({
        field: `talking_points[${i}]`,
        category: 'talking_points',
        kind: 'removed',
        before: p.text ?? '',
        after: null,
      });
      pointDistance += 1;
      return;
    }
    matchedFinal.add(j);
    const before = p.text ?? '';
    const after = finalPoints[j].text ?? '';
    if (before.trim() !== after.trim()) {
      const distance = textDistance(before, after);
      pointDistance += distance;
      changes.push({
        field: `talking_points[${i}].text`,
        category: 'talking_points',
        kind: 'edited',
        before,
        after,
        distance,
      });
    }
    if (j !== i) {
      changes.push({
        field: `talking_points[${i}]`,
        category: 'structure',
        kind: 'reordered',
        before: i,
        after: j,
      });
    }
    if (p.is_product !== finalPoints[j].is_product) {
      changes.push({
        field: `talking_points[${i}].is_product`,
        category: 'cta',
        kind: 'toggled',
        before: p.is_product ?? false,
        after: finalPoints[j].is_product ?? false,
      });
    }
  });
  finalPoints.forEach((q, j) => {
    if (matchedFinal.has(j)) return;
    pointDistance += 1;
    changes.push({
      field: `talking_points[${j}]`,
      category: 'talking_points',
      kind: 'added',
      before: null,
      after: q.text ?? '',
    });
  });
  const pointDenominator = Math.max(aiPoints.length, finalPoints.length, 1);
  weighted += Math.min(1, pointDistance / pointDenominator) * 3;

  // Hashtags.
  const aiTags = new Set(Array.isArray(ai.brief.hashtags) ? ai.brief.hashtags.map(str) : []);
  const finalTags = new Set(Array.isArray(final.brief.hashtags) ? final.brief.hashtags.map(str) : []);
  const addedTags = [...finalTags].filter((t) => !aiTags.has(t));
  const removedTags = [...aiTags].filter((t) => !finalTags.has(t));
  totalWeight += 0.5;
  if (addedTags.length || removedTags.length) {
    const union = new Set([...aiTags, ...finalTags]).size || 1;
    weighted += ((addedTags.length + removedTags.length) / union) * 0.5;
    if (addedTags.length) {
      changes.push({ field: 'hashtags', category: 'hashtags', kind: 'added', before: null, after: addedTags });
    }
    if (removedTags.length) {
      changes.push({ field: 'hashtags', category: 'hashtags', kind: 'removed', before: removedTags, after: null });
    }
  }

  // Segments: overlay copy, boxes, screenshots and placement. Match by
  // talking_point_index when set, else by slot_index.
  const finalBySlot = new Map<number, Record<string, Json>>();
  const finalByPoint = new Map<number, Record<string, Json>>();
  for (const s of final.segments) {
    if (typeof s.slot_index === 'number') finalBySlot.set(s.slot_index, s);
    if (typeof s.talking_point_index === 'number') finalByPoint.set(s.talking_point_index, s);
  }
  totalWeight += 2;
  let segmentDistance = 0;
  const segmentCount = Math.max(ai.segments.length, final.segments.length, 1);
  for (const s of ai.segments) {
    const slot = typeof s.slot_index === 'number' ? s.slot_index : -1;
    const t =
      typeof s.talking_point_index === 'number'
        ? finalByPoint.get(s.talking_point_index)
        : finalBySlot.get(slot);
    const path = `segments[${slot}]`;
    if (!t) {
      segmentDistance += 1;
      changes.push({ field: path, category: 'structure', kind: 'removed', before: str(s.kind), after: null });
      continue;
    }

    const beforeText = [str(s.overlay_text), ...boxTexts(s.overlay_style)].join(' | ');
    const afterText = [str(t.overlay_text), ...boxTexts(t.overlay_style)].join(' | ');
    if (beforeText.trim() !== afterText.trim()) {
      const distance = textDistance(beforeText, afterText);
      segmentDistance += distance * 0.6;
      changes.push({
        field: `${path}.overlay_text`,
        category: 'overlay_text',
        kind: 'edited',
        before: beforeText,
        after: afterText,
        distance,
      });
    }
    if (s.show_on_screen !== t.show_on_screen) {
      segmentDistance += 0.3;
      changes.push({
        field: `${path}.show_on_screen`,
        category: 'overlay_text',
        kind: 'toggled',
        before: s.show_on_screen ?? null,
        after: t.show_on_screen ?? null,
      });
    }
    const beforeGeom = boxGeometry(s.overlay_style);
    const afterGeom = boxGeometry(t.overlay_style);
    if (!sameJson(beforeGeom, afterGeom)) {
      segmentDistance += 0.2;
      changes.push({
        field: `${path}.overlay_boxes`,
        category: 'layout',
        kind: 'moved',
        before: beforeGeom,
        after: afterGeom,
      });
    }
    if (!sameJson(s.text_y, t.text_y) || !sameJson(s.layout, t.layout)) {
      segmentDistance += 0.2;
      changes.push({
        field: `${path}.layout`,
        category: 'layout',
        kind: 'moved',
        before: { layout: s.layout ?? null, text_y: s.text_y ?? null },
        after: { layout: t.layout ?? null, text_y: t.text_y ?? null },
      });
    }
    const beforeShot = str(s.screenshot_url);
    const afterShot = str(t.screenshot_url);
    if (beforeShot !== afterShot) {
      segmentDistance += 0.5;
      changes.push({
        field: `${path}.screenshot_url`,
        category: 'screenshots',
        kind: !beforeShot ? 'added' : !afterShot ? 'removed' : 'edited',
        before: beforeShot || null,
        after: afterShot || null,
      });
    } else if (
      afterShot &&
      (!sameJson(s.screenshot_x, t.screenshot_x) ||
        !sameJson(s.screenshot_y, t.screenshot_y) ||
        !sameJson(s.screenshot_width, t.screenshot_width))
    ) {
      segmentDistance += 0.2;
      changes.push({
        field: `${path}.screenshot_placement`,
        category: 'screenshots',
        kind: 'moved',
        before: { x: s.screenshot_x ?? null, y: s.screenshot_y ?? null, width: s.screenshot_width ?? null },
        after: { x: t.screenshot_x ?? null, y: t.screenshot_y ?? null, width: t.screenshot_width ?? null },
      });
    }
  }
  if (final.segments.length > ai.segments.length) {
    segmentDistance += final.segments.length - ai.segments.length;
    changes.push({
      field: 'segments',
      category: 'structure',
      kind: 'added',
      before: ai.segments.length,
      after: final.segments.length,
    });
  }
  weighted += Math.min(1, segmentDistance / segmentCount) * 2;

  const categories = [...new Set(changes.map((c) => c.category))];
  return {
    changes,
    changed_fields: [...new Set(changes.map((c) => c.field))],
    categories,
    edit_ratio: totalWeight ? Math.round((weighted / totalWeight) * 10000) / 10000 : 0,
  };
}

function clip(v: Json, max = 240): string {
  const s = str(v).replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Compact, model-readable account of one post's edits. Screenshot paths are
 * reduced to added/removed/swapped so no storage paths leak into prompts.
 */
export function summarizeDiff(diff: BriefDiff, postTypeKey: string | null): string {
  if (diff.changes.length === 0) return `[${postTypeKey ?? 'post'}] published exactly as generated.`;
  const lines = diff.changes.map((c) => {
    if (c.category === 'screenshots' && c.field.endsWith('screenshot_url')) {
      return `${c.field}: screenshot ${c.kind === 'edited' ? 'swapped for a different one' : c.kind}`;
    }
    if (c.kind === 'chosen') return `hook: picked option ${clip(c.after)} over the AI's first choice "${clip(c.before)}"`;
    if (c.kind === 'moved' || c.kind === 'toggled' || c.kind === 'reordered') {
      return `${c.field}: ${c.kind} ${clip(c.before, 120)} -> ${clip(c.after, 120)}`;
    }
    if (c.kind === 'added') return `${c.field}: added ${clip(c.after)}`;
    if (c.kind === 'removed') return `${c.field}: removed ${clip(c.before)}`;
    return `${c.field} (${Math.round((c.distance ?? 0) * 100)}% rewritten):\n    AI: ${clip(c.before)}\n    HUMAN: ${clip(c.after)}`;
  });
  return `[${postTypeKey ?? 'post'}] edit_ratio ${diff.edit_ratio}\n  ${lines.join('\n  ')}`;
}

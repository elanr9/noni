// What the manager did with the AI's words, turned into ai_feedback rows.
// Pure, so the editor can call it on every save and the rules stay tested:
// an AI line counts as edited only when the words changed (not spacing,
// casing, punctuation or the slide number), and each version of a line is
// logged once.

import type { AiFeedback } from './ai-feedback';

/** A slide as the editor holds it, with what AI last wrote on it. */
export type SignalSlide = {
  id: number;
  role: string;
  text: string;
  shot: string;
  aiText?: string;
  aiShot?: string;
};

export type SignalContext = {
  companyId: string;
  briefId: string | null;
  format: string;
  postType: string | null;
};

/** Lowercase words only; the slide number and punctuation do not count. */
export function normalizeLine(t: string): string {
  return t
    .toLowerCase()
    .replace(/^\s*\d+\s*[.)]\s*/, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the manager changed the words, not just the spacing or punctuation. */
export function changedMeaningfully(before: string, after: string): boolean {
  return normalizeLine(before) !== normalizeLine(after);
}

type Field = { role: string; before: string; after: string };

function fieldsOf(s: SignalSlide): Field[] {
  const out: Field[] = [];
  if (typeof s.aiText === 'string' && s.aiText.trim()) out.push({ role: s.role, before: s.aiText, after: s.text });
  if (typeof s.aiShot === 'string' && s.aiShot.trim()) out.push({ role: `${s.role}.shot`, before: s.aiShot, after: s.shot });
  return out;
}

/**
 * Feedback rows for the slides AI wrote, and the updated log of what was
 * already sent (key: slide id and field, value: before and after). Edits go
 * out once per new final text; approvals only when final is set (Add to
 * week). skip holds slide ids still being worked on (the selected slide on
 * autosave), so half typed lines are not logged.
 */
export function editSignals(
  slides: SignalSlide[],
  ctx: SignalContext,
  logged: ReadonlyMap<string, string>,
  opts: { final: boolean; skip?: ReadonlySet<number> },
): { rows: AiFeedback[]; logged: Map<string, string> } {
  const next = new Map(logged);
  const rows: AiFeedback[] = [];
  for (const s of slides) {
    if (opts.skip?.has(s.id)) continue;
    for (const f of fieldsOf(s)) {
      const key = `${s.id}:${f.role}`;
      const edited = f.after.trim() !== '' && changedMeaningfully(f.before, f.after);
      if (!edited && !opts.final) continue;
      // An emptied line is not a rewrite to learn from.
      if (!edited && !f.after.trim()) continue;
      const sig = `${f.before}\u0000${edited ? f.after : ''}`;
      if (next.get(key) === sig) continue;
      next.set(key, sig);
      rows.push({
        companyId: ctx.companyId,
        kind: edited ? 'edit' : 'approve',
        surface: 'editor',
        format: ctx.format,
        postType: ctx.postType,
        role: f.role,
        before: f.before,
        after: edited ? f.after : null,
        briefId: ctx.briefId,
      });
    }
  }
  return { rows, logged: next };
}

// Raw learning signals: what a person did with something the AI made. Two
// kinds are captured today, each stored as one brain source (kind 'manual',
// never extracted, never chunked) whose `meta.signal` holds the structured
// record and whose content is the same record as text:
//
//   brief_edit  the brief engine's draft against the brief the manager saved
//   edit_plan   the edit planner's applied plan against the creator's final cut
//
// Nothing here distils. A later job reads brain_sources where
// meta->>'signal' is set, groups them per company, and writes `learning`
// records that cite these sources (upsertFact), which assembleBrainContext
// then retrieves like any other learning. This file is pure so it runs under
// Deno and vitest alike.

export type SignalClip = { say: string; onScreen: string; cta?: boolean };
export type SignalHook = { say: string; onScreen: string; archetype?: string };

/** The engine's plan as the app received it. */
export type BriefDraft = {
  title: string;
  clips: SignalClip[];
  caption: string;
  tags: string[];
  hooks: SignalHook[];
  angle?: string;
};

/** The brief as the manager saved it. */
export type BriefSaved = { title: string; clips: SignalClip[]; caption: string; tags: string[] };

export type FieldChange = { field: 'say' | 'onScreen'; before: string; after: string };

export type ClipSignal = {
  /** 0 is the hook. */
  clip: number;
  /** kept: both fields as drafted. edited: at least one changed. removed: in the draft, not saved. added: saved, not in the draft. */
  outcome: 'kept' | 'edited' | 'removed' | 'added';
  changes: FieldChange[];
};

export type BriefEditSignal = {
  signal: 'brief_edit';
  v: 1;
  library_brief_id: string;
  brief_type: string;
  angle: string;
  /**
   * Which opening was saved: the index in the engine's hooks (0 is the one it
   * put first), or -1 when clip 1 matches none of them (the manager rewrote it).
   */
  hook_choice: number;
  hook_archetype: string | null;
  hooks_offered: SignalHook[];
  clips: ClipSignal[];
  title: { before: string; after: string } | null;
  caption: { before: string; after: string } | null;
  tags: { added: string[]; removed: string[] };
  /** Share of drafted clips saved word for word, 0 to 1. */
  kept_ratio: number;
};

export type EditPlanDelta = {
  ai: boolean;
  blocksChanged: boolean;
  textsRemoved: number;
  textsEdited: number;
  textsAdded: number;
  captionsChanged: boolean;
  soundChanged: boolean;
};

export type EditPlanSignal = {
  signal: 'edit_plan';
  v: 1;
  assignment_id: string;
  library_brief_id: string | null;
  format: string | null;
  delta: EditPlanDelta;
  /** True when the creator sent the planner's cut as it was. */
  untouched: boolean;
};

const norm = (t: unknown): string => (typeof t === 'string' ? t.replace(/\s+/g, ' ').trim() : '');
const cut = (t: unknown, max: number): string => norm(t).slice(0, max);
const same = (a: unknown, b: unknown): boolean => norm(a).toLowerCase() === norm(b).toLowerCase();

function clips(raw: unknown): SignalClip[] {
  return (Array.isArray(raw) ? raw : []).slice(0, 12).map((c) => {
    const o = (c ?? {}) as Record<string, unknown>;
    return { say: cut(o.say, 900), onScreen: cut(o.onScreen, 900), cta: o.cta === true };
  });
}

function tags(raw: unknown): string[] {
  return [...new Set((Array.isArray(raw) ? raw : []).map((t) => norm(t).replace(/^#/, '').toLowerCase()).filter(Boolean))].slice(0, 12);
}

/** Draft against saved, clip by clip in order. Clips are compared by position: the form keeps the engine's order unless the manager moves them. */
export function briefEditSignal(input: { libraryBriefId: string; briefType: string; draft: unknown; saved: unknown }): BriefEditSignal {
  const d = (input.draft ?? {}) as Record<string, unknown>;
  const s = (input.saved ?? {}) as Record<string, unknown>;
  const drafted = clips(d.clips);
  const saved = clips(s.clips);
  const hooks: SignalHook[] = (Array.isArray(d.hooks) ? d.hooks : []).slice(0, 3).map((h) => {
    const o = (h ?? {}) as Record<string, unknown>;
    return { say: cut(o.say, 300), onScreen: cut(o.onScreen, 300), archetype: cut(o.archetype, 60) };
  });

  const out: ClipSignal[] = [];
  for (let i = 0; i < Math.max(drafted.length, saved.length); i += 1) {
    const before = drafted[i];
    const after = saved[i];
    if (before && !after) out.push({ clip: i, outcome: 'removed', changes: [{ field: before.say ? 'say' : 'onScreen', before: before.say || before.onScreen, after: '' }] });
    else if (!before && after) out.push({ clip: i, outcome: 'added', changes: [{ field: after.say ? 'say' : 'onScreen', before: '', after: after.say || after.onScreen }] });
    else if (before && after) {
      const changes: FieldChange[] = [];
      if (!same(before.say, after.say)) changes.push({ field: 'say', before: before.say, after: after.say });
      if (!same(before.onScreen, after.onScreen)) changes.push({ field: 'onScreen', before: before.onScreen, after: after.onScreen });
      out.push({ clip: i, outcome: changes.length ? 'edited' : 'kept', changes });
    }
  }

  const first = saved[0];
  const matches = (h: SignalHook) => (h.say ? same(h.say, first?.say) : !!h.onScreen && same(h.onScreen, first?.onScreen));
  let hookChoice = first ? hooks.findIndex(matches) : -1;
  // No hooks were offered and the opening is as drafted: the engine's own.
  if (hookChoice < 0 && !hooks.length && out[0]?.outcome === 'kept') hookChoice = 0;

  const draftTags = tags(d.tags);
  const savedTags = tags(s.tags);
  const kept = out.filter((c) => c.outcome === 'kept').length;
  return {
    signal: 'brief_edit',
    v: 1,
    library_brief_id: input.libraryBriefId,
    brief_type: input.briefType,
    angle: cut(d.angle, 400),
    hook_choice: hookChoice,
    hook_archetype: hookChoice >= 0 ? hooks[hookChoice]?.archetype || null : null,
    hooks_offered: hooks,
    clips: out,
    title: same(d.title, s.title) ? null : { before: cut(d.title, 200), after: cut(s.title, 200) },
    caption: same(d.caption, s.caption) ? null : { before: cut(d.caption, 600), after: cut(s.caption, 600) },
    tags: { added: savedTags.filter((t) => !draftTags.includes(t)), removed: draftTags.filter((t) => !savedTags.includes(t)) },
    kept_ratio: drafted.length ? Math.round((kept / drafted.length) * 100) / 100 : 0,
  };
}

/** Null when the delta is not the shape lib/auto-edit.ts editPlanDelta returns. */
export function editPlanSignal(input: { assignmentId: string; libraryBriefId: string | null; format: string | null; delta: unknown }): EditPlanSignal | null {
  const d = input.delta as Partial<EditPlanDelta> | null;
  if (!d || typeof d !== 'object' || typeof d.ai !== 'boolean' || typeof d.blocksChanged !== 'boolean') return null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(Math.round(v), 999) : 0);
  const delta: EditPlanDelta = {
    ai: d.ai,
    blocksChanged: d.blocksChanged,
    textsRemoved: n(d.textsRemoved),
    textsEdited: n(d.textsEdited),
    textsAdded: n(d.textsAdded),
    captionsChanged: d.captionsChanged === true,
    soundChanged: d.soundChanged === true,
  };
  return {
    signal: 'edit_plan',
    v: 1,
    assignment_id: input.assignmentId,
    library_brief_id: input.libraryBriefId,
    format: input.format,
    delta,
    untouched: !delta.blocksChanged && !delta.textsRemoved && !delta.textsEdited && !delta.textsAdded && !delta.captionsChanged && !delta.soundChanged,
  };
}

/** The signal as the text a person or a model reads; the structured copy travels in the source's meta. */
export function renderSignal(signal: BriefEditSignal | EditPlanSignal): string {
  if (signal.signal === 'edit_plan') {
    const d = signal.delta;
    const did = [
      d.blocksChanged ? 'changed the cuts' : null,
      d.textsRemoved ? `removed ${d.textsRemoved} on-screen text${d.textsRemoved === 1 ? '' : 's'}` : null,
      d.textsEdited ? `edited ${d.textsEdited}` : null,
      d.textsAdded ? `added ${d.textsAdded}` : null,
      d.captionsChanged ? 'changed the captions' : null,
      d.soundChanged ? 'changed the sound' : null,
    ].filter(Boolean);
    return [
      `Edit plan signal for post ${signal.assignment_id}${signal.library_brief_id ? ` (brief ${signal.library_brief_id})` : ''}.`,
      `The plan was ${d.ai ? 'written by the model' : 'the rule-based fallback'}.`,
      signal.untouched ? 'The creator sent it as planned.' : `Before sending, the creator ${did.join(', ')}.`,
    ].join('\n');
  }
  const label = (i: number) => (i === 0 ? 'Hook' : `Clip ${i}`);
  const lines = [
    `Brief edit signal for ${signal.brief_type} brief ${signal.library_brief_id}.`,
    signal.angle ? `Angle: ${signal.angle}` : null,
    signal.hook_choice === 0
      ? 'The manager kept the opening the engine put first.'
      : signal.hook_choice > 0
        ? `The manager chose alternative opening ${signal.hook_choice + 1}${signal.hook_archetype ? ` (${signal.hook_archetype})` : ''}.`
        : 'The manager wrote their own opening.',
    ...signal.clips.flatMap((c) =>
      c.outcome === 'kept'
        ? [`${label(c.clip)}: kept.`]
        : c.changes.map((ch) => `${label(c.clip)} ${ch.field === 'say' ? 'spoken line' : 'on-screen text'} ${c.outcome}: "${ch.before}" -> "${ch.after}"`)
    ),
    signal.title ? `Title: "${signal.title.before}" -> "${signal.title.after}"` : null,
    signal.caption ? `Caption: "${signal.caption.before}" -> "${signal.caption.after}"` : null,
    signal.tags.added.length || signal.tags.removed.length
      ? `Tags: added ${signal.tags.added.join(', ') || 'none'}; removed ${signal.tags.removed.join(', ') || 'none'}.`
      : null,
  ];
  return lines.filter(Boolean).join('\n');
}

// State of the stepped brief editor (SSManager.jsx HandheldEditor): the
// deck, the current step and slide, the sheets, and the AI actions. Works
// for slideshows and reels; Story and Long text change the steps.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  addBriefToWeek,
  ctaPlaceOf,
  resolvePostTypeId,
  saveWeekBrief,
  type BriefKind,
  type BriefMediaFormat,
  type CtaPlacement,
  type SlideBox,
  type WeekBrief,
  type WeekBriefInput,
} from '../../../../lib/briefs-api';
import type { PostTypeCopy } from '../../../../lib/brief-copy';
import type { LibraryFeature } from '../../../../lib/library-api';
import type { BriefStep } from '../../../shared/briefs';
import { CTA_BOXES, LONGTEXT_BOX, LONGTEXT_TSTYLE } from '../canvas/layout';
import { deckIdeas, reviewDeck, writeDeck, type DeckFix, type DeckIdea, type DeckMode, type DeckReview } from '../../../../lib/deck-ai';
import { logAiFeedback } from '../../../../lib/ai-feedback';
import { editSignals, type SignalSlide } from '../../../../lib/ai-edit-signals';
import { addTurn, reviseReply, type ReviseTurn } from '../../../../lib/revise-chat';
import { loadReviseChat, saveReviseChat } from '../../../../lib/revise-chat-store';
import { stripEditorSlide, type BusyId, type EditorSlide, type SheetId, type StepId } from './types';

export type Gap = { min: number; max: number };

// Post type ids per company and key for the session, so save is one round trip.
const postTypeIds = new Map<string, Promise<string>>();
function postTypeIdFor(companyId: string, postType: PostTypeCopy): Promise<string> {
  const k = `${companyId}:${postType.key}`;
  let p = postTypeIds.get(k);
  if (!p) {
    p = resolvePostTypeId(companyId, postType);
    p.catch(() => postTypeIds.delete(k));
    postTypeIds.set(k, p);
  }
  return p;
}

export interface BriefEditorOptions {
  briefId: string;
  companyId: string;
  brief: WeekBrief | null;
  format: BriefMediaFormat;
  kind: Exclude<BriefKind, 'open'>;
  postType: PostTypeCopy | null;
  features: LibraryFeature[];
  onSaved: () => void;
  /**
   * An idea picked in the idea chat. On open, when the deck has no text yet,
   * it becomes the cover and AI writes the whole post (pickIdea), once.
   */
  initialIdea?: DeckIdea | null;
}

function stepsFor(story: boolean, lt: boolean, reel: boolean): BriefStep[] {
  if (story) {
    return [
      { id: 'cover', name: reel ? 'Hook' : 'Cover' },
      { id: 'cta', name: 'CTA' },
      { id: 'details', name: 'Details' },
      { id: 'review', name: 'Review' },
    ];
  }
  if (lt) {
    return [
      { id: 'cover', name: 'Text' },
      { id: 'cta', name: 'CTA line' },
      { id: 'details', name: 'Details' },
      { id: 'review', name: 'Review' },
    ];
  }
  return [
    { id: 'cover', name: reel ? 'Hook' : 'Cover' },
    { id: 'points', name: reel ? 'Points' : 'Slides' },
    { id: 'details', name: 'Details' },
    { id: 'review', name: 'Review' },
  ];
}

function seedSlides(brief: WeekBrief | null, story: boolean, lt: boolean): EditorSlide[] {
  // The CTA carries its placement; briefs saved before it read the Story setting, else any.
  const place = brief ? ctaPlaceOf(brief) : 'any';
  if (brief && brief.slides.length > 0) {
    return brief.slides.map((s, i) => (s.role === 'cta' ? { ...s, place, id: i } : { ...s, id: i }));
  }
  const cover: EditorSlide = { id: 0, role: 'cover', text: '', shot: '', inset_feature_id: null };
  if (lt) {
    cover.tstyle = LONGTEXT_TSTYLE;
    cover.box = LONGTEXT_BOX;
  }
  const cta: EditorSlide = { id: 1, role: 'cta', text: brief?.cta.text ?? '', shot: '', inset_feature_id: brief?.cta.featureId ?? null, place };
  if (story) cover.text = brief?.story?.theme ?? '';
  return [cover, cta];
}

/**
 * Deck index of the CTA for n body slides (the CTA counts as one): right
 * after the cover, last, or (creator decides) a little past the middle as the
 * starting point, where the real top posts put the product.
 */
export function ctaSlot(n: number, place: CtaPlacement): number {
  if (place === 'after_hook') return 1;
  if (place === 'end') return Math.max(1, n);
  return Math.min(Math.max(1, Math.ceil(n * 0.6)), Math.max(1, n - 1));
}

/**
 * The deck with its CTA locked where place says (right after the cover, or
 * last); the other slides keep their order. Creator decides leaves the CTA
 * where the manager has it, as the creators' starting point.
 */
export function moveCta<T extends { role: string }>(arr: T[], place: CtaPlacement): T[] {
  const cta = arr.find((s) => s.role === 'cta');
  if (!cta || arr.length < 3 || place === 'any') return arr;
  const rest = arr.filter((s) => s !== cta);
  const out = [...rest];
  out.splice(ctaSlot(arr.length - 1, place), 0, cta);
  return out;
}

/** A clip is done with on screen text, a line for the creator, a screen recording or a picture on it. */
export function slideFilled(s: Pick<EditorSlide, 'text' | 'shot' | 'inset_feature_id' | 'pics'>): boolean {
  return Boolean(s.text.trim() || s.shot.trim() || s.inset_feature_id || s.pics?.length);
}

export function useBriefEditor(opts: BriefEditorOptions) {
  const { briefId, companyId, brief, format, kind, postType, onSaved } = opts;
  const reel = format === 'reel';
  const lt = reel && postType?.id === 'longtext';
  const story = kind === 'story';
  const tipsStory = story && postType?.id === 'tips';
  const STEPS = useMemo(() => stepsFor(story, lt, reel), [story, lt, reel]);

  const [seed] = useState<EditorSlide[]>(() => seedSlides(brief, story, lt));
  const [slides, setSlides] = useState<EditorSlide[]>(seed);
  // The chat's idea runs only on a blank deck; a post with text keeps its words.
  const [autoIdea] = useState<DeckIdea | null>(() => (opts.initialIdea && seed.every((s) => !s.text.trim()) ? opts.initialIdea : null));
  const autoRan = useRef(false);
  const [step, setStep] = useState<StepId>(brief?.status === 'ready' ? 'review' : 'cover');
  const [sel, setSel] = useState(0);
  const [count, setCountN] = useState<number | null>(brief?.story && tipsStory ? brief.story.min + 1 : null);
  const [gap, setGap] = useState<Gap>({ min: brief?.story?.min ?? 4, max: brief?.story?.max ?? 8 });
  const [search, setSearch] = useState(brief?.searchTerm ?? '');
  const [caption, setCaption] = useState(brief?.caption ?? '');
  const [tags, setTags] = useState<string[]>(brief?.hashtags ?? []);
  const [sheet, setSheet] = useState<SheetId>(null);
  const [busy, setBusy] = useState<BusyId>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editNonce, setEditNonce] = useState(0);
  const nextId = useRef(100);
  const introSeen = useRef(brief?.status === 'ready');
  const sheetRef = useRef<SheetId>(null);
  useEffect(() => {
    sheetRef.current = sheet;
  }, [sheet]);

  // Learning signals: what AI wrote vs what the manager kept, logged once per version.
  const aiCaption = useRef<string | undefined>(undefined);
  const loggedEdits = useRef<Map<string, string>>(new Map());
  const selId = useRef<number | null>(null);
  const feedbackCtx = { companyId, briefId: briefId || null, format, postType: postType?.key ?? postType?.id ?? null };

  /** Log edits (and on final save, approvals) for the lines AI wrote. Fire and forget. */
  const logEdits = (deck: EditorSlide[], cap: string, final: boolean) => {
    if (!companyId) return;
    const list: SignalSlide[] = [...deck, { id: -1, role: 'caption', text: cap, shot: '', aiText: aiCaption.current }];
    const skip = !final && selId.current !== null ? new Set([selId.current]) : undefined;
    const { rows, logged } = editSignals(list, feedbackCtx, loggedEdits.current, { final, skip });
    loggedEdits.current = logged;
    if (rows.length) logAiFeedback(rows);
  };

  // Revise with AI conversation for this post, kept on the device.
  const [reviseChat, setReviseChat] = useState<ReviseTurn[]>([]);
  const reviseRef = useRef<ReviseTurn[]>([]);
  useEffect(() => {
    if (!briefId) return;
    let live = true;
    void loadReviseChat(briefId).then((saved) => {
      if (!live || !saved.length) return;
      const merged = [...saved, ...reviseRef.current];
      reviseRef.current = merged;
      setReviseChat(merged);
    });
    return () => {
      live = false;
    };
  }, [briefId]);
  const pushTurn = useCallback(
    (role: ReviseTurn['role'], text: string) => {
      const next = addTurn(reviseRef.current, role, text);
      reviseRef.current = next;
      setReviseChat(next);
      if (briefId) void saveReviseChat(briefId, next);
    },
    [briefId],
  );

  const stepIdx = STEPS.findIndex((s) => s.id === step);
  const ctaIdx = slides.findIndex((s) => s.role === 'cta');
  // Where every creator's CTA goes, kept on the CTA slide: after the hook, at the end, or the creator decides.
  const ctaAt: CtaPlacement = slides[ctaIdx]?.place ?? 'any';
  const cur = slides[sel] ?? slides[0];
  const curId = cur?.id ?? null;
  useEffect(() => {
    selId.current = curId;
  }, [curId]);
  const title = slides[0]?.text ?? '';
  const points = slides.filter((s) => s.role === 'point');
  const ctaOk = Boolean(slides[ctaIdx]?.text.trim());
  const pointsOk = points.length > 0 && points.every(slideFilled) && (story || ctaOk);
  const lastIdx = slides.length - 1;
  const onLastPoint = step === 'points' && sel >= lastIdx;
  const onCta = !story && step === 'points' && cur?.role === 'cta';

  const showIntro = useCallback(() => {
    if (introSeen.current) return false;
    introSeen.current = true;
    setSheet('intro');
    return true;
  }, []);

  const patchAt = useCallback((at: number, p: Partial<EditorSlide>) => {
    setSlides((arr) => arr.map((s, i) => (i === at ? { ...s, ...p } : s)));
  }, []);

  /**
   * The deck for n body slides (the CTA counts as one), with the CTA where
   * its placement puts it (a little past the middle when the creator decides).
   */
  const buildDeck = useCallback(
    (arr: EditorSlide[], n: number): EditorSlide[] => {
      const cov = arr[0];
      const cta = arr.find((s) => s.role === 'cta');
      const m = cta && !story ? Math.max(1, n - 1) : n;
      const pts = arr.filter((s) => s.role === 'point').slice(0, m);
      while (pts.length < m) pts.push({ id: nextId.current++, role: 'point', text: '', shot: '', inset_feature_id: null });
      if (!cta) return [cov, ...pts];
      if (story) return [cov, ...pts, cta];
      pts.splice(ctaSlot(pts.length + 1, ctaAt) - 1, 0, cta);
      return [cov, ...pts];
    },
    [story, ctaAt],
  );

  /**
   * Set where the CTA goes. Story keeps its deck (the creator's part goes
   * around the CTA); Handheld moves the CTA slide right after the cover or
   * last, or leaves it where it is when the creator decides, and keeps it selected.
   */
  const setCtaAt = useCallback(
    (place: CtaPlacement) => {
      const placed = slides.map((s) => (s.role === 'cta' ? { ...s, place } : s));
      const moved = story ? placed : moveCta(placed, place);
      setSlides(moved);
      const at = moved.findIndex((s) => s.role === 'cta');
      if (!story && at >= 0) setSel(at);
    },
    [slides, story],
  );

  const setCount = useCallback(
    (n: number) => {
      setSlides((arr) => buildDeck(arr, n));
      setSel(1);
    },
    [buildDeck],
  );

  /** One more clip right after the current one, selected and ready to type. */
  const addPoint = useCallback(() => {
    const at = Math.max(1, sel + 1);
    setSlides((arr) => {
      const fresh: EditorSlide = { id: nextId.current++, role: 'point', text: '', shot: '', inset_feature_id: null };
      const next = [...arr];
      next.splice(Math.min(at, next.length), 0, fresh);
      return next;
    });
    setSel(at);
    setEditNonce((n) => n + 1);
  }, [sel]);

  /** Drop one clip; the cover and the CTA stay, and at least one point stays. */
  const removePoint = useCallback(
    (at: number) => {
      setSlides((arr) => {
        const s = arr[at];
        if (!s || s.role !== 'point' || arr.filter((x) => x.role === 'point').length <= 1) return arr;
        return arr.filter((_, i) => i !== at);
      });
      setSel((cur) => (cur >= at ? Math.max(1, cur - 1) : cur));
    },
    [],
  );

  const go = useCallback(
    (id: string) => {
      const next = id as StepId;
      setSheet(null);
      setStep(next);
      if (next === 'cover') setSel(0);
      if (next === 'cta') {
        setSel(ctaIdx);
        if (tipsStory && !count) setSheet('count');
        else if (!ctaOk) showIntro();
      }
      if (next === 'points') {
        if (points.length) setSel(1);
        else {
          setSel(0);
          setSheet('count');
        }
      }
    },
    [ctaIdx, tipsStory, count, ctaOk, showIntro, points.length],
  );

  const next = useCallback(() => {
    if (step === 'points' && !onLastPoint) {
      setSel(sel + 1);
      return;
    }
    const target = STEPS[stepIdx + 1];
    if (target) go(target.id);
  }, [step, onLastPoint, sel, STEPS, stepIdx, go]);

  const back = useCallback(() => {
    const target = STEPS[stepIdx - 1];
    if (target) go(target.id);
  }, [STEPS, stepIdx, go]);

  const ctaBoxes = (): Partial<EditorSlide> => ({
    box: { ...CTA_BOXES.box },
    inset_box: { ...CTA_BOXES.inset_box },
    box_ig: { ...CTA_BOXES.box_ig },
    inset_box_ig: { ...CTA_BOXES.inset_box_ig },
  });

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong');

  /**
   * Every AI button runs through write-deck: it gets the whole deck, writes
   * only what the mode covers (and never a slide the manager typed, outside
   * revise), and returns the deck in the same order. Exact counts, a real
   * CTA from the feature library, one voice for slideshows and reels.
   */
  const runDeck = useCallback(
    async (
      mode: Exclude<DeckMode, 'ideas' | 'review'>,
      busyId: Exclude<BusyId, null>,
      extra: { featureId?: string | null; feedback?: string; slides?: EditorSlide[] } = {},
    ) => {
      setBusy(busyId);
      try {
        const deck = extra.slides ?? slides;
        const ids = deck.map((s) => s.id);
        const sentText = deck.map((s) => s.text);
        const res = await writeDeck({
          briefId,
          mode,
          format,
          kind,
          postType,
          slides: deck.map(stripEditorSlide),
          caption,
          hashtags: tags,
          searchPhrase: search,
          featureId: extra.featureId,
          feedback: extra.feedback,
        });
        const now = Date.now();
        // Apply by stable id, and only where the text is still what was sent.
        setSlides((arr) =>
          arr.map((s) => {
            const k = ids.indexOf(s.id);
            const o = k < 0 ? null : res.slides[k];
            if (!o?.changed || s.text !== sentText[k]) return s;
            const next: EditorSlide = { ...s, text: o.text, shot: o.shot, genAt: now, aiText: o.text, aiShot: o.shot };
            if (s.role !== 'cta') return next;
            if (lt) return { ...next, inset_feature_id: null };
            const fid = o.featureId ?? s.inset_feature_id;
            return { ...next, inset_feature_id: fid, ...(s.box || !fid ? {} : ctaBoxes()) };
          }),
        );
        const sentCaption = caption;
        const sentTags = tags.join('\n');
        const sentSearch = search;
        if (res.caption && caption === sentCaption) aiCaption.current = res.caption;
        if (res.caption) setCaption((c) => (c === sentCaption ? (res.caption ?? c) : c));
        if (res.hashtags?.length) setTags((t) => (t.join('\n') === sentTags ? (res.hashtags ?? t) : t));
        if (res.searchPhrase) setSearch((v) => (v === sentSearch ? (res.searchPhrase ?? v) : v));
        return res;
      } catch (e) {
        fail(e);
        return null;
      } finally {
        setBusy(null);
      }
    },

    [briefId, format, kind, postType, lt, slides, caption, tags, search],
  );

  /** Write the CTA slide from the feature that fits this post best. */
  const generateCta = useCallback(() => {
    // Keep the feature the manager already set; the model only picks when there is none.
    void runDeck('cta', 'cta', { featureId: slides[ctaIdx]?.inset_feature_id ?? null });
  }, [runDeck, slides, ctaIdx]);

  /** The manager picked the feature; show its screenshot now and write the line for it. */
  const pickFeature = useCallback(
    (it: LibraryFeature) => {
      patchAt(ctaIdx, lt ? { inset_feature_id: null } : { inset_feature_id: it.id, ...(slides[ctaIdx]?.box || !it.id ? {} : ctaBoxes()) });
      void runDeck('cta', 'cta', { featureId: it.id });
    },

    [ctaIdx, lt, patchAt, runDeck, slides],
  );

  const selfCta = useCallback(
    (it: LibraryFeature | null) => {
      if (it) patchAt(ctaIdx, { inset_feature_id: it.id });
      setSel(ctaIdx);
      // sel may not change, so tell the canvas to open the keyboard.
      setEditNonce((n) => n + 1);
    },
    [ctaIdx, patchAt],
  );

  /** Fill every empty slide (and an empty CTA) against the cover. Typed slides stay. */
  const writePoints = useCallback(async () => {
    await runDeck('points', 'points');
  }, [runDeck]);

  /** Reel cover: title card plus the spoken hook. */
  const writeHook = useCallback(async () => {
    await runDeck('cover', 'hook');
  }, [runDeck]);

  const fillDetails = useCallback(async () => {
    await runDeck('details', 'details');
  }, [runDeck]);

  /**
   * Revise with AI: a chip or free text; slides the feedback is not about
   * stay. The ask and the AI's note of what changed go in this post's
   * conversation, and the ask is a lesson for every later generation.
   */
  const revise = useCallback(
    async (feedback: string) => {
      pushTurn('user', feedback);
      if (companyId) logAiFeedback({ ...feedbackCtx, kind: 'revise', surface: 'editor', note: feedback });
      const res = await runDeck('revise', 'revise', { feedback });
      pushTurn('ai', reviseReply(res?.note, Boolean(res)));
    },
    // feedbackCtx is rebuilt from these each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runDeck, pushTurn, companyId, briefId, format, postType],
  );

  /**
   * Cover ideas for this post type, fresh against the week and recent posts.
   * Prefetched on an empty cover and kept, so the sheet opens with them.
   */
  const [ideas, setIdeas] = useState<DeckIdea[] | null>(null);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const ideasReq = useRef(0);
  const shownCovers = useRef<string[]>([]);
  const fetchIdeas = useCallback(
    async (quiet: boolean) => {
      const req = ++ideasReq.current;
      setIdeasBusy(true);
      setIdeas(null);
      try {
        const res = await deckIdeas({ briefId, format, kind, postType, exclude: shownCovers.current });
        if (req !== ideasReq.current) return;
        shownCovers.current = [...shownCovers.current, ...res.map((d) => d.cover)];
        setIdeas(res);
      } catch (e) {
        if (req !== ideasReq.current) return;
        // A failed prefetch stays quiet; opening the sheet tries again.
        if (!quiet || sheetRef.current === 'ideas') {
          setSheet(null);
          fail(e);
        }
      } finally {
        if (req === ideasReq.current) setIdeasBusy(false);
      }
    },
    [briefId, format, kind, postType],
  );
  const openIdeas = useCallback(() => {
    setSheet('ideas');
    if (ideasBusy || (ideas && ideas.length > 0)) return;
    void fetchIdeas(false);
  }, [fetchIdeas, ideas, ideasBusy]);
  /** Different ideas: a fresh set that skips every cover already shown. */
  const moreIdeas = useCallback(() => {
    if (ideasBusy) return;
    void fetchIdeas(false);
  }, [fetchIdeas, ideasBusy]);
  useEffect(() => {
    // An idea from the chat is about to fill the post; no cover ideas needed.
    if (step !== 'cover' || title.trim() || autoIdea) return;
    const t = setTimeout(() => void fetchIdeas(true), 0);
    return () => clearTimeout(t);
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** One tap: the idea becomes the cover, the deck is sized to it, and AI writes the rest. */
  const pickIdea = useCallback(
    (idea: DeckIdea) => {
      setSheet(null);
      setIdeas((list) => (list ? list.filter((d) => d !== idea) : list));
      // A new idea is a new topic: clear the body so the old one does not stay
      // and mode all has something to write. The CTA keeps its feature.
      const withCover = slides.map((s, i) =>
        i === 0
          ? { ...s, text: idea.cover, shot: reel && idea.say ? idea.say : s.shot, genAt: Date.now(), aiText: idea.cover, aiShot: reel && idea.say ? idea.say : undefined }
          : { ...s, text: '', shot: '', genAt: undefined, aiText: undefined, aiShot: undefined },
      );
      const sized = !story && !lt && idea.count > 0 ? buildDeck(withCover, idea.count) : withCover;
      setSlides(sized);
      if (story || lt) {
        setStep('cta');
        setSel(sized.findIndex((s) => s.role === 'cta'));
      } else {
        setStep('points');
        setSel(1);
      }
      void runDeck('all', 'post', { slides: sized });
    },
    [slides, reel, story, lt, buildDeck, runDeck],
  );

  // Opened from the idea chat: straight into "Writing the whole post".
  useEffect(() => {
    if (!autoIdea || autoRan.current) return;
    autoRan.current = true;
    pickIdea(autoIdea);
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** A strict second read of the finished post. */
  const [check, setCheck] = useState<DeckReview | null>(null);
  const [checkApplied, setCheckApplied] = useState(0);
  const checkPost = useCallback(async () => {
    // Open now with a skeleton; the read fills it in.
    setBusy('check');
    setCheck(null);
    setCheckApplied(0);
    setSheet('check');
    try {
      const res = await reviewDeck({ briefId, format, kind, postType, slides: slides.map(stripEditorSlide), caption, hashtags: tags, searchPhrase: search });
      setCheck(res);
    } catch (e) {
      if (sheetRef.current === 'check') setSheet(null);
      fail(e);
    } finally {
      setBusy(null);
    }
  }, [briefId, format, kind, postType, slides, caption, tags, search]);

  const applyFix = useCallback(
    (fix: DeckFix) => {
      const was = slides[fix.i];
      if (was && companyId) {
        const base = { ...feedbackCtx, kind: 'edit' as const, surface: 'check' as const };
        const rows = [];
        if (fix.text !== was.text) rows.push({ ...base, role: was.role, before: was.text, after: fix.text });
        if (fix.shot && fix.shot !== was.shot) rows.push({ ...base, role: `${was.role}.shot`, before: was.shot, after: fix.shot });
        if (rows.length) logAiFeedback(rows);
      }
      patchAt(fix.i, { text: fix.text, ...(fix.shot ? { shot: fix.shot } : {}), genAt: Date.now(), aiText: fix.text, ...(fix.shot ? { aiShot: fix.shot } : {}) });
      setCheck((c) => (c ? { ...c, fixes: c.fixes.filter((f) => f !== fix) } : c));
      setCheckApplied((n) => n + 1);
    },
    // feedbackCtx is rebuilt from these each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patchAt, slides, companyId, briefId, format, postType],
  );

  const toInput = (): WeekBriefInput => ({
    kind,
    postTypeId: null,
    title: lt ? title.split(/[.!?]/)[0] || 'Long text' : title,
    caption,
    searchTerm: search,
    hashtags: tags,
    slides: slides.map(stripEditorSlide),
    story: story
      ? {
          theme: title,
          beats: [],
          min: tipsStory ? Math.max(1, (count ?? 2) - 1) : gap.min,
          max: tipsStory ? Math.max(1, (count ?? 2) - 1) : gap.max,
          ctaAt,
        }
      : null,
    open: null,
    cta: { text: slides[ctaIdx]?.text ?? '', featureId: slides[ctaIdx]?.inset_feature_id ?? null },
    creatorNote: null,
  });

  /** Draft autosave: 1.5s after the post changes, while the brief is not ready. */
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRun = useRef<(() => void) | null>(null);
  const saved = useRef(false);
  const draftInFlight = useRef<Promise<void> | null>(null);
  const draftKey = useRef<string | null>(null);
  const isReady = brief?.status === 'ready';
  useEffect(() => {
    const input = toInput();
    const key = JSON.stringify([input.slides, input.caption, input.hashtags, input.searchTerm, input.story]);
    // The first run is the seed, not an edit.
    if (draftKey.current === null || draftKey.current === key) {
      draftKey.current = key;
      return;
    }
    draftKey.current = key;
    if (isReady || saved.current || !briefId) return;
    const deckNow = slides;
    const captionNow = caption;
    const run = () => {
      draftRun.current = null;
      if (saved.current) return;
      logEdits(deckNow, captionNow, false);
      const p = (async () => {
        try {
          if (postType && companyId) input.postTypeId = await postTypeIdFor(companyId, postType);
          if (saved.current) return;
          await saveWeekBrief(briefId, input);
        } catch (e) {
          console.warn('draft autosave failed', e);
        }
      })();
      draftInFlight.current = p;
      void p.finally(() => {
        if (draftInFlight.current === p) draftInFlight.current = null;
      });
    };
    draftRun.current = run;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(run, 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides, caption, tags, search, count, gap, ctaAt]);
  // Leaving inside the debounce still keeps the draft.
  useEffect(
    () => () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftRun.current?.();
    },
    [],
  );

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    saved.current = true;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftRun.current = null;
    try {
      // A draft write landing after this one would turn the brief back to draft.
      await draftInFlight.current;
      const input = toInput();
      if (postType) input.postTypeId = await postTypeIdFor(companyId, postType);
      await addBriefToWeek(briefId, input);
      logEdits(slides, caption, true);
      onSaved();
    } catch (e) {
      saved.current = false;
      fail(e);
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving, postType, companyId, briefId, onSaved, slides, caption, search, tags, count, gap, ctaAt]);

  const reviewGap: Gap = tipsStory
    ? { min: Math.max(1, (count ?? 2) - 1), max: Math.max(1, (count ?? 2) - 1) }
    : story
      ? { min: gap.min, max: gap.max }
      : { min: 3, max: 3 };

  const setBoxFor = useCallback(
    (at: number, key: 'box' | 'box_ig' | 'inset_box' | 'inset_box_ig', box: SlideBox) => patchAt(at, { [key]: box }),
    [patchAt],
  );

  return {
    reel,
    lt,
    story,
    tipsStory,
    STEPS,
    step,
    stepIdx,
    slides,
    sel,
    setSel,
    cur,
    ctaIdx,
    title,
    points,
    ctaOk,
    pointsOk,
    onLastPoint,
    onCta,
    count,
    setCountN,
    setCount,
    gap,
    setGap,
    ctaAt,
    setCtaAt,
    search,
    setSearch,
    caption,
    setCaption,
    tags,
    setTags,
    sheet,
    setSheet,
    busy,
    saving,
    error,
    clearError: () => setError(null),
    showIntro,
    patchAt,
    addPoint,
    removePoint,
    setBoxFor,
    go,
    next,
    back,
    generateCta,
    pickFeature,
    selfCta,
    editNonce,
    writePoints,
    writeHook,
    fillDetails,
    revise,
    reviseChat,
    ideas,
    ideasBusy,
    openIdeas,
    moreIdeas,
    pickIdea,
    check,
    checkApplied,
    checkPost,
    applyFix,
    save,
    reviewGap,
  };
}

export type BriefEditorState = ReturnType<typeof useBriefEditor>;

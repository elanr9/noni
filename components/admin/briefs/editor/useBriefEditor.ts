// State of the stepped brief editor (SSManager.jsx HandheldEditor): the
// deck, the current step and slide, the sheets, and the AI actions. Works
// for slideshows and reels; Story and Long text change the steps.

import { useCallback, useMemo, useRef, useState } from 'react';

import {
  addBriefToWeek,
  assistRegenerateField,
  assistRevise,
  resolvePostTypeId,
  toBriefFormat,
  type BriefKind,
  type BriefMediaFormat,
  type RegenDraftPayload,
  type SlideBox,
  type WeekBrief,
  type WeekBriefInput,
} from '../../../../lib/briefs-api';
import type { PostTypeCopy } from '../../../../lib/brief-copy';
import type { LibraryFeature } from '../../../../lib/library-api';
import type { BriefStep } from '../../../shared/briefs';
import { CTA_BOXES, LONGTEXT_BOX, LONGTEXT_TSTYLE } from '../canvas/layout';
import { matchFeature } from './matchFeature';
import { stripEditorSlide, type BusyId, type EditorSlide, type SheetId, type StepId } from './types';

export type Gap = { min: number; max: number };

export interface BriefEditorOptions {
  briefId: string;
  companyId: string;
  brief: WeekBrief | null;
  format: BriefMediaFormat;
  kind: Exclude<BriefKind, 'open'>;
  postType: PostTypeCopy | null;
  features: LibraryFeature[];
  onSaved: () => void;
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
  if (brief && brief.slides.length > 0) {
    return brief.slides.map((s, i) => ({ ...s, id: i }));
  }
  const cover: EditorSlide = { id: 0, role: 'cover', text: '', shot: '', inset_feature_id: null };
  if (lt) {
    cover.tstyle = LONGTEXT_TSTYLE;
    cover.box = LONGTEXT_BOX;
  }
  const cta: EditorSlide = { id: 1, role: 'cta', text: brief?.cta.text ?? '', shot: '', inset_feature_id: brief?.cta.featureId ?? null };
  if (story) cover.text = brief?.story?.theme ?? '';
  return [cover, cta];
}

function splitTags(caption: string): { caption: string; tags: string[] } {
  const parts = caption.split(' #');
  return { caption: parts[0] ?? '', tags: parts.slice(1).map((t) => t.replace(/^#/, '')) };
}

export function useBriefEditor(opts: BriefEditorOptions) {
  const { briefId, companyId, brief, format, kind, postType, features, onSaved } = opts;
  const reel = format === 'reel';
  const lt = reel && postType?.id === 'longtext';
  const story = kind === 'story';
  const tipsStory = story && postType?.id === 'tips';
  const STEPS = useMemo(() => stepsFor(story, lt, reel), [story, lt, reel]);

  const [slides, setSlides] = useState<EditorSlide[]>(() => seedSlides(brief, story, lt));
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
  const nextId = useRef(100);
  const ctaPos = useRef<number | null>(null);
  const introSeen = useRef(brief?.status === 'ready');

  const stepIdx = STEPS.findIndex((s) => s.id === step);
  const ctaIdx = slides.findIndex((s) => s.role === 'cta');
  const cur = slides[sel] ?? slides[0];
  const title = slides[0]?.text ?? '';
  const points = slides.filter((s) => s.role === 'point');
  const ctaOk = Boolean(slides[ctaIdx]?.text.trim());
  const pointsOk = points.length > 0 && points.every((p) => p.text.trim()) && (story || ctaOk);
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

  const setCount = useCallback(
    (n: number) => {
      if (ctaPos.current === null) ctaPos.current = 2 + Math.floor(Math.random() * 4);
      const pos = ctaPos.current;
      setSlides((arr) => {
        const cov = arr[0];
        const cta = arr.find((s) => s.role === 'cta');
        const m = cta && !story ? Math.max(1, n - 1) : n;
        const pts = arr.filter((s) => s.role === 'point').slice(0, m);
        while (pts.length < m) pts.push({ id: nextId.current++, role: 'point', text: '', shot: '', inset_feature_id: null });
        if (!cta) return [cov, ...pts];
        if (story) return [cov, ...pts, cta];
        const at = Math.min(pos, pts.length + 1) - 1;
        pts.splice(at, 0, cta);
        return [cov, ...pts];
      });
      setSel(1);
    },
    [story],
  );

  const go = useCallback(
    (id: string) => {
      const next = id as StepId;
      setStep(next);
      if (next === 'cover') setSel(0);
      if (next === 'cta') {
        setSel(ctaIdx);
        if (tipsStory && !count) setSheet('count');
        else if (!ctaOk) showIntro();
      }
      if (next === 'points') {
        if (points.length) setSel(1);
        else setSheet('count');
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

  const draftPayload = (): RegenDraftPayload => ({
    title,
    search_phrase: search || null,
    format: toBriefFormat(format),
    point_count: Math.max(1, points.length),
    target_words: reel ? 120 : 60,
    hook: reel ? slides[0]?.shot || null : title || null,
    hook_options: [],
    talking_points: slides
      .filter((s) => s.role !== 'cover')
      .map((s, i) => ({ id: `p${i}`, text: reel ? s.shot || s.text : s.text, is_product: s.role === 'cta', edited_by_admin: Boolean(s.text.trim()) })),
    cta: slides[ctaIdx]?.text || null,
    caption,
    hashtags: tags,
    why_it_works: '',
    script: null,
  });

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong');

  /** Fill the CTA from the matched feature, shaped to the post type. */
  const generateCta = useCallback(() => {
    const m = matchFeature(features, title, postType?.id, story || lt ? null : ctaIdx);
    if (!m) return;
    setBusy('cta');
    setTimeout(() => {
      patchAt(ctaIdx, lt ? { text: m.cta, inset_feature_id: null, genAt: Date.now() } : { text: m.cta, inset_feature_id: m.feature.id, ...ctaBoxes(), genAt: Date.now() });
      setBusy(null);
    }, 700);
  }, [features, title, postType?.id, story, lt, ctaIdx, patchAt]);

  const pickFeature = useCallback(
    (it: LibraryFeature) => {
      const m = matchFeature(features, title, postType?.id, story || lt ? null : ctaIdx, it.id);
      if (!m) return;
      setBusy('cta');
      setTimeout(() => {
        patchAt(ctaIdx, { text: m.cta, inset_feature_id: lt ? null : it.id, ...(lt ? {} : ctaBoxes()), genAt: Date.now() });
        setBusy(null);
      }, 500);
    },
    [features, title, postType?.id, story, lt, ctaIdx, patchAt],
  );

  const selfCta = useCallback(
    (it: LibraryFeature | null) => {
      if (it) patchAt(ctaIdx, { inset_feature_id: it.id });
      setSel(ctaIdx);
    },
    [ctaIdx, patchAt],
  );

  const writePoints = useCallback(async () => {
    setBusy('points');
    try {
      const res = await assistRegenerateField({ field: 'talking_points', draft: draftPayload(), postTypeKey: postType?.key });
      if (res.kind !== 'talking_points') return;
      const lines = res.talking_points.map((p) => p.text?.trim() ?? '').filter(Boolean);
      const ctaIt = matchFeature(features, title, postType?.id, ctaIdx);
      let k = 0;
      const hookSay = res.script?.split(/(?<=[.!?])\s+/)[0]?.trim() ?? '';
      setSlides((arr) =>
        arr.map((s) => {
          if (reel && s.role === 'cover' && !s.shot.trim() && hookSay) return { ...s, shot: hookSay, genAt: Date.now() };
          if (s.role === 'point' && !s.text.trim()) {
            const line = lines[k++ % Math.max(1, lines.length)] ?? '';
            return reel ? { ...s, text: line.split(/[.!?]/)[0] ?? line, shot: line, genAt: Date.now() } : { ...s, text: line, genAt: Date.now() };
          }
          if (s.role === 'cta' && !s.text.trim() && ctaIt) {
            return { ...s, text: res.cta ?? ctaIt.cta, inset_feature_id: ctaIt.feature.id, shot: reel ? 'Say it while the recording plays' : s.shot, ...ctaBoxes(), genAt: Date.now() };
          }
          return s;
        }),
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features, title, postType, ctaIdx, reel, slides, search, caption, tags]);

  const writeHook = useCallback(async () => {
    setBusy('hook');
    try {
      const res = await assistRegenerateField({ field: 'hook', draft: draftPayload(), postTypeKey: postType?.key });
      if (res.kind === 'hook' && res.hook_options[0]) patchAt(0, { shot: res.hook_options[0], genAt: Date.now() });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postType, patchAt, slides, search, caption, tags]);

  const fillDetails = useCallback(async () => {
    setBusy('details');
    try {
      const [cap, sp] = await Promise.all([
        assistRegenerateField({ field: 'caption', draft: draftPayload(), postTypeKey: postType?.key }),
        assistRegenerateField({ field: 'search_phrase', draft: draftPayload(), postTypeKey: postType?.key }),
      ]);
      if (cap.kind === 'caption') {
        const split = splitTags(cap.caption);
        setCaption(split.caption);
        setTags(cap.hashtags.length ? cap.hashtags.map((t) => t.replace(/^#/, '')) : split.tags);
      }
      if (sp.kind === 'search_phrase' && sp.search_phrase) setSearch(sp.search_phrase);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postType, slides, search, caption, tags]);

  /** Revise with AI: a chip or free text; the rest stays. */
  const revise = useCallback(
    async (feedback: string) => {
      setBusy('revise');
      try {
        const res = await assistRevise({ draft: draftPayload(), feedback, postTypeKey: postType?.key });
        if (res.kind === 'draft') {
          const lines = res.draft.talking_points.map((p) => p.text?.trim() ?? '');
          setSlides((arr) => {
            let k = 0;
            return arr.map((s) => {
              if (s.role === 'cover') return res.hook ? { ...s, ...(reel ? { shot: res.hook } : { text: res.hook }), genAt: Date.now() } : s;
              const line = lines[k++];
              if (!line) return s;
              return reel ? { ...s, text: line.split(/[.!?]/)[0] ?? line, shot: line, genAt: Date.now() } : { ...s, text: line, genAt: Date.now() };
            });
          });
          if (res.draft.caption) setCaption(res.draft.caption);
        } else if (res.kind === 'field') {
          const r = res.result;
          if (r.kind === 'hook' && r.hook_options[0]) patchAt(0, reel ? { shot: r.hook_options[0] } : { text: r.hook_options[0] });
          if (r.kind === 'caption') setCaption(r.caption);
          if (r.kind === 'search_phrase' && r.search_phrase) setSearch(r.search_phrase);
          if (r.kind === 'talking_point' && r.talking_point.text) {
            const at = slides.findIndex((s, i) => s.role !== 'cover' && i - 1 === r.index);
            if (at > 0) patchAt(at, reel ? { shot: r.talking_point.text } : { text: r.talking_point.text });
          }
        }
      } catch (e) {
        fail(e);
      } finally {
        setBusy(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [postType, reel, patchAt, slides, search, caption, tags],
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
        }
      : null,
    open: null,
    cta: { text: slides[ctaIdx]?.text ?? '', featureId: slides[ctaIdx]?.inset_feature_id ?? null },
    creatorNote: null,
  });

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const input = toInput();
      if (postType) input.postTypeId = await resolvePostTypeId(companyId, postType);
      await addBriefToWeek(briefId, input);
      onSaved();
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving, postType, companyId, briefId, onSaved, slides, caption, search, tags, count, gap]);

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
    setBoxFor,
    go,
    next,
    back,
    generateCta,
    pickFeature,
    selfCta,
    writePoints,
    writeHook,
    fillDetails,
    revise,
    save,
    reviewGap,
  };
}

export type BriefEditorState = ReturnType<typeof useBriefEditor>;

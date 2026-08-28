// Stepped post editor. Post type comes stamped from week setup but stays
// editable on the title step. Nothing generates on open — AI assist is on
// demand. Screenshots live on brief_segments keyed by talking_point_index.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CameraRollSheet } from '../../../components/admin/editor/CameraRollSheet';
import { CaptionStep } from '../../../components/admin/editor/CaptionStep';
import { CtaCard } from '../../../components/admin/editor/CtaCard';
import { HookOptionsField } from '../../../components/admin/editor/HookOptionsField';
import {
  OverlayEditor,
  type OverlayEditorMode,
  type OverlaySavePatch,
} from '../../../components/admin/editor/OverlayEditor';
import {
  DEFAULT_BOX_SIZE,
  DEFAULT_OVERLAY_FILL,
  DEFAULT_TEXT_Y,
  parseOverlayBoxes,
  serializeOverlayBoxes,
} from '../../../lib/overlay-boxes';
import { PointsEditor } from '../../../components/admin/editor/PointsEditor';
import { PortSheet, type PortOption } from '../../../components/admin/editor/PortSheet';
import {
  LibraryPickerSheet,
  type LibraryPick,
} from '../../../components/admin/LibraryPickerSheet';
import { SlideStage, type SlideInset } from '../../../components/SlideStage';
import { ReviewSheet } from '../../../components/admin/editor/ReviewSheet';
import { SearchPhraseCard } from '../../../components/admin/editor/SearchPhraseCard';
import { StepDots } from '../../../components/admin/editor/StepDots';
import { TitleCard } from '../../../components/admin/editor/TitleCard';
import { PushHeader, SectionLabel } from '../../../components/admin/shared';
import { Button } from '../../../components/ui/Button';
import { PressableScale } from '../../../components/ui/PressableScale';
import { useAuth } from '../../../lib/auth';
import {
  appendBannedPhrases,
  assistDeriveSegments,
  assistRegenerateField,
  confirmBriefReview,
  confirmSlideshowReview,
  briefRowState,
  getBrief,
  listApprovedClaimIds,
  listBriefSegments,
  listCampaignBriefs,
  listCampaigns,
  listNoniLibrary,
  listPostTypes,
  logBriefReviewEvents,
  parseHookOptions,
  parseTalkingPoints,
  reviewBrief,
  runClientTier1,
  signedScreenshotUrl,
  updateBrief,
  updateBriefSegment,
  uploadSegmentScreenshot,
  type BriefReviewEventInput,
  type BriefReviewResult,
  type BriefSegment,
  type CampaignBriefItem,
  type NoniLibraryGroup,
  type PostType,
  type PostTypeShape,
  type RegenDraftPayload,
  type RegenField,
  type TalkingPoint,
} from '../../../lib/briefs-api';
import { ensureSlot, fillPostSlot, type FillSource } from '../../../lib/post-fill';
import { supabase } from '../../../lib/supabase';
import { color, motion, radius, type } from '../../../theme/tokens';

const VIDEO_STEPS = [
  'title',
  'search',
  'hook',
  'cta',
  'points',
  'caption',
  'review',
] as const;
type EditorStep = (typeof VIDEO_STEPS)[number];

/** Slideshows skip the spoken-video steps: no hook, no CTA. Slides carry
 * their own text and screenshots and are read, not performed. */
const SLIDESHOW_STEPS: readonly EditorStep[] = [
  'title',
  'search',
  'points',
  'caption',
  'review',
];

const STEP_TITLES: Record<EditorStep, string> = {
  title: 'Title',
  search: 'Search phrase',
  hook: 'Hook',
  cta: 'CTA',
  points: 'Talking points',
  caption: 'Caption + hashtags',
  review: 'AI review',
};

/** The fields as they stood when review opened, for edit diffs and the ban list. */
type ReviewSnapshot = {
  hook: string;
  cta: string;
  caption: string;
  searchPhrase: string;
  points: Array<{ id: string; text: string | null; edited_by_admin: boolean }>;
};

/** What save must re-derive segments for: points, hook, or type changed. */
function deriveSnapshot(params: {
  hook: string | null;
  points: TalkingPoint[];
  postTypeId: string | null;
}): string {
  return JSON.stringify({
    hook: params.hook,
    points: params.points.map((p) => ({ id: p.id, text: p.text })),
    postTypeId: params.postTypeId,
  });
}

export default function PostEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<EditorStep>('title');
  /** Completed posts open as one read-only page; Edit flips it to inputs. */
  const [summaryMode, setSummaryMode] = useState<'view' | 'edit' | null>(null);
  /** reviewed_at from the row; null means the post never counted as complete. */
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);
  // Direction-aware step transition: Next slides in from the right,
  // Back from the left, with a fade. Driven by index delta so every
  // setStep caller gets it for free.
  const stepOpacity = useRef(new Animated.Value(1)).current;
  const stepShift = useRef(new Animated.Value(0)).current;
  const prevStepIndexRef = useRef(0);
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);
  const [postNumber, setPostNumber] = useState<number | null>(null);
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [postTypes, setPostTypes] = useState<PostType[]>([]);
  const [hashtagBank, setHashtagBank] = useState<string[]>([]);
  const [segments, setSegments] = useState<BriefSegment[]>([]);
  const [screenshotUrls, setScreenshotUrls] = useState<Record<string, string>>({});
  const [noniLibrary, setNoniLibrary] = useState<NoniLibraryGroup[]>([]);

  /* Company Brain shots load once so the picker opens instantly. */
  useEffect(() => {
    if (!profile?.company_id) return;
    void listNoniLibrary(profile.company_id)
      .then(setNoniLibrary)
      .catch(() => setNoniLibrary([]));
  }, [profile?.company_id]);

  const [title, setTitle] = useState('');
  const [postTypeId, setPostTypeId] = useState<string | null>(null);
  const [hookOptions, setHookOptions] = useState<string[]>([]);
  const [chosenHookIndex, setChosenHookIndex] = useState(0);
  const [useCustomHook, setUseCustomHook] = useState(false);
  const [customHook, setCustomHook] = useState('');
  const [points, setPoints] = useState<TalkingPoint[]>([]);
  const [cta, setCta] = useState('');
  const [searchPhrase, setSearchPhrase] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [whyItWorks, setWhyItWorks] = useState('');
  const [script, setScript] = useState<string | null>(null);
  const [targetWords, setTargetWords] = useState(380);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [exampleUrl, setExampleUrl] = useState<string | null>(null);
  const [killReason, setKillReason] = useState<string | null>(null);

  const [pendingOverlayLabels, setPendingOverlayLabels] = useState<
    (string | null)[] | null
  >(null);
  /** Set by a slideshow "Regenerate all": the next save pushes the fresh
   * slide copy into the segments' text boxes, replacing what was there. */
  const slideRegenPending = useRef(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [baseline, setBaseline] = useState('');

  const [approvedClaimIds, setApprovedClaimIds] = useState<string[]>([]);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [reviewRunning, setReviewRunning] = useState(false);
  const [reviewConfirming, setReviewConfirming] = useState(false);
  const [reviewResult, setReviewResult] = useState<BriefReviewResult | null>(null);
  const [appliedIndexes, setAppliedIndexes] = useState<ReadonlySet<number>>(new Set());
  const [appliedPointIds, setAppliedPointIds] = useState<ReadonlySet<string>>(new Set());
  const [reviewSnapshot, setReviewSnapshot] = useState<ReviewSnapshot | null>(null);

  const [regenBusy, setRegenBusy] = useState<RegenField | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  /** True while a talking point card drags, so the page scroll pauses. */
  const [pointsDragging, setPointsDragging] = useState(false);
  const [shotBusyIndex, setShotBusyIndex] = useState<number | null>(null);
  /** Which point the camera roll sheet is picking for; null means closed. */
  const [shotPickerIndex, setShotPickerIndex] = useState<number | null>(null);
  const [overlayIndex, setOverlayIndex] = useState<number | null>(null);
  const [overlayMode, setOverlayMode] = useState<OverlayEditorMode>('text');
  const [overlaySaving, setOverlaySaving] = useState(false);
  /** The brand account shown on the merged caption preview. */
  const [accountName, setAccountName] = useState('');

  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [weekPosts, setWeekPosts] = useState<CampaignBriefItem[]>([]);
  /** target: pick the format to port this post into. source: pick the post
   * this empty slot is built from. */
  const [portSheet, setPortSheet] = useState<'target' | 'source' | null>(null);
  const [portBusyId, setPortBusyId] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [filling, setFilling] = useState(false);
  /** Bumped after a fill so the screen re-reads the row it just wrote. */
  const [reloadNonce, setReloadNonce] = useState(0);

  const currentType = useMemo(
    () => postTypes.find((t) => t.id === postTypeId) ?? null,
    [postTypes, postTypeId],
  );
  const family: 'video' | 'photo_carousel' =
    currentType?.family === 'photo_carousel' ? 'photo_carousel' : 'video';
  const steps: readonly EditorStep[] =
    family === 'photo_carousel' ? SLIDESHOW_STEPS : VIDEO_STEPS;

  useEffect(() => {
    const idx = steps.indexOf(step);
    const delta = idx - prevStepIndexRef.current;
    prevStepIndexRef.current = idx;
    if (delta === 0) return;
    stepOpacity.setValue(0);
    stepShift.setValue(delta > 0 ? 28 : -28);
    Animated.parallel([
      Animated.timing(stepOpacity, {
        toValue: 1,
        duration: motion.base,
        easing: motion.easeOut,
        useNativeDriver: true,
      }),
      Animated.timing(stepShift, {
        toValue: 0,
        duration: motion.base,
        easing: motion.easeOut,
        useNativeDriver: true,
      }),
    ]).start();
  }, [step, steps, stepOpacity, stepShift]);

  const refreshScreenshotUrls = useCallback((rows: BriefSegment[]) => {
    for (const row of rows) {
      if (!row.screenshot_url) continue;
      void signedScreenshotUrl(row.screenshot_url)
        .then((url) =>
          setScreenshotUrls((prev) => ({ ...prev, [row.id]: url })),
        )
        .catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        const [
          brief,
          types,
          segs,
          { data: brand },
          claimIds,
          { data: link },
          { data: company },
        ] = await Promise.all([
          getBrief(id),
          listPostTypes(),
          listBriefSegments(id),
          supabase.from('brand_profiles').select('hashtag_bank').maybeSingle(),
          listApprovedClaimIds(),
          supabase
            .from('campaign_briefs')
            .select('position, campaign_id')
            .eq('brief_id', id)
            .maybeSingle(),
          supabase.from('companies').select('slug, name').maybeSingle(),
        ]);
        if (!brief) {
          setMissing(true);
          return;
        }
        setPostTypes(types);
        setSegments(segs);
        refreshScreenshotUrls(segs);
        setHashtagBank(brand?.hashtag_bank ?? []);
        setApprovedClaimIds(claimIds);
        // No posting-account handle lives in the data; the slug is the
        // closest stable stand-in for the merged preview.
        setAccountName(company?.slug ?? company?.name ?? '');

        const options = parseHookOptions(brief.hook_options);
        const chosen = brief.hook ? options.indexOf(brief.hook) : 0;
        const briefPoints = parseTalkingPoints(brief.talking_points);
        setTitle(brief.title);
        setPostTypeId(brief.post_type_id);
        setHookOptions(options);
        if (brief.hook && chosen < 0) {
          setUseCustomHook(true);
          setCustomHook(brief.hook);
          setChosenHookIndex(0);
        } else {
          setUseCustomHook(false);
          setCustomHook('');
          setChosenHookIndex(chosen >= 0 ? chosen : 0);
        }
        setPoints(briefPoints);
        setCta(brief.cta ?? '');
        setSearchPhrase(brief.search_phrase ?? '');
        setCaption(brief.caption ?? '');
        setHashtags(brief.hashtags);
        setWhyItWorks(brief.why_it_works ?? '');
        setScript(brief.script);
        setTargetWords(brief.target_words);
        setGenerationId(brief.generation_id);
        setExampleUrl(brief.example_url);
        setKillReason(brief.kill_reason);
        setReviewedAt(brief.reviewed_at);
        setBaseline(
          deriveSnapshot({
            hook: brief.hook,
            points: briefPoints,
            postTypeId: brief.post_type_id,
          }),
        );

        // Header meta: "Post 04" from the row's position in the week,
        // "Week 14" from the campaign's chronological number.
        if (link) {
          if (typeof link.position === 'number') setPostNumber(link.position + 1);
          setCampaignId(link.campaign_id);
          void listCampaignBriefs(link.campaign_id)
            .then(setWeekPosts)
            .catch(() => undefined);
          void listCampaigns()
            .then((all) => {
              const idx = all.findIndex((c) => c.id === link.campaign_id);
              if (idx >= 0) setWeekNumber(all.length - idx);
            })
            .catch(() => undefined);
        }

        // A finished post opens as one read-only page instead of a step.
        // Slideshows never require a hook or CTA.
        const rowType = types.find((t) => t.id === brief.post_type_id) ?? null;
        const isSlideshow = rowType?.family === 'photo_carousel';
        const complete =
          (isSlideshow || Boolean(brief.hook?.trim())) &&
          briefPoints.length >= (rowType?.min_points ?? 1) &&
          Boolean(brief.caption?.trim());
        if (complete) setSummaryMode('view');

        // Entering the editor opens the first incomplete step, or step 1
        // on an untouched row. Never lands on review — that would either
        // generate on open (rule 1) or show an empty screen.
        const untouched =
          !brief.hook?.trim() &&
          briefPoints.length === 0 &&
          !brief.cta?.trim() &&
          !brief.caption?.trim() &&
          brief.hashtags.length === 0;
        setStep(
          untouched
            ? 'title'
            : !brief.search_phrase?.trim()
              ? 'search'
              : !isSlideshow && !brief.hook?.trim()
                ? 'hook'
                : !isSlideshow &&
                    (rowType?.requires_plug ?? true) &&
                    !brief.cta?.trim()
                  ? 'cta'
                  : briefPoints.length < (rowType?.min_points ?? 1)
                    ? 'points'
                    : 'caption',
        );
      } catch (e) {
        Alert.alert(
          'Could not load',
          e instanceof Error ? e.message : 'Try again',
        );
      } finally {
        setLoaded(true);
      }
    })();
  }, [id, refreshScreenshotUrls, reloadNonce]);

  // Auto-draft the caption: landing on the caption step with nothing
  // written generates caption and hashtags from the post, once per open.
  const autoCaptionRan = useRef(false);
  useEffect(() => {
    if (step !== 'caption' || summaryMode !== null) return;
    if (autoCaptionRan.current || caption.trim() || regenBusy !== null) return;
    autoCaptionRan.current = true;
    void regenerate('caption');
    // Fires on step entry only; regenerate reads the draft fields fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, summaryMode]);

  function buildRegenPayload(): RegenDraftPayload {
    return {
      title,
      search_phrase: searchPhrase.trim() || null,
      format: currentType?.family === 'photo_carousel' ? 'photo_carousel' : 'video',
      point_count: points.length,
      target_words: targetWords,
      hook_options: hookOptions,
      talking_points: points,
      cta: cta.trim() || null,
      caption,
      hashtags,
      why_it_works: whyItWorks,
      script,
    };
  }

  async function regenerate(field: RegenField, index?: number) {
    setRegenBusy(field);
    try {
      const result = await assistRegenerateField({
        field,
        draft: buildRegenPayload(),
        postTypeKey: currentType?.key,
        index,
      });
      if (result.kind === 'kill') {
        Alert.alert('Generation refused', result.kill_reason);
        return;
      }
      setWarnings(result.warnings);
      switch (result.kind) {
        case 'search_phrase':
          if (result.search_phrase) setSearchPhrase(result.search_phrase);
          break;
        case 'talking_points':
          setPoints(result.talking_points);
          setCta(result.cta ?? '');
          if (result.script !== null) setScript(result.script);
          if (result.target_words !== null) setTargetWords(result.target_words);
          setPendingOverlayLabels(result.overlay_labels);
          if (family === 'photo_carousel') slideRegenPending.current = true;
          break;
        case 'talking_point': {
          setPoints((prev) =>
            prev.map((p, i) => (i === result.index ? result.talking_point : p)),
          );
          setPendingOverlayLabels((prev) => {
            const next = prev ? [...prev] : points.map(() => null);
            next[result.index] = result.overlay_label;
            return next;
          });
          break;
        }
        case 'hook':
          setHookOptions(result.hook_options);
          setChosenHookIndex(0);
          break;
        case 'caption':
          setCaption(result.caption);
          setHashtags(result.hashtags);
          break;
      }
    } catch (e) {
      Alert.alert(
        'Could not regenerate',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setRegenBusy(null);
    }
  }

  function resolvedHook(): string | null {
    if (useCustomHook) return customHook.trim() || null;
    return hookOptions[chosenHookIndex]?.trim() || null;
  }

  function mergedCaption(): string {
    const body = caption.replace(/#\w+/g, ' ').replace(/\s+/g, ' ').trim();
    const tags = hashtags
      .map((t) => (t.startsWith('#') ? t : `#${t}`))
      .join(' ');
    return [body, tags].filter(Boolean).join('\n\n');
  }

  function segmentForPointIndex(index: number): BriefSegment | undefined {
    return segments.find(
      (s) =>
        (s.kind === 'point' || s.kind === 'slide') &&
        s.talking_point_index === index,
    );
  }

  /** Overlay slots: -1 is the hook clip, 0+ are talking points. */
  function segmentForOverlayIndex(index: number): BriefSegment | undefined {
    if (index === -1) return segments.find((s) => s.kind === 'hook');
    return segmentForPointIndex(index);
  }

  /** The admin's inset picture on a slide, for slide previews. */
  function insetForPointIndex(index: number): SlideInset | undefined {
    const seg = segmentForPointIndex(index);
    if (!seg?.screenshot_url) return undefined;
    const uri = screenshotUrls[seg.id];
    if (uri === undefined) return undefined;
    return {
      uri,
      x: seg.screenshot_x,
      y: seg.screenshot_y,
      width: seg.screenshot_width,
    };
  }

  /** Boxes on a slide's segment, for slide previews. */
  function boxesForPointIndex(index: number) {
    const seg = segmentForPointIndex(index);
    return parseOverlayBoxes(seg?.overlay_style, {
      text: seg?.overlay_text,
      textY: seg?.text_y,
    });
  }

  async function save(): Promise<boolean> {
    if (!id) return false;
    setSaving(true);
    try {
      const chosenHook = resolvedHook();
      const optionsToStore = useCustomHook
        ? [...hookOptions.filter((h) => h.trim()), customHook.trim()].filter(
            Boolean,
          )
        : hookOptions;
      await updateBrief(id, {
        title: title.trim() || searchPhrase.trim() || 'Untitled post',
        format:
          currentType?.family === 'photo_carousel' ? 'photo_carousel' : 'video',
        hook: chosenHook,
        hook_options: optionsToStore,
        talking_points: points,
        hashtags,
        search_phrase: searchPhrase.trim() || null,
        point_count: points.length,
        target_words: targetWords,
        script,
        caption: mergedCaption() || null,
        why_it_works: whyItWorks || null,
        cta: cta.trim() || null,
        post_type_id: postTypeId,
        kill_reason: killReason,
        generation_id: generationId,
        example_url: exampleUrl,
      });
      const snapshot = deriveSnapshot({ hook: chosenHook, points, postTypeId });
      const deriveNeeded =
        postTypeId !== null &&
        (points.length > 0 || chosenHook !== null) &&
        (snapshot !== baseline || segments.length === 0);
      if (deriveNeeded) {
        let rows = await assistDeriveSegments(
          id,
          pendingOverlayLabels ?? undefined,
        );
        // Regenerated slide copy replaces each surviving slide's text boxes;
        // derivation alone only seeds brand-new segments.
        if (
          slideRegenPending.current &&
          currentType?.family === 'photo_carousel'
        ) {
          slideRegenPending.current = false;
          rows = await Promise.all(
            rows.map(async (row) => {
              if (row.kind !== 'slide' || row.talking_point_index === null) {
                return row;
              }
              const text = points[row.talking_point_index]?.text?.trim() ?? '';
              const patch = serializeOverlayBoxes(
                text
                  ? [
                      {
                        id: `slide-${row.talking_point_index}-box-0`,
                        text,
                        color: DEFAULT_OVERLAY_FILL,
                        bg: true,
                        size: DEFAULT_BOX_SIZE,
                        x: 0.5,
                        y: DEFAULT_TEXT_Y,
                      },
                    ]
                  : [],
              );
              await updateBriefSegment(row.id, patch);
              return { ...row, ...patch } as BriefSegment;
            }),
          );
        }
        setSegments(rows);
        refreshScreenshotUrls(rows);
        setPendingOverlayLabels(null);
      }
      setBaseline(snapshot);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
      return true;
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Try again');
      return false;
    } finally {
      setSaving(false);
    }
  }

  // --- Format port and library fills. A port always writes a different,
  // empty slot: the post you are looking at is never overwritten. ----------

  const otherFamily: 'video' | 'photo_carousel' =
    family === 'photo_carousel' ? 'video' : 'photo_carousel';

  /** Ports this finished post into the other format as a new post. */
  async function portToFormat(targetTypeId: string) {
    const target = postTypes.find((t) => t.id === targetTypeId);
    if (!profile || !id || !target) return;
    const targetFamily =
      target.family === 'photo_carousel' ? 'photo_carousel' : 'video';
    setPortBusyId(targetTypeId);
    try {
      const slotId = await ensureSlot({
        companyId: profile.company_id,
        createdBy: profile.id,
        campaignId,
        family: targetFamily,
        postTypeId: target.id,
      });
      const result = await fillPostSlot({
        briefId: slotId,
        postTypeId: target.id,
        postTypeKey: target.key,
        family: targetFamily,
        source: { kind: 'port', sourceBriefId: id },
      });
      if (result.kind === 'kill') {
        Alert.alert('Generation refused', result.kill_reason);
        return;
      }
      setPortSheet(null);
      router.push(`/(admin)/post/${slotId}`);
    } catch (e) {
      Alert.alert(
        'Could not make that version',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setPortBusyId(null);
    }
  }

  /** Fills this empty slot: from a finished post, a reference, or an idea. */
  async function fillThisSlot(source: FillSource, busyKey: string) {
    if (!id || !currentType) return;
    setPortBusyId(busyKey);
    setFilling(true);
    try {
      const result = await fillPostSlot({
        briefId: id,
        postTypeId: currentType.id,
        postTypeKey: currentType.key,
        family,
        source,
      });
      if (result.kind === 'kill') {
        Alert.alert('Generation refused', result.kill_reason);
        return;
      }
      setPortSheet(null);
      setLibraryOpen(false);
      setReloadNonce((n) => n + 1);
    } catch (e) {
      Alert.alert(
        'Could not fill this post',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setPortBusyId(null);
      setFilling(false);
    }
  }

  function onLibraryPick(pick: LibraryPick) {
    if (pick.kind === 'port') {
      void fillThisSlot({ kind: 'port', sourceBriefId: pick.briefId }, pick.briefId);
      return;
    }
    if (pick.kind === 'example') {
      void fillThisSlot({ kind: 'example', url: pick.url }, pick.url);
      return;
    }
    void fillThisSlot({ kind: 'idea', text: pick.text }, pick.text);
  }

  /** Finished posts in this week on the other side, as port sources. */
  const portSourceOptions: PortOption[] = weekPosts
    .filter((item) => {
      const type = item.briefs.post_types;
      const itemFamily = type?.family ?? item.briefs.format;
      const state = briefRowState(item.briefs, type);
      return (
        item.brief_id !== id &&
        itemFamily === otherFamily &&
        (state === 'filled' || state === 'complete')
      );
    })
    .map((item) => ({
      id: item.brief_id,
      label: item.briefs.title || 'Untitled post',
      sub: item.briefs.post_types?.label ?? undefined,
    }));

  const portTargetOptions: PortOption[] = postTypes
    .filter((t) => t.family === otherFamily)
    .map((t) => ({
      id: t.id,
      label: t.label,
      sub: `${t.min_points} to ${t.max_points} ${otherFamily === 'photo_carousel' ? 'slides' : 'points'}`,
    }));

  // --- AI review. A step, not a background check: on demand, never blocks,
  // never edits anything without an explicit Apply. -------------------------

  function takeReviewSnapshot(): ReviewSnapshot {
    return {
      hook: resolvedHook() ?? '',
      cta,
      caption: mergedCaption(),
      searchPhrase,
      points: points.map((p) => ({
        id: p.id,
        text: p.text,
        edited_by_admin: p.edited_by_admin,
      })),
    };
  }

  async function runReview() {
    setReviewResult(null);
    setAppliedIndexes(new Set());
    setAppliedPointIds(new Set());
    setReviewSnapshot(takeReviewSnapshot());
    setReviewVisible(true);
    setReviewRunning(true);
    try {
      const result = await reviewBrief({
        draft: {
          ...buildRegenPayload(),
          caption: mergedCaption(),
          hook_options: useCustomHook
            ? [customHook.trim(), ...hookOptions].filter(Boolean)
            : hookOptions,
        },
        postTypeKey: currentType?.key,
        hookIndex: useCustomHook ? 0 : chosenHookIndex,
      });
      setReviewResult(result);
    } catch (e) {
      setReviewVisible(false);
      Alert.alert(
        'Review failed',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setReviewRunning(false);
    }
  }

  function applySuggestion(checkIndex: number) {
    const suggestion = reviewResult?.checks[checkIndex]?.suggestion;
    if (!suggestion) return;
    const replacement = suggestion.replacement;
    switch (suggestion.field) {
      case 'hook':
        if (useCustomHook) {
          setCustomHook(replacement);
        } else {
          setHookOptions((prev) =>
            prev.map((h, i) => (i === chosenHookIndex ? replacement : h)),
          );
        }
        break;
      case 'talking_point': {
        const index = suggestion.index ?? -1;
        const target = points[index];
        if (!target) return;
        setPoints((prev) =>
          prev.map((p, i) => (i === index ? { ...p, text: replacement } : p)),
        );
        // Applied swaps are the model correcting itself, not her rewrite;
        // they never feed banned_phrases.
        setAppliedPointIds((prev) => new Set([...prev, target.id]));
        break;
      }
      case 'cta':
        setCta(replacement);
        break;
      case 'caption':
        setCaption(replacement);
        break;
      case 'search_phrase':
        setSearchPhrase(replacement);
        break;
    }
    setAppliedIndexes((prev) => new Set([...prev, checkIndex]));
  }

  function toPostTypeShape(row: PostType | null): PostTypeShape | null {
    if (!row) return null;
    return {
      key: row.key,
      family: row.family === 'photo_carousel' ? 'photo_carousel' : 'video',
      min_points: row.min_points,
      max_points: row.max_points,
      requires_plug: row.requires_plug,
      target_words_min: row.target_words_min,
      target_words_max: row.target_words_max,
    };
  }

  async function confirmReview() {
    if (!id || !profile || !reviewResult || !reviewSnapshot) return;
    setReviewConfirming(true);
    try {
      const base = {
        brief_id: id,
        company_id: profile.company_id,
        author_id: profile.id,
      };
      const events: BriefReviewEventInput[] = [];

      // Edit diffs: what changed between opening review and confirming.
      const snapshot = reviewSnapshot;
      const hookNow = resolvedHook() ?? '';
      const captionNow = mergedCaption();
      const fieldDiffs: Array<{ field: string; before: string | null; after: string | null }> = [];
      if (snapshot.hook !== hookNow) {
        fieldDiffs.push({ field: 'hook', before: snapshot.hook || null, after: hookNow || null });
      }
      if (snapshot.cta !== cta) {
        fieldDiffs.push({ field: 'cta', before: snapshot.cta || null, after: cta || null });
      }
      if (snapshot.caption !== captionNow) {
        fieldDiffs.push({
          field: 'caption',
          before: snapshot.caption || null,
          after: captionNow || null,
        });
      }
      if (snapshot.searchPhrase !== searchPhrase) {
        fieldDiffs.push({
          field: 'search_phrase',
          before: snapshot.searchPhrase || null,
          after: searchPhrase || null,
        });
      }
      const bannedPhrases: string[] = [];
      for (const before of snapshot.points) {
        const now = points.find((p) => p.id === before.id);
        if (!now || (now.text ?? '') === (before.text ?? '')) continue;
        fieldDiffs.push({
          field: `talking_point:${before.id}`,
          before: before.text,
          after: now.text,
        });
        // Her rewrite of a generated line bans the removed phrase. Lines she
        // had already hand-edited, and applied suggestions, do not count.
        if (before.text && !before.edited_by_admin && !appliedPointIds.has(before.id)) {
          bannedPhrases.push(before.text);
        }
      }
      for (const diff of fieldDiffs) {
        events.push({ ...base, event: 'edit', diff });
      }

      // Overrides: Tier 1 re-runs against the post as it stands now, so a
      // fixed check is not logged as overridden. Tier 2/3 come from the
      // review response; applied suggestions are not overrides.
      const tier1Now = runClientTier1(buildRegenPayload(), {
        hashtagBank,
        approvedClaimIds,
        postType: toPostTypeShape(currentType),
      });
      for (const check of tier1Now) {
        events.push({ ...base, event: 'override', check_id: check.check_id, tier: 1 });
      }
      reviewResult.checks.forEach((check, index) => {
        if (check.tier !== 1 && !appliedIndexes.has(index)) {
          events.push({ ...base, event: 'override', check_id: check.check_id, tier: check.tier });
        }
      });
      events.push({ ...base, event: 'confirm' });

      const saved = await save();
      if (!saved) return;
      await confirmBriefReview(id, reviewResult);
      await logBriefReviewEvents(events);
      await appendBannedPhrases(profile.company_id, bannedPhrases);
      setReviewVisible(false);
      router.back();
    } catch (e) {
      Alert.alert(
        'Could not confirm',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setReviewConfirming(false);
    }
  }

  async function ensureSegmentsDerived(): Promise<BriefSegment[]> {
    const ok = await save();
    if (!ok || !id) return [];
    if (segments.length > 0) return segments;
    if (!postTypeId) return [];
    try {
      const rows = await assistDeriveSegments(id);
      setSegments(rows);
      refreshScreenshotUrls(rows);
      return rows;
    } catch {
      return [];
    }
  }

  async function attachScreenshotToPoint(pointIndex: number) {
    if (!profile || !id) return;
    const rows = await ensureSegmentsDerived();
    if (rows.length === 0) {
      Alert.alert('Save first', 'Could not prepare clips for screenshots.');
      return;
    }
    setShotPickerIndex(pointIndex);
  }

  /** Camera roll pick lands here: upload against the point's segment. */
  async function uploadShotForPoint(pointIndex: number, localUri: string) {
    if (!profile || !id) return;
    const segment =
      segmentForPointIndex(pointIndex) ??
      segments.find((s) => s.kind === 'hook') ??
      segments[0];
    if (!segment) {
      Alert.alert('No clip yet', 'Save the post so clips exist, then attach.');
      return;
    }
    setShotBusyIndex(pointIndex);
    try {
      const path = await uploadSegmentScreenshot({
        companyId: profile.company_id,
        briefId: id,
        segmentId: segment.id,
        localUri,
      });
      await updateBriefSegment(segment.id, { screenshot_url: path });
      setSegments((prev) =>
        prev.map((s) => (s.id === segment.id ? { ...s, screenshot_url: path } : s)),
      );
      const url = await signedScreenshotUrl(path);
      setScreenshotUrls((prev) => ({ ...prev, [segment.id]: url }));
      // Straight into placement: the composer opens on the fresh screenshot.
      setOverlayMode('media');
      setOverlayIndex(pointIndex);
    } catch (e) {
      Alert.alert(
        'Could not attach',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setShotBusyIndex(null);
    }
  }

  async function removeScreenshotFromPoint(pointIndex: number) {
    const segment = segmentForPointIndex(pointIndex);
    if (!segment?.screenshot_url) return;
    setShotBusyIndex(pointIndex);
    try {
      await updateBriefSegment(segment.id, { screenshot_url: null });
      setSegments((prev) =>
        prev.map((s) =>
          s.id === segment.id ? { ...s, screenshot_url: null } : s,
        ),
      );
    } catch (e) {
      Alert.alert(
        'Could not remove',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setShotBusyIndex(null);
    }
  }

  async function openOverlay(pointIndex: number, mode: OverlayEditorMode) {
    const rows = await ensureSegmentsDerived();
    if (rows.length === 0) {
      Alert.alert('Save first', 'Could not prepare this point.');
      return;
    }
    setOverlayMode(mode);
    setOverlayIndex(pointIndex);
  }

  async function saveOverlay(patch: OverlaySavePatch) {
    const pointIndex = overlayIndex;
    if (pointIndex === null) return;
    const segment = segmentForOverlayIndex(pointIndex);
    if (!segment) {
      Alert.alert('No clip yet', 'Save the post so clips exist, then add text.');
      throw new Error('No clip yet');
    }
    setOverlaySaving(true);
    try {
      await updateBriefSegment(segment.id, patch);
      setSegments((prev) =>
        prev.map((s) => (s.id === segment.id ? { ...s, ...patch } : s)),
      );
      // A slide's text lives in its boxes; mirror it into the carrier point
      // so row states, creator screens and search keep reading real copy.
      if (
        family === 'photo_carousel' &&
        segment.talking_point_index !== null &&
        patch.overlay_style !== undefined
      ) {
        const slideIndex = segment.talking_point_index;
        const joined = parseOverlayBoxes(patch.overlay_style, {
          text: patch.overlay_text,
          textY: patch.text_y,
        })
          .map((b) => b.text.trim())
          .filter(Boolean)
          .join('\n');
        setPoints((prev) =>
          prev.map((p, i) =>
            i === slideIndex
              ? { ...p, text: joined || null, edited_by_admin: true }
              : p,
          ),
        );
      }
    } catch (e) {
      Alert.alert(
        'Could not save overlay',
        e instanceof Error ? e.message : 'Try again',
      );
      throw e;
    } finally {
      setOverlaySaving(false);
    }
  }

  function toggleHashtag(tag: string) {
    setHashtags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= 5) return prev;
      return [...prev, tag];
    });
  }

  function addHashtag(tag: string) {
    setHashtags((prev) => {
      if (prev.includes(tag) || prev.length >= 5) return prev;
      return [...prev, tag];
    });
  }

  function stepIndex(s: EditorStep): number {
    return steps.indexOf(s);
  }

  async function goNext() {
    const idx = stepIndex(step);
    if (step === 'cta' && cta.trim() && points.length > 0 && !points.some((p) => p.is_product)) {
      setPoints((prev) =>
        prev.map((p, i) => ({ ...p, is_product: i === 0 })),
      );
    }
    if (step === 'points') {
      await ensureSegmentsDerived();
    }
    if (step === 'caption') {
      await save();
      setStep('review');
      // Slideshows have no spoken script to review; the last step is a
      // visual preview of the slides put together.
      if (family !== 'photo_carousel') void runReview();
      return;
    }
    if (idx < steps.length - 1) {
      const next = steps[idx + 1];
      if (next) setStep(next);
    }
  }

  function goBack() {
    if (summaryMode === 'edit') {
      setSummaryMode('view');
      return;
    }
    if (summaryMode === 'view') {
      router.back();
      return;
    }
    const idx = stepIndex(step);
    if (idx <= 0) {
      router.back();
      return;
    }
    if (step === 'review') setReviewVisible(false);
    const prev = steps[idx - 1];
    if (prev) setStep(prev);
  }

  /** Slideshow finish: the admin approved the visual preview. */
  async function confirmSlideshow() {
    if (!id) return;
    setReviewConfirming(true);
    try {
      const ok = await save();
      if (!ok) return;
      await confirmSlideshowReview(id);
      router.back();
    } catch (e) {
      Alert.alert(
        'Could not save',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setReviewConfirming(false);
    }
  }

  /** Summary Edit → Save: persist and drop back to the read-only page. */
  async function saveSummaryEdits() {
    const ok = await save();
    if (ok) setSummaryMode('view');
  }

  /** Header action: save through the normal path and exit, row stays partial. */
  async function saveProgress() {
    const ok = await save();
    if (ok) router.back();
  }

  if (!loaded) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.centerText}>Loading post…</Text>
      </View>
    );
  }
  if (missing) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.centerText}>Post not found.</Text>
      </View>
    );
  }

  // The generation API returns one phrase, no alternates; the "Also
  // searched" section renders only when some exist.
  const alsoSearched: string[] = [];
  const bankTags = [...new Set([...hashtagBank, ...hashtags])];
  const currentStepIndex = stepIndex(step);
  const typeLabel = currentType?.label ?? 'Post';

  const overlaySegment =
    overlayIndex !== null
      ? (segmentForOverlayIndex(overlayIndex) ?? null)
      : null;

  const hookSegment = segments.find((s) => s.kind === 'hook') ?? null;
  const hookOverlayBoxes = parseOverlayBoxes(hookSegment?.overlay_style, {
    text: hookSegment?.overlay_text,
    textY: hookSegment?.text_y,
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.shellTop}>
        <PushHeader
          title={
            postNumber !== null
              ? `Post ${String(postNumber).padStart(2, '0')}`
              : 'Post'
          }
          subtitle={
            weekNumber !== null ? `${typeLabel} · Week ${weekNumber}` : typeLabel
          }
          onBack={goBack}
          trailing={
            summaryMode === 'view' ? (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Edit this post"
                onPress={() => setSummaryMode('edit')}
              >
                <Text style={styles.saveProgress}>Edit</Text>
              </PressableScale>
            ) : summaryMode === 'edit' ? (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Save changes"
                disabled={saving}
                onPress={() => void saveSummaryEdits()}
              >
                <Text style={styles.saveProgress}>
                  {saving ? 'Saving…' : 'Save'}
                </Text>
              </PressableScale>
            ) : (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Save progress"
                disabled={saving}
                onPress={() => void saveProgress()}
              >
                <Text style={styles.saveProgress}>
                  {saving ? 'Saving…' : savedFlash ? 'Saved' : 'Save progress'}
                </Text>
              </PressableScale>
            )
          }
        />
        {summaryMode === null ? (
          <StepDots current={currentStepIndex} total={steps.length} />
        ) : null}
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEnabled={!pointsDragging}
      >
        {summaryMode === 'view' ? (
          <View style={styles.summaryStack}>
            {title.trim() ? (
              <View style={styles.summaryCard}>
                <SectionLabel>Title</SectionLabel>
                <Text style={styles.summaryTitle}>{title.trim()}</Text>
              </View>
            ) : null}
            {searchPhrase.trim() ? (
              <View style={styles.summaryCard}>
                <SectionLabel>Search phrase</SectionLabel>
                <Text style={styles.summaryText}>{searchPhrase.trim()}</Text>
              </View>
            ) : null}
            {family !== 'photo_carousel' && resolvedHook() ? (
              <View style={styles.summaryCard}>
                <SectionLabel>Hook</SectionLabel>
                <Text style={styles.summaryText}>{resolvedHook()}</Text>
              </View>
            ) : null}
            <View style={styles.summaryCard}>
              <SectionLabel>
                {family === 'photo_carousel' ? 'Slides' : 'Talking points'}
              </SectionLabel>
              {family === 'photo_carousel' ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.previewRow}
                >
                  {points.map((point, i) => (
                    <SlideStage
                      key={point.id}
                      boxes={boxesForPointIndex(i)}
                      inset={insetForPointIndex(i)}
                      placeholder="Creator's photo"
                      style={styles.previewSlide}
                    />
                  ))}
                </ScrollView>
              ) : (
              points.map((point, i) => {
                const seg = segmentForPointIndex(i);
                const thumb = seg?.screenshot_url
                  ? screenshotUrls[seg.id]
                  : undefined;
                return (
                  <View key={point.id} style={styles.summaryPoint}>
                    <Text style={styles.summaryPointNum}>{i + 1}</Text>
                    <View style={styles.summaryPointBody}>
                      <Text style={styles.summaryText}>{point.text ?? ''}</Text>
                      {point.is_product && cta.trim() ? (
                        <Text style={styles.summaryPlug}>{cta.trim()}</Text>
                      ) : null}
                      {thumb !== undefined ? (
                        <Image
                          source={{ uri: thumb }}
                          style={styles.summaryThumb}
                        />
                      ) : null}
                    </View>
                  </View>
                );
              })
              )}
            </View>
            {mergedCaption() ? (
              <View style={styles.summaryCard}>
                <SectionLabel>Caption</SectionLabel>
                <Text style={styles.summaryText}>{mergedCaption()}</Text>
              </View>
            ) : null}
            <View style={styles.summaryCard}>
              <SectionLabel>
                {otherFamily === 'photo_carousel'
                  ? 'Slideshow version'
                  : 'Video version'}
              </SectionLabel>
              <Text style={styles.summaryHint}>
                {otherFamily === 'photo_carousel'
                  ? 'Same idea, rewritten as slides in a new post. This one stays as it is.'
                  : 'Same idea, rewritten as a spoken video in a new post. This one stays as it is.'}
              </Text>
              <Button
                size="md"
                variant="outline"
                block
                disabled={portBusyId !== null}
                onPress={() => setPortSheet('target')}
              >
                {otherFamily === 'photo_carousel'
                  ? 'Make a slideshow version'
                  : 'Make a video version'}
              </Button>
            </View>
          </View>
        ) : summaryMode === 'edit' ? (
          <View style={styles.summaryStack}>
            <SectionLabel>Title</SectionLabel>
            <TitleCard value={title} onChange={setTitle} />
            <SectionLabel>Search phrase</SectionLabel>
            <SearchPhraseCard
              value={searchPhrase}
              onChange={setSearchPhrase}
              busy={regenBusy === 'search_phrase'}
              onRegenerate={() => void regenerate('search_phrase')}
              alternates={alsoSearched}
              onPickAlternate={setSearchPhrase}
            />
            <SectionLabel>
              {family === 'photo_carousel' ? 'Slides' : 'Script'}
            </SectionLabel>
            <PointsEditor
              points={points}
              family={family}
              hook={useCustomHook ? customHook : (hookOptions[chosenHookIndex] ?? '')}
              onChangeHook={(text) => {
                setUseCustomHook(true);
                setCustomHook(text);
              }}
              hookOverlayBoxes={hookOverlayBoxes}
              onOpenHookOverlay={() => void openOverlay(-1, 'text')}
              cta={cta}
              busyAll={regenBusy === 'talking_points'}
              onChange={setPoints}
              onRegenerateAll={() => void regenerate('talking_points')}
              onDragStateChange={setPointsDragging}
              screenshotUrlForIndex={(i) => {
                const seg = segmentForPointIndex(i);
                return seg?.screenshot_url
                  ? screenshotUrls[seg.id]
                  : undefined;
              }}
              screenshotBusyIndex={shotBusyIndex}
              onAttachScreenshot={(i) => void attachScreenshotToPoint(i)}
              onRemoveScreenshot={(i) => void removeScreenshotFromPoint(i)}
              overlayBoxesForIndex={boxesForPointIndex}
              insetForIndex={insetForPointIndex}
              onOpenOverlay={(i, mode) => void openOverlay(i, mode)}
            />
            {family !== 'photo_carousel' ? (
              <>
                <SectionLabel>CTA</SectionLabel>
                <CtaCard value={cta} onChange={setCta} />
              </>
            ) : null}
            <SectionLabel>Caption</SectionLabel>
            <CaptionStep
              caption={caption}
              onChangeCaption={setCaption}
              busy={regenBusy === 'caption'}
              onRegenerate={() => void regenerate('caption')}
              hashtags={hashtags}
              bankTags={bankTags}
              onToggleTag={toggleHashtag}
              onAddTag={addHashtag}
              merged={mergedCaption()}
              accountName={accountName}
            />
          </View>
        ) : (
        <Animated.View
          style={{
            opacity: stepOpacity,
            transform: [{ translateX: stepShift }],
          }}
        >
        <Text style={styles.h1}>
          {family === 'photo_carousel' && step === 'points'
            ? 'Slides'
            : family === 'photo_carousel' && step === 'review'
              ? 'Preview'
              : STEP_TITLES[step]}
        </Text>

        {killReason && step === 'title' ? (
          <View style={styles.killCard}>
            <Text style={styles.killTitle}>Generation killed this slot</Text>
            <Text style={styles.killText}>{killReason}</Text>
          </View>
        ) : null}

        {warnings.length > 0 && step === 'title' ? (
          <View style={styles.warnCard}>
            {warnings.map((w) => (
              <Text key={w} style={styles.warnText}>
                {w}
              </Text>
            ))}
          </View>
        ) : null}

        {step === 'title' ? (
          <View style={styles.section}>
            <TitleCard value={title} onChange={setTitle} />
            {points.length === 0 ? (
              <View style={styles.startFrom}>
                <SectionLabel>Start from something</SectionLabel>
                <Text style={styles.summaryHint}>
                  Build this post out of a reference, a saved idea, or a post
                  you already made, instead of writing it from scratch.
                </Text>
                <Button
                  size="md"
                  variant="outline"
                  block
                  disabled={filling}
                  onPress={() => setLibraryOpen(true)}
                >
                  {filling ? 'Building the post…' : 'Start from the library'}
                </Button>
                <Button
                  size="md"
                  variant="ghost"
                  block
                  disabled={filling}
                  onPress={() => setPortSheet('source')}
                >
                  {otherFamily === 'photo_carousel'
                    ? 'Start from a slideshow this week'
                    : 'Start from a video this week'}
                </Button>
              </View>
            ) : null}
          </View>
        ) : null}

        {step === 'search' ? (
          <View style={styles.section}>
            <SearchPhraseCard
              value={searchPhrase}
              onChange={setSearchPhrase}
              busy={regenBusy === 'search_phrase'}
              onRegenerate={() => void regenerate('search_phrase')}
              alternates={alsoSearched}
              onPickAlternate={setSearchPhrase}
            />
          </View>
        ) : null}

        {step === 'hook' ? (
          <View style={styles.section}>
            <HookOptionsField
              value={useCustomHook ? customHook : (hookOptions[chosenHookIndex] ?? '')}
              onChange={(text) => {
                setUseCustomHook(true);
                setCustomHook(text);
              }}
            />
          </View>
        ) : null}

        {step === 'cta' ? (
          <View style={styles.section}>
            <CtaCard value={cta} onChange={setCta} />
          </View>
        ) : null}

        {step === 'points' ? (
          <View style={styles.section}>
            <PointsEditor
              points={points}
              family={family}
              hook={useCustomHook ? customHook : (hookOptions[chosenHookIndex] ?? '')}
              onChangeHook={(text) => {
                setUseCustomHook(true);
                setCustomHook(text);
              }}
              hookOverlayBoxes={hookOverlayBoxes}
              onOpenHookOverlay={() => void openOverlay(-1, 'text')}
              cta={cta}
              busyAll={regenBusy === 'talking_points'}
              onChange={setPoints}
              onRegenerateAll={() => void regenerate('talking_points')}
              onDragStateChange={setPointsDragging}
              screenshotUrlForIndex={(i) => {
                const seg = segmentForPointIndex(i);
                return seg?.screenshot_url
                  ? screenshotUrls[seg.id]
                  : undefined;
              }}
              screenshotBusyIndex={shotBusyIndex}
              onAttachScreenshot={(i) => void attachScreenshotToPoint(i)}
              onRemoveScreenshot={(i) => void removeScreenshotFromPoint(i)}
              overlayBoxesForIndex={boxesForPointIndex}
              insetForIndex={insetForPointIndex}
              onOpenOverlay={(i, mode) => void openOverlay(i, mode)}
            />
          </View>
        ) : null}

        {step === 'caption' ? (
          <View style={styles.section}>
            <CaptionStep
              caption={caption}
              onChangeCaption={setCaption}
              busy={regenBusy === 'caption'}
              onRegenerate={() => void regenerate('caption')}
              hashtags={hashtags}
              bankTags={bankTags}
              onToggleTag={toggleHashtag}
              onAddTag={addHashtag}
              merged={mergedCaption()}
              accountName={accountName}
            />
          </View>
        ) : null}

        {step === 'review' ? (
          family === 'photo_carousel' ? (
            <View style={styles.section}>
              <Text style={styles.previewNote}>
                Your text and pictures, put together. Creators add their own
                photos behind them.
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.previewRow}
              >
                {points.map((point, i) => (
                  <SlideStage
                    key={point.id}
                    boxes={boxesForPointIndex(i)}
                    inset={insetForPointIndex(i)}
                    placeholder="Creator's photo"
                    style={styles.previewSlide}
                  />
                ))}
              </ScrollView>
              {mergedCaption() ? (
                <View style={styles.summaryCard}>
                  <SectionLabel>Caption</SectionLabel>
                  <Text style={styles.summaryText}>{mergedCaption()}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <ReviewSheet
              inline
              hideHeader
              hideConfirm
              visible
              running={reviewRunning}
              confirming={reviewConfirming}
              result={reviewResult}
              appliedIndexes={appliedIndexes}
              onApply={applySuggestion}
              onClose={() => setStep('caption')}
              onConfirm={() => void confirmReview()}
              confirmLabel="Save post"
            />
          )
        ) : null}

        </Animated.View>
        )}
      </ScrollView>

      {summaryMode === null ? (
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View style={styles.backButton}>
          <Button size="lg" variant="ghost" block onPress={goBack}>
            Back
          </Button>
        </View>
        <View style={styles.nextButton}>
          {step !== 'review' ? (
            <Button
              size="lg"
              variant="primary"
              block
              disabled={saving}
              onPress={() => void goNext()}
            >
              Next
            </Button>
          ) : family === 'photo_carousel' ? (
            <Button
              size="lg"
              variant="primary"
              block
              disabled={saving || reviewConfirming}
              onPress={() => void confirmSlideshow()}
            >
              {reviewConfirming ? 'Saving…' : 'Save post'}
            </Button>
          ) : (
            <Button
              size="lg"
              variant="primary"
              block
              disabled={reviewRunning || reviewConfirming || !reviewResult}
              onPress={() => void confirmReview()}
            >
              {reviewConfirming ? 'Saving…' : 'Save post'}
            </Button>
          )}
        </View>
      </View>
      ) : null}

      {summaryMode === 'view' && reviewedAt === null ? (
        <View
          style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}
        >
          <View style={styles.nextButton}>
            {family === 'photo_carousel' ? (
              <Button
                size="lg"
                variant="primary"
                block
                disabled={saving || reviewConfirming}
                onPress={() => void confirmSlideshow()}
              >
                {reviewConfirming ? 'Saving…' : 'Mark complete'}
              </Button>
            ) : (
              <Button
                size="lg"
                variant="primary"
                block
                disabled={reviewRunning}
                onPress={() => {
                  setSummaryMode(null);
                  setStep('review');
                  void runReview();
                }}
              >
                Run final review
              </Button>
            )}
          </View>
        </View>
      ) : null}

      {overlayIndex !== null ? (
        <OverlayEditor
          visible
          mode={overlayMode}
          resetKey={overlaySegment?.id ?? String(overlayIndex)}
          screenshotUrl={
            overlaySegment?.screenshot_url
              ? screenshotUrls[overlaySegment.id]
              : undefined
          }
          boxes={parseOverlayBoxes(overlaySegment?.overlay_style, {
            text: overlaySegment?.overlay_text,
            textY: overlaySegment?.text_y,
          })}
          screenshotX={overlaySegment?.screenshot_x ?? null}
          screenshotY={overlaySegment?.screenshot_y ?? null}
          screenshotWidth={overlaySegment?.screenshot_width ?? null}
          saving={overlaySaving}
          onClose={() => setOverlayIndex(null)}
          onSave={saveOverlay}
          onRemoveShot={() => {
            const segment = overlaySegment;
            if (!segment?.screenshot_url) return;
            void updateBriefSegment(segment.id, { screenshot_url: null })
              .then(() =>
                setSegments((prev) =>
                  prev.map((s) =>
                    s.id === segment.id ? { ...s, screenshot_url: null } : s,
                  ),
                ),
              )
              .catch(() => undefined);
          }}
        />
      ) : null}

      <PortSheet
        visible={portSheet !== null}
        title={
          portSheet === 'source'
            ? otherFamily === 'photo_carousel'
              ? 'Start from a slideshow'
              : 'Start from a video'
            : otherFamily === 'photo_carousel'
              ? 'Make a slideshow version'
              : 'Make a video version'
        }
        subtitle={
          portSheet === 'source'
            ? 'The post you pick is rewritten into this slot. It stays as it is.'
            : 'Pick the type for the new post. This post stays as it is.'
        }
        options={portSheet === 'source' ? portSourceOptions : portTargetOptions}
        emptyText={
          portSheet === 'source'
            ? 'No finished posts on the other side of this week yet.'
            : 'No post types on the other side yet.'
        }
        busyId={portBusyId}
        onClose={() => {
          if (portBusyId !== null) return;
          setPortSheet(null);
        }}
        onPick={(optionId) => {
          if (portSheet === 'source') {
            void fillThisSlot(
              { kind: 'port', sourceBriefId: optionId },
              optionId,
            );
            return;
          }
          void portToFormat(optionId);
        }}
      />

      <LibraryPickerSheet
        visible={libraryOpen}
        postTypeId={postTypeId}
        busy={filling}
        onClose={() => {
          if (filling) return;
          setLibraryOpen(false);
        }}
        onPick={onLibraryPick}
      />

      <CameraRollSheet
        visible={shotPickerIndex !== null}
        library={noniLibrary}
        onClose={() => setShotPickerIndex(null)}
        onPick={(uri) => {
          const index = shotPickerIndex;
          setShotPickerIndex(null);
          if (index !== null) void uploadShotForPoint(index, uri);
        }}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 24 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.offWhite,
  },
  centerText: {
    fontSize: type.size.bodySm,
    color: color.slate400,
  },
  shellTop: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 4,
  },
  saveProgress: {
    fontSize: 13,
    fontWeight: '700',
    color: color.blue600,
  },
  h1: {
    fontSize: 28,
    fontWeight: '700',
    color: color.ink,
    letterSpacing: type.tracking.title,
    marginBottom: 16,
  },
  killCard: {
    gap: 6,
    padding: 14,
    marginBottom: 16,
    borderRadius: radius.md,
    backgroundColor: color.dangerSoft,
  },
  killTitle: {
    fontSize: type.size.bodySm,
    fontWeight: '800',
    color: color.danger,
  },
  killText: {
    fontSize: type.size.bodySm,
    color: color.ink,
  },
  warnCard: {
    gap: 4,
    padding: 12,
    marginBottom: 16,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.amber,
    backgroundColor: color.white,
  },
  warnText: {
    fontSize: type.size.meta,
    color: color.amber,
    fontWeight: '600',
  },
  section: { gap: 10, marginBottom: 8 },
  previewNote: {
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * 1.4,
    color: color.slate500,
  },
  previewRow: {
    gap: 10,
    paddingVertical: 4,
  },
  previewSlide: {
    width: 168,
    aspectRatio: 9 / 16,
    borderRadius: radius.md,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    backgroundColor: color.glass,
  },
  backButton: { flexBasis: '30%' },
  nextButton: { flex: 1 },
  summaryStack: {
    gap: 12,
  },
  summaryCard: {
    gap: 10,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: color.white,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 20 * 1.3,
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  summaryText: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 15 * 1.4,
    color: color.ink,
  },
  summaryHint: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 13 * 1.45,
    color: color.slate500,
  },
  startFrom: {
    gap: 10,
    padding: 16,
    marginTop: 6,
    borderRadius: radius.md,
    backgroundColor: color.white,
  },
  summaryPlug: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 15 * 1.4,
    color: color.slate500,
  },
  summaryPoint: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryPointNum: {
    width: 22,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 15 * 1.4,
    color: color.slate400,
  },
  summaryPointBody: {
    flex: 1,
    minWidth: 0,
  },
  summaryThumb: {
    marginTop: 8,
    width: 42,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: color.offWhite,
  },
});

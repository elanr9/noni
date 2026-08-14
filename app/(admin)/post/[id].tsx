// Stepped post editor. Post type comes stamped from week setup but stays
// editable on the title step. Nothing generates on open — AI assist is on
// demand. Screenshots live on brief_segments keyed by talking_point_index.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CameraRollSheet } from '../../../components/admin/editor/CameraRollSheet';
import { CaptionStep } from '../../../components/admin/editor/CaptionStep';
import { CtaCard } from '../../../components/admin/editor/CtaCard';
import { FillSheet } from '../../../components/admin/editor/FillSheet';
import { HookOptionsField } from '../../../components/admin/editor/HookOptionsField';
import { MoveSheet, type MoveSlot } from '../../../components/admin/editor/MoveSheet';
import {
  OverlayEditor,
  overlayPlacementLabel,
  parseOverlayStyle,
  type OverlayEditorMode,
  type OverlaySavePatch,
} from '../../../components/admin/editor/OverlayEditor';
import { PointsEditor } from '../../../components/admin/editor/PointsEditor';
import { ReviewSheet } from '../../../components/admin/editor/ReviewSheet';
import { SearchPhraseCard } from '../../../components/admin/editor/SearchPhraseCard';
import { StepDots } from '../../../components/admin/editor/StepDots';
import { TitleCard } from '../../../components/admin/editor/TitleCard';
import { TypePicker } from '../../../components/admin/editor/TypePicker';
import {
  LibraryPickerSheet,
  type LibraryPick,
} from '../../../components/admin/LibraryPickerSheet';
import { PushHeader } from '../../../components/admin/shared';
import { Button } from '../../../components/ui/Button';
import { PressableScale } from '../../../components/ui/PressableScale';
import { useAuth } from '../../../lib/auth';
import {
  appendBannedPhrases,
  assistDeriveSegments,
  assistRegenerateField,
  confirmBriefReview,
  generatePost,
  getBrief,
  listApprovedClaimIds,
  listBriefSegments,
  listCampaigns,
  listNoniLibrary,
  listPostTypes,
  logBriefReviewEvents,
  markSearchQueryUsedByText,
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
  type NoniLibraryGroup,
  type PostType,
  type PostTypeShape,
  type RegenDraftPayload,
  type RegenField,
  type TalkingPoint,
} from '../../../lib/briefs-api';
import { supabase } from '../../../lib/supabase';
import { color, motion, radius, type } from '../../../theme/tokens';

const STEPS = [
  'title',
  'search',
  'hook',
  'cta',
  'points',
  'caption',
  'review',
] as const;
type EditorStep = (typeof STEPS)[number];

const STEP_TITLES: Record<EditorStep, string> = {
  title: 'Title',
  search: 'Search phrase',
  hook: 'Hook',
  cta: 'CTA',
  points: 'Talking points',
  caption: 'Caption + hashtags',
  review: 'AI review',
};

/** One line of intent under each step's h1 (README §8 shell). */
const STEP_INTENTS: Record<EditorStep, string> = {
  title: 'Optional. It is how the post reads in the grid, not on the platform.',
  search:
    'The TikTok search this post answers. Everything downstream is written against it.',
  hook: 'Nine words maximum, written against the finished body. Pick one or write your own.',
  cta: 'One plug sentence. On the talking points step it lands inside one point, never its own clip.',
  points: 'Clip count is derived from the type, never entered.',
  caption: 'Caption and 3 to 5 hashtags. Instagram reads tags inside the caption.',
  review:
    'Suggestions only. Apply what helps, ignore the rest, confirm when it reads right.',
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
  // Direction-aware step transition: Next slides in from the right,
  // Back from the left, with a fade. Driven by index delta so every
  // setStep caller gets it for free.
  const stepOpacity = useRef(new Animated.Value(1)).current;
  const stepShift = useRef(new Animated.Value(0)).current;
  const prevStepIndexRef = useRef(0);

  useEffect(() => {
    const idx = STEPS.indexOf(step);
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
  }, [step, stepOpacity, stepShift]);
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
  const [hookStale, setHookStale] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [baseline, setBaseline] = useState('');

  const [approvedClaimIds, setApprovedClaimIds] = useState<string[]>([]);
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [reviewRunning, setReviewRunning] = useState(false);
  const [reviewConfirming, setReviewConfirming] = useState(false);
  const [reviewResult, setReviewResult] = useState<BriefReviewResult | null>(null);
  const [appliedIndexes, setAppliedIndexes] = useState<ReadonlySet<number>>(new Set());
  const [appliedPointIds, setAppliedPointIds] = useState<ReadonlySet<string>>(new Set());
  const [reviewSnapshot, setReviewSnapshot] = useState<ReviewSnapshot | null>(null);

  const [fillVisible, setFillVisible] = useState(false);
  const [libraryVisible, setLibraryVisible] = useState(false);
  /** Approved claim names by id, for the CTA trace chip. */
  const [claimNames, setClaimNames] = useState<Record<string, string>>({});
  const [filling, setFilling] = useState(false);
  const [regenBusy, setRegenBusy] = useState<RegenField | null>(null);
  const [regenPointIndex, setRegenPointIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [shotBusyIndex, setShotBusyIndex] = useState<number | null>(null);
  /** Which point the camera roll sheet is picking for; null means closed. */
  const [shotPickerIndex, setShotPickerIndex] = useState<number | null>(null);
  /** Which point's screenshot the Move sheet is placing; null means closed. */
  const [moveIndex, setMoveIndex] = useState<number | null>(null);
  const [overlayIndex, setOverlayIndex] = useState<number | null>(null);
  const [overlayMode, setOverlayMode] = useState<OverlayEditorMode>('text');
  const [overlaySaving, setOverlaySaving] = useState(false);
  /** The brand account shown on the merged caption preview. */
  const [accountName, setAccountName] = useState('');

  const currentType = useMemo(
    () => postTypes.find((t) => t.id === postTypeId) ?? null,
    [postTypes, postTypeId],
  );

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
          { data: claims },
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
          supabase.from('product_features').select('id, name').eq('approved', true),
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
        setClaimNames(
          Object.fromEntries((claims ?? []).map((c) => [c.id, c.name])),
        );
        // No posting-account handle lives in the data; the slug is the
        // closest stable stand-in for the merged preview.
        setAccountName(company?.slug ?? company?.name ?? '');
        setReviewedAt(brief.reviewed_at);

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
          void listCampaigns()
            .then((all) => {
              const idx = all.findIndex((c) => c.id === link.campaign_id);
              if (idx >= 0) setWeekNumber(all.length - idx);
            })
            .catch(() => undefined);
        }

        // Entering the editor opens the first incomplete step, or step 1
        // on an untouched row. Never lands on review — that would either
        // generate on open (rule 1) or show an empty screen.
        const rowType = types.find((t) => t.id === brief.post_type_id) ?? null;
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
              : !brief.hook?.trim()
                ? 'hook'
                : (rowType?.requires_plug ?? true) && !brief.cta?.trim()
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
  }, [id, refreshScreenshotUrls]);

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

  async function fillFrom(source: { query?: string; url?: string; context?: string }) {
    if (!id || !currentType) return;
    setFilling(true);
    try {
      const result = await generatePost({
        ...source,
        postTypeKey: currentType.key,
      });
      if (result.kind === 'kill') {
        // Kill rather than pad: persist immediately so the grid row shows
        // the reason even if she backs out without saving.
        setKillReason(result.kill_reason);
        await updateBrief(id, { kill_reason: result.kill_reason });
        setFillVisible(false);
        return;
      }
      const d = result.draft;
      setTitle(d.title);
      setPoints(d.talking_points);
      setCta(d.cta ?? '');
      setHookOptions(d.hook_options);
      setChosenHookIndex(0);
      setSearchPhrase(d.search_phrase ?? searchPhrase);
      setCaption(d.caption);
      setHashtags(d.hashtags);
      setWhyItWorks(d.why_it_works);
      setScript(d.script);
      setTargetWords(d.target_words);
      setGenerationId(d.generation_id);
      if (d.example_url) setExampleUrl(d.example_url);
      setPendingOverlayLabels(d.overlay_labels);
      setWarnings(d.warnings);
      setKillReason(null);
      setHookStale(false);
      if (source.query) void markSearchQueryUsedByText(source.query);
      setFillVisible(false);
    } catch (e) {
      Alert.alert(
        'Could not fill',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setFilling(false);
    }
  }

  async function regenerate(field: RegenField, index?: number) {
    setRegenBusy(field);
    if (field === 'talking_point') setRegenPointIndex(index ?? null);
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
          if (result.hook_may_be_stale) setHookStale(true);
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
          if (result.hook_may_be_stale) setHookStale(true);
          break;
        }
        case 'hook':
          setHookOptions(result.hook_options);
          setChosenHookIndex(0);
          setHookStale(false);
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
      setRegenPointIndex(null);
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
        const rows = await assistDeriveSegments(
          id,
          pendingOverlayLabels ?? undefined,
        );
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
      setReviewedAt(new Date().toISOString());
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

  /** Flip a point's recording layout between standard and green screen. */
  async function toggleLayoutForPoint(pointIndex: number) {
    const segment = segmentForPointIndex(pointIndex);
    if (!segment?.screenshot_url) return;
    const next = segment.layout === 'green_screen' ? 'standard' : 'green_screen';
    setShotBusyIndex(pointIndex);
    try {
      await updateBriefSegment(segment.id, { layout: next });
      setSegments((prev) =>
        prev.map((s) => (s.id === segment.id ? { ...s, layout: next } : s)),
      );
    } catch (e) {
      Alert.alert(
        'Could not switch layout',
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
    const segment = segmentForPointIndex(pointIndex);
    if (!segment) {
      Alert.alert('No clip yet', 'Save the post so clips exist, then add text.');
      throw new Error('No clip yet');
    }
    setOverlaySaving(true);
    try {
      await updateBriefSegment(segment.id, patch);
      setSegments((prev) =>
        prev.map((s) =>
          s.id === segment.id
            ? {
                ...s,
                overlay_text: patch.overlay_text,
                show_on_screen: patch.show_on_screen,
                overlay_style: patch.overlay_style,
                screenshot_x: patch.screenshot_x,
                screenshot_y: patch.screenshot_y,
                screenshot_width: patch.screenshot_width,
              }
            : s,
        ),
      );
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

  async function deleteOverlayText() {
    const pointIndex = overlayIndex;
    if (pointIndex === null) return;
    const segment = segmentForPointIndex(pointIndex);
    if (!segment) return;
    try {
      await updateBriefSegment(segment.id, {
        overlay_text: '',
        show_on_screen: false,
      });
      setSegments((prev) =>
        prev.map((s) =>
          s.id === segment.id
            ? { ...s, overlay_text: '', show_on_screen: false }
            : s,
        ),
      );
    } catch (e) {
      Alert.alert(
        'Could not delete text',
        e instanceof Error ? e.message : 'Try again',
      );
      throw e;
    }
  }

  function moveScreenshotFromPoint(pointIndex: number) {
    const from = segmentForPointIndex(pointIndex);
    if (!from?.screenshot_url) return;
    if (segments.length <= 1) {
      Alert.alert('Nowhere to move', 'Only one clip exists on this post.');
      return;
    }
    setMoveIndex(pointIndex);
  }

  /**
   * One screenshot per slot, one slot per screenshot: moving onto an
   * occupied slot swaps the two. Ordered so no slot ever holds two paths.
   */
  async function placeScreenshot(targetId: string) {
    const pointIndex = moveIndex;
    setMoveIndex(null);
    if (pointIndex === null) return;
    const from = segmentForPointIndex(pointIndex);
    const target = segments.find((s) => s.id === targetId);
    if (!from?.screenshot_url || !target || target.id === from.id) return;
    setShotBusyIndex(pointIndex);
    try {
      const fromPath = from.screenshot_url;
      const targetPath = target.screenshot_url;
      await updateBriefSegment(from.id, { screenshot_url: null });
      await updateBriefSegment(target.id, { screenshot_url: fromPath });
      if (targetPath) {
        await updateBriefSegment(from.id, { screenshot_url: targetPath });
      }
      setSegments((prev) =>
        prev.map((s) => {
          if (s.id === from.id) return { ...s, screenshot_url: targetPath ?? null };
          if (s.id === target.id) return { ...s, screenshot_url: fromPath };
          return s;
        }),
      );
      setScreenshotUrls((prev) => {
        const next = { ...prev };
        const fromUrl = prev[from.id];
        const targetUrl = prev[target.id];
        if (targetPath && targetUrl) {
          next[from.id] = targetUrl;
        } else {
          delete next[from.id];
        }
        if (fromUrl) next[target.id] = fromUrl;
        return next;
      });
    } catch (e) {
      Alert.alert(
        'Could not move',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setShotBusyIndex(null);
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
    return STEPS.indexOf(s);
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
      void runReview();
      return;
    }
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1]);
    }
  }

  function goBack() {
    const idx = stepIndex(step);
    if (idx <= 0) {
      router.back();
      return;
    }
    if (step === 'review') setReviewVisible(false);
    setStep(STEPS[idx - 1]);
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
  const plugClaimId = points.find((p) => p.is_product)?.claim_id ?? null;
  const traceClaimName =
    plugClaimId !== null ? (claimNames[plugClaimId] ?? null) : null;
  const bankTags = [...new Set([...hashtagBank, ...hashtags])];
  const captionBody = caption.replace(/#\w+/g, ' ').replace(/\s+/g, ' ').trim();
  const currentStepIndex = stepIndex(step);
  const typeLabel = currentType?.label ?? 'Post';
  const family: 'video' | 'photo_carousel' =
    currentType?.family === 'photo_carousel' ? 'photo_carousel' : 'video';

  // The Move sheet's slot list, in segment order, derived from the type.
  const moveSlots: MoveSlot[] = segments.map((s) => ({
    segmentId: s.id,
    label:
      s.kind === 'hook'
        ? 'Hook'
        : s.kind === 'outro'
          ? 'Outro'
          : s.kind === 'slide'
            ? `Slide ${(s.talking_point_index ?? 0) + 1}`
            : `Clip ${(s.talking_point_index ?? 0) + 1}`,
    occupied: s.screenshot_url !== null,
  }));
  const movingFrom =
    moveIndex !== null ? (segmentForPointIndex(moveIndex) ?? null) : null;
  const overlaySegment =
    overlayIndex !== null ? (segmentForPointIndex(overlayIndex) ?? null) : null;

  // Clip and slide counts are derived from the type, never entered.
  const pointCount =
    currentType !== null ? Math.max(points.length, currentType.min_points) : points.length;
  const stepIntent =
    step === 'points' && currentType !== null
      ? currentType.clip_structure === 'single_clip'
        ? 'One clip, derived from the type.'
        : currentType.clip_structure === 'slide_per_point'
          ? `One slide per point = ${pointCount} slides. Derived from the type, never entered.`
          : `Hook + ${pointCount} points + outro = ${pointCount + 2} clips. Derived from the type, never entered.`
      : STEP_INTENTS[step];

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
          }
        />
        <StepDots
          current={currentStepIndex}
          total={STEPS.length}
          name={STEP_TITLES[step]}
        />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            opacity: stepOpacity,
            transform: [{ translateX: stepShift }],
          }}
        >
        <Text style={styles.h1}>{STEP_TITLES[step]}</Text>
        <Text style={styles.intent}>{stepIntent}</Text>

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
            <TitleCard
              value={title}
              onChange={setTitle}
              filling={filling}
              onFillWithAi={() => setFillVisible(true)}
            />
            {postTypeId !== null ? (
              <TypePicker
                postTypes={postTypes}
                selectedId={postTypeId}
                onSelect={(t) => setPostTypeId(t.id)}
              />
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
              options={hookOptions}
              chosenIndex={chosenHookIndex}
              stale={hookStale}
              busy={regenBusy === 'hook'}
              onChoose={(i) => {
                setUseCustomHook(false);
                setChosenHookIndex(i);
              }}
              onRegenerate={() => void regenerate('hook')}
              onOpenLibrary={() => setLibraryVisible(true)}
              useCustom={useCustomHook}
              customText={customHook}
              onChooseCustom={() => setUseCustomHook(true)}
              onChangeCustom={(text) => {
                setUseCustomHook(true);
                setCustomHook(text);
              }}
            />
          </View>
        ) : null}

        {step === 'cta' ? (
          <View style={styles.section}>
            <CtaCard value={cta} onChange={setCta} claimName={traceClaimName} />
          </View>
        ) : null}

        {step === 'points' ? (
          <View style={styles.section}>
            <PointsEditor
              points={points}
              minPoints={currentType?.min_points ?? null}
              maxPoints={currentType?.max_points ?? null}
              family={family}
              busyAll={regenBusy === 'talking_points'}
              busyIndex={regenBusy === 'talking_point' ? regenPointIndex : null}
              onChange={setPoints}
              onRegenerateAll={() => void regenerate('talking_points')}
              onRegeneratePoint={(i) => void regenerate('talking_point', i)}
              screenshotUrlForIndex={(i) => {
                const seg = segmentForPointIndex(i);
                return seg?.screenshot_url
                  ? screenshotUrls[seg.id]
                  : undefined;
              }}
              screenshotBusyIndex={shotBusyIndex}
              onAttachScreenshot={(i) => void attachScreenshotToPoint(i)}
              onMoveScreenshot={moveScreenshotFromPoint}
              onRemoveScreenshot={(i) => void removeScreenshotFromPoint(i)}
              layoutForIndex={(i) =>
                segmentForPointIndex(i)?.layout === 'green_screen'
                  ? 'green_screen'
                  : 'standard'
              }
              overlayTextForIndex={(i) => {
                const t = segmentForPointIndex(i)?.overlay_text?.trim();
                return t ? t : undefined;
              }}
              overlayStyleForIndex={(i) =>
                parseOverlayStyle(segmentForPointIndex(i)?.overlay_style)
              }
              placementLabelForIndex={(i) => {
                const s = segmentForPointIndex(i);
                return overlayPlacementLabel(
                  s?.screenshot_x,
                  s?.screenshot_y,
                  s?.screenshot_width,
                );
              }}
              onOpenOverlay={(i, mode) => void openOverlay(i, mode)}
            />
          </View>
        ) : null}

        {step === 'caption' ? (
          <View style={styles.section}>
            <CaptionStep
              caption={captionBody}
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
        ) : null}

        {reviewedAt && step !== 'review' ? (
          <Text style={styles.reviewedNote}>
            Reviewed {new Date(reviewedAt).toLocaleDateString()}. You can still
            edit and review again.
          </Text>
        ) : null}
        </Animated.View>
      </ScrollView>

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
              disabled={saving || filling}
              onPress={() => void goNext()}
            >
              Next
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

      <FillSheet
        visible={fillVisible}
        searchPhrase={searchPhrase}
        busy={filling}
        onClose={() => setFillVisible(false)}
        onFillFromPhrase={() => void fillFrom({ query: searchPhrase })}
        onFillFromLink={(url, context) => void fillFrom({ url, context })}
      />

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
          overlayText={overlaySegment?.overlay_text ?? ''}
          overlayStyle={parseOverlayStyle(overlaySegment?.overlay_style)}
          screenshotX={overlaySegment?.screenshot_x ?? null}
          screenshotY={overlaySegment?.screenshot_y ?? null}
          screenshotWidth={overlaySegment?.screenshot_width ?? null}
          greenScreen={overlaySegment?.layout === 'green_screen'}
          saving={overlaySaving}
          onClose={() => setOverlayIndex(null)}
          onSave={saveOverlay}
          onSwapMedia={() => setShotPickerIndex(overlayIndex)}
          onToggleGreenScreen={() => void toggleLayoutForPoint(overlayIndex)}
          onRemoveMedia={() => void removeScreenshotFromPoint(overlayIndex)}
          onDeleteText={deleteOverlayText}
        />
      ) : null}

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

      <MoveSheet
        visible={moveIndex !== null}
        slots={moveSlots}
        currentSegmentId={movingFrom?.id ?? null}
        onClose={() => setMoveIndex(null)}
        onPick={(segmentId) => void placeScreenshot(segmentId)}
      />

      <LibraryPickerSheet
        visible={libraryVisible}
        postTypeId={postTypeId}
        onClose={() => setLibraryVisible(false)}
        onPick={(pick: LibraryPick) => {
          // From the hook step: a reference attaches as the example, a
          // text idea becomes the written hook.
          if (pick.kind === 'example') {
            setExampleUrl(pick.url);
          } else {
            setUseCustomHook(true);
            setCustomHook(pick.text);
          }
          setLibraryVisible(false);
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
  },
  intent: {
    marginTop: 6,
    marginBottom: 16,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 14 * 1.45,
    color: color.slate500,
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
  reviewedNote: {
    marginTop: 10,
    fontSize: type.size.meta,
    color: color.slate400,
  },
});

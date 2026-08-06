// Stepped post editor. Post type is locked from week setup. Nothing
// generates on open — AI assist is on demand. Screenshots live on
// brief_segments keyed by talking_point_index.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

import { FillSheet } from '../../../components/admin/editor/FillSheet';
import { HookOptionsField } from '../../../components/admin/editor/HookOptionsField';
import { PointsEditor } from '../../../components/admin/editor/PointsEditor';
import { ReviewSheet } from '../../../components/admin/editor/ReviewSheet';
import { StepDots } from '../../../components/admin/editor/StepDots';
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
  type PostType,
  type PostTypeShape,
  type RegenDraftPayload,
  type RegenField,
  type TalkingPoint,
} from '../../../lib/briefs-api';
import { supabase } from '../../../lib/supabase';
import { color, radius, ringFocus, type } from '../../../theme/tokens';

const CAPTION_MAX = 200;
const HOOK_MAX_WORDS = 9;

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

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

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
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);
  const [postNumber, setPostNumber] = useState<number | null>(null);
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [postTypes, setPostTypes] = useState<PostType[]>([]);
  const [hashtagBank, setHashtagBank] = useState<string[]>([]);
  const [segments, setSegments] = useState<BriefSegment[]>([]);
  const [screenshotUrls, setScreenshotUrls] = useState<Record<string, string>>({});

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
  const [filling, setFilling] = useState(false);
  const [regenBusy, setRegenBusy] = useState<RegenField | null>(null);
  const [regenPointIndex, setRegenPointIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [shotBusyIndex, setShotBusyIndex] = useState<number | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

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
        const [brief, types, segs, { data: brand }, claimIds, { data: link }] =
          await Promise.all([
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
    const segment =
      rows.find(
        (s) =>
          (s.kind === 'point' || s.kind === 'slide') &&
          s.talking_point_index === pointIndex,
      ) ??
      rows.find((s) => s.kind === 'hook') ??
      rows[0];
    if (!segment) {
      Alert.alert('No clip yet', 'Save the post so clips exist, then attach.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setShotBusyIndex(pointIndex);
    try {
      const path = await uploadSegmentScreenshot({
        companyId: profile.company_id,
        briefId: id,
        segmentId: segment.id,
        localUri: result.assets[0].uri,
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

  function moveScreenshotFromPoint(pointIndex: number) {
    const from = segmentForPointIndex(pointIndex);
    if (!from?.screenshot_url) return;
    const targets = segments.filter((s) => s.id !== from.id);
    if (targets.length === 0) {
      Alert.alert('Nowhere to move', 'Only one clip exists on this post.');
      return;
    }
    Alert.alert(
      'Show screenshot on',
      'Pick which clip or slide this screenshot pops up on.',
      [
        ...targets.map((target) => ({
          text:
            target.kind === 'hook'
              ? 'Hook'
              : target.kind === 'outro'
                ? 'Outro'
                : target.kind === 'slide'
                  ? `Slide ${(target.talking_point_index ?? 0) + 1}`
                  : `Point ${(target.talking_point_index ?? 0) + 1}`,
          onPress: () => {
            void (async () => {
              setShotBusyIndex(pointIndex);
              try {
                const path = from.screenshot_url;
                await updateBriefSegment(from.id, { screenshot_url: null });
                await updateBriefSegment(target.id, { screenshot_url: path });
                setSegments((prev) =>
                  prev.map((s) => {
                    if (s.id === from.id) return { ...s, screenshot_url: null };
                    if (s.id === target.id) return { ...s, screenshot_url: path };
                    return s;
                  }),
                );
                if (path) {
                  setScreenshotUrls((prev) => {
                    const next = { ...prev };
                    delete next[from.id];
                    if (prev[from.id]) next[target.id] = prev[from.id];
                    return next;
                  });
                }
              } catch (e) {
                Alert.alert(
                  'Could not move',
                  e instanceof Error ? e.message : 'Try again',
                );
              } finally {
                setShotBusyIndex(null);
              }
            })();
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  function toggleHashtag(tag: string) {
    setHashtags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= 5) return prev;
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

  const chosenHook = resolvedHook() ?? '';
  const hookTooLong = wordCount(chosenHook) > HOOK_MAX_WORDS;
  const bankTags = [...new Set([...hashtagBank, ...hashtags])];
  const captionBody = caption.replace(/#\w+/g, ' ').replace(/\s+/g, ' ').trim();
  const currentStepIndex = stepIndex(step);
  const typeLabel = currentType?.label ?? 'Post';

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
            <View style={styles.fillRow}>
              <Button
                size="md"
                variant="tint"
                icon="sparkles"
                block
                disabled={filling}
                onPress={() => setFillVisible(true)}
              >
                {filling ? 'Generating…' : 'Fill with AI'}
              </Button>
            </View>
            <Text style={styles.hint}>
              What this post is about. Keep it short and concrete.
            </Text>
            <View style={[styles.fieldRing, focused === 'title' && ringFocus]}>
              <TextInput
                value={title}
                onChangeText={setTitle}
                onFocus={() => setFocused('title')}
                onBlur={() => setFocused(null)}
                placeholder="Post title"
                placeholderTextColor={color.slate400}
                style={styles.field}
                autoFocus
              />
            </View>
          </View>
        ) : null}

        {step === 'search' ? (
          <View style={styles.section}>
            <View style={styles.labelRow}>
              <Text style={styles.hint}>TikTok search this post answers</Text>
              <Button
                size="sm"
                variant="tint"
                disabled={regenBusy !== null}
                onPress={() => void regenerate('search_phrase')}
              >
                {regenBusy === 'search_phrase' ? '…' : 'Regenerate'}
              </Button>
            </View>
            <View style={[styles.fieldRing, focused === 'phrase' && ringFocus]}>
              <TextInput
                value={searchPhrase}
                onChangeText={setSearchPhrase}
                onFocus={() => setFocused('phrase')}
                onBlur={() => setFocused(null)}
                placeholder="e.g. is NCSA worth it"
                placeholderTextColor={color.slate400}
                autoCapitalize="none"
                style={styles.field}
                autoFocus
              />
            </View>
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
              onChangeOption={(i, text) =>
                setHookOptions((prev) => prev.map((h, j) => (j === i ? text : h)))
              }
              onRegenerate={() => void regenerate('hook')}
              useCustom={useCustomHook}
              customText={customHook}
              onChooseCustom={() => setUseCustomHook(true)}
              onChangeCustom={(text) => {
                setUseCustomHook(true);
                setCustomHook(text);
              }}
            />
            {hookTooLong ? (
              <Text style={styles.inlineWarn}>
                Hook is {wordCount(chosenHook)} words. Cap is {HOOK_MAX_WORDS}.
              </Text>
            ) : null}
          </View>
        ) : null}

        {step === 'cta' ? (
          <View style={styles.section}>
            <Text style={styles.hint}>
              The product plug sentence. It rides inside one talking point —
              never its own card.
            </Text>
            <View style={[styles.fieldRing, focused === 'cta' && ringFocus]}>
              <TextInput
                multiline
                value={cta}
                onChangeText={setCta}
                onFocus={() => setFocused('cta')}
                onBlur={() => setFocused(null)}
                placeholder="One sentence plug"
                placeholderTextColor={color.slate400}
                style={[styles.field, styles.multiline]}
                autoFocus
              />
            </View>
          </View>
        ) : null}

        {step === 'points' ? (
          <View style={styles.section}>
            <Text style={styles.hint}>
              Tap a card to attach a screenshot. Move picks which clip it
              pops up on. The CTA card is marked with a star.
            </Text>
            <PointsEditor
              points={points}
              minPoints={currentType?.min_points ?? null}
              maxPoints={currentType?.max_points ?? null}
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
            />
          </View>
        ) : null}

        {step === 'caption' ? (
          <View style={styles.section}>
            <View style={styles.labelRow}>
              <Text style={styles.hint}>Caption body</Text>
              <Button
                size="sm"
                variant="tint"
                disabled={regenBusy !== null}
                onPress={() => void regenerate('caption')}
              >
                {regenBusy === 'caption' ? '…' : 'Regenerate'}
              </Button>
            </View>
            <View style={[styles.fieldRing, focused === 'caption' && ringFocus]}>
              <TextInput
                multiline
                value={captionBody}
                onChangeText={setCaption}
                onFocus={() => setFocused('caption')}
                onBlur={() => setFocused(null)}
                placeholder="Caption"
                placeholderTextColor={color.slate400}
                style={[styles.field, styles.multiline]}
                autoFocus
              />
            </View>
            <Text
              style={[
                styles.helper,
                captionBody.length > CAPTION_MAX && styles.helperDanger,
              ]}
            >
              {captionBody.length} of {CAPTION_MAX} characters
            </Text>
            <Text
              style={[
                styles.label,
                (hashtags.length < 3 || hashtags.length > 5) && styles.labelWarn,
              ]}
            >
              {`Hashtags (${hashtags.length}, pick 3–5)`}
            </Text>
            <View style={styles.pillRow}>
              {bankTags.map((tag) => {
                const selected = hashtags.includes(tag);
                return (
                  <PressableScale
                    key={tag}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => toggleHashtag(tag)}
                    style={[styles.pill, selected && styles.pillSelected]}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        selected && styles.pillTextSelected,
                      ]}
                    >
                      {tag}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
            <Text style={styles.hint}>
              Instagram needs hashtags in the caption. Saved merge:
            </Text>
            <View style={styles.previewCard}>
              <Text style={styles.previewText}>{mergedCaption() || '—'}</Text>
            </View>
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
  fillRow: { marginBottom: 12 },
  section: { gap: 10, marginBottom: 8 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.slate400,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
  },
  labelWarn: { color: color.amber },
  hint: {
    fontSize: type.size.meta,
    color: color.slate400,
    lineHeight: type.size.meta * 1.4,
  },
  inlineWarn: {
    fontSize: type.size.meta,
    fontWeight: '600',
    color: color.amber,
  },
  helper: {
    fontSize: type.size.meta,
    color: color.slate400,
  },
  helperDanger: { color: color.danger },
  fieldRing: { borderRadius: radius.sm },
  field: {
    borderWidth: 1.5,
    borderColor: color.lineStrong,
    borderRadius: radius.sm,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontSize: type.size.body,
    fontWeight: '600',
    color: color.ink,
    backgroundColor: color.white,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
  },
  pillSelected: { backgroundColor: color.blue100 },
  pillText: {
    fontSize: type.size.meta,
    fontWeight: '700',
    color: color.slate500,
  },
  pillTextSelected: { color: color.blue700 },
  previewCard: {
    padding: 14,
    borderRadius: radius.sm,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.lineStrong,
  },
  previewText: {
    fontSize: type.size.bodySm,
    color: color.ink,
    lineHeight: type.size.bodySm * 1.45,
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
  reviewedNote: {
    marginTop: 10,
    fontSize: type.size.meta,
    color: color.slate400,
  },
});

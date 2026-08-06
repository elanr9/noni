// The post editor. Nothing generates when it opens — AI assist is on
// demand only, per field via brief-assist or fill-whole-post via
// ingest-brief. Overlay fields live on brief_segments, not talking points.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { FillSheet } from '../../../components/admin/editor/FillSheet';
import {
  LibraryPickerSheet,
  type LibraryPick,
} from '../../../components/admin/LibraryPickerSheet';
import { HookOptionsField } from '../../../components/admin/editor/HookOptionsField';
import { PointsEditor } from '../../../components/admin/editor/PointsEditor';
import { ReviewSheet } from '../../../components/admin/editor/ReviewSheet';
import { SegmentsSection } from '../../../components/admin/editor/SegmentsSection';
import { TypePicker } from '../../../components/admin/editor/TypePicker';
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

  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);
  const [postTypes, setPostTypes] = useState<PostType[]>([]);
  const [hashtagBank, setHashtagBank] = useState<string[]>([]);
  const [segments, setSegments] = useState<BriefSegment[]>([]);
  const [screenshotUrls, setScreenshotUrls] = useState<Record<string, string>>({});

  const [title, setTitle] = useState('');
  const [postTypeId, setPostTypeId] = useState<string | null>(null);
  const [hookOptions, setHookOptions] = useState<string[]>([]);
  const [chosenHookIndex, setChosenHookIndex] = useState(0);
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
  const [filling, setFilling] = useState(false);
  const [regenBusy, setRegenBusy] = useState<RegenField | null>(null);
  const [regenPointIndex, setRegenPointIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [segBusy, setSegBusy] = useState<string | null>(null);
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
        const [brief, types, segs, { data: brand }, claimIds] = await Promise.all([
          getBrief(id),
          listPostTypes(),
          listBriefSegments(id),
          supabase.from('brand_profiles').select('hashtag_bank').maybeSingle(),
          listApprovedClaimIds(),
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
        setChosenHookIndex(chosen >= 0 ? chosen : 0);
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

  async function save(): Promise<boolean> {
    if (!id) return false;
    setSaving(true);
    try {
      const chosenHook = hookOptions[chosenHookIndex]?.trim() || null;
      await updateBrief(id, {
        title: title.trim() || searchPhrase.trim() || 'Untitled post',
        format:
          currentType?.family === 'photo_carousel' ? 'photo_carousel' : 'video',
        hook: chosenHook,
        hook_options: hookOptions,
        talking_points: points,
        hashtags,
        search_phrase: searchPhrase.trim() || null,
        point_count: points.length,
        target_words: targetWords,
        script,
        caption: caption || null,
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
      hook: hookOptions[chosenHookIndex] ?? '',
      cta,
      caption,
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
        draft: buildRegenPayload(),
        postTypeKey: currentType?.key,
        hookIndex: chosenHookIndex,
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
        setHookOptions((prev) =>
          prev.map((h, i) => (i === chosenHookIndex ? replacement : h)),
        );
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
      const hookNow = hookOptions[chosenHookIndex] ?? '';
      const fieldDiffs: Array<{ field: string; before: string | null; after: string | null }> = [];
      if (snapshot.hook !== hookNow) {
        fieldDiffs.push({ field: 'hook', before: snapshot.hook || null, after: hookNow || null });
      }
      if (snapshot.cta !== cta) {
        fieldDiffs.push({ field: 'cta', before: snapshot.cta || null, after: cta || null });
      }
      if (snapshot.caption !== caption) {
        fieldDiffs.push({ field: 'caption', before: snapshot.caption || null, after: caption || null });
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
    } catch (e) {
      Alert.alert(
        'Could not confirm',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setReviewConfirming(false);
    }
  }

  async function attachScreenshot(segment: BriefSegment) {
    if (!profile || !id) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setSegBusy(segment.id);
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
      setSegBusy(null);
    }
  }

  async function removeScreenshot(segment: BriefSegment) {
    setSegBusy(segment.id);
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
      setSegBusy(null);
    }
  }

  async function toggleShow(segment: BriefSegment, value: boolean) {
    setSegments((prev) =>
      prev.map((s) => (s.id === segment.id ? { ...s, show_on_screen: value } : s)),
    );
    try {
      await updateBriefSegment(segment.id, { show_on_screen: value });
    } catch {
      setSegments((prev) =>
        prev.map((s) =>
          s.id === segment.id ? { ...s, show_on_screen: !value } : s,
        ),
      );
    }
  }

  async function saveOverlayText(segment: BriefSegment, text: string) {
    try {
      await updateBriefSegment(segment.id, { overlay_text: text.trim() || null });
      setSegments((prev) =>
        prev.map((s) =>
          s.id === segment.id ? { ...s, overlay_text: text.trim() || null } : s,
        ),
      );
    } catch (e) {
      Alert.alert(
        'Could not save overlay',
        e instanceof Error ? e.message : 'Try again',
      );
    }
  }

  function handleLibraryPick(pick: LibraryPick) {
    setLibraryVisible(false);
    if (pick.kind === 'example') {
      setExampleUrl(pick.url);
      return;
    }
    // The picker marked the item used already; feed the text straight to
    // the whole-post fill as the query.
    void fillFrom({ query: pick.text });
  }

  function toggleHashtag(tag: string) {
    setHashtags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= 5) return prev;
      return [...prev, tag];
    });
  }

  if (!loaded) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>Loading post…</Text>
      </View>
    );
  }
  if (missing) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>Post not found.</Text>
      </View>
    );
  }

  const chosenHook = hookOptions[chosenHookIndex] ?? '';
  const hookTooLong = wordCount(chosenHook) > HOOK_MAX_WORDS;
  const bankTags = [...new Set([...hashtagBank, ...hashtags])];
  const isCarousel = currentType?.family === 'photo_carousel';

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {killReason ? (
          <View style={styles.killCard}>
            <Text style={styles.killTitle}>Generation killed this slot</Text>
            <Text style={styles.killText}>{killReason}</Text>
            <Text style={styles.killHint}>
              Better empty than padded. Change the phrase or the type and
              fill again, or write it yourself.
            </Text>
          </View>
        ) : null}

        {warnings.length > 0 ? (
          <View style={styles.warnCard}>
            {warnings.map((w) => (
              <Text key={w} style={styles.warnText}>
                {w}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.fillRow}>
          <Button
            size="md"
            variant="primary"
            icon="sparkles"
            block
            disabled={filling}
            onPress={() => setFillVisible(true)}
          >
            {filling ? 'Generating…' : 'Fill with AI'}
          </Button>
        </View>

        <TypePicker
          postTypes={postTypes}
          selectedId={postTypeId}
          onSelect={(t) => setPostTypeId(t.id)}
        />

        <View style={styles.section}>
          <Text style={styles.label}>Title</Text>
          <View style={[styles.fieldRing, focused === 'title' && ringFocus]}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              onFocus={() => setFocused('title')}
              onBlur={() => setFocused(null)}
              style={styles.field}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Search phrase</Text>
            <Button
              size="sm"
              variant="tint"
              disabled={regenBusy !== null}
              onPress={() => void regenerate('search_phrase')}
            >
              {regenBusy === 'search_phrase' ? 'Regenerating…' : 'Regenerate'}
            </Button>
          </View>
          <View style={[styles.fieldRing, focused === 'phrase' && ringFocus]}>
            <TextInput
              value={searchPhrase}
              onChangeText={setSearchPhrase}
              onFocus={() => setFocused('phrase')}
              onBlur={() => setFocused(null)}
              placeholder="Search phrase this answers"
              placeholderTextColor={color.slate400}
              autoCapitalize="none"
              style={styles.field}
            />
          </View>
        </View>

        <HookOptionsField
          options={hookOptions}
          chosenIndex={chosenHookIndex}
          stale={hookStale}
          busy={regenBusy === 'hook'}
          onChoose={(i) => setChosenHookIndex(i)}
          onChangeOption={(i, text) =>
            setHookOptions((prev) => prev.map((h, j) => (j === i ? text : h)))
          }
          onRegenerate={() => void regenerate('hook')}
        />
        {hookTooLong ? (
          <Text style={styles.inlineWarn}>
            The chosen hook is {wordCount(chosenHook)} words. Cap is{' '}
            {HOOK_MAX_WORDS}.
          </Text>
        ) : null}

        <PointsEditor
          points={points}
          minPoints={currentType?.min_points ?? null}
          maxPoints={currentType?.max_points ?? null}
          busyAll={regenBusy === 'talking_points'}
          busyIndex={regenBusy === 'talking_point' ? regenPointIndex : null}
          onChange={setPoints}
          onRegenerateAll={() => void regenerate('talking_points')}
          onRegeneratePoint={(i) => void regenerate('talking_point', i)}
        />

        <View style={styles.section}>
          <Text style={styles.label}>Plug sentence (CTA)</Text>
          <Text style={styles.hint}>
            Rides inside the FV talking point as one sentence. Never its own
            point or clip.
          </Text>
          <View style={[styles.fieldRing, focused === 'cta' && ringFocus]}>
            <TextInput
              multiline
              value={cta}
              onChangeText={setCta}
              onFocus={() => setFocused('cta')}
              onBlur={() => setFocused(null)}
              style={[styles.field, styles.multiline]}
            />
          </View>
        </View>

        {isCarousel ? (
          <View style={styles.section}>
            <Text style={styles.label}>Slide copy</Text>
            <View style={[styles.fieldRing, focused === 'script' && ringFocus]}>
              <TextInput
                multiline
                value={script ?? ''}
                onChangeText={(text) => setScript(text || null)}
                onFocus={() => setFocused('script')}
                onBlur={() => setFocused(null)}
                style={[styles.field, styles.scriptField]}
              />
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Caption</Text>
            <Button
              size="sm"
              variant="tint"
              disabled={regenBusy !== null}
              onPress={() => void regenerate('caption')}
            >
              {regenBusy === 'caption' ? 'Regenerating…' : 'Regenerate'}
            </Button>
          </View>
          <View style={[styles.fieldRing, focused === 'caption' && ringFocus]}>
            <TextInput
              multiline
              value={caption}
              onChangeText={setCaption}
              onFocus={() => setFocused('caption')}
              onBlur={() => setFocused(null)}
              style={[styles.field, styles.multiline]}
            />
          </View>
          <Text
            style={[
              styles.helper,
              caption.length > CAPTION_MAX && styles.helperDanger,
            ]}
          >
            {caption.length} of {CAPTION_MAX} characters
          </Text>
        </View>

        <View style={styles.section}>
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
                    style={[styles.pillText, selected && styles.pillTextSelected]}
                  >
                    {tag}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Example</Text>
          {exampleUrl ? (
            <PressableScale
              accessibilityRole="link"
              onPress={() => void Linking.openURL(exampleUrl)}
            >
              <Text style={styles.exampleLink} numberOfLines={1}>
                {exampleUrl}
              </Text>
            </PressableScale>
          ) : (
            <Text style={styles.hint}>No example attached.</Text>
          )}
          <Button
            size="sm"
            variant="tint"
            disabled={filling}
            onPress={() => setLibraryVisible(true)}
          >
            Choose from Library
          </Button>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Why this works</Text>
          <View style={[styles.fieldRing, focused === 'why' && ringFocus]}>
            <TextInput
              multiline
              value={whyItWorks}
              onChangeText={setWhyItWorks}
              onFocus={() => setFocused('why')}
              onBlur={() => setFocused(null)}
              style={[styles.field, styles.multiline]}
            />
          </View>
        </View>

        <SegmentsSection
          segments={segments}
          screenshotUrls={screenshotUrls}
          busySegmentId={segBusy}
          onSaveOverlayText={(s, text) => void saveOverlayText(s, text)}
          onToggleShow={(s, value) => void toggleShow(s, value)}
          onAttachScreenshot={(s) => void attachScreenshot(s)}
          onRemoveScreenshot={(s) => void removeScreenshot(s)}
        />

        <View style={styles.footerRow}>
          <View style={styles.footerButton}>
            <Button
              size="lg"
              variant="tint"
              block
              disabled={saving || reviewRunning || regenBusy !== null}
              onPress={() => void runReview()}
            >
              {reviewedAt ? 'Review again' : 'Review'}
            </Button>
          </View>
          <View style={styles.footerButton}>
            <Button
              size="lg"
              variant="primary"
              block
              disabled={saving}
              onPress={() => void save()}
            >
              {saving ? 'Saving…' : savedFlash ? 'Saved' : 'Save post'}
            </Button>
          </View>
        </View>
        {reviewedAt ? (
          <Text style={styles.reviewedNote}>
            Reviewed {new Date(reviewedAt).toLocaleDateString()}. Later edits
            keep it complete; review again if it changed a lot.
          </Text>
        ) : null}
      </ScrollView>

      <FillSheet
        visible={fillVisible}
        searchPhrase={searchPhrase}
        busy={filling}
        onClose={() => setFillVisible(false)}
        onFillFromPhrase={() => void fillFrom({ query: searchPhrase })}
        onFillFromLink={(url, context) => void fillFrom({ url, context })}
      />

      <LibraryPickerSheet
        visible={libraryVisible}
        postTypeId={postTypeId}
        onClose={() => setLibraryVisible(false)}
        onPick={handleLibraryPick}
      />

      <ReviewSheet
        visible={reviewVisible}
        running={reviewRunning}
        confirming={reviewConfirming}
        result={reviewResult}
        appliedIndexes={appliedIndexes}
        onApply={applySuggestion}
        onClose={() => setReviewVisible(false)}
        onConfirm={() => void confirmReview()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
  content: { padding: 20, paddingBottom: 60 },
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
  killHint: {
    fontSize: type.size.meta,
    color: color.slate500,
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
  fillRow: { marginBottom: 16 },
  section: { gap: 8, marginBottom: 16 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  },
  inlineWarn: {
    marginTop: -10,
    marginBottom: 16,
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
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  scriptField: {
    minHeight: 140,
    textAlignVertical: 'top',
    fontWeight: '400',
    lineHeight: type.size.body * type.leading.body,
    color: color.slate500,
  },
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
  exampleLink: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.blue700,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  footerButton: { flex: 1 },
  reviewedNote: {
    marginTop: 10,
    fontSize: type.size.meta,
    color: color.slate400,
  },
});

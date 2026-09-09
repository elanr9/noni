// Single-page post editor. Every field sits on one scroll, filled posts
// open as a read-only summary. Nothing generates on open — AI assist is on
// demand. Screenshots live on brief_segments keyed by talking_point_index.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CameraRollSheet,
  type MediaPick,
} from '../../../components/admin/editor/CameraRollSheet';
import { MediaThumb } from '../../../components/ui/MediaThumb';
import {
  copySegmentMediaToLibrary,
  listMediaLibrary,
  placeLibraryItemOnSegment,
  placeRemoteImageOnSegment,
  uploadSegmentMedia,
  type MediaLibraryItem,
} from '../../../lib/media-library-api';
import { CaptionStep } from '../../../components/admin/editor/CaptionStep';
import { CtaCard } from '../../../components/admin/editor/CtaCard';
import { SubtitlesCard } from '../../../components/admin/editor/SubtitlesCard';
import {
  OverlayEditor,
  type OverlayEditorMode,
  type OverlaySavePatch,
} from '../../../components/admin/editor/OverlayEditor';
import {
  newOverlayBox,
  parseOverlayBoxes,
  parseOverlayThemeColor,
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
import {
  KindOfPostCard,
  rankTypeSuggestions,
} from '../../../components/admin/editor/KindOfPostCard';
import { SearchPhraseCard } from '../../../components/admin/editor/SearchPhraseCard';
import { StartPostCard } from '../../../components/admin/editor/StartPostCard';
import { TitleCard } from '../../../components/admin/editor/TitleCard';
import {
  PushHeader,
  SectionLabel,
  SkeletonCard,
  SkeletonLine,
} from '../../../components/admin/shared';
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
  clearBrief,
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
  type BriefReviewEventInput,
  type BriefReviewResult,
  type BriefSegment,
  type CampaignBriefItem,
  type NoniLibraryGroup,
  type PointMedia,
  type PostType,
  type PostTypeShape,
  type RegenDraftPayload,
  type RegenField,
  type TalkingPoint,
} from '../../../lib/briefs-api';
import {
  applyPointMedia,
  ensureSlot,
  fillPostSlot,
  saveTypedIdea,
  seedOverlayBoxes,
  type FillSource,
} from '../../../lib/post-fill';
import { supabase } from '../../../lib/supabase';
import { color, radius, radiusAdmin, space, type } from '../../../theme/tokens';

/** The fields as they stood when review opened, for edit diffs and the ban list. */
type ReviewSnapshot = {
  hook: string;
  cta: string;
  caption: string;
  searchPhrase: string;
  points: { id: string; text: string | null; edited_by_admin: boolean }[];
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

const FILL_STATUS_LABELS = [
  'Writing the script',
  'Placing screenshots from your library',
  'Setting up overlays and subtitles',
  'Almost there',
] as const;

/** Rotates through the fill status lines while a fill runs. */
function useFillStatusLabel(filling: boolean): string | null {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!filling) return;
    const timer = setInterval(
      () => setStep((s) => Math.min(s + 1, FILL_STATUS_LABELS.length - 1)),
      1800,
    );
    return () => {
      clearInterval(timer);
      setStep(0);
    };
  }, [filling]);
  return filling ? FILL_STATUS_LABELS[step] : null;
}

export default function PostEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  /** Completed posts open as one read-only page; Edit flips it to inputs. */
  const [summaryMode, setSummaryMode] = useState<'view' | 'edit' | null>(null);
  /** reviewed_at from the row; null means the post never counted as complete. */
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);
  const [postNumber, setPostNumber] = useState<number | null>(null);
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [postTypes, setPostTypes] = useState<PostType[]>([]);
  const [hashtagBank, setHashtagBank] = useState<string[]>([]);
  const [segments, setSegments] = useState<BriefSegment[]>([]);
  const [screenshotUrls, setScreenshotUrls] = useState<Record<string, string>>({});
  const [noniLibrary, setNoniLibrary] = useState<NoniLibraryGroup[]>([]);
  const [mediaLibrary, setMediaLibrary] = useState<MediaLibraryItem[]>([]);

  /* Shared library and Company Brain shots load once so the picker opens instantly. */
  useEffect(() => {
    if (!profile?.company_id) return;
    void listNoniLibrary(profile.company_id)
      .then(setNoniLibrary)
      .catch(() => setNoniLibrary([]));
    void listMediaLibrary(profile.company_id)
      .then(setMediaLibrary)
      .catch(() => setMediaLibrary([]));
  }, [profile?.company_id]);

  const [title, setTitle] = useState('');
  /** The type on the row or picked here; null on a fresh stamped row. */
  const [pickedTypeId, setPostTypeId] = useState<string | null>(null);
  /** The lane the row was stamped into; the type may still be unchosen. */
  const [briefFormat, setBriefFormat] = useState<'video' | 'photo_carousel'>('video');
  const [hookOptions, setHookOptions] = useState<string[]>([]);
  const [chosenHookIndex, setChosenHookIndex] = useState(0);
  const [useCustomHook, setUseCustomHook] = useState(false);
  const [customHook, setCustomHook] = useState('');
  const [points, setPoints] = useState<TalkingPoint[]>([]);
  const [cta, setCta] = useState('');
  const [subtitles, setSubtitles] = useState(false);
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
  const [themeColor, setThemeColor] = useState<string | null>(null);

  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [weekPosts, setWeekPosts] = useState<CampaignBriefItem[]>([]);
  /** target: pick the format to port this post into. source: pick the post
   * this empty slot is built from. */
  const [portSheet, setPortSheet] = useState<'target' | 'source' | null>(null);
  const [portBusyId, setPortBusyId] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [filling, setFilling] = useState(false);
  const fillStatusLabel = useFillStatusLabel(filling);
  /** Bumped after a fill so the screen re-reads the row it just wrote. */
  const [reloadNonce, setReloadNonce] = useState(0);
  /** The manager chose to skip AI on this empty post; the form shows instead. */
  const [startedBlank, setStartedBlank] = useState(false);
  const [placedNote, setPlacedNote] = useState<string | null>(null);
  /** Screenshots a regenerate picked from the feature library; the next save places them. */
  const pendingPointMedia = useRef<(PointMedia | null)[]>([]);

  const pickedType = postTypes.find((t) => t.id === pickedTypeId) ?? null;
  const lane: 'video' | 'photo_carousel' =
    pickedType === null
      ? briefFormat
      : pickedType.family === 'photo_carousel'
        ? 'photo_carousel'
        : 'video';
  const typeSuggestions = useMemo(
    () => rankTypeSuggestions(postTypes, lane, weekPosts),
    [postTypes, lane, weekPosts],
  );
  // A typeless row opens with the kind the week lacks most preselected.
  // The pick is written on save or when the manager changes it.
  const postTypeId =
    pickedTypeId ??
    (summaryMode === null ? (typeSuggestions[0]?.type.id ?? null) : null);
  const currentType = useMemo(
    () => postTypes.find((t) => t.id === postTypeId) ?? null,
    [postTypes, postTypeId],
  );
  const family: 'video' | 'photo_carousel' =
    currentType === null
      ? briefFormat
      : currentType.family === 'photo_carousel'
        ? 'photo_carousel'
        : 'video';
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
          supabase.from('companies').select('slug, name, settings').maybeSingle(),
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
        setThemeColor(parseOverlayThemeColor(company?.settings));

        const options = parseHookOptions(brief.hook_options);
        const chosen = brief.hook ? options.indexOf(brief.hook) : 0;
        const briefPoints = parseTalkingPoints(brief.talking_points);
        setTitle(brief.title);
        setPostTypeId(brief.post_type_id);
        setBriefFormat(brief.format === 'photo_carousel' ? 'photo_carousel' : 'video');
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
        setSubtitles(brief.subtitles);
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

        // A finished post opens as one read-only page instead of the form.
        // Slideshows never require a hook or CTA.
        const rowType = types.find((t) => t.id === brief.post_type_id) ?? null;
        const isSlideshow = rowType?.family === 'photo_carousel';
        const complete =
          (isSlideshow || Boolean(brief.hook?.trim())) &&
          briefPoints.length >= (rowType?.min_points ?? 1) &&
          Boolean(brief.caption?.trim());
        if (complete) setSummaryMode('view');

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

  function chooseType(next: PostType) {
    if (next.id === pickedTypeId) return;
    setPostTypeId(next.id);
    if (id) {
      void updateBrief(id, { post_type_id: next.id }).catch(() => undefined);
    }
  }

  // Auto-draft the caption once the script reaches the type's minimum
  // length and nothing is written yet, once per open.
  const autoCaptionRan = useRef(false);
  useEffect(() => {
    if (summaryMode !== null || !loaded) return;
    if (autoCaptionRan.current || caption.trim() || regenBusy !== null) return;
    if (points.length < (currentType?.min_points ?? 1)) return;
    autoCaptionRan.current = true;
    void regenerate('caption');
    // Fires when the script fills in; regenerate reads the draft fields fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length, caption, regenBusy, summaryMode, loaded]);

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
          pendingPointMedia.current = result.point_media;
          if (family === 'photo_carousel') slideRegenPending.current = true;
          break;
        case 'talking_point': {
          setPoints((prev) =>
            prev.map((p, i) => (i === result.index ? result.talking_point : p)),
          );
          if (result.point_media) {
            const sparse: (PointMedia | null)[] = [...pendingPointMedia.current];
            sparse[result.index] = result.point_media;
            pendingPointMedia.current = sparse;
          }
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
        subtitles: family === 'video' && subtitles,
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
        let rows = await seedOverlayBoxes(
          await assistDeriveSegments(id, pendingOverlayLabels ?? undefined),
          themeColor,
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
                      newOverlayBox({
                        id: `slide-${row.talking_point_index}-box-0`,
                        text,
                        style: themeColor ? 'theme' : 'classic',
                        themeColor,
                      }),
                    ]
                  : [],
              );
              await updateBriefSegment(row.id, patch);
              return { ...row, ...patch } as BriefSegment;
            }),
          );
        }
        rows = await placePendingPointMedia(rows);
        setSegments(rows);
        refreshScreenshotUrls(rows);
        setPendingOverlayLabels(null);
      } else if (pendingPointMedia.current.some(Boolean)) {
        const rows = await placePendingPointMedia(segments);
        setSegments(rows);
        refreshScreenshotUrls(rows);
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

  /** Writes regenerate-picked feature screenshots onto the rows, then re-reads them. */
  async function placePendingPointMedia(rows: BriefSegment[]): Promise<BriefSegment[]> {
    const pointMedia = pendingPointMedia.current;
    if (!profile || !id || !pointMedia.some(Boolean)) return rows;
    pendingPointMedia.current = [];
    const placed = await applyPointMedia({
      companyId: profile.company_id,
      briefId: id,
      rows,
      pointMedia,
    });
    if (placed === 0) return rows;
    return listBriefSegments(id);
  }

  function flashPlacedNote(count: number) {
    if (count === 0) return;
    setPlacedNote(
      `Placed ${count} ${count === 1 ? 'screenshot' : 'screenshots'} from your feature library`,
    );
    setTimeout(() => setPlacedNote(null), 3000);
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
        companyId: profile.company_id,
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
    if (!id || !currentType || !profile) return;
    setPortBusyId(busyKey);
    setFilling(true);
    try {
      const result = await fillPostSlot({
        briefId: id,
        postTypeId: currentType.id,
        postTypeKey: currentType.key,
        family,
        source,
        companyId: profile.company_id,
      });
      if (result.kind === 'kill') {
        Alert.alert('Generation refused', result.kill_reason);
        return;
      }
      if (source.kind === 'idea') {
        void saveTypedIdea({
          companyId: profile.company_id,
          userId: profile.id,
          text: source.text,
          briefId: id,
        }).catch(() => undefined);
      }
      setPortSheet(null);
      setLibraryOpen(false);
      flashPlacedNote(result.placedScreenshots);
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
    if (pick.kind === 'feature') {
      void fillThisSlot({ kind: 'feature', featureId: pick.featureId }, pick.featureId);
      return;
    }
    void fillThisSlot({ kind: 'idea', text: pick.text }, pick.text);
  }

  function startBlank() {
    if (family === 'video') setSubtitles(true);
    setStartedBlank(true);
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

  // --- AI review. On demand, not a background check: on demand, never blocks,
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
      const fieldDiffs: { field: string; before: string | null; after: string | null }[] = [];
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

  /** A sheet pick lands here: device upload, library copy, or Company Brain fetch. */
  /** The segment for a point, deriving clips first when the point has none yet. */
  async function resolveSegmentForPoint(
    pointIndex: number,
  ): Promise<BriefSegment | undefined> {
    const existing = segmentForPointIndex(pointIndex);
    if (existing || !id) return existing;
    const saved = await save();
    if (!saved) return undefined;
    const rows = await seedOverlayBoxes(
      await assistDeriveSegments(id, pendingOverlayLabels ?? undefined),
      themeColor,
    );
    setSegments(rows);
    refreshScreenshotUrls(rows);
    setPendingOverlayLabels(null);
    return rows.find(
      (s) =>
        (s.kind === 'point' || s.kind === 'slide') &&
        s.talking_point_index === pointIndex,
    );
  }

  async function uploadShotForPoint(pointIndex: number, pick: MediaPick) {
    if (!profile || !id) return;
    const segment = await resolveSegmentForPoint(pointIndex);
    if (!segment) {
      Alert.alert('Save the post first', 'This talking point has no clip yet.');
      return;
    }
    setShotBusyIndex(pointIndex);
    try {
      const target = { companyId: profile.company_id, briefId: id, segmentId: segment.id };
      let path: string;
      if (pick.source === 'library') {
        path = await placeLibraryItemOnSegment({ ...target, item: pick.item });
      } else if (pick.source === 'noni') {
        path = await placeRemoteImageOnSegment({ ...target, url: pick.url });
      } else {
        path = await uploadSegmentMedia({ ...target, media: pick.media });
        if (pick.saveToLibrary) {
          void copySegmentMediaToLibrary({
            companyId: profile.company_id,
            createdBy: profile.id,
            segmentPath: path,
            media: pick.media,
          })
            .then((item) => setMediaLibrary((prev) => [item, ...prev]))
            .catch(() => undefined);
        }
      }
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

  /** Footer action. Video posts save then open the AI review; slideshows
   * save and finish, there is no spoken script to review. */
  async function finishPost() {
    if (cta.trim() && points.length > 0 && !points.some((p) => p.is_product)) {
      setPoints((prev) =>
        prev.map((p, i) => ({ ...p, is_product: i === 0 })),
      );
    }
    await ensureSegmentsDerived();
    if (family === 'photo_carousel') {
      await confirmSlideshow();
      return;
    }
    const ok = await save();
    if (ok) void runReview();
  }

  function goBack() {
    if (summaryMode === 'edit') {
      setSummaryMode('view');
      return;
    }
    router.back();
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

  /** Wipe this post back to an empty slot in its week, then leave. */
  function confirmDeletePost() {
    Alert.alert(
      'Delete this post?',
      'The slot stays in the week but everything in it is cleared. Clips and slides go too.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void deletePost(),
        },
      ],
    );
  }

  async function deletePost() {
    if (!id) return;
    setSaving(true);
    try {
      await clearBrief(id);
      router.back();
    } catch (e) {
      Alert.alert('Delete failed', e instanceof Error ? e.message : 'Try again');
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <View style={styles.loadingShell}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingHeader}>
          <SkeletonLine height={36} width={36} radius={18} />
          <SkeletonLine height={16} width={150} />
        </View>
        <SkeletonCard style={styles.loadingMedia} radius={radiusAdmin.xl} />
        <SkeletonCard height={52} radius={radiusAdmin.lg} />
        <SkeletonCard height={52} radius={radiusAdmin.lg} />
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
  const typeLabel = currentType?.label ?? 'Post';
  const showStartCard =
    summaryMode === null &&
    points.length === 0 &&
    !startedBlank &&
    killReason === null;
  /** A killed empty slot shows only the kill card until the manager starts blank. */
  const hideForm =
    showStartCard || (killReason !== null && points.length === 0 && !startedBlank);

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
                  {saving ? 'Saving…' : savedFlash ? 'Saved' : 'Save'}
                </Text>
              </PressableScale>
            )
          }
        />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
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
                        <MediaThumb uri={thumb} style={styles.summaryThumb} />
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
        ) : (
          <View style={styles.summaryStack}>
            {placedNote ? (
              <View style={styles.placedCard}>
                <Text style={styles.placedText}>{placedNote}</Text>
              </View>
            ) : null}
            {killReason ? (
              <View style={styles.killCard}>
                <Text style={styles.killTitle}>Generation killed this slot</Text>
                <Text style={styles.killText}>{killReason}</Text>
                {points.length === 0 && !startedBlank ? (
                  <Button size="sm" variant="ghost" onPress={startBlank}>
                    Start blank
                  </Button>
                ) : null}
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
            {summaryMode === null && typeSuggestions.length > 0 ? (
              <>
                <SectionLabel>Kind of post</SectionLabel>
                <Text style={styles.summaryHint}>
                  Suggested from what the week still lacks. Change it if you have a better idea.
                </Text>
                <KindOfPostCard
                  suggestions={typeSuggestions}
                  family={family}
                  selectedId={postTypeId}
                  onSelect={chooseType}
                />
              </>
            ) : null}
            {showStartCard ? (
              <StartPostCard
                family={family}
                typeLabel={typeLabel}
                busy={filling}
                busyLabel={fillStatusLabel}
                onWriteFromIdea={(text) =>
                  void fillThisSlot({ kind: 'idea', text }, 'idea')
                }
                onOpenLibrary={() => setLibraryOpen(true)}
                onStartBlank={startBlank}
                onRewriteFromThisWeek={
                  portSourceOptions.length > 0
                    ? () => setPortSheet('source')
                    : undefined
                }
              />
            ) : null}
            {hideForm ? null : (
            <>
            <SectionLabel>Title</SectionLabel>
            <TitleCard value={title} onChange={setTitle} />
            <Text style={styles.summaryHint}>
              Skip the title and the grid shows the hook instead.
            </Text>
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
              greenScreenForIndex={(i) =>
                segmentForPointIndex(i)?.layout === 'green_screen'
              }
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
                <SectionLabel>Subtitles</SectionLabel>
                <SubtitlesCard value={subtitles} onChange={setSubtitles} />
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
            </>
            )}
          </View>
        )}
        {points.length > 0 || killReason !== null || reviewedAt !== null ? (
          <View style={styles.deleteWrap}>
            <Button
              size="md"
              variant="danger"
              block
              disabled={saving || reviewRunning || reviewConfirming}
              onPress={confirmDeletePost}
            >
              Delete post
            </Button>
            <Text style={styles.deleteHint}>Leaves an empty slot in this week.</Text>
          </View>
        ) : null}
      </ScrollView>

      {summaryMode === null && !showStartCard ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <Button
            size="lg"
            variant="primary"
            block
            disabled={saving || reviewRunning || reviewConfirming || points.length === 0}
            onPress={() => void finishPost()}
          >
            {reviewConfirming
              ? 'Saving…'
              : family === 'photo_carousel'
                ? 'Save post'
                : 'Review and save'}
          </Button>
        </View>
      ) : null}

      {summaryMode === 'view' && reviewedAt === null ? (
        <View
          style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}
        >
          <View style={styles.flex}>
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
                onPress={() => void runReview()}
              >
                Run final review
              </Button>
            )}
          </View>
        </View>
      ) : null}

      <ReviewSheet
        visible={reviewVisible}
        running={reviewRunning}
        confirming={reviewConfirming}
        result={reviewResult}
        appliedIndexes={appliedIndexes}
        onApply={applySuggestion}
        onClose={() => setReviewVisible(false)}
        onConfirm={() => void confirmReview()}
        confirmLabel="Save post"
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
          layout={
            overlaySegment?.layout === 'green_screen' ? 'green_screen' : 'standard'
          }
          layoutSelectable={family !== 'photo_carousel'}
          boxes={parseOverlayBoxes(overlaySegment?.overlay_style, {
            text: overlaySegment?.overlay_text,
            textY: overlaySegment?.text_y,
          })}
          themeColor={themeColor}
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

      {profile ? (
        <CameraRollSheet
          visible={shotPickerIndex !== null}
          companyId={profile.company_id}
          userId={profile.id}
          allowRecordings={family === 'video'}
          library={mediaLibrary}
          onLibraryChange={setMediaLibrary}
          noniLibrary={noniLibrary}
          onClose={() => setShotPickerIndex(null)}
          onPick={(pick) => {
            const index = shotPickerIndex;
            setShotPickerIndex(null);
            if (index !== null) void uploadShotForPoint(index, pick);
          }}
        />
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 24 },
  loadingShell: {
    flex: 1,
    backgroundColor: color.offWhite,
    paddingHorizontal: space[4],
    paddingTop: space[11] + space[8],
    gap: space[3],
  },
  loadingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  loadingMedia: {
    flex: 1,
  },
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
  summaryStack: {
    gap: 12,
  },
  deleteWrap: {
    marginTop: 28,
    gap: 8,
    alignItems: 'center',
  },
  deleteHint: {
    fontSize: 12,
    color: color.slate500,
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
  placedCard: {
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: color.greenSoft,
  },
  placedText: {
    fontSize: type.size.meta,
    fontWeight: '600',
    color: color.green,
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

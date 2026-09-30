import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApprovedOverlay } from '../../../components/admin/review/ApprovedOverlay';
import {
  ManagerVideoEditor,
  type ManagerClip,
} from '../../../components/admin/review/ManagerVideoEditor';
import { ReelSurface, type ReelClip } from '../../../components/admin/review/ReelSurface';
import {
  ReviewEditMode,
  type EditTarget,
} from '../../../components/admin/review/ReviewEditMode';
import { ReviewMetaOverlay } from '../../../components/admin/review/ReviewMetaOverlay';
import { ReviewTopBar } from '../../../components/admin/review/ReviewTopBar';
import {
  RevisionMode,
  type RevisionSection,
} from '../../../components/admin/review/RevisionMode';
import { SentConfirmation } from '../../../components/admin/review/SentConfirmation';
import { SlideshowSurface } from '../../../components/admin/review/SlideshowSurface';
import { SkeletonCard, SkeletonLine } from '../../../components/admin/shared';
import { SoftToast } from '../../../components/states';
import { Button } from '../../../components/ui/Button';
import {
  getSubmissionRenderState,
  latestSubmissionsByAssignment,
  listAssignmentQueue,
  rerenderSubmission,
  restartRender,
  reviewAssignment,
  signedOriginalSlideUrl,
  signedVideoUrl,
  type AssignmentQueueItem,
  type Submission,
} from '../../../lib/admin-api';
import {
  scriptToLines,
  slidesFromScript,
  toAssignmentQueueRow,
} from '../../../lib/admin-queue-map';
import {
  DEFAULT_SUBTITLES_Y,
  listBriefSegments,
  listPostTypes,
  parseHookOptions,
  parseTalkingPoints,
  signedScreenshotUrl,
  type Brief,
  type BriefSegment,
} from '../../../lib/briefs-api';
import { parseOverlayBoxes, type OverlayBox } from '../../../lib/overlay-boxes';
import { parseNotes } from '../../../lib/post-event-labels';
import { getCreatorAccount } from '../../../lib/creator-accounts-api';
import { useAuth } from '../../../lib/auth';
import type { MockQueueItem } from '../../../lib/admin-review-types';
import { asSlideAspect, probeDurationMs } from '../../../lib/submissions';
import type { Json } from '../../../lib/types';
import { isVideoEditorAvailable } from '../../../modules/video-editor';
import { borderWidth, color, type } from '../../../theme/tokens';

type ReviewItem = {
  assignment: AssignmentQueueItem;
  row: MockQueueItem;
  submission: Submission | null;
};

/** Hook / Clip n / Outro for Reels, Cover / Slide n / Close for Slideshows. */
function sectionLabel(index: number, count: number, isReel: boolean): string {
  if (index === 0) return isReel ? 'Hook' : 'Cover';
  if (index === count - 1 && count >= 3) return isReel ? 'Outro' : 'Close';
  return `${isReel ? 'Clip' : 'Slide'} ${index}`;
}

/** Uploaded clip lengths in ms, slot order, from the render manifest; 0 when unknown. */
function timelineSourceDurationsMs(timeline: Json | null): number[] {
  if (timeline === null || typeof timeline !== 'object' || Array.isArray(timeline)) return [];
  const clips = (timeline as { clips?: unknown }).clips;
  if (!Array.isArray(clips)) return [];
  return clips.map((c) => {
    const row = c as { source_duration_ms?: unknown; duration_ms?: unknown };
    const ms = typeof row.source_duration_ms === 'number' ? row.source_duration_ms : row.duration_ms;
    return typeof ms === 'number' && ms > 0 ? ms : 0;
  });
}

const FALLBACK_CLIP_MS = 8000;
/** The creator's editor is a native iOS module; elsewhere the reduced edit mode stays. */
const FULL_EDITOR = Platform.OS === 'ios' && isVideoEditorAvailable();

/** Seconds per stitched clip, in order, from the submission's render manifest. */
function timelineClipDurations(timeline: Json | null): number[] {
  if (timeline === null || typeof timeline !== 'object' || Array.isArray(timeline)) return [];
  const clips = (timeline as { clips?: unknown }).clips;
  if (!Array.isArray(clips)) return [];
  return clips.flatMap((c) => {
    const ms = (c as { duration_ms?: unknown }).duration_ms;
    return typeof ms === 'number' && ms > 0 ? [ms / 1000] : [];
  });
}

/** Index of the stitched clip playing at `positionSec`. */
function clipIndexAt(clips: ReelClip[], positionSec: number): number {
  let elapsed = 0;
  for (let i = 0; i < clips.length; i += 1) {
    elapsed += clips[i]?.durationSec ?? 0;
    if (positionSec < elapsed) return i;
  }
  return Math.max(clips.length - 1, 0);
}

/** Seconds into the stitched edit where clip `index` starts. */
function clipStartSec(clips: ReelClip[], index: number): number {
  return clips.slice(0, index).reduce((sum, c) => sum + c.durationSec, 0);
}

/** One revision section per recorded clip, mirroring the creator's recording
 * plan: hook, one per talking point, then the CTA. Clips are matched to
 * segments by the slot index in their storage path (`draft-{slot}-…`). */
function clipSectionsFromSegments(
  brief: Brief,
  segments: BriefSegment[],
  segmentPaths: string[],
  clipUris: string[],
): RevisionSection[] {
  const spoken = segments
    .filter((s) => s.kind !== 'slide')
    .sort((a, b) => a.slot_index - b.slot_index);
  if (spoken.length === 0 || segmentPaths.length === 0) return [];
  const talkingPoints = parseTalkingPoints(brief.talking_points);
  const hookLine = brief.hook?.trim() || parseHookOptions(brief.hook_options)[0]?.trim() || '';
  const ctaLine = brief.cta?.trim() || '';
  const clipFor = (slot: number, fallbackIndex: number): string | null => {
    const byPath = segmentPaths.findIndex((p) => /\/draft-(\d+)-/.exec(p)?.[1] === String(slot));
    const index = byPath >= 0 ? byPath : fallbackIndex;
    return clipUris[index] || null;
  };
  let pointNumber = 0;
  const sections: RevisionSection[] = [];
  spoken.forEach((s, i) => {
    const clipUri = clipFor(s.slot_index, i);
    if (s.kind === 'outro') {
      if (clipUri === null) return;
      sections.push({ key: `segment-${s.slot_index}`, label: 'Outro', text: ctaLine, clipUri });
      return;
    }
    if (s.kind === 'hook') {
      sections.push({
        key: `segment-${s.slot_index}`,
        label: 'Hook',
        text: hookLine || s.overlay_text?.trim() || '',
        clipUri,
      });
      return;
    }
    pointNumber += 1;
    const point = talkingPoints[s.talking_point_index ?? pointNumber - 1];
    sections.push({
      key: `segment-${s.slot_index}`,
      label: `Clip ${pointNumber}`,
      text: point?.text?.trim() || s.overlay_text?.trim() || '',
      clipUri,
    });
  });
  return sections;
}

export default function ReviewScreen() {
  const { id, creator, brief } = useLocalSearchParams<{
    id: string;
    creator?: string;
    brief?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();

  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [index, setIndex] = useState(0);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [slideIndex, setSlideIndex] = useState(0);
  const [briefSegments, setBriefSegments] = useState<BriefSegment[]>([]);
  /** Signed URLs for the creator's submitted slide photos, slot order. */
  const [slidePhotos, setSlidePhotos] = useState<string[]>([]);
  /** Originals behind baked slides, for the edit stage. */
  const [slideOriginals, setSlideOriginals] = useState<string[]>([]);
  /** Signed URLs for the creator's raw clips, slot order. Revision mode only. */
  const [clipUris, setClipUris] = useState<string[]>([]);
  /** Uploaded clip lengths in ms, slot order, for the manager's editor. */
  const [clipDurationsMs, setClipDurationsMs] = useState<number[]>([]);
  /** Signed URLs for admin inset pictures, keyed by segment id. */
  const [slideInsetUrls, setSlideInsetUrls] = useState<Record<string, string>>({});
  const [typeLabels, setTypeLabels] = useState<Map<string, string>>(new Map());
  const [handle, setHandle] = useState<string | null>(null);

  const [revisionVisible, setRevisionVisible] = useState(false);
  const [approvedVisible, setApprovedVisible] = useState(false);
  const [sentVisible, setSentVisible] = useState(false);

  const [editVisible, setEditVisible] = useState(false);
  const [editIndex, setEditIndex] = useState(0);
  const [subtitlesY, setSubtitlesY] = useState(DEFAULT_SUBTITLES_Y);
  /** Submission whose re-render the manager asked for; gates Approve on slideshows too. */
  const [rerenderPending, setRerenderPending] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  /** Signed URLs by assignment id, so the next item starts instantly. */
  const urlCache = useRef(new Map<string, string>());

  const signedUrlFor = useCallback(async (item: ReviewItem): Promise<string | null> => {
    if (item.row.format !== 'video' || !item.submission) return null;
    // The finished edit is what gets reviewed. Until it is ready (or when it
    // failed) the first raw clip plays so the footage is still watchable.
    const ready = item.submission.render_status === 'ready';
    const path = ready
      ? item.submission.video_path
      : item.submission.segment_paths?.[0] ?? item.submission.video_path;
    if (!path) return null;
    const cacheKey = `${item.assignment.id}:${ready ? 'edit' : 'raw'}`;
    const cached = urlCache.current.get(cacheKey);
    if (cached !== undefined) return cached;
    const url = await signedVideoUrl(path);
    urlCache.current.set(cacheKey, url);
    return url;
  }, []);

  // The `type` in the bottom scrim's `type · age` line.
  useEffect(() => {
    let cancelled = false;
    void listPostTypes()
      .then((rows) => {
        if (!cancelled) setTypeLabels(new Map(rows.map((r) => [r.id, r.label])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const all = await listAssignmentQueue();
        const filtered = all.filter(
          (a) =>
            (creator === undefined || a.creator_id === creator) &&
            (brief === undefined || a.brief_id === brief),
        );
        const subs = await latestSubmissionsByAssignment(filtered.map((a) => a.id));
        const items: ReviewItem[] = filtered.map((a) => ({
          assignment: a,
          row: toAssignmentQueueRow(a, subs.get(a.id) ?? null),
          submission: subs.get(a.id) ?? null,
        }));
        if (cancelled) return;
        const idx = items.findIndex((it) => it.assignment.id === id);
        setQueue(items);
        setIndex(idx >= 0 ? idx : 0);
      } catch (e) {
        if (!cancelled) {
          Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, creator, brief]);

  const current = queue[index] as ReviewItem | undefined;
  const currentId = current?.assignment.id;
  const submissionId = current?.submission?.id;
  // Reels always wait on the edit job. Slideshows only do once the manager
  // asked for a re-bake from edit mode.
  const trackRender =
    current?.row.format === 'video' ||
    (submissionId !== undefined && rerenderPending === submissionId);
  const renderStatus = trackRender ? current?.submission?.render_status ?? 'ready' : 'ready';

  // The edit job runs right after the creator submits. While it is still
  // going, poll until the finished video lands, then the load effect below
  // picks it up.
  useEffect(() => {
    if (submissionId === undefined) return;
    if (renderStatus === 'ready' || renderStatus === 'failed') return;
    const timer = setInterval(() => {
      void getSubmissionRenderState(submissionId)
        .then((fresh) => {
          if (!fresh) return;
          setQueue((q) =>
            q.map((it) =>
              it.submission && it.submission.id === submissionId
                ? { ...it, submission: { ...it.submission, ...fresh } }
                : it,
            ),
          );
        })
        .catch(() => undefined);
    }, 5000);
    return () => clearInterval(timer);
  }, [submissionId, renderStatus]);

  const restartEdit = useCallback(async () => {
    if (submissionId === undefined) return;
    try {
      await restartRender(submissionId);
      setQueue((q) =>
        q.map((it) =>
          it.submission && it.submission.id === submissionId
            ? {
                ...it,
                submission: {
                  ...it.submission,
                  render_status: 'rendering',
                  render_error: null,
                },
              }
            : it,
        ),
      );
    } catch (e) {
      Alert.alert('Could not restart', e instanceof Error ? e.message : 'Try again');
    }
  }, [submissionId]);

  // Load the current item's video and segments, autoplay, prefetch the next one.
  // A render finishing on the same item swaps media in place: position, slide
  // and the already loaded segments stay so nothing jumps.
  const loadedId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (currentId === undefined || current === undefined) return;
    let cancelled = false;
    const sameItem = loadedId.current === currentId;
    loadedId.current = currentId;
    if (!sameItem) {
      setPositionSec(0);
      setSlideIndex(0);
      setBriefSegments([]);
      setSlidePhotos([]);
      setClipUris([]);
      setClipDurationsMs([]);
      setSlideInsetUrls({});
      setHandle(null);
      setSubtitlesY(current.assignment.briefs.subtitles_y ?? DEFAULT_SUBTITLES_Y);
    }
    void (async () => {
      try {
        const url = await signedUrlFor(current);
        if (cancelled) return;
        setVideoUri(url);
        setPlaying(url !== null);
      } catch {
        if (!cancelled) setVideoUri(null);
      }
      try {
        const segments = await listBriefSegments(
          current.assignment.brief_id,
          current.assignment.id,
        );
        if (!cancelled) setBriefSegments(segments);
        // Slideshows review the real thing: the creator's photos, plus the
        // admin's inset pictures composited while the bake is still running.
        const paths = current.submission?.segment_paths ?? [];
        const segmentUrls = await Promise.all(
          paths.map((p) => signedVideoUrl(p).catch(() => '')),
        );
        if (cancelled) return;
        if (current.row.format === 'video') {
          setClipUris(segmentUrls);
          // The manifest knows every uploaded clip's length once the edit ran;
          // before that each clip is probed so the editor's timeline is honest.
          const known = timelineSourceDurationsMs(current.submission?.render_timeline ?? null);
          const durations = await Promise.all(
            segmentUrls.map((url, i) =>
              known[i] !== undefined && known[i] > 0
                ? Promise.resolve(known[i])
                : url
                  ? probeDurationMs(url, FALLBACK_CLIP_MS)
                  : Promise.resolve(FALLBACK_CLIP_MS),
            ),
          );
          if (!cancelled) setClipDurationsMs(durations);
        } else {
          setSlidePhotos(segmentUrls);
          const originals = await Promise.all(
            paths.map((p) => signedOriginalSlideUrl(p).catch(() => '')),
          );
          if (!cancelled) setSlideOriginals(originals);
        }
        // Inset pictures: composited on slides while the bake runs, and
        // placed on either format in edit mode.
        for (const seg of segments) {
          if (!seg.screenshot_url) continue;
          void signedScreenshotUrl(seg.screenshot_url)
            .then((url) => {
              if (!cancelled) {
                setSlideInsetUrls((prev) => ({ ...prev, [seg.id]: url }));
              }
            })
            .catch(() => undefined);
        }
      } catch {
        if (!cancelled) setBriefSegments([]);
      }
      if (profile) {
        const account = await getCreatorAccount(
          profile.active_company_id,
          current.assignment.creator_id,
        ).catch(() => null);
        if (!cancelled) setHandle(account?.tiktok_handle ?? null);
      }
      const next = queue[index + 1];
      if (next !== undefined) void signedUrlFor(next).catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, renderStatus]);

  const durationSec = current?.submission?.duration_seconds ?? 0;

  useEffect(() => {
    if (durationSec > 0 && positionSec >= durationSec) setPlaying(false);
  }, [positionSec, durationSec]);

  if (loading) {
    return (
      <View style={[styles.fallbackScreen, { paddingTop: insets.top + 12 }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.skeletonBody}>
          <SkeletonCard style={styles.skeletonMedia} />
          <View style={styles.skeletonStrip}>
            <SkeletonLine height={48} width="46%" radius={14} />
            <SkeletonLine height={48} style={styles.skeletonGrow} radius={14} />
          </View>
        </View>
      </View>
    );
  }

  if (!current) {
    return (
      <View style={[styles.fallbackScreen, styles.centered, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.missing}>Nothing left to review.</Text>
        <Button size="md" variant="outline" onPress={() => router.back()}>
          Back
        </Button>
      </View>
    );
  }

  const { assignment, row, submission } = current;
  const briefRow = assignment.briefs;
  const isReel = row.format === 'video';
  const slideAspect = asSlideAspect(submission?.slide_aspect);
  const editPending = trackRender && submission !== null && submission.render_status !== 'ready';
  const editFailed = trackRender && submission?.render_status === 'failed';
  const counterLabel = `${index + 1} of ${Math.max(queue.length, 1)}`;
  const caption = briefRow.caption ?? '';
  const attempt = submission?.version ?? 1;
  const typeLabel =
    briefRow.post_type_id !== null
      ? typeLabels.get(briefRow.post_type_id) ?? null
      : null;

  const scriptTexts = isReel
    ? scriptToLines(briefRow.script).map((line) => line.text)
    : slidesFromScript(briefRow.script);
  // Slides come from brief_segments (the render manifest). Once the bake is
  // ready the photos already carry the text, so nothing composites twice.
  const slideSegs = briefSegments.filter((s) => s.kind === 'slide');
  // Baked files already carry the text and inset. While a re-bake runs the
  // paths still point at the previous bake, so nothing composites twice.
  const slidePaths = submission?.segment_paths ?? [];
  const slidesBaked =
    submission?.render_status === 'ready' ||
    (slidePaths.length > 0 && slidePaths.every((p) => /-final\.(?:png|jpg)$/i.test(p)));
  const surfaceSlides = isReel
    ? []
    : slideSegs.length > 0
      ? slideSegs.map((s, i) => {
          const boxes = parseOverlayBoxes(s.overlay_style, {
            text: s.overlay_text,
            textY: s.text_y,
          });
          const insetUri = s.screenshot_url ? slideInsetUrls[s.id] : undefined;
          return {
            photoUri: slidePhotos[i] || undefined,
            boxes: slidesBaked || !s.show_on_screen ? ([] as OverlayBox[]) : boxes,
            inset:
              slidesBaked || insetUri === undefined
                ? undefined
                : {
                    uri: insetUri,
                    x: s.screenshot_x,
                    y: s.screenshot_y,
                    width: s.screenshot_width,
                  },
            text:
              boxes.map((b) => b.text.trim()).filter(Boolean).join('\n') ||
              scriptTexts[i] ||
              '',
          };
        })
      : Array.from(
          { length: Math.max(scriptTexts.length, slidePhotos.length) },
          (_, i) => ({
            photoUri: slidePhotos[i] || undefined,
            boxes: [] as OverlayBox[],
            inset: undefined,
            text: scriptTexts[i] ?? '',
          }),
        );

  const sectionTexts = isReel ? scriptTexts : surfaceSlides.map((s) => s.text);
  // Spoken sections only. Captions come from the brief and are placed
  // automatically, so revision mode never shows a caption card.
  // Video briefs built from talking points have no script, so their sections
  // come from the recorded clips (one per brief segment, slot order).
  const clipSections: RevisionSection[] = isReel
    ? clipSectionsFromSegments(
        briefRow,
        briefSegments,
        submission?.segment_paths ?? [],
        clipUris,
      )
    : [];
  const sections: RevisionSection[] =
    clipSections.length > 0
      ? clipSections
      : sectionTexts.map((text, i) => ({
          key: `segment-${i}`,
          label: sectionLabel(i, sectionTexts.length, isReel),
          text,
          clipUri: isReel ? clipUris[i] || null : null,
          slide: isReel ? undefined : surfaceSlides[i],
        }));
  const reelClips: ReelClip[] =
    isReel && submission?.render_status === 'ready'
      ? timelineClipDurations(submission.render_timeline).map((durationSec, i) => ({
          label: clipSections[i]?.label ?? sectionLabel(i, clipSections.length, true),
          durationSec,
        }))
      : [];
  const creatorShort = row.creator.name.trim().split(/\s+/)[0] ?? row.creator.name;

  // Edit mode works one brief segment at a time: spoken clips for reels
  // (slot order, matched to their recorded clip), slides for slideshows.
  const spokenSegments = briefSegments
    .filter((s) => s.kind !== 'slide')
    .sort((a, b) => a.slot_index - b.slot_index);
  // Background still: the raw clip at 0, falling back to the stitched edit at
  // the clip start when the raw URL is missing or fails to load.
  const stitchedStill = (i: number) =>
    videoUri !== null && submission?.render_status === 'ready'
      ? { uri: videoUri, atSec: clipStartSec(reelClips, i) }
      : undefined;
  const editTargets: EditTarget[] = isReel
    ? spokenSegments.flatMap((s, i) => {
        const section = clipSections.find((c) => c.key === `segment-${s.slot_index}`);
        const clipUri = section?.clipUri ?? null;
        const fallback = stitchedStill(i);
        const still = clipUri !== null ? { uri: clipUri, atSec: 0 } : fallback;
        if (still === undefined) return [];
        return [
          {
            segment: s,
            label: section?.label ?? sectionLabel(i, spokenSegments.length, true),
            background: { kind: 'video' as const, still, fallback },
            insetUri: s.screenshot_url ? slideInsetUrls[s.id] : undefined,
          },
        ];
      })
    : slideSegs.map((s, i) => ({
        segment: s,
        label: sectionLabel(i, slideSegs.length, false),
        background: { kind: 'photo' as const, uri: slideOriginals[i] || slidePhotos[i] || undefined },
        insetUri: s.screenshot_url ? slideInsetUrls[s.id] : undefined,
      }));

  // The manager's video editor plays the uploaded clips themselves, in slot
  // order, matched to their brief segment like the revision sections are.
  const managerClips: ManagerClip[] = isReel
    ? spokenSegments.flatMap((s, i) => {
        const section = clipSections.find((c) => c.key === `segment-${s.slot_index}`);
        const uri = section?.clipUri ?? clipUris[i] ?? null;
        if (uri === null) return [];
        const uriIndex = clipUris.indexOf(uri);
        const durationMs = clipDurationsMs[uriIndex >= 0 ? uriIndex : i] ?? 0;
        if (durationMs <= 0) return [];
        return [
          {
            slotIndex: s.slot_index,
            label: section?.label ?? sectionLabel(i, spokenSegments.length, true),
            uri,
            durationMs,
            segment: s,
          },
        ];
      })
    : [];
  const fullEditor = isReel && FULL_EDITOR && managerClips.length > 0;

  const openEdit = () => {
    if (submission === null) return;
    setPlaying(false);
    setEditIndex(isReel ? clipIndexAt(reelClips, positionSec) : slideIndex);
    setEditVisible(true);
  };

  // Edit mode keeps its spinner up until this resolves; a throw keeps it open
  // with a Retry.
  const finishEdit = async (changed: boolean) => {
    if (!changed || submissionId === undefined) {
      setEditVisible(false);
      return;
    }
    await rerenderSubmission(submissionId);
    // The finished file lands on the same path; a fresh signed URL makes the
    // player reload it instead of replaying the cached cut.
    urlCache.current.delete(`${assignment.id}:edit`);
    setRerenderPending(submissionId);
    setQueue((q) =>
      q.map((it) =>
        it.submission && it.submission.id === submissionId
          ? {
              ...it,
              submission: { ...it.submission, render_status: 'rendering', render_error: null },
            }
          : it,
      ),
    );
    setEditVisible(false);
    setToast(isReel ? 'Re-editing the video…' : 'Re-editing the slides…');
  };

  // Touched rows are already restored server side; pick up the truth again.
  const cancelEdit = async () => {
    try {
      const fresh = await listBriefSegments(assignment.brief_id, assignment.id);
      setBriefSegments(fresh);
    } catch {
      // The load effect refetches on the next status change; local state is
      // restored below either way.
    }
    setSubtitlesY(briefRow.subtitles_y ?? DEFAULT_SUBTITLES_Y);
    setEditVisible(false);
  };

  const togglePlay = () => {
    if (!playing && durationSec > 0 && positionSec >= durationSec) setPositionSec(0);
    setPlaying((p) => !p);
  };

  function advance() {
    const rest = queue.filter((_, i) => i !== index);
    if (rest.length === 0) {
      router.back();
      return;
    }
    setVideoUri(null);
    setPlaying(false);
    setQueue(rest);
    setIndex(Math.min(index, rest.length - 1));
  }

  async function runReview(
    action: 'approved' | 'changes_requested',
    note: string | null,
  ): Promise<boolean> {
    if (!profile || !current) return false;
    if (!current.submission) {
      Alert.alert('Missing submission', 'This post has no video to review yet.');
      return false;
    }
    if (action === 'approved' && editPending) {
      Alert.alert(
        'Still editing',
        'The final video is not ready yet. Wait for the edit to finish before you approve.',
      );
      return false;
    }
    setBusy(true);
    try {
      await reviewAssignment({
        assignment: current.assignment,
        submissionId: current.submission.id,
        reviewerId: profile.id,
        action,
        note,
        notes: action === 'changes_requested' ? parseNotes(note) : null,
      });
      return true;
    } catch (e) {
      Alert.alert(
        action === 'approved' ? "Couldn't approve" : "Couldn't send back",
        e instanceof Error ? e.message : 'Check your connection and try again.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  const approve = async () => {
    const ok = await runReview('approved', null);
    if (ok) {
      setPlaying(false);
      setApprovedVisible(true);
    }
  };

  const sendBack = async (note: string) => {
    const ok = await runReview('changes_requested', note);
    if (ok) {
      setPlaying(false);
      setRevisionVisible(false);
      setSentVisible(true);
    }
  };

  const closeAndAdvance = () => {
    setApprovedVisible(false);
    setSentVisible(false);
    advance();
  };

  const openThread = () => {
    if (!current) return;
    const assignmentId = current.assignment.id;
    closeAndAdvance();
    router.push({
      pathname: '/(admin)/post-thread/[assignmentId]',
      params: { assignmentId },
    });
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      <View style={styles.media}>
        {isReel ? (
          <ReelSurface
            key={assignment.id}
            videoUri={videoUri}
            playing={playing}
            onTogglePlay={togglePlay}
            positionSec={positionSec}
            durationSec={durationSec}
            onPositionSec={setPositionSec}
            clips={reelClips}
            chipTop={insets.top + 56}
          />
        ) : (
          <SlideshowSurface
            slides={surfaceSlides}
            aspect={slideAspect}
            index={slideIndex}
            onIndex={setSlideIndex}
          />
        )}

        {editPending && (
          <View style={styles.editPillRow} pointerEvents="box-none">
            {editFailed ? (
              <View style={styles.editFailedStack}>
                <Pressable
                  onPress={() => void restartEdit()}
                  style={[styles.editPill, styles.editPillFailed]}
                  accessibilityRole="button"
                >
                  <Text style={styles.editPillText}>Edit failed</Text>
                  <Text style={styles.editPillAction}>Retry</Text>
                </Pressable>
                {submission?.render_error ? (
                  <Text style={styles.editErrorDetail} numberOfLines={3}>
                    {submission.render_error}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Pressable
                onPress={
                  submission?.render_status === 'queued' ? () => void restartEdit() : undefined
                }
                style={styles.editPill}
              >
                <ActivityIndicator size="small" color={color.white} />
                <Text style={styles.editPillText}>
                  {isReel ? 'Editing final video' : 'Editing final slides'}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        <ReviewMetaOverlay
          creatorName={row.creator.name}
          handle={handle}
          typeLabel={typeLabel}
          ageLabel={row.ageLabel}
          format={row.format}
          caption={caption}
          hashtags={briefRow.hashtags}
          slideCount={isReel ? 0 : surfaceSlides.length}
          slideIndex={slideIndex}
        />
        <ReviewTopBar
          topInset={insets.top}
          counterLabel={counterLabel}
          takeLabel={attempt > 1 ? `Take ${attempt}` : undefined}
          onBack={() => router.back()}
          onEdit={
            submission !== null && (fullEditor || editTargets.length > 0) ? openEdit : undefined
          }
          onChat={() =>
            router.push({
              pathname: '/(admin)/chat/[creatorId]',
              params: { creatorId: assignment.creator_id, assignment: assignment.id },
            })
          }
        />
      </View>

      <View style={[styles.actionStrip, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Button
          variant="outline"
          size="md"
          disabled={busy}
          style={styles.request}
          onPress={() => setRevisionVisible(true)}
        >
          Request changes
        </Button>
        <Button
          variant="primary"
          size="md"
          icon="check"
          disabled={busy || editPending}
          style={styles.approve}
          onPress={() => void approve()}
        >
          Approve
        </Button>
      </View>

      {editVisible && fullEditor && submission !== null && (
        <ManagerVideoEditor
          key={submission.id}
          brief={briefRow}
          assignmentId={assignment.id}
          submissionId={submission.id}
          clips={managerClips}
          insetUrls={slideInsetUrls}
          cues={submission.cues}
          transcript={submission.transcript}
          subtitlesY={subtitlesY}
          onSubtitlesY={setSubtitlesY}
          onSegments={setBriefSegments}
          onDone={finishEdit}
          onCancel={cancelEdit}
          topInset={insets.top}
          bottomInset={insets.bottom}
        />
      )}
      {editVisible && !fullEditor && (
        <ReviewEditMode
          format={row.format}
          slideAspect={slideAspect}
          briefId={briefRow.id}
          assignmentId={assignment.id}
          companyId={briefRow.company_id}
          targets={editTargets}
          index={editIndex}
          onIndex={setEditIndex}
          onSegments={setBriefSegments}
          subtitles={
            isReel && briefRow.subtitles === true
              ? { y: subtitlesY, onChange: setSubtitlesY }
              : null
          }
          onDone={finishEdit}
          onCancel={cancelEdit}
        />
      )}
      {revisionVisible && (
        <RevisionMode
          creatorShort={creatorShort}
          postTitle={row.title}
          format={row.format}
          sections={sections}
          busy={busy}
          onCancel={() => setRevisionVisible(false)}
          onSend={(note) => void sendBack(note)}
        />
      )}
      {approvedVisible && (
        <ApprovedOverlay
          title={row.title}
          format={row.format}
          creatorShort={creatorShort}
          onNext={closeAndAdvance}
          onOpenThread={openThread}
        />
      )}
      {sentVisible && (
        <SentConfirmation
          creatorShort={creatorShort}
          onNext={closeAndAdvance}
          onOpenThread={openThread}
        />
      )}
      <SoftToast
        visible={toast !== null}
        message={toast ?? ''}
        tone="info"
        onHide={() => setToast(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.ink900,
  },
  fallbackScreen: {
    flex: 1,
    backgroundColor: color.offWhite,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  skeletonBody: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 14,
  },
  skeletonMedia: {
    flex: 1,
  },
  skeletonStrip: {
    flexDirection: 'row',
    gap: 10,
  },
  skeletonGrow: {
    flex: 1,
    width: 'auto',
  },
  missing: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.semibold,
    color: color.slate500,
  },
  media: {
    flex: 1,
    overflow: 'hidden',
  },
  editPillRow: {
    position: 'absolute',
    top: 104,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(10, 10, 14, 0.6)',
  },
  editPillFailed: {
    backgroundColor: 'rgba(200, 40, 40, 0.85)',
  },
  editFailedStack: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 24,
  },
  editErrorDetail: {
    fontSize: type.size.label,
    color: color.white,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },
  editPillText: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.semibold,
    color: color.white,
  },
  editPillAction: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.semibold,
    color: color.white,
    textDecorationLine: 'underline',
  },
  actionStrip: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
    paddingHorizontal: 20,
    borderTopWidth: borderWidth.hair,
    borderTopColor: color.line,
    backgroundColor: color.white,
  },
  request: {
    flex: 46,
  },
  approve: {
    flex: 54,
  },
});

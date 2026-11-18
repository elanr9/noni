// Review detail (v2_review README 3.3): full-bleed post player between a white
// header band (back, title, View script) and a white footer band (Changes /
// Approve, or Send changes once notes exist). Opens any assignment by id, so
// links from chat, profiles and pushes land on the right post in the right
// state; live posts hand off to the post screen.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ManagerVideoEditor, type ManagerClip } from '../../../components/admin/review/ManagerVideoEditor';
import { ReviewEditMode, type EditTarget } from '../../../components/admin/review/ReviewEditMode';
import { SlideshowSurface } from '../../../components/admin/review/SlideshowSurface';
import { AudioChip } from '../../../components/admin/v2/audio/AudioChip';
import { Celebration } from '../../../components/admin/v2/review/detail/Celebration';
import { FeedBand } from '../../../components/admin/v2/review/detail/FeedBand';
import { NotesSheet } from '../../../components/admin/v2/review/detail/NotesSheet';
import { fromPostNotes, sortNotes, toFlatNote, toPostNotes, type ReviewNote } from '../../../components/admin/v2/review/detail/notes';
import { Scrubber } from '../../../components/admin/v2/review/detail/Scrubber';
import { ScriptSheet, type ScriptSection } from '../../../components/admin/v2/review/detail/ScriptSheet';
import { useReviewPlayer } from '../../../components/admin/v2/review/detail/useReviewPlayer';
import { Button, Icon, Press, Skeleton } from '../../../components/v2';
import { toast } from '../../../components/v2/Toast';
import {
  getSubmissionRenderState,
  rerenderSubmission,
  restartRender,
  reviewAssignment,
  signedOriginalSlideUrl,
  signedVideoUrl,
  type AssignmentQueueItem,
  type Submission,
} from '../../../lib/admin-api';
import { getAssignmentForReview, latestSentBackNotes, listReviewSiblings } from '../../../lib/admin-review-api';
import { useReviewQueue } from '../../../lib/admin-review-queue';
import { scriptToLines, slidesFromScript, toAssignmentQueueRow } from '../../../lib/admin-queue-map';
import {
  DEFAULT_SUBTITLES_Y,
  listBriefSegments,
  parseHookOptions,
  parseTalkingPoints,
  signedScreenshotUrl,
  type Brief,
  type BriefSegment,
} from '../../../lib/briefs-api';
import { parseEditDocument, parsePostAudio, type SlideshowDocument } from '../../../lib/edit-document';
import { parseOverlayBoxes, type OverlayBox } from '../../../lib/overlay-boxes';
import { getCreatorAccount } from '../../../lib/creator-accounts-api';
import { useAuth } from '../../../lib/auth';
import type { MockQueueItem } from '../../../lib/admin-review-types';
import { asSlideAspect, probeDurationMs } from '../../../lib/submissions';
import type { Json } from '../../../lib/types';
import type { PhotoCrop } from '../../../components/creator/slides/photo-crop';
import { isVideoEditorAvailable } from '../../../modules/video-editor';
import { color, radius, shadow, text } from '../../../theme/v2';

/** One stitched clip of the finished edit: "Hook" / "Clip 3" / "Outro". */
type ReelClip = { label: string; durationSec: number };

/** One recorded clip matched to its brief segment, for the editors. */
type RevisionSection = { key: string; label: string; text: string; clipUri?: string | null };

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

/** A job still 'queued' this long after submit never started: the kick was lost. */
const QUEUED_STALL_MS = 2 * 60 * 1000;
/** A job still 'rendering' this long after its claim died without writing a status. */
const RENDERING_STALL_MS = 20 * 60 * 1000;

function olderThan(iso: string | null | undefined, ms: number): boolean {
  if (!iso) return false;
  const at = new Date(iso).getTime();
  return Number.isFinite(at) && Date.now() - at > ms;
}

/** The render job never landed or died mid flight; Retry restarts it. */
function renderStalled(submission: Submission): boolean {
  if (submission.render_status === 'queued') {
    return olderThan(submission.created_at, QUEUED_STALL_MS);
  }
  if (submission.render_status === 'rendering') {
    return olderThan(submission.render_claimed_at, RENDERING_STALL_MS);
  }
  return false;
}

/** The studio slideshow document a submission was built from, if any. */
function slideshowDocumentOf(submission: Submission | null | undefined): SlideshowDocument | null {
  if (!submission || submission.edit_document === null) return null;
  const doc = parseEditDocument(submission.edit_document);
  return doc?.format === 'slideshow' ? doc : null;
}

/** Storage path of each document slide's source photo, slide order; '' when not uploaded. */
function documentSlidePaths(doc: SlideshowDocument): string[] {
  return doc.slides.map(
    (slide) => doc.assets.find((a) => a.id === slide.assetId)?.storagePath ?? '',
  );
}

/** A document crop is in source pixels; the stage wants fractions of the source. */
function documentSlideCrop(doc: SlideshowDocument, index: number): PhotoCrop | undefined {
  const slide = doc.slides[index];
  if (!slide?.crop) return undefined;
  const asset = doc.assets.find((a) => a.id === slide.assetId);
  if (!asset?.width || !asset.height) return undefined;
  return {
    x: slide.crop.x / asset.width,
    y: slide.crop.y / asset.height,
    width: slide.crop.width / asset.width,
    height: slide.crop.height / asset.height,
  };
}
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


/** Hook, numbered points, CTA for a reel; one numbered row per slide for a slideshow. */
function scriptSectionsFor(brief: Brief, isReel: boolean, slideTexts: string[]): ScriptSection[] {
  if (!isReel) {
    return slideTexts.map((t, i) => ({ kind: 'point' as const, n: i + 1, text: t })).filter((s) => s.text.trim());
  }
  const out: ScriptSection[] = [];
  const hook = brief.hook?.trim() || parseHookOptions(brief.hook_options)[0]?.trim() || '';
  if (hook) out.push({ kind: 'label', label: 'Hook', text: hook });
  const points = parseTalkingPoints(brief.talking_points)
    .map((p) => p.text?.trim() ?? '')
    .filter(Boolean);
  const lines = points.length > 0 ? points : scriptToLines(brief.script).map((l) => l.text.trim()).filter(Boolean);
  lines.forEach((t, i) => out.push({ kind: 'point', n: i + 1, text: t }));
  const cta = brief.cta?.trim() || '';
  if (cta) out.push({ kind: 'label', label: 'CTA', text: cta });
  return out;
}

type Decision = { kind: 'approved' | 'sent'; left: number };

export default function ReviewScreen() {
  const { id, creator, brief } = useLocalSearchParams<{ id: string; creator?: string; brief?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();

  const [item, setItem] = useState<ReviewItem | null>(null);
  const [creatorPhoto, setCreatorPhoto] = useState<string | null>(null);
  /** Other submitted posts from this creator (and brief, when opened from one). */
  const [siblings, setSiblings] = useState<AssignmentQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);

  const [slideIndex, setSlideIndex] = useState(0);
  const [briefSegments, setBriefSegments] = useState<BriefSegment[]>([]);
  const [slidePhotos, setSlidePhotos] = useState<string[]>([]);
  const [slideOriginals, setSlideOriginals] = useState<string[]>([]);
  const [clipUris, setClipUris] = useState<string[]>([]);
  const [clipDurationsMs, setClipDurationsMs] = useState<number[]>([]);
  const [slideInsetUrls, setSlideInsetUrls] = useState<Record<string, string>>({});
  const [handle, setHandle] = useState<string | null>(null);

  const [notes, setNotes] = useState<ReviewNote[]>([]);
  /** Notes already sent on a post waiting for its new take. */
  const [sentNotes, setSentNotes] = useState<ReviewNote[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const wasPlaying = useRef(false);
  const [decision, setDecision] = useState<Decision | null>(null);

  const [editVisible, setEditVisible] = useState(false);
  const [editIndex, setEditIndex] = useState(0);
  const [subtitlesY, setSubtitlesY] = useState(DEFAULT_SUBTITLES_Y);
  const [rerenderPending, setRerenderPending] = useState<string | null>(null);

  const urlCache = useRef(new Map<string, string>());
  const noteSeq = useRef(0);

  const signedUrlFor = useCallback(async (it: ReviewItem): Promise<string | null> => {
    if (it.row.format !== 'video' || !it.submission) return null;
    // The finished edit is what gets reviewed. Until it is ready (or when it
    // failed) the first raw clip plays so the footage is still watchable.
    const ready = it.submission.render_status === 'ready';
    const path = ready ? it.submission.video_path : it.submission.segment_paths?.[0] ?? it.submission.video_path;
    if (!path) return null;
    const cacheKey = `${it.assignment.id}:${ready ? 'edit' : 'raw'}`;
    const cached = urlCache.current.get(cacheKey);
    if (cached !== undefined) return cached;
    const url = await signedVideoUrl(path);
    urlCache.current.set(cacheKey, url);
    return url;
  }, []);

  // Load the exact assignment behind the link, whatever its status.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let redirected = false;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const target = await getAssignmentForReview(id);
        if (cancelled) return;
        if (!target) {
          setItem(null);
          return;
        }
        const { assignment, submission } = target;
        // Live posts have numbers, not a review: the post screen owns them.
        if (assignment.status === 'posted' || (assignment.status === 'approved' && !!assignment.post_url)) {
          redirected = true;
          router.replace({ pathname: '/(admin)/brief-post/[id]', params: { id: assignment.id } });
          return;
        }
        setItem({ assignment, submission, row: toAssignmentQueueRow(assignment, submission) });
        setCreatorPhoto(target.creatorPhoto);
        const isReel = assignment.briefs.format !== 'photo_carousel';
        if (assignment.status === 'changes_requested' && submission) {
          void latestSentBackNotes(submission.id)
            .then((n) => {
              if (!cancelled) setSentNotes(fromPostNotes(n, isReel));
            })
            .catch(() => undefined);
        }
        void listReviewSiblings({
          companyId: assignment.company_id,
          creatorId: creator ?? assignment.creator_id,
          briefId: brief,
        })
          .then((rows) => {
            if (!cancelled) setSiblings(rows.filter((r) => r.id !== assignment.id));
          })
          .catch(() => undefined);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Check your connection and try again.');
      } finally {
        if (!cancelled && !redirected) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, creator, brief, reloadKey]);

  const currentId = item?.assignment.id;
  const submission = item?.submission ?? null;
  const submissionId = submission?.id;
  const isReel = item?.row.format === 'video';
  // Reels and every studio submission wait on the render: until it is ready the
  // stored media is the untrimmed source with no text. Legacy slideshows only
  // wait once the manager asked for a re-bake from edit mode.
  const trackRender =
    isReel || (submission?.edit_document ?? null) !== null || (submissionId !== undefined && rerenderPending === submissionId);
  const renderStatus = trackRender ? submission?.render_status ?? 'ready' : 'ready';

  const patchSubmission = useCallback((sid: string, patch: Partial<Submission>) => {
    setItem((it) => (it && it.submission && it.submission.id === sid ? { ...it, submission: { ...it.submission, ...patch } } : it));
  }, []);

  // Poll the edit job until the finished file lands; the media effect then swaps it in.
  useEffect(() => {
    if (submissionId === undefined) return;
    if (renderStatus === 'ready' || renderStatus === 'failed') return;
    const timer = setInterval(() => {
      void getSubmissionRenderState(submissionId)
        .then((fresh) => {
          if (fresh) patchSubmission(submissionId, fresh);
        })
        .catch(() => undefined);
    }, 5000);
    return () => clearInterval(timer);
  }, [submissionId, renderStatus, patchSubmission]);

  const restartEdit = useCallback(async () => {
    if (submissionId === undefined) return;
    try {
      await restartRender(submissionId);
      patchSubmission(submissionId, { render_status: 'rendering', render_error: null, render_claimed_at: new Date().toISOString() });
    } catch (e) {
      toast.error(e instanceof Error ? `Could not restart the render. ${e.message}` : 'Could not restart the render.', {
        label: 'Retry',
        onPress: () => void restartEdit(),
      });
    }
  }, [submissionId, patchSubmission]);

  const rp = useReviewPlayer(videoUri, submission?.duration_seconds ?? 0);
  const { setPlaying } = rp;

  // Load the item's media and segments. A render finishing on the same item
  // swaps media in place: position and the loaded segments stay.
  const loadedId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (currentId === undefined || item === null) return;
    const current = item;
    let cancelled = false;
    const sameItem = loadedId.current === currentId;
    loadedId.current = currentId;
    if (!sameItem) {
      setSlideIndex(0);
      setBriefSegments([]);
      setSlidePhotos([]);
      setSlideOriginals([]);
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
        setVideoFailed(false);
        // Autoplay only what is still waiting on a decision.
        setPlaying(url !== null && current.assignment.status === 'submitted');
      } catch {
        if (!cancelled) {
          setVideoUri(null);
          setVideoFailed(true);
        }
      }
      try {
        const segments = await listBriefSegments(current.assignment.brief_id, current.assignment.id);
        if (!cancelled) setBriefSegments(segments);
        const paths = current.submission?.segment_paths ?? [];
        const segmentUrls = await Promise.all(paths.map((p) => signedVideoUrl(p).catch(() => '')));
        if (cancelled) return;
        if (current.row.format === 'video') {
          setClipUris(segmentUrls);
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
          const doc = slideshowDocumentOf(current.submission);
          if (doc && current.submission?.render_status !== 'ready') {
            const originals = await Promise.all(documentSlidePaths(doc).map((p) => (p ? signedVideoUrl(p).catch(() => '') : '')));
            if (cancelled) return;
            setSlidePhotos([]);
            setSlideOriginals(originals);
          } else {
            setSlidePhotos(segmentUrls);
            const originals = await Promise.all(paths.map((p) => signedOriginalSlideUrl(p).catch(() => '')));
            if (!cancelled) setSlideOriginals(originals);
          }
        }
        for (const seg of segments) {
          if (!seg.screenshot_url) continue;
          void signedScreenshotUrl(seg.screenshot_url)
            .then((u) => {
              if (!cancelled) setSlideInsetUrls((prev) => ({ ...prev, [seg.id]: u }));
            })
            .catch(() => undefined);
        }
      } catch {
        if (!cancelled) setBriefSegments([]);
      }
      const account = await getCreatorAccount(current.assignment.company_id, current.assignment.creator_id).catch(() => null);
      if (!cancelled) setHandle(account?.tiktok_handle ?? account?.instagram_handle ?? null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, renderStatus, reloadKey]);

  const sortedNotes = useMemo(() => sortNotes(notes), [notes]);

  const HEAD = insets.top + 64;
  const FOOT = 16 + 56 + Math.max(insets.bottom, 16) + 12;

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: color.bg, paddingTop: insets.top + 12, paddingHorizontal: 20, gap: 14 }]}>
        <Stack.Screen options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Skeleton h={44} r={radius.pill} style={{ marginBottom: 0 }} />
        <Skeleton h={0} style={{ flex: 1, marginBottom: 0 }} />
        <View style={{ flexDirection: 'row', gap: 10, paddingBottom: Math.max(insets.bottom, 16) }}>
          <Skeleton h={56} r={radius.pill} style={{ flex: 1, marginBottom: 0 }} />
          <Skeleton h={56} r={radius.pill} style={{ flex: 1, marginBottom: 0 }} />
        </View>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[styles.screen, styles.centered, { backgroundColor: color.bg, paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.emptyDisc}>
          <Icon name={loadError ? 'cloud_off' : 'inbox'} size={30} color={color.blue} />
        </View>
        <Text style={[text.card, { textAlign: 'center' }]}>{loadError ? 'Could not load this post' : 'This post is gone'}</Text>
        <Text style={[text.body, { color: color.grey4, textAlign: 'center' }]}>
          {loadError ?? 'It was removed or belongs to another company. Switch companies from the Review tab to see it.'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 8 }}>
          <Button label="Back" variant="quiet" onPress={() => router.back()} />
          {loadError ? <Button label="Try again" icon="refresh" onPress={() => setReloadKey((k) => k + 1)} /> : null}
        </View>
      </View>
    );
  }

  const { assignment, row } = item;
  const status = assignment.status;
  const reviewable = status === 'submitted' && submission !== null;
  const briefRow = assignment.briefs;
  const creatorName = row.creator.name.trim().split(/\s+/)[0] ?? row.creator.name;
  const postAudio = parsePostAudio(submission?.audio);
  const slideAspect = asSlideAspect(submission?.slide_aspect);
  const editPending = trackRender && submission !== null && submission.render_status !== 'ready';
  const editStalled = editPending && submission !== null && renderStalled(submission);
  const editFailed = trackRender && submission?.render_status === 'failed';
  const slideDoc = isReel ? null : slideshowDocumentOf(submission);
  const caption = assignment.caption ?? briefRow.caption ?? '';

  const scriptTexts = isReel ? scriptToLines(briefRow.script).map((line) => line.text) : slidesFromScript(briefRow.script);
  const slideSegs = briefSegments.filter((s) => s.kind === 'slide');
  const slidePaths = submission?.segment_paths ?? [];
  const slidesBaked =
    submission?.render_status === 'ready' || (slidePaths.length > 0 && slidePaths.every((p) => /-final\.(?:png|jpg)$/i.test(p)));
  const surfaceSlides = isReel
    ? []
    : slideDoc
      ? slideDoc.slides.map((slide, i) => {
          const ready = submission?.render_status === 'ready';
          return {
            photoUri: (ready ? slidePhotos[i] : slideOriginals[i]) || undefined,
            crop: ready ? undefined : documentSlideCrop(slideDoc, i),
            boxes: ready ? ([] as OverlayBox[]) : slide.boxes,
            inset: undefined,
            text: slide.boxes.map((b) => b.text.trim()).filter(Boolean).join('\n'),
          };
        })
      : slideSegs.length > 0
        ? slideSegs.map((s, i) => {
            const boxes = parseOverlayBoxes(s.overlay_style, { text: s.overlay_text, textY: s.text_y });
            const insetUri = s.screenshot_url ? slideInsetUrls[s.id] : undefined;
            return {
              photoUri: slidePhotos[i] || undefined,
              boxes: slidesBaked || !s.show_on_screen ? ([] as OverlayBox[]) : boxes,
              inset:
                slidesBaked || insetUri === undefined
                  ? undefined
                  : { uri: insetUri, x: s.screenshot_x, y: s.screenshot_y, width: s.screenshot_width },
              text: boxes.map((b) => b.text.trim()).filter(Boolean).join('\n') || scriptTexts[i] || '',
            };
          })
        : Array.from({ length: Math.max(scriptTexts.length, slidePhotos.length) }, (_, i) => ({
            photoUri: slidePhotos[i] || undefined,
            boxes: [] as OverlayBox[],
            inset: undefined,
            text: scriptTexts[i] ?? '',
          }));

  const clipSections: RevisionSection[] = isReel
    ? clipSectionsFromSegments(briefRow, briefSegments, submission?.segment_paths ?? [], clipUris)
    : [];
  const reelClips: ReelClip[] =
    isReel && submission?.render_status === 'ready'
      ? timelineClipDurations(submission.render_timeline).map((durationSec, i) => ({
          label: clipSections[i]?.label ?? sectionLabel(i, clipSections.length, true),
          durationSec,
        }))
      : [];

  const spokenSegments = briefSegments.filter((s) => s.kind !== 'slide').sort((a, b) => a.slot_index - b.slot_index);
  const stitchedStill = (i: number) =>
    videoUri !== null && submission?.render_status === 'ready' ? { uri: videoUri, atSec: clipStartSec(reelClips, i) } : undefined;
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
  const managerClips: ManagerClip[] = isReel
    ? spokenSegments.flatMap((s, i) => {
        const section = clipSections.find((c) => c.key === `segment-${s.slot_index}`);
        const uri = section?.clipUri ?? clipUris[i] ?? null;
        if (uri === null) return [];
        const uriIndex = clipUris.indexOf(uri);
        const durationMs = clipDurationsMs[uriIndex >= 0 ? uriIndex : i] ?? 0;
        if (durationMs <= 0) return [];
        return [{ slotIndex: s.slot_index, label: section?.label ?? sectionLabel(i, spokenSegments.length, true), uri, durationMs, segment: s }];
      })
    : [];
  const fullEditor = isReel && FULL_EDITOR && managerClips.length > 0;
  const canEdit = reviewable && submission !== null && submission.edit_document === null && (fullEditor || editTargets.length > 0);

  const scriptSections = scriptSectionsFor(briefRow, isReel, surfaceSlides.map((s) => s.text));
  const pointIdx = scriptSections.map((s, i) => (s.kind === 'point' ? i : -1)).filter((i) => i >= 0);
  let live = -1;
  if (!isReel) {
    live = pointIdx[slideIndex] ?? -1;
  } else if (rp.playing && rp.duration > 0 && scriptSections.length > 0) {
    // Sections line up with the stitched clips (hook, points, outro) when the
    // counts match; otherwise the post is split evenly.
    const at =
      reelClips.length === scriptSections.length
        ? clipIndexAt(reelClips, rp.time)
        : Math.min(scriptSections.length - 1, Math.floor((rp.time / rp.duration) * scriptSections.length));
    live = scriptSections[at]?.kind === 'point' ? at : -1;
  }

  const shownNotes = reviewable ? sortedNotes : sentNotes;
  const markers = isReel ? shownNotes.flatMap((n) => (n.at !== null ? [n.at] : [])) : [];
  const pinAt = isReel ? Math.round(rp.time) : slideIndex;
  const left = siblings.length;

  const seekNote = (at: number) => {
    if (isReel) rp.seek(at);
    else setSlideIndex(Math.min(at, Math.max(surfaceSlides.length - 1, 0)));
  };

  const openEdit = () => {
    if (submission === null) return;
    setPlaying(false);
    setEditIndex(isReel ? clipIndexAt(reelClips, rp.time) : slideIndex);
    setEditVisible(true);
  };

  // Edit mode keeps its spinner up until this resolves; a throw keeps it open with a Retry.
  const finishEdit = async (changed: boolean) => {
    if (!changed || submissionId === undefined) {
      setEditVisible(false);
      return;
    }
    await rerenderSubmission(submissionId);
    urlCache.current.delete(`${assignment.id}:edit`);
    setRerenderPending(submissionId);
    patchSubmission(submissionId, { render_status: 'rendering', render_error: null, render_claimed_at: new Date().toISOString() });
    setEditVisible(false);
    toast.show(isReel ? 'Re-editing the video. Approve once it lands.' : 'Re-editing the slides. Approve once they land.');
  };

  const cancelEdit = async () => {
    try {
      setBriefSegments(await listBriefSegments(assignment.brief_id, assignment.id));
    } catch {
      // The media effect refetches on the next status change.
    }
    setSubtitlesY(briefRow.subtitles_y ?? DEFAULT_SUBTITLES_Y);
    setEditVisible(false);
  };

  // Optimistic: the celebration starts at once; a failure takes it down, keeps
  // the notes and offers a retry.
  const decide = async (action: 'approved' | 'changes_requested') => {
    if (!profile || submission === null) return;
    if (action === 'approved' && editPending) {
      toast.show(
        editFailed || editStalled
          ? `The final ${isReel ? 'video' : 'slides'} did not render. Retry the render, then approve.`
          : `The final ${isReel ? 'video is' : 'slides are'} still rendering. Approve once ${isReel ? 'it lands' : 'they land'}.`,
      );
      return;
    }
    const postNotes = action === 'changes_requested' ? toPostNotes(notes, isReel) : null;
    setPlaying(false);
    setNotesOpen(false);
    setScriptOpen(false);
    setDecision({ kind: action === 'approved' ? 'approved' : 'sent', left });
    // The Review root and creator queue drop the post at once; restored on failure.
    const restore = useReviewQueue.getState().removePost(assignment.id);
    try {
      await reviewAssignment({
        assignment,
        submissionId: submission.id,
        reviewerId: profile.id,
        action,
        note: postNotes ? toFlatNote(postNotes) : null,
        notes: postNotes,
      });
    } catch (e) {
      restore();
      setDecision(null);
      const why = e instanceof Error && e.message ? ` ${e.message}` : '';
      toast.error(`${action === 'approved' ? "Couldn't approve." : "Couldn't send your changes."}${why}`, {
        label: 'Retry',
        onPress: () => void decide(action),
      });
    }
  };

  const returnFromDecision = () => {
    if (decision && decision.left > 0) router.back();
    else router.dismissTo('/(admin)/(tabs)');
  };

  const openChat = () =>
    router.push({ pathname: '/(admin)/chat/[creatorId]', params: { creatorId: assignment.creator_id, assignment: assignment.id } });

  const stateBanner =
    status === 'approved'
      ? { icon: 'check' as const, label: `Approved. ${creatorName} posts it next.`, tone: color.green }
      : status === 'changes_requested'
        ? { icon: 'edit_note' as const, label: `Changes sent. Waiting on ${creatorName}'s new take.`, tone: color.amber }
        : status === 'assigned' || status === 'recorded'
          ? { icon: 'schedule' as const, label: submission ? `Old take. ${creatorName} is recording a new one.` : `${creatorName} has not sent this yet.`, tone: color.blue }
          : null;

  const hasMedia = submission !== null;
  const titleSize = row.title.length > 44 ? 17 : 20;
  const showEditHandle = canEdit && !scrubbing && !notesOpen && !scriptOpen;

  return (
    <View style={[styles.screen, { backgroundColor: color.ink }]}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: !notesOpen && decision === null }} />
      <StatusBar style="dark" />

      <View style={{ position: 'absolute', left: 0, right: 0, top: HEAD, bottom: FOOT, overflow: 'hidden' }}>
        {hasMedia ? (
          <FeedBand
            player={isReel ? rp.player : null}
            hasVideo={isReel && videoUri !== null}
            playing={rp.playing}
            fast={rp.fast}
            scrubbing={scrubbing}
            onToggle={rp.toggle}
            onFast={(on) => {
              rp.setFast(on);
              if (on) setPlaying(true);
            }}
            creatorName={row.creator.name}
            creatorPhoto={creatorPhoto}
            handle={handle}
            caption={caption}
          >
            {isReel ? (
              videoUri === null ? (
                <View style={[StyleSheet.absoluteFill, styles.centered]}>
                  {videoFailed ? (
                    <>
                      <Text style={[text.row, { color: color.white, textAlign: 'center' }]}>The video did not load</Text>
                      <Button pill variant="secondary" icon="refresh" label="Try again" onPress={() => setReloadKey((k) => k + 1)} />
                    </>
                  ) : (
                    <ActivityIndicator color={color.white} />
                  )}
                </View>
              ) : null
            ) : (
              <SlideshowSurface slides={surfaceSlides} aspect={slideAspect} index={slideIndex} onIndex={setSlideIndex} />
            )}
          </FeedBand>
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.centered, { backgroundColor: color.bg }]}>
            <View style={styles.emptyDisc}>
              <Icon name="videocam" size={30} color={color.blue} />
            </View>
            <Text style={[text.card, { textAlign: 'center' }]}>Nothing to watch yet</Text>
            <Text style={[text.body, { color: color.grey4, textAlign: 'center' }]}>
              {creatorName} has not sent a take of this post. You will get a push the moment it lands.
            </Text>
          </View>
        )}

        {postAudio ? <AudioChip audio={postAudio} style={{ position: 'absolute', left: 12, top: stateBanner || (reviewable && editPending) ? 92 : 52 }} /> : null}

        {stateBanner ? (
          <View pointerEvents="none" style={styles.bannerRow}>
            <View style={styles.banner}>
              <Icon name={stateBanner.icon} size={16} color={stateBanner.tone} />
              <Text style={styles.bannerText} numberOfLines={1}>
                {stateBanner.label}
              </Text>
            </View>
          </View>
        ) : null}

        {reviewable && editPending ? (
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={styles.bannerRow} pointerEvents="box-none">
            {editFailed || editStalled ? (
              <Press accessibilityRole="button" accessibilityLabel="Retry render" onPress={() => void restartEdit()} style={[styles.banner, { backgroundColor: color.pinkTint }]}>
                <Icon name="refresh" size={16} color={color.pink} />
                <Text style={[styles.bannerText, { color: color.pink }]} numberOfLines={1}>
                  {editFailed ? 'Render failed. Tap to retry' : 'Render stalled. Tap to retry'}
                </Text>
              </Press>
            ) : (
              <View style={styles.banner} accessibilityRole="progressbar">
                <ActivityIndicator size="small" color={color.blue} />
                <Text style={styles.bannerText}>{isReel ? 'Rendering the final video' : 'Rendering the final slides'}</Text>
              </View>
            )}
          </Animated.View>
        ) : null}

        <ScriptSheet open={scriptOpen} onClose={() => setScriptOpen(false)} sections={scriptSections} live={live} />
      </View>

      {/* Header band */}
      <View style={[styles.head, { height: HEAD, paddingTop: insets.top + 4 }]}>
        <Press accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}>
          <Icon name="chevron_left" size={32} color={color.ink} />
        </Press>
        <Text numberOfLines={2} style={[styles.title, { fontSize: titleSize, lineHeight: titleSize * 1.2 }]}>
          {row.title}
        </Text>
        <Press
          accessibilityRole="button"
          accessibilityLabel={scriptOpen ? 'Hide script' : 'View script'}
          onPress={() => {
            setNotesOpen(false);
            setScriptOpen((o) => !o);
          }}
          style={styles.scriptPill}
        >
          <Text style={styles.scriptText}>{scriptOpen ? 'Hide script' : 'View script'}</Text>
          <Icon name={scriptOpen ? 'keyboard_arrow_up' : 'keyboard_arrow_down'} size={16} color={color.blueDeep} />
        </Press>
      </View>

      {/* Footer band */}
      <View style={[styles.foot, { height: FOOT }]} />

      {showEditHandle ? (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={[styles.editRow, { bottom: FOOT + 22 }]} pointerEvents="box-none">
          <Press accessibilityRole="button" accessibilityLabel="Edit this post" onPress={openEdit} style={styles.editHandle}>
            <Icon name="keyboard_arrow_up" size={26} weight={700} color={color.white} style={styles.editShadow} />
            <Text style={[styles.editText, styles.editShadow]}>Edit</Text>
          </Press>
        </Animated.View>
      ) : null}

      {isReel && hasMedia && videoUri !== null && !scriptOpen ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: FOOT - 14, zIndex: 3 }}>
          <Scrubber
            time={rp.time}
            duration={rp.duration}
            markers={markers}
            scrubbing={scrubbing}
            onScrubStart={() => {
              wasPlaying.current = rp.playing;
              setPlaying(false);
              setScrubbing(true);
            }}
            onSeek={rp.seek}
            onScrubEnd={() => {
              setScrubbing(false);
              if (wasPlaying.current) setPlaying(true);
            }}
          />
        </View>
      ) : null}

      {/* Footer buttons */}
      <View style={[styles.actions, { bottom: Math.max(insets.bottom, 16) + 12, opacity: notesOpen ? 0 : 1 }]} pointerEvents={notesOpen ? 'none' : 'auto'}>
        {reviewable ? (
          <>
            <Button
              variant="secondary"
              icon={notes.length ? 'edit_note' : 'close'}
              label={notes.length ? `${notes.length} ${notes.length === 1 ? 'change' : 'changes'}` : 'Changes'}
              onPress={() => {
                setPlaying(false);
                setScriptOpen(false);
                setNotesOpen(true);
              }}
              style={styles.btn}
            />
            {notes.length ? (
              <Button icon="arrow_upward" label="Send changes" onPress={() => void decide('changes_requested')} style={styles.btn} />
            ) : (
              <Button icon="check" label="Approve" disabled={editPending && !(editFailed || editStalled)} onPress={() => void decide('approved')} style={styles.btn} />
            )}
          </>
        ) : (
          <>
            <Button variant="secondary" icon="chat_bubble" label={`Message ${creatorName}`} onPress={openChat} style={styles.btn} />
            {status === 'changes_requested' && sentNotes.length > 0 ? (
              <Button
                variant="amber"
                icon="edit_note"
                label={`${sentNotes.length} ${sentNotes.length === 1 ? 'change' : 'changes'} sent`}
                onPress={() => {
                  setPlaying(false);
                  setNotesOpen(true);
                }}
                style={styles.btn}
              />
            ) : status === 'approved' ? (
              <Button icon="open_in_new" label="Open post" onPress={() => router.push({ pathname: '/(admin)/brief-post/[id]', params: { id: assignment.id } })} style={styles.btn} />
            ) : null}
          </>
        )}
      </View>

      <NotesSheet
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        creatorName={creatorName}
        isReel={isReel}
        notes={shownNotes}
        pinAt={pinAt}
        readOnly={!reviewable}
        onAdd={(n) => {
          noteSeq.current += 1;
          setNotes((prev) => [...prev, { id: `n${noteSeq.current}`, at: n.at, text: n.text }]);
        }}
        onDelete={(nid) => setNotes((prev) => prev.filter((n) => n.id !== nid))}
        onSeek={seekNote}
      />

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
          subtitles={isReel && briefRow.subtitles === true ? { y: subtitlesY, onChange: setSubtitlesY } : null}
          onDone={finishEdit}
          onCancel={cancelEdit}
        />
      )}

      {decision ? <Celebration kind={decision.kind} creatorName={creatorName} left={decision.left} onReturn={returnFromDecision} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  emptyDisc: { width: 64, height: 64, borderRadius: radius.pill, backgroundColor: color.blueTint, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  head: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 1, backgroundColor: color.card, flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingLeft: 4, paddingRight: 16 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, minWidth: 0, paddingTop: 8, fontWeight: '700', letterSpacing: -0.2, color: color.ink },
  scriptPill: { marginTop: 10, height: 24, paddingLeft: 10, paddingRight: 6, borderRadius: radius.pill, backgroundColor: color.blueTint, flexDirection: 'row', alignItems: 'center', gap: 2 },
  scriptText: { fontSize: 12, fontWeight: '600', color: color.blueDeep },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 1, backgroundColor: color.card },
  editRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 3 },
  editHandle: { alignItems: 'center', gap: 2, paddingHorizontal: 16, paddingVertical: 4 },
  editText: { fontSize: 13, lineHeight: 14, fontWeight: '700', color: color.white },
  editShadow: { textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  actions: { position: 'absolute', left: 16, right: 16, zIndex: 4, flexDirection: 'row', gap: 10 },
  btn: { height: 56, paddingHorizontal: 14 },
  bannerRow: { position: 'absolute', top: 52, left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: color.card, maxWidth: '100%', ...shadow.float },
  bannerText: { fontSize: 13, fontWeight: '700', color: color.ink, flexShrink: 1 },
});

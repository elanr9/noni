import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImagePlus } from 'lucide-react-native';

import { FormatTag, TypeTag } from '../../../components/creator/Chips';
import { scriptBlocks, usePostTypeMeta } from '../../../components/creator/PostCard';
import { PostPreview } from '../../../components/creator/PostPreview';
import { SlideNav } from '../../../components/creator/SlideNav';
import { FrameFit } from '../../../components/creator/slides/FrameFit';
import {
  ensurePreview,
  usePhotoPreviews,
} from '../../../components/creator/slides/photo-previews';
import { RetryToast, type Failure } from '../../../components/creator/slides/RetryToast';
import {
  clampBoxSize,
  nextBoxId,
  segmentBoxes,
  segmentWithBoxes,
} from '../../../components/creator/slides/segment-boxes';
import { SlideToolbar } from '../../../components/creator/slides/SlideToolbar';
import { TextEditPanel } from '../../../components/creator/slides/TextEditPanel';
import { useDebouncedCommit } from '../../../components/creator/slides/useDebouncedCommit';
import { TextColorPicker } from '../../../components/creator/TextColorPicker';
import { useCreatorToast } from '../../../components/creator/Toast';
import { DetailSkeleton, SoftToast } from '../../../components/states';
import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { color, motion, radius, shadow, space, type } from '../../../theme/tokens';
import { useAuth } from '../../../lib/auth';
import {
  creatorEditSegmentBoxes,
  creatorPlaceSegment,
  creatorRemoveSlide,
  creatorStyleBriefBoxes,
  listBriefSegments,
  parseTalkingPoints,
  segmentWithBoxesStyled,
  signedScreenshotUrl,
  type BriefSegment,
} from '../../../lib/briefs-api';
import { getCreatorAccount } from '../../../lib/creator-accounts-api';
import { useKeyboardHeight } from '../../../lib/keyboard';
import {
  newOverlayBox,
  parseOverlayBoxes,
  type OverlayBox,
} from '../../../lib/overlay-boxes';
import {
  SLIDE_INSET_DEFAULTS,
  SlideStage,
  type SlideInset,
} from '../../../components/SlideStage';
import { useCreatorQueue } from '../../../lib/creator-queue';
import { getAssignment, type AssignmentWithBrief } from '../../../lib/tasks-api';
import { submitAssignmentPhotos, type PickedPhoto } from '../../../lib/submissions';

type Phase = 'idle' | 'processing' | 'review';

type Slide = {
  slotIndex: number;
  text: string;
  /** Admin-placed text boxes, rendered exactly as they will publish. */
  boxes: OverlayBox[];
  /** The admin's inset picture on this slide. */
  inset?: SlideInset;
  /** Same words as the slide before it; probably an accidental copy. */
  duplicate?: boolean;
};

/** Photos keyed by slot after one slot is dropped; later slots shift down. */
function photosWithoutSlot(
  photos: Record<number, PickedPhoto>,
  slot: number,
): Record<number, PickedPhoto> {
  const out: Record<number, PickedPhoto> = {};
  for (const [key, photo] of Object.entries(photos)) {
    const n = Number(key);
    if (n === slot) continue;
    out[n > slot ? n - 1 : n] = photo;
  }
  return out;
}

/** Slides the segments describe, then any picked photo sitting past them. */
function withExtraPhotoSlides(
  base: Slide[],
  photos: Record<number, PickedPhoto>,
): Slide[] {
  const known = new Set(base.map((s) => s.slotIndex));
  const extras = Object.keys(photos)
    .map(Number)
    .filter((slot) => Number.isFinite(slot) && !known.has(slot))
    .sort((a, b) => a - b)
    .map((slotIndex) => ({ slotIndex, text: '', boxes: [] as OverlayBox[] }));
  return [...base, ...extras];
}

function markDuplicates(slides: Slide[]): Slide[] {
  return slides.map((slide, i) => {
    const prev = slides[i - 1];
    const words = slide.text.trim();
    const duplicate = prev !== undefined && words.length > 0 && words === prev.text.trim();
    return duplicate ? { ...slide, duplicate } : slide;
  });
}

const PROCESSING_MIN_MS = 2_000;

function draftKey(assignmentId: string): string {
  return `noni:slideshow-draft:${assignmentId}`;
}

type StoredDraft = Record<string, PickedPhoto>;

async function loadPhotoDraft(
  assignmentId: string,
): Promise<Record<number, PickedPhoto>> {
  try {
    const raw = await AsyncStorage.getItem(draftKey(assignmentId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredDraft;
    const out: Record<number, PickedPhoto> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const slot = Number(k);
      if (
        !Number.isFinite(slot) ||
        !v ||
        typeof v.uri !== 'string' ||
        v.uri.length === 0
      ) {
        continue;
      }
      out[slot] = {
        uri: v.uri,
        mimeType: typeof v.mimeType === 'string' ? v.mimeType : null,
      };
    }
    return out;
  } catch {
    return {};
  }
}

async function savePhotoDraft(
  assignmentId: string,
  photos: Record<number, PickedPhoto>,
): Promise<void> {
  const stored: StoredDraft = {};
  for (const [k, v] of Object.entries(photos)) {
    stored[k] = v;
  }
  await AsyncStorage.setItem(draftKey(assignmentId), JSON.stringify(stored));
}

async function clearPhotoDraft(assignmentId: string): Promise<void> {
  await AsyncStorage.removeItem(draftKey(assignmentId));
}

/** 54px ring spinning 900ms linear (SCREENS §3 processing). */
function SpinnerRing() {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  return (
    <Animated.View style={[styles.spinnerRing, { transform: [{ rotate }] }]} />
  );
}

function briefSlides(
  brief: AssignmentWithBrief['briefs'],
  briefSegments: BriefSegment[],
  insetUrls: Record<string, string>,
): Slide[] {
  const talkingPoints = parseTalkingPoints(brief.talking_points);
  const slideSegments = briefSegments.filter((s) => s.kind === 'slide');
  if (slideSegments.length > 0) {
    return slideSegments.map((s) => {
      const boxes = parseOverlayBoxes(s.overlay_style, {
        text: s.overlay_text,
        textY: s.text_y,
      });
      const fromPoint =
        s.talking_point_index !== null
          ? talkingPoints[s.talking_point_index]?.text?.trim()
          : undefined;
      const insetUri = s.screenshot_url ? insetUrls[s.id] : undefined;
      return {
        slotIndex: s.slot_index,
        text:
          boxes.map((b) => b.text.trim()).filter(Boolean).join('\n') ||
          fromPoint ||
          '',
        boxes,
        inset:
          insetUri !== undefined
            ? {
                uri: insetUri,
                x: s.screenshot_x,
                y: s.screenshot_y,
                width: s.screenshot_width,
              }
            : undefined,
      };
    });
  }
  const fromPoints = talkingPoints
    .map((p) => p.text?.trim() ?? '')
    .filter((t) => t.length > 0)
    .map((text, i) => ({ slotIndex: i, text, boxes: [] as OverlayBox[] }));
  if (fromPoints.length > 0) return fromPoints;
  return scriptBlocks(brief.script).map((text, i) => ({
    slotIndex: i,
    text,
    boxes: [] as OverlayBox[],
  }));
}

export default function UploadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const queue = useCreatorQueue();
  const toast = useCreatorToast();

  const [assignment, setAssignment] = useState<AssignmentWithBrief | null>(null);
  const [briefSegments, setBriefSegments] = useState<BriefSegment[]>([]);
  /** Signed URLs for admin inset pictures, keyed by segment id. */
  const [insetUrls, setInsetUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [photos, setPhotos] = useState<Record<number, PickedPhoto>>({});
  const [picking, setPicking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  /** Height of the bottom panel at rest; the stage reserves it so nothing jumps. */
  const [sheetHeight, setSheetHeight] = useState(0);
  const previewUris = usePhotoPreviews(photos);
  const [placedOnce, setPlacedOnce] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [tiktokHandle, setTiktokHandle] = useState<string | null>(null);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [freshBoxId, setFreshBoxId] = useState<string | null>(null);
  const reviewSheet = useRef(new Animated.Value(0)).current;
  const keyboardHeight = useKeyboardHeight();
  const { schedule } = useDebouncedCommit();

  const typeMeta = usePostTypeMeta(assignment?.briefs.post_type_id ?? null);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    getCreatorAccount(profile.active_company_id, profile.id)
      .then((account) => {
        if (!cancelled) setTiktokHandle(account?.tiktok_handle ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [profile]);

  useEffect(() => {
    if (!id || !profile?.active_company_id) return;
    const companyId = profile.active_company_id;
    let cancelled = false;
    async function load() {
      try {
        const a = await getAssignment(companyId, id);
        if (cancelled) return;
        setAssignment(a);
        if (a) {
          const [segs, draft] = await Promise.all([
            listBriefSegments(a.briefs.id),
            loadPhotoDraft(a.id),
          ]);
          if (cancelled) return;
          setBriefSegments(segs);
          setPhotos(draft);
          setDraftLoaded(true);
          for (const seg of segs) {
            if (!seg.screenshot_url) continue;
            void signedScreenshotUrl(seg.screenshot_url)
              .then((url) => {
                if (!cancelled) {
                  setInsetUrls((prev) => ({ ...prev, [seg.id]: url }));
                }
              })
              .catch(() => undefined);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setErrorToast(
            e instanceof Error ? e.message : 'Could not load this post. Try again.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, profile?.active_company_id]);

  useEffect(() => {
    if (phase !== 'review') {
      reviewSheet.setValue(0);
      return;
    }
    Animated.timing(reviewSheet, {
      toValue: 1,
      duration: motion.base,
      easing: motion.easeOut,
      useNativeDriver: true,
    }).start();
  }, [phase, reviewSheet]);

  const brief = assignment?.briefs ?? null;

  const slides = useMemo<Slide[]>(() => {
    if (!brief) return [];
    return markDuplicates(
      withExtraPhotoSlides(briefSlides(brief, briefSegments, insetUrls), photos),
    );
  }, [brief, briefSegments, insetUrls, photos]);

  const pickedCount = slides.filter((s) => photos[s.slotIndex] !== undefined).length;
  const allPicked = slides.length > 0 && pickedCount === slides.length;
  const nextEmpty = slides.find((s) => photos[s.slotIndex] === undefined);
  const missingSlideNumbers = slides
    .map((s, i) => (photos[s.slotIndex] === undefined ? i + 1 : null))
    .filter((n): n is number => n !== null);
  const missingLabel =
    missingSlideNumbers.length === 1
      ? `Add a photo to slide ${missingSlideNumbers[0]}`
      : `Photos missing on slides ${missingSlideNumbers.join(', ')}`;

  // Every photo change persists at once, so backgrounding or a crash between
  // picks never loses the draft. Waits for the stored draft to load first.
  const draftAssignmentId = draftLoaded ? assignment?.id ?? null : null;
  useEffect(() => {
    if (draftAssignmentId === null) return;
    savePhotoDraft(draftAssignmentId, photos).catch(() => undefined);
  }, [draftAssignmentId, photos]);

  function fail(message: string, retry?: () => void) {
    if (retry) setFailure({ message, retry });
    else setErrorToast(message);
  }

  async function pickPhoto(slotIndex: number) {
    if (picking || phase === 'processing' || !assignment) return;
    setPicking(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      const asset = result.canceled ? null : result.assets[0];
      if (asset) {
        const picked = { uri: asset.uri, mimeType: asset.mimeType ?? null };
        setPhotos((prev) => ({ ...prev, [slotIndex]: picked }));
        void ensurePreview(picked.uri);
      }
    } catch (e) {
      fail(
        e instanceof Error ? e.message : 'Could not open your photos.',
        () => void pickPhoto(slotIndex),
      );
    } finally {
      setPicking(false);
    }
  }

  async function processSlideshow() {
    setPhase('processing');
    await new Promise<void>((resolve) => setTimeout(resolve, PROCESSING_MIN_MS));
    setReviewIndex(0);
    setPhase('review');
  }

  /** The stage is never gated on photos: open any slide and edit it now. */
  function openStage(slideIndex: number) {
    setReviewIndex(Math.max(0, Math.min(slideIndex, slides.length - 1)));
    setSelectedBoxId(null);
    setFreshBoxId(null);
    setPhase('review');
  }

  function removeSlide(slideIndex: number) {
    const slide = slides[slideIndex];
    if (!slide || !assignment) return;
    if (slides.length <= 1) {
      setErrorToast('A slideshow needs at least one slide.');
      return;
    }
    const segment = slideSegment(slideIndex);
    Alert.alert(
      `Remove slide ${slideIndex + 1}?`,
      segment
        ? 'Its text and photo go away and the later slides move up.'
        : 'This photo goes away and the later slides move up.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => void confirmRemoveSlide(slide.slotIndex, segment),
        },
      ],
    );
  }

  async function confirmRemoveSlide(slot: number, segment: BriefSegment | null) {
    if (!assignment || !brief || removing) return;
    setRemoving(true);
    const lastIndex = slides.length - 2;
    try {
      if (segment) {
        await creatorRemoveSlide(segment.id);
        // The server owns slot numbering; read it back rather than guess.
        const fresh = await listBriefSegments(brief.id);
        setBriefSegments(fresh);
      }
      // Photos shift with the same rule the server applied to slot_index.
      setPhotos((prev) => photosWithoutSlot(prev, slot));
      setSelectedBoxId(null);
      setFreshBoxId(null);
      setReviewIndex((i) => Math.max(0, Math.min(i, lastIndex)));
      toast.show('Slide removed.');
    } catch (e) {
      fail(
        e instanceof Error ? e.message : 'Could not remove that slide.',
        () => void confirmRemoveSlide(slot, segment),
      );
    } finally {
      setRemoving(false);
    }
  }

  async function sendForApproval() {
    if (!profile || !assignment || submitting) return;
    if (!allPicked) {
      setErrorToast(missingLabel);
      return;
    }
    setSubmitting(true);
    try {
      const ordered = slides.map((s) => {
        const photo = photos[s.slotIndex];
        if (photo === undefined) {
          throw new Error('A slide is missing its photo.');
        }
        return photo;
      });
      const updated = await submitAssignmentPhotos({
        assignment,
        companyId: profile.active_company_id,
        creatorId: profile.id,
        photos: ordered,
      });
      try {
        await clearPhotoDraft(assignment.id);
      } catch {
        // submission succeeded
      }
      queue.applyLocal(updated);
      toast.show('Sent for approval. It posts once approved.');
      router.replace('/(creator)/(tabs)');
    } catch (e) {
      setSubmitting(false);
      fail(e instanceof Error ? e.message : 'Upload failed.', () => void sendForApproval());
    }
  }

  function slideSegment(slideIndex: number): BriefSegment | null {
    const slot = slides[slideIndex]?.slotIndex;
    return (
      briefSegments.find((s) => s.kind === 'slide' && s.slot_index === slot) ??
      null
    );
  }

  // Optimistic: the stage updates now, the save runs once the creator is still.
  function updateSlideBoxes(
    slideIndex: number,
    update: (boxes: OverlayBox[]) => OverlayBox[],
  ) {
    const segment = slideSegment(slideIndex);
    if (!segment) return;
    const next = update(segmentBoxes(segment));
    setPlacedOnce(true);
    setBriefSegments((prev) =>
      prev.map((s) => (s.id === segment.id ? segmentWithBoxes(s, next) : s)),
    );
    const save = () => {
      creatorEditSegmentBoxes({ segmentId: segment.id, boxes: next }).catch(() =>
        fail('Could not save that text.', save),
      );
    };
    schedule(`boxes:${segment.id}`, save);
  }

  function moveSlideBox(slideIndex: number, boxId: string, x: number, y: number) {
    updateSlideBoxes(slideIndex, (boxes) =>
      boxes.map((b) => (b.id === boxId ? { ...b, x, y } : b)),
    );
  }

  function scaleSlideBox(slideIndex: number, boxId: string, size: number) {
    updateSlideBoxes(slideIndex, (boxes) =>
      boxes.map((b) => (b.id === boxId ? { ...b, size: clampBoxSize(size) } : b)),
    );
  }

  function editSlideBox(slideIndex: number, box: OverlayBox) {
    updateSlideBoxes(slideIndex, (boxes) =>
      boxes.map((b) => (b.id === box.id ? box : b)),
    );
  }

  function deleteSlideBox(slideIndex: number, boxId: string) {
    updateSlideBoxes(slideIndex, (boxes) => boxes.filter((b) => b.id !== boxId));
    setSelectedBoxId(null);
    setFreshBoxId(null);
  }

  function addSlideBox(slideIndex: number) {
    const segment = slideSegment(slideIndex);
    if (!segment) {
      setErrorToast(
        'This slide has no text layer yet, so text cannot be added here. You can still swap or remove it.',
      );
      return;
    }
    const id = nextBoxId(segmentBoxes(segment));
    updateSlideBoxes(slideIndex, (boxes) => [
      ...boxes,
      newOverlayBox({
        id,
        text: 'Your text',
        style: 'classic',
        themeColor: null,
        index: boxes.length,
      }),
    ]);
    setSelectedBoxId(id);
    setFreshBoxId(id);
  }

  function finishEditingBox(slideIndex: number, boxId: string, finalText: string) {
    if (finalText.trim().length === 0) {
      deleteSlideBox(slideIndex, boxId);
      return;
    }
    setSelectedBoxId(null);
    setFreshBoxId(null);
  }

  // One look for the whole post: a pick on any slide restyles every slide.
  function styleSlideBox(boxColor: string, bg: boolean) {
    if (!brief) return;
    setBriefSegments((prev) => prev.map((s) => segmentWithBoxesStyled(s, boxColor, bg)));
    creatorStyleBriefBoxes({ briefId: brief.id, color: boxColor, bg }).catch(() =>
      setErrorToast('Could not save that color. Try again.'),
    );
  }

  // Position and width save together so a move followed by a pinch (or the
  // reverse) inside the debounce window never drops the earlier change.
  function placeSlideInset(
    slideIndex: number,
    change: Partial<{ x: number; y: number; width: number }>,
  ) {
    const segment = slideSegment(slideIndex);
    if (!segment) return;
    const next = {
      x: change.x ?? segment.screenshot_x ?? SLIDE_INSET_DEFAULTS.x,
      y: change.y ?? segment.screenshot_y ?? SLIDE_INSET_DEFAULTS.y,
      width: change.width ?? segment.screenshot_width ?? SLIDE_INSET_DEFAULTS.width,
    };
    setPlacedOnce(true);
    setBriefSegments((prev) =>
      prev.map((s) =>
        s.id === segment.id
          ? { ...s, screenshot_x: next.x, screenshot_y: next.y, screenshot_width: next.width }
          : s,
      ),
    );
    const save = () => {
      creatorPlaceSegment({ segmentId: segment.id, screenshot: next }).catch(() =>
        fail('Could not save that picture.', save),
      );
    };
    schedule(`inset:${segment.id}`, save);
  }

  function changeReviewIndex(next: number) {
    setReviewIndex(next);
    setSelectedBoxId(null);
    setFreshBoxId(null);
  }

  const canPlace = slides.some(
    (s) => s.boxes.length > 0 || s.inset !== undefined,
  );
  const reviewSlide = slides[Math.min(reviewIndex, Math.max(slides.length - 1, 0))];
  const reviewBoxes = reviewSlide?.boxes ?? [];
  const reviewSegmentId = slideSegment(reviewIndex)?.id ?? null;
  const selectedBox = reviewBoxes.find((b) => b.id === selectedBoxId) ?? null;

  if (loading) {
    return <DetailSkeleton />;
  }
  if (!assignment || !brief) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Post not found.</Text>
      </View>
    );
  }
  if (slides.length === 0) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>
          This post has no slides yet. Check back soon.
        </Text>
      </View>
    );
  }

  if (phase === 'processing') {
    return (
      <View style={[styles.processing, { paddingTop: insets.top }]}>
        <SpinnerRing />
        <Text style={styles.processingTitle}>Processing your post…</Text>
        <Text style={styles.processingSub}>
          Placing your text on {slides.length}{' '}
          {slides.length === 1 ? 'slide' : 'slides'} and adding your caption.
        </Text>
      </View>
    );
  }

  if (phase === 'review') {
    return (
      <View style={[styles.review, { paddingTop: insets.top + space[2] }]}>
        <View style={styles.reviewHeader}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Edit photos"
            onPress={() => setPhase('idle')}
          >
            <Text style={styles.reviewHeaderBtn}>Edit photos</Text>
          </PressableScale>
          <Text style={styles.reviewHeaderTitle}>Review</Text>
          <SlideToolbar
            onAddText={() => addSlideBox(reviewIndex)}
            onPickPhoto={() => {
              if (reviewSlide) void pickPhoto(reviewSlide.slotIndex);
            }}
            onRemoveSlide={() => removeSlide(reviewIndex)}
            disabled={picking || submitting || removing}
            canRemove={slides.length > 1}
          />
        </View>

        <FrameFit style={styles.reviewStage} frameStyle={styles.reviewCard}>
          <SlideNav
            key={slides.length}
            initialIndex={reviewIndex}
            variant="dark"
            slides={slides.map((s) => ({
              image: previewUris[s.slotIndex],
              boxes: s.boxes,
              inset: s.inset,
            }))}
            style={StyleSheet.absoluteFill}
            onTapEmpty={() => {
              setSelectedBoxId(null);
              setFreshBoxId(null);
            }}
            editing={{
              onMoveBox: moveSlideBox,
              onScaleBox: scaleSlideBox,
              onTapBox: (_slideIndex, boxId) => {
                setFreshBoxId(null);
                setSelectedBoxId(boxId);
              },
              onMoveInset: (slideIndex, x, y) => placeSlideInset(slideIndex, { x, y }),
              onScaleInset: (slideIndex, width) => placeSlideInset(slideIndex, { width }),
              selectedBoxId,
            }}
            chrome
            swipe
            onIndexChange={changeReviewIndex}
          />
          {reviewSlide !== undefined && photos[reviewSlide.slotIndex] === undefined ? (
            <View style={styles.stageCta} pointerEvents="box-none">
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`Add photo for slide ${reviewIndex + 1}`}
                onPress={() => void pickPhoto(reviewSlide.slotIndex)}
                disabled={picking}
                style={styles.stageCtaBtn}
              >
                <Icon name="image-plus" size={18} color={color.ink} />
                <Text style={styles.stageCtaText}>Add photo</Text>
              </PressableScale>
            </View>
          ) : null}
          {reviewSlide?.duplicate ? (
            <View style={styles.duplicatePillStage} pointerEvents="none">
              <Text style={styles.duplicateText}>Duplicate? Same words as the slide before</Text>
            </View>
          ) : null}
          {canPlace && !placedOnce ? (
            <View style={styles.placeHint} pointerEvents="none">
              <Text style={styles.placeHintText}>
                Drag to move, pinch to resize, tap to edit
              </Text>
            </View>
          ) : null}
        </FrameFit>
        {/* Fixed height slot so paging to a slide without text never shifts the stage. */}
        <View style={[styles.colorPicker, { marginBottom: sheetHeight }]}>
          {reviewBoxes.length > 0 && reviewSegmentId !== null ? (
            <TextColorPicker
              key={reviewSegmentId}
              boxes={reviewBoxes}
              onChange={(_boxId, pick) => styleSlideBox(pick.color, pick.bg)}
            />
          ) : null}
        </View>

        <Animated.View
          onLayout={(e) => {
            // Measure the panel at rest only; the text panel and keyboard overlay the stage.
            if (selectedBox === null && keyboardHeight === 0) {
              setSheetHeight(e.nativeEvent.layout.height);
            }
          }}
          style={[
            styles.reviewSheet,
            {
              paddingBottom: Math.max(insets.bottom, 14) + 6 + keyboardHeight,
              transform: [
                {
                  translateY: reviewSheet.interpolate({
                    inputRange: [0, 1],
                    outputRange: [220, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {selectedBox !== null ? (
            <TextEditPanel
              key={selectedBox.id}
              box={selectedBox}
              autoFocus={freshBoxId === selectedBox.id}
              onChange={(box) => editSlideBox(reviewIndex, box)}
              onDelete={() => deleteSlideBox(reviewIndex, selectedBox.id)}
              onDone={(finalText) =>
                finishEditingBox(reviewIndex, selectedBox.id, finalText)
              }
            />
          ) : (
            <>
              <Text style={styles.reviewLabel}>Autofilled from the brief</Text>
              <Text style={styles.reviewTitle} numberOfLines={2}>
                {brief.title}
              </Text>
              <View style={styles.reviewChips}>
                <FormatTag format={brief.format} />
                {typeMeta !== null ? (
                  <TypeTag label={typeMeta.label} typeKey={typeMeta.key} />
                ) : null}
              </View>
              {brief.caption ? (
                <View style={styles.captionBlock}>
                  <Text style={styles.captionLabel}>Caption</Text>
                  <Text style={styles.captionText} numberOfLines={4}>
                    {brief.caption}
                  </Text>
                </View>
              ) : null}
              <View style={styles.actionRow}>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel="Preview post"
                  onPress={() => setPreviewVisible(true)}
                  disabled={submitting}
                  style={styles.previewBtn}
                >
                  <Icon name="play" size={18} color={color.ink} />
                  <Text style={styles.previewText}>Preview</Text>
                </PressableScale>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel="Send for approval"
                  onPress={() => void sendForApproval()}
                  disabled={submitting}
                  style={[styles.sendBtn, (submitting || !allPicked) && styles.sendBtnOff]}
                >
                  {submitting ? (
                    <ActivityIndicator color={color.white} />
                  ) : (
                    <Icon name="send" size={19} color={color.white} />
                  )}
                  <Text style={styles.sendText} numberOfLines={1}>
                    {submitting ? 'Sending…' : allPicked ? 'Send for approval' : missingLabel}
                  </Text>
                </PressableScale>
              </View>
            </>
          )}
        </Animated.View>

        <PostPreview
          visible={previewVisible}
          onClose={() => setPreviewVisible(false)}
          creatorName={profile?.full_name ?? ''}
          handle={tiktokHandle}
          typeLabel={typeMeta?.label ?? null}
          caption={brief.caption ?? ''}
          hashtags={brief.hashtags ?? []}
          media={{
            kind: 'slides',
            slides: slides.map((s) => ({
              photoUri: photos[s.slotIndex]?.uri,
              boxes: s.boxes,
              inset: undefined,
              text: s.text,
            })),
          }}
        />

        <SoftToast
          visible={errorToast !== null}
          message={errorToast ?? ''}
          tone="error"
          onHide={() => setErrorToast(null)}
        />
        <RetryToast
          failure={failure}
          bottom={sheetHeight + keyboardHeight + space[3]}
          onDismiss={() => setFailure(null)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          style={styles.closeBtn}
        >
          <Icon name="x" size={20} color={color.ink} />
        </PressableScale>
        <FormatTag format={brief.format} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{brief.title}</Text>
        <Text style={styles.sub}>
          Add a photo for each slide. Tap a slide to edit its text, hold to remove it.
        </Text>

        {slides.map((slide, i) => {
          const photo = photos[slide.slotIndex];
          return (
            <PressableScale
              key={slide.slotIndex}
              accessibilityRole="button"
              accessibilityLabel={`Edit slide ${i + 1}`}
              onPress={() => openStage(i)}
              onLongPress={() => removeSlide(i)}
              style={[styles.slideCard, shadow.shadowCard]}
            >
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={
                  photo
                    ? `Swap photo for slide ${i + 1}`
                    : `Add photo for slide ${i + 1}`
                }
                onPress={() => void pickPhoto(slide.slotIndex)}
                onLongPress={() => removeSlide(i)}
                style={[styles.tile, photo !== undefined && styles.tileFilled]}
              >
                {photo !== undefined ? (
                  <>
                    <SlideStage
                      boxes={slide.boxes}
                      photoUri={photo.uri}
                      inset={slide.inset}
                      tint={color.ink800}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.tileCheck}>
                      <Icon name="check" size={11} color={color.white} />
                    </View>
                  </>
                ) : (
                  <ImagePlus size={20} color={color.blue600} strokeWidth={2} />
                )}
              </PressableScale>
              <View style={styles.slideBody}>
                <View style={styles.slideLabelRow}>
                  <Text style={styles.slideLabel}>Slide {i + 1}</Text>
                  {slide.duplicate ? (
                    <View style={styles.duplicatePill}>
                      <Text style={styles.duplicateText}>Duplicate?</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.slideText}>
                  {slide.text || 'No text on this slide'}
                </Text>
              </View>
              <Icon name="chevron-right" size={18} color={color.slate300} />
            </PressableScale>
          );
        })}
      </ScrollView>

      <View
        style={[styles.footer, { paddingBottom: Math.max(16, insets.bottom + 4) }]}
      >
        {allPicked ? (
          <Button variant="primary" size="lg" block onPress={() => void processSlideshow()}>
            Process slideshow
          </Button>
        ) : (
          <>
            <Button
              variant="primary"
              size="lg"
              block
              icon="images"
              disabled={picking || nextEmpty === undefined}
              onPress={() => {
                if (nextEmpty !== undefined) void pickPhoto(nextEmpty.slotIndex);
              }}
            >
              {`Add photos · ${pickedCount} of ${slides.length}`}
            </Button>
            <Button variant="ghost" size="md" block onPress={() => openStage(reviewIndex)}>
              Edit slides first
            </Button>
          </>
        )}
      </View>

      <SoftToast
        visible={errorToast !== null}
        message={errorToast ?? ''}
        tone="error"
        onHide={() => setErrorToast(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.offWhite },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.offWhite,
    paddingHorizontal: space.gutter,
  },
  fallbackText: {
    color: color.textMuted,
    fontSize: type.size.body,
    textAlign: 'center',
  },
  topBar: {
    paddingHorizontal: space.gutter,
    paddingVertical: space[2],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: space.gutter,
    paddingTop: space[2],
    gap: space[3],
  },
  title: {
    color: color.ink,
    fontWeight: type.weight.bold,
    fontSize: 24,
    lineHeight: 24 * 1.18,
    letterSpacing: -0.5,
  },
  sub: {
    color: color.slate500,
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    marginBottom: space[2],
  },
  slideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: radius.lg,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
    padding: 12,
  },
  tile: {
    width: 54,
    height: 96,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: color.lineStrong,
    borderStyle: 'dashed',
    backgroundColor: color.offWhite,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tileFilled: {
    borderStyle: 'solid',
    borderColor: color.line,
  },
  tileCheck: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: color.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideBody: {
    flex: 1,
    gap: 4,
  },
  slideLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  slideLabel: {
    fontSize: type.size.micro,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
  },
  duplicatePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: color.amberSoft,
  },
  duplicatePillStage: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: color.amberSoft,
  },
  duplicateText: {
    fontSize: type.size.micro,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  stageCta: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    backgroundColor: color.white,
  },
  stageCtaText: {
    color: color.ink,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.heavy,
  },
  slideText: {
    color: color.ink,
    fontWeight: type.weight.semibold,
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.snug,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.gutter,
    paddingTop: space[4],
    backgroundColor: color.offWhite,
    gap: 6,
  },
  processing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: space[10],
    backgroundColor: color.ink900,
  },
  spinnerRing: {
    width: 54,
    height: 54,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: color.whiteA28,
    borderTopColor: color.accent,
  },
  processingTitle: {
    color: color.white,
    fontSize: type.size.card,
    fontWeight: type.weight.heavy,
    textAlign: 'center',
  },
  processingSub: {
    color: color.whiteA75,
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    textAlign: 'center',
  },
  review: {
    flex: 1,
    backgroundColor: color.ink900,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[7],
    paddingVertical: space[2],
  },
  reviewHeaderBtn: {
    color: color.white,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
  },
  reviewHeaderTitle: {
    color: color.white,
    fontSize: type.size.body,
    fontWeight: type.weight.heavy,
  },
  reviewStage: {
    flex: 1,
    paddingVertical: space[3],
    paddingHorizontal: space[7],
  },
  reviewCard: {
    borderRadius: radius.xl,
    backgroundColor: color.ink800,
    overflow: 'hidden',
  },
  reviewSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.white,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingHorizontal: space.gutter,
    paddingTop: space[6],
    gap: 10,
  },
  colorPicker: {
    height: 84,
    justifyContent: 'center',
  },
  placeHint: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  placeHintText: {
    color: color.white,
    fontSize: type.size.micro,
    fontWeight: type.weight.bold,
  },
  reviewLabel: {
    fontSize: type.size.micro,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
  },
  reviewTitle: {
    fontSize: 19,
    lineHeight: 19 * 1.25,
    fontWeight: type.weight.bold,
    letterSpacing: -0.3,
    color: color.ink,
  },
  reviewChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  captionBlock: {
    gap: 4,
  },
  captionLabel: {
    fontSize: type.size.micro,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
  },
  captionText: {
    fontSize: type.size.meta,
    lineHeight: type.size.meta * type.leading.body,
    color: color.slate500,
  },
  actionRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewBtn: {
    flex: 2,
    height: 60,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.line,
    backgroundColor: color.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  previewText: {
    color: color.ink,
    fontSize: type.size.action,
    fontWeight: type.weight.heavy,
  },
  sendBtn: {
    flex: 3,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sendBtnOff: {
    opacity: 0.7,
  },
  sendText: {
    color: color.white,
    fontSize: type.size.action,
    fontWeight: type.weight.heavy,
  },
});

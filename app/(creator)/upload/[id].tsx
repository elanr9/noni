import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
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
import { SlideNav } from '../../../components/creator/SlideNav';
import { useCreatorToast } from '../../../components/creator/Toast';
import { DetailSkeleton, SoftToast } from '../../../components/states';
import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { color, motion, radius, shadow, space, type } from '../../../theme/tokens';
import { useAuth } from '../../../lib/auth';
import {
  listBriefSegments,
  parseTalkingPoints,
  type BriefSegment,
} from '../../../lib/briefs-api';
import { useCreatorQueue } from '../../../lib/creator-queue';
import { getAssignment, type AssignmentWithBrief } from '../../../lib/tasks-api';
import { submitAssignmentPhotos, type PickedPhoto } from '../../../lib/submissions';

type Phase = 'idle' | 'processing' | 'review';

type Slide = {
  slotIndex: number;
  text: string;
};

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

export default function UploadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const queue = useCreatorQueue();
  const toast = useCreatorToast();

  const [assignment, setAssignment] = useState<AssignmentWithBrief | null>(null);
  const [briefSegments, setBriefSegments] = useState<BriefSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [photos, setPhotos] = useState<Record<number, PickedPhoto>>({});
  const [picking, setPicking] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const reviewSheet = useRef(new Animated.Value(0)).current;

  const typeMeta = usePostTypeMeta(assignment?.briefs.post_type_id ?? null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      try {
        const a = await getAssignment(id);
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
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

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
    const talkingPoints = parseTalkingPoints(brief.talking_points);
    const slideSegments = briefSegments.filter((s) => s.kind === 'slide');
    if (slideSegments.length > 0) {
      return slideSegments.map((s) => {
        const fromPoint =
          s.talking_point_index !== null
            ? talkingPoints[s.talking_point_index]?.text?.trim()
            : undefined;
        return {
          slotIndex: s.slot_index,
          text: s.overlay_text?.trim() || fromPoint || '',
        };
      });
    }
    const fromPoints = talkingPoints
      .map((p) => p.text?.trim() ?? '')
      .filter((t) => t.length > 0)
      .map((text, i) => ({ slotIndex: i, text }));
    if (fromPoints.length > 0) return fromPoints;
    return scriptBlocks(brief.script).map((text, i) => ({
      slotIndex: i,
      text,
    }));
  }, [brief, briefSegments]);

  const pickedCount = slides.filter((s) => photos[s.slotIndex] !== undefined).length;
  const allPicked = slides.length > 0 && pickedCount === slides.length;
  const nextEmpty = slides.find((s) => photos[s.slotIndex] === undefined);

  async function pickPhoto(slotIndex: number) {
    if (picking || phase !== 'idle' || !assignment) return;
    setPicking(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      const asset = result.canceled ? null : result.assets[0];
      if (asset) {
        const next = {
          ...photos,
          [slotIndex]: { uri: asset.uri, mimeType: asset.mimeType ?? null },
        };
        setPhotos(next);
        await savePhotoDraft(assignment.id, next);
      }
    } finally {
      setPicking(false);
    }
  }

  async function processSlideshow() {
    setPhase('processing');
    await new Promise<void>((resolve) => setTimeout(resolve, PROCESSING_MIN_MS));
    setPhase('review');
  }

  async function sendForApproval() {
    if (!profile || !assignment || !allPicked || submitting) return;
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
        companyId: profile.company_id,
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
      setErrorToast(e instanceof Error ? e.message : 'Upload failed. Try again.');
    }
  }

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
          <View style={styles.reviewHeaderSpacer} />
        </View>

        <View style={styles.reviewStage}>
          <View style={styles.reviewCard}>
            <SlideNav
              variant="dark"
              slides={slides.map((s) => ({
                text: s.text.length > 0 ? s.text : undefined,
                image: photos[s.slotIndex]?.uri,
              }))}
              style={StyleSheet.absoluteFill}
            />
          </View>
        </View>

        <Animated.View
          style={[
            styles.reviewSheet,
            {
              paddingBottom: Math.max(insets.bottom, 14) + 6,
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
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Send for approval"
            onPress={() => void sendForApproval()}
            disabled={submitting}
            style={[styles.sendBtn, submitting && styles.sendBtnOff]}
          >
            {submitting ? (
              <ActivityIndicator color={color.white} />
            ) : (
              <Icon name="send" size={19} color={color.white} />
            )}
            <Text style={styles.sendText}>
              {submitting ? 'Sending…' : 'Send for approval'}
            </Text>
          </PressableScale>
        </Animated.View>

        <SoftToast
          visible={errorToast !== null}
          message={errorToast ?? ''}
          tone="error"
          onHide={() => setErrorToast(null)}
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
          Add a photo for each slide. The text is already on them.
        </Text>

        {slides.map((slide, i) => {
          const photo = photos[slide.slotIndex];
          return (
            <View key={slide.slotIndex} style={[styles.slideCard, shadow.shadowCard]}>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={
                  photo
                    ? `Swap photo for slide ${i + 1}`
                    : `Add photo for slide ${i + 1}`
                }
                onPress={() => void pickPhoto(slide.slotIndex)}
                style={[styles.tile, photo !== undefined && styles.tileFilled]}
              >
                {photo !== undefined ? (
                  <>
                    <Image
                      source={{ uri: photo.uri }}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
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
                <Text style={styles.slideLabel}>Slide {i + 1}</Text>
                <Text style={styles.slideText}>
                  {slide.text || 'No text on this slide'}
                </Text>
              </View>
            </View>
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
    width: 62,
    height: 82,
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
  slideLabel: {
    fontSize: type.size.micro,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
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
  reviewHeaderSpacer: {
    width: 80,
  },
  reviewStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space[3],
  },
  reviewCard: {
    height: '100%',
    aspectRatio: 4 / 5,
    maxWidth: '86%',
    borderRadius: radius.xl,
    backgroundColor: color.ink800,
    overflow: 'hidden',
  },
  reviewSheet: {
    backgroundColor: color.white,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingHorizontal: space.gutter,
    paddingTop: space[6],
    gap: 10,
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
  sendBtn: {
    marginTop: 4,
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

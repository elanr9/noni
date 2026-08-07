import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

import { DetailSkeleton, SoftToast } from '../../../components/states';
import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { color, radius, shadow, space, type } from '../../../theme/tokens';
import { useAuth } from '../../../lib/auth';
import {
  listBriefSegments,
  parseTalkingPoints,
  type BriefSegment,
} from '../../../lib/briefs-api';
import { getAssignment, type AssignmentWithBrief } from '../../../lib/tasks-api';
import { submitAssignmentPhotos, type PickedPhoto } from '../../../lib/submissions';

type Phase = 'idle' | 'submitting' | 'sent';

type Slide = {
  slotIndex: number;
  text: string;
};

const TOAST_MS = 2600;

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

export default function UploadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();

  const [assignment, setAssignment] = useState<AssignmentWithBrief | null>(null);
  const [briefSegments, setBriefSegments] = useState<BriefSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [photos, setPhotos] = useState<Record<number, PickedPhoto>>({});
  const [picking, setPicking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
    return talkingPoints
      .map((p) => p.text?.trim() ?? '')
      .filter((t) => t.length > 0)
      .map((text, i) => ({ slotIndex: i, text }));
  }, [brief, briefSegments]);

  const pickedCount = slides.filter((s) => photos[s.slotIndex] !== undefined).length;
  const allPicked = slides.length > 0 && pickedCount === slides.length;
  const activeSlideIndex = slides.findIndex(
    (s) => photos[s.slotIndex] === undefined,
  );

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

  async function submit() {
    if (!profile || !assignment || !allPicked) return;
    setPhase('submitting');
    try {
      const ordered = slides.map((s) => {
        const photo = photos[s.slotIndex];
        if (photo === undefined) {
          throw new Error('A slide is missing its photo.');
        }
        return photo;
      });
      await submitAssignmentPhotos({
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
      setPhase('sent');
      setTimeout(() => router.replace('/(creator)/(tabs)'), TOAST_MS);
    } catch (e) {
      setPhase('idle');
      setToast(e instanceof Error ? e.message : 'Upload failed. Try again.');
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

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => {
            if (phase === 'idle') router.back();
          }}
          style={styles.backBtn}
        >
          <Icon name="x" size={20} color={color.ink} />
        </PressableScale>
        <View style={styles.topMeta}>
          <Text style={styles.topTitle} numberOfLines={1}>
            Add pictures
          </Text>
          <Text style={styles.topSub}>
            {pickedCount} of {slides.length} slides
          </Text>
        </View>
        <View style={styles.backBtnSpacer} />
      </View>

      <View style={styles.stepper}>
        {slides.map((slide, i) => {
          const done = photos[slide.slotIndex] !== undefined;
          const active = i === activeSlideIndex || (allPicked && i === slides.length - 1);
          return (
            <View
              key={slide.slotIndex}
              style={[
                styles.stepTrack,
                done && styles.stepDone,
                active && !done && styles.stepActive,
              ]}
            />
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Pick a photo for each slide</Text>
        <Text style={styles.subheading}>
          Slide text is added for you. Choose shots that match what each slide
          says. Your picks stay saved if you leave.
        </Text>

        {slides.map((slide, i) => {
          const photo = photos[slide.slotIndex];
          return (
            <View key={slide.slotIndex} style={styles.slideCard}>
              <View style={styles.slideHeader}>
                <View style={styles.slideBadge}>
                  <Text style={styles.slideBadgeText}>{i + 1}</Text>
                </View>
                <Text style={styles.slideText}>
                  {slide.text || 'No text on this slide'}
                </Text>
              </View>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={
                  photo ? `Swap photo for slide ${i + 1}` : `Add photo for slide ${i + 1}`
                }
                style={[styles.photoSlot, photo ? styles.photoSlotFilled : null]}
                onPress={() => void pickPhoto(slide.slotIndex)}
                disabled={phase !== 'idle'}
              >
                {photo ? (
                  <>
                    <Image
                      source={{ uri: photo.uri }}
                      style={styles.photo}
                      resizeMode="cover"
                    />
                    <View style={styles.swapChip}>
                      <Text style={styles.swapChipText}>Swap photo</Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.addCol}>
                    <Icon name="images" size={22} color={color.blue600} />
                    <Text style={styles.addText}>Add photo</Text>
                  </View>
                )}
              </PressableScale>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(30, insets.bottom + 12) }]}>
        {phase === 'submitting' ? (
          <View style={styles.submittingRow}>
            <ActivityIndicator color={color.white} />
            <Text style={styles.hint}>Uploading your photos…</Text>
          </View>
        ) : (
          <Button
            variant="primary"
            size="lg"
            block
            disabled={!allPicked || phase !== 'idle'}
            onPress={() => void submit()}
          >
            {allPicked
              ? 'Send for review'
              : `${pickedCount} of ${slides.length} photos picked`}
          </Button>
        )}
      </View>

      <SoftToast
        visible={toast !== null}
        message={toast ?? ''}
        tone="error"
        onHide={() => setToast(null)}
      />

      {phase === 'sent' ? (
        <View style={[styles.toast, shadow.shadowFloat]} pointerEvents="none">
          <Text style={styles.toastText}>
            Sent for review. Approve lands it in your queue.
          </Text>
        </View>
      ) : null}
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
    paddingBottom: space[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnSpacer: { width: 40, height: 40 },
  topMeta: { flex: 1, alignItems: 'center', gap: 2 },
  topTitle: {
    fontSize: type.size.action,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  topSub: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.slate400,
  },
  stepper: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: space.gutter,
    marginBottom: space[3],
  },
  stepTrack: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: color.line,
  },
  stepDone: { backgroundColor: color.blue300 },
  stepActive: { backgroundColor: color.accent },
  scroll: {
    paddingHorizontal: space.gutter,
    gap: space.stackGap,
  },
  heading: {
    color: color.ink,
    fontWeight: type.weight.heavy,
    fontSize: type.size.titleSm,
    letterSpacing: type.tracking.title,
    marginTop: space[2],
  },
  subheading: {
    color: color.textMuted,
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    marginBottom: space[2],
  },
  slideCard: {
    borderRadius: radius.lg,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
    padding: space.cardPad,
    gap: space[3],
    ...shadow.shadowCard,
  },
  slideHeader: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  slideBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideBadgeText: {
    color: color.blue700,
    fontWeight: type.weight.heavy,
    fontSize: type.size.chip,
  },
  slideText: {
    flex: 1,
    color: color.ink,
    fontWeight: type.weight.semibold,
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
  },
  photoSlot: {
    height: 200,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: color.offWhite,
  },
  photoSlotFilled: {
    borderStyle: 'solid',
    borderColor: color.line,
  },
  photo: { ...StyleSheet.absoluteFillObject },
  addCol: { alignItems: 'center', gap: 8 },
  addText: {
    color: color.blue600,
    fontWeight: type.weight.bold,
    fontSize: type.size.bodySm,
  },
  swapChip: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: color.scrimStrong,
  },
  swapChipText: {
    color: color.white,
    fontWeight: type.weight.bold,
    fontSize: type.size.chip,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.gutter,
    paddingTop: space[5],
    backgroundColor: color.offWhite,
  },
  submittingRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    height: space.tapPrimary,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
  },
  hint: {
    color: color.white,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.semibold,
  },
  toast: {
    position: 'absolute',
    left: space[7],
    right: space[7],
    bottom: 112,
    borderRadius: radius.md,
    backgroundColor: color.ink,
    paddingHorizontal: space[5],
    paddingVertical: 14,
    alignItems: 'center',
    zIndex: 30,
  },
  toastText: {
    color: color.white,
    fontWeight: type.weight.semibold,
    fontSize: type.size.meta,
    textAlign: 'center',
  },
});

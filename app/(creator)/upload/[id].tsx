import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, shadow } from '../../../theme/tokens';
import { useAuth } from '../../../lib/auth';
import {
  listBriefSegments,
  parseTalkingPoints,
  type BriefSegment,
} from '../../../lib/briefs-api';
import { getAssignment, type AssignmentWithBrief } from '../../../lib/tasks-api';
import { submitAssignmentPhotos, type PickedPhoto } from '../../../lib/submissions';

type Phase = 'idle' | 'submitting' | 'sent';

/** One slide of the static post: the text the photo has to carry. */
type Slide = {
  slotIndex: number;
  text: string;
};

/** Post-submit toast duration before returning Home. */
const TOAST_MS = 2600;

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

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      try {
        const a = await getAssignment(id);
        if (cancelled) return;
        setAssignment(a);
        if (a) {
          const segs = await listBriefSegments(a.briefs.id);
          if (!cancelled) setBriefSegments(segs);
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

  // Slides come from brief_segments (kind slide); briefs without segments
  // fall back to one slide per talking point, matching the derivation rule.
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

  async function pickPhoto(slotIndex: number) {
    if (picking || phase !== 'idle') return;
    setPicking(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      const asset = result.canceled ? null : result.assets[0];
      if (asset) {
        setPhotos((prev) => ({
          ...prev,
          [slotIndex]: { uri: asset.uri, mimeType: asset.mimeType ?? null },
        }));
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
      setPhase('sent');
      setTimeout(() => router.replace('/(creator)/(tabs)'), TOAST_MS);
    } catch (e) {
      setPhase('idle');
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Try again');
    }
  }

  if (loading) {
    return (
      <View style={styles.fallback}>
        <ActivityIndicator size="large" color={color.accent} />
      </View>
    );
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
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + 14 }]}>
        <Pressable
          onPress={() => {
            if (phase === 'idle') router.back();
          }}
          hitSlop={12}
        >
          <Text style={styles.topBtn}>Close</Text>
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {brief.title}
        </Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Pick your photos</Text>
        <Text style={styles.subheading}>
          One photo per slide. The slide text gets added for you, so pick shots
          that fit what each slide says.
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
              <Pressable
                style={[styles.photoSlot, photo && styles.photoSlotFilled]}
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
                  <Text style={styles.addText}>Add photo</Text>
                )}
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {phase === 'submitting' ? (
          <View style={styles.submittingRow}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={styles.hint}>Uploading your photos…</Text>
          </View>
        ) : (
          <Pressable
            style={[styles.submitBtn, !allPicked && styles.submitBtnOff]}
            disabled={!allPicked || phase !== 'idle'}
            onPress={() => void submit()}
          >
            <Text style={styles.submitText}>
              {allPicked
                ? 'Send for review'
                : `${pickedCount} of ${slides.length} photos picked`}
            </Text>
          </Pressable>
        )}
      </View>

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
  root: { flex: 1, backgroundColor: color.ink900 },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.ink900,
    paddingHorizontal: 32,
  },
  fallbackText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    textAlign: 'center',
  },
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBtn: { color: '#fff', fontWeight: '700', fontSize: 16, width: 48 },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  scroll: { paddingHorizontal: 20, gap: 14 },
  heading: { color: '#fff', fontWeight: '800', fontSize: 24, marginTop: 6 },
  subheading: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  slideCard: {
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 14,
    gap: 12,
  },
  slideHeader: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  slideBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideBadgeText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  slideText: {
    flex: 1,
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
    lineHeight: 21,
  },
  photoSlot: {
    height: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  photoSlotFilled: { borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.12)' },
  photo: { ...StyleSheet.absoluteFillObject },
  addText: { color: color.accentTint, fontWeight: '700', fontSize: 15 },
  swapChip: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  swapChipText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: 'rgba(11,15,20,0.92)',
  },
  submittingRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
  },
  submitBtn: {
    height: 52,
    borderRadius: 999,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnOff: { backgroundColor: 'rgba(255,255,255,0.16)' },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  hint: { color: '#fff', fontSize: 15, fontWeight: '600' },
  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 104,
    borderRadius: 16,
    backgroundColor: color.ink,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    zIndex: 30,
  },
  toastText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center',
  },
});

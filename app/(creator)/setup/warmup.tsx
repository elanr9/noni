import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter, type Href } from 'expo-router';

import { Button } from '../../../components/ui/Button';
import { Icon, type IconName } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { SentBackCard } from '../../../components/states';
import { SkeletonLine } from '../../../components/ui/Skeleton';
import { useAuth } from '../../../lib/auth';
import { startAccountSubmission } from '../../../lib/account-submission';
import {
  getCreatorAccount,
  type CreatorAccount,
} from '../../../lib/creator-accounts-api';
import { markWarmupTutorialSeen } from '../../../lib/setup';
import { borderWidth, color, radius, shadow, space, type } from '../../../theme/tokens';

type RecordingKind = 'tiktok-recording' | 'instagram-recording';

type RecordingSlot = {
  kind: RecordingKind;
  label: string;
  hint: string;
  minSeconds: number;
};

const RECORDING_SLOTS: RecordingSlot[] = [
  {
    kind: 'tiktok-recording',
    label: 'TikTok',
    hint: '15 seconds of For You scrolling',
    minSeconds: 15,
  },
  {
    kind: 'instagram-recording',
    label: 'Instagram',
    hint: '20 seconds of home, explore, reels',
    minSeconds: 20,
  },
];

const STEPS_PAGE: { icon: IconName; title: string; steps: string[] } = {
  icon: 'flame',
  title: 'Warm up your accounts',
  steps: [
    'Search college soccer recruiting',
    'Like and save recruiting videos',
    'Follow a few college programs',
    'Watch videos to the end',
    '15 minutes on TikTok and Instagram',
  ],
};

const PAGE_COUNT = 2;

export default function WarmupScreen() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { profile } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  const seenMarked = useRef(false);

  const [page, setPage] = useState(0);
  const [account, setAccount] = useState<CreatorAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [picked, setPicked] = useState<
    Partial<Record<RecordingKind, { uri: string; mimeType: string }>>
  >({});

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setAccount(await getCreatorAccount(profile.company_id, profile.id));
    } catch {
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (page === PAGE_COUNT - 1 && profile && !seenMarked.current) {
      seenMarked.current = true;
      void markWarmupTutorialSeen(profile.id).catch(() => undefined);
    }
  }, [page, profile]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const goTo = (next: number) => {
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
    setPage(next);
  };

  const existingRecordingPath = (kind: RecordingKind): string | null =>
    kind === 'tiktok-recording'
      ? account?.tiktok_recording_path ?? null
      : account?.instagram_recording_path ?? null;

  const pickRecording = async (slot: RecordingSlot) => {
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        // Skip the slow iOS re-encode; screen recordings upload as they are.
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      });
    } catch (e) {
      Alert.alert(
        'Could not open your videos',
        e instanceof Error ? e.message : 'Try again',
      );
      return;
    }
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset === undefined) return;
    const seconds = (asset.duration ?? 0) / 1000;
    if (seconds > 0 && seconds < slot.minSeconds - 1) {
      Alert.alert(
        'Recording too short',
        `${slot.label} needs at least ${slot.minSeconds} seconds.`,
      );
      return;
    }
    setPicked((prev) => ({
      ...prev,
      [slot.kind]: { uri: asset.uri, mimeType: asset.mimeType ?? 'video/mp4' },
    }));
  };

  const submitProof = () => {
    if (!profile || !account) return;
    const tiktokHandle = account.tiktok_handle;
    const instagramHandle = account.instagram_handle;
    const instagramScreenshot = account.instagram_screenshot_path;
    const tiktokScreenshot = account.tiktok_screenshot_path;
    if (!tiktokHandle || !instagramHandle || !instagramScreenshot || !tiktokScreenshot) {
      Alert.alert(
        'Finish step one first',
        'Save your handles and profile screenshots in Create your accounts.',
      );
      return;
    }
    const missing = RECORDING_SLOTS.filter(
      (slot) =>
        picked[slot.kind] === undefined && existingRecordingPath(slot.kind) === null,
    );
    if (missing.length > 0) {
      Alert.alert('Recordings missing', missing.map((s) => s.label).join('\n'));
      return;
    }
    const source = (kind: RecordingKind) => {
      const local = picked[kind];
      return local !== undefined
        ? { uri: local.uri, mimeType: local.mimeType }
        : { path: existingRecordingPath(kind) ?? '' };
    };

    // The upload keeps running after this screen closes, so the creator is not
    // held on a spinner while a screen recording goes up.
    startAccountSubmission({
      companyId: profile.company_id,
      creatorId: profile.id,
      tiktokHandle,
      instagramHandle,
      instagramScreenshotPath: instagramScreenshot,
      tiktokScreenshotPath: tiktokScreenshot,
      instagramRecording: source('instagram-recording'),
      tiktokRecording: source('tiktok-recording'),
    });
    setPicked({});
    setSubmitted(true);
  };

  const status = account?.status ?? null;
  const proofOpen =
    !loading && account !== null && status !== 'pending' && status !== 'approved';
  const recordingsReady = RECORDING_SLOTS.every(
    (slot) =>
      picked[slot.kind] !== undefined || existingRecordingPath(slot.kind) !== null,
  );

  if (submitted) {
    return (
      <View style={styles.submitted}>
        <View style={styles.submittedSeal}>
          <Icon name="check" size={34} color={color.white} strokeWidth={3} />
        </View>
        <Text style={styles.submittedTitle}>Application submitted!</Text>
        <Text style={styles.submittedBody}>
          We will let you know once your accounts are approved.
        </Text>
        <Button size="lg" block variant="primary" onPress={() => router.back()}>
          Done
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
      >
        <ScrollView
          style={{ width }}
          contentContainerStyle={styles.page}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.pageIcon}>
            <Icon name={STEPS_PAGE.icon} size={26} color={color.blue700} />
          </View>
          <Text style={styles.pageTitle}>{STEPS_PAGE.title}</Text>
          {STEPS_PAGE.steps.map((step) => (
            <View key={step} style={styles.bulletRow}>
              <Icon name="check" size={16} color={color.green} />
              <Text style={styles.bulletText}>{step}</Text>
            </View>
          ))}
        </ScrollView>

        <ScrollView
          style={{ width }}
          contentContainerStyle={styles.page}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.pageIcon}>
            <Icon name="video" size={26} color={color.blue700} />
          </View>
          <Text style={styles.pageTitle}>Prove it</Text>
          <Text style={styles.pageBody}>
            Screen record each app while you scroll.
          </Text>

          {loading ? (
            <View style={styles.proofSkeletons}>
              <SkeletonLine height={64} radius={radius.md} />
              <SkeletonLine height={64} radius={radius.md} />
            </View>
          ) : account === null ? (
            <View style={styles.noticeCard}>
              <Icon name="circle-alert" size={19} color={color.amber} />
              <Text style={styles.noticeText}>Create your accounts first.</Text>
              <Button
                size="sm"
                variant="outline"
                onPress={() => router.push('/(creator)/account-setup' as Href)}
              >
                Go
              </Button>
            </View>
          ) : status === 'pending' ? (
            <View style={[styles.noticeCard, { backgroundColor: color.amberSoft }]}>
              <Icon name="clock" size={19} color={color.amber} />
              <Text style={styles.noticeText}>Submitted. In review.</Text>
            </View>
          ) : status === 'approved' ? (
            <View style={[styles.noticeCard, { backgroundColor: color.greenSoft }]}>
              <Icon name="circle-check-big" size={19} color={color.green} />
              <Text style={styles.noticeText}>Approved.</Text>
            </View>
          ) : (
            <>
              {account.reason != null ? (
                <SentBackCard reason={account.reason} />
              ) : null}
              {RECORDING_SLOTS.map((slot) => {
                const chosen = picked[slot.kind] !== undefined;
                const already = existingRecordingPath(slot.kind) !== null;
                return (
                  <PressableScale
                    key={slot.kind}
                    accessibilityRole="button"
                    accessibilityLabel={slot.label}
                    onPress={() => void pickRecording(slot)}
                    style={[styles.slot, shadow.shadowCard]}
                  >
                    <Icon
                      name="video"
                      size={19}
                      color={chosen || already ? color.green : color.slate400}
                    />
                    <View style={styles.slotText}>
                      <Text style={styles.slotLabel}>{slot.label}</Text>
                      <Text style={styles.slotHint}>
                        {chosen
                          ? 'Ready to upload'
                          : already
                            ? 'Uploaded. Tap to replace'
                            : slot.hint}
                      </Text>
                    </View>
                    {(chosen || already) && (
                      <Icon name="circle-check-big" size={18} color={color.green} />
                    )}
                  </PressableScale>
                );
              })}
              <Button
                size="lg"
                variant="primary"
                block
                disabled={!recordingsReady}
                onPress={submitProof}
              >
                Submit for review
              </Button>
            </>
          )}
        </ScrollView>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {Array.from({ length: PAGE_COUNT }, (_, i) => (
            <View
              key={i}
              style={[styles.dot, i === page ? styles.dotActive : null]}
            />
          ))}
        </View>
        {page < PAGE_COUNT - 1 ? (
          <Button size="md" variant="primary" iconRight="arrow-right" onPress={() => goTo(page + 1)}>
            Next
          </Button>
        ) : (
          !proofOpen && (
            <Button size="md" variant="outline" onPress={() => router.back()}>
              Back to setup
            </Button>
          )
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
  submitted: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.offWhite,
    paddingHorizontal: space.gutter,
    gap: space[4],
  },
  submittedSeal: {
    width: 68,
    height: 68,
    borderRadius: radius.pill,
    backgroundColor: color.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[2],
  },
  submittedTitle: {
    fontSize: type.size.titleSm,
    letterSpacing: type.tracking.title,
    fontWeight: '700',
    color: color.ink,
    textAlign: 'center',
  },
  submittedBody: {
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    color: color.slate500,
    textAlign: 'center',
    marginBottom: space[4],
  },
  page: {
    paddingHorizontal: space.gutter,
    paddingTop: 24,
    paddingBottom: 24,
    gap: 12,
  },
  pageIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    fontSize: type.size.titleSm,
    fontWeight: '700',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  pageBody: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
    lineHeight: 22,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: color.white,
    borderRadius: radius.cell,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    padding: 12,
  },
  bulletText: {
    flex: 1,
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.ink,
    lineHeight: 20,
  },
  proofSkeletons: { gap: 10 },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: color.blue100,
    borderRadius: radius.md,
    padding: 14,
  },
  noticeText: {
    flex: 1,
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.ink,
    lineHeight: 19,
  },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: color.white,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  slotText: { flex: 1, gap: 2 },
  slotLabel: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.ink,
  },
  slotHint: {
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.slate500,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.gutter,
    paddingTop: 10,
    paddingBottom: 28,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: color.lineStrong,
  },
  dotActive: {
    backgroundColor: color.blue500,
    width: 18,
  },
});

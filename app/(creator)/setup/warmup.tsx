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
import { SkeletonLine } from '../../../components/ui/Skeleton';
import { useAuth } from '../../../lib/auth';
import {
  getCreatorAccount,
  submitCreatorAccount,
  uploadVerificationAsset,
  type CreatorAccount,
} from '../../../lib/creator-accounts-api';
import { markWarmupTutorialSeen, refreshSetupState } from '../../../lib/setup';
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
    label: 'TikTok For You recording',
    hint: '15 seconds minimum of continuous For You scrolling',
    minSeconds: 15,
  },
  {
    kind: 'instagram-recording',
    label: 'Instagram recording',
    hint: '20 seconds scrolling home, then explore, then reels',
    minSeconds: 20,
  },
];

const INFO_PAGES: Array<{
  icon: IconName;
  title: string;
  body: string;
  bullets?: string[];
}> = [
  {
    icon: 'flame',
    title: 'Warm up your accounts',
    body: 'Before your first post, both apps need to learn who you are. Warming up means 15 to 20 minutes of scrolling, searching, and liking college soccer and recruiting content on TikTok and Instagram.',
  },
  {
    icon: 'eye',
    title: 'Why it matters',
    body: 'The For You page decides who sees your posts. A warm account gets shown to soccer players and their parents. A cold account gets shown to nobody, no matter how good the post is.',
  },
  {
    icon: 'sparkles',
    title: 'What to do',
    body: 'Spend 15 to 20 minutes on each app doing this:',
    bullets: [
      'Search college soccer recruiting and watch what comes up',
      'Like and save videos about recruiting, offers, and campus visits',
      'Follow a few college programs and recruiting accounts',
      'Watch videos to the end so the app knows you care',
    ],
  },
];

const PAGE_COUNT = INFO_PAGES.length + 1;

export default function WarmupScreen() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { profile } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  const seenMarked = useRef(false);

  const [page, setPage] = useState(0);
  const [account, setAccount] = useState<CreatorAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Partial<Record<RecordingKind, string>>>({});

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
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.85,
    });
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
    setPicked((prev) => ({ ...prev, [slot.kind]: asset.uri }));
  };

  const submitProof = async () => {
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
    setBusy(true);
    try {
      const paths: Record<RecordingKind, string> = {
        'tiktok-recording': '',
        'instagram-recording': '',
      };
      for (const slot of RECORDING_SLOTS) {
        const local = picked[slot.kind];
        paths[slot.kind] =
          local !== undefined
            ? await uploadVerificationAsset({
                companyId: profile.company_id,
                creatorId: profile.id,
                kind: slot.kind,
                localUri: local,
                contentType: 'video/mp4',
              })
            : existingRecordingPath(slot.kind) ?? '';
      }
      await submitCreatorAccount({
        companyId: profile.company_id,
        creatorId: profile.id,
        tiktokHandle,
        instagramHandle,
        instagramRecordingPath: paths['instagram-recording'],
        tiktokRecordingPath: paths['tiktok-recording'],
        instagramScreenshotPath: instagramScreenshot,
        tiktokScreenshotPath: tiktokScreenshot,
      });
      setPicked({});
      await refreshSetupState(profile.company_id, profile.id);
      Alert.alert(
        'Proof submitted',
        'Your accounts are in review. You will hear back soon.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e) {
      Alert.alert('Could not submit', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const status = account?.status ?? null;
  const proofOpen =
    !loading && account !== null && status !== 'pending' && status !== 'approved';

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
      >
        {INFO_PAGES.map((info) => (
          <ScrollView
            key={info.title}
            style={{ width }}
            contentContainerStyle={styles.page}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.pageIcon}>
              <Icon name={info.icon} size={26} color={color.blue700} />
            </View>
            <Text style={styles.pageTitle}>{info.title}</Text>
            <Text style={styles.pageBody}>{info.body}</Text>
            {info.bullets?.map((bullet) => (
              <View key={bullet} style={styles.bulletRow}>
                <Icon name="check" size={16} color={color.green} />
                <Text style={styles.bulletText}>{bullet}</Text>
              </View>
            ))}
          </ScrollView>
        ))}

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
            Record your screen while you scroll. If the feed shows soccer and
            recruiting, you are warm. We need one recording per app.
          </Text>

          {loading ? (
            <View style={styles.proofSkeletons}>
              <SkeletonLine height={64} radius={radius.md} />
              <SkeletonLine height={64} radius={radius.md} />
            </View>
          ) : account === null ? (
            <View style={styles.noticeCard}>
              <Icon name="circle-alert" size={19} color={color.amber} />
              <Text style={styles.noticeText}>
                Create your accounts first. We attach the proof to them.
              </Text>
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
              <Text style={styles.noticeText}>
                Proof submitted. We are reviewing it now.
              </Text>
            </View>
          ) : status === 'approved' ? (
            <View style={[styles.noticeCard, { backgroundColor: color.greenSoft }]}>
              <Icon name="circle-check-big" size={19} color={color.green} />
              <Text style={styles.noticeText}>
                Approved. Your accounts are cleared to receive posts.
              </Text>
            </View>
          ) : (
            <>
              {account.reason != null && (
                <View style={[styles.noticeCard, { backgroundColor: color.amberSoft }]}>
                  <Icon name="circle-alert" size={19} color={color.amber} />
                  <Text style={styles.noticeText}>{account.reason}</Text>
                </View>
              )}
              {RECORDING_SLOTS.map((slot) => {
                const chosen = picked[slot.kind] !== undefined;
                const already = existingRecordingPath(slot.kind) !== null;
                return (
                  <PressableScale
                    key={slot.kind}
                    accessibilityRole="button"
                    accessibilityLabel={slot.label}
                    disabled={busy}
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
                disabled={busy}
                onPress={() => void submitProof()}
              >
                {busy ? 'Uploading…' : 'Submit for review'}
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

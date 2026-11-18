import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import Animated, { FadeIn, FadeInDown, LinearTransition, ZoomIn } from 'react-native-reanimated';

import { Notice, SentBackNote, UploadSlot } from '../../../components/creator/v2/setup/SetupParts';
import { Button, Icon, Screen, Skeleton, type IconName } from '../../../components/v2';
import { toast } from '../../../components/v2/Toast';
import { useAuth } from '../../../lib/auth';
import { startAccountSubmission } from '../../../lib/account-submission';
import {
  getCreatorAccount,
  type CreatorAccount,
} from '../../../lib/creator-accounts-api';
import { warmupSteps } from '../../../lib/company-copy';
import { useCompanyNiche } from '../../../lib/company-copy-api';
import { markWarmupTutorialSeen } from '../../../lib/setup';
import { color, motion, radius, shadow, space, text } from '../../../theme/v2';

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

const STEPS_PAGE: { icon: IconName; title: string } = {
  icon: 'bolt',
  title: 'Warm up your accounts',
};

const PAGE_COUNT = 2;

export default function WarmupScreen() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { profile } = useAuth();
  const steps = warmupSteps(useCompanyNiche());
  const scrollRef = useRef<ScrollViewInstance>(null);
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
      setAccount(await getCreatorAccount(profile.active_company_id, profile.id));
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
      toast.error(e instanceof Error && e.message ? `Could not open your videos. ${e.message}` : 'Could not open your videos. Try again.');
      return;
    }
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset === undefined) return;
    const seconds = (asset.duration ?? 0) / 1000;
    if (seconds > 0 && seconds < slot.minSeconds - 1) {
      toast.error(`That recording is too short. ${slot.label} needs at least ${slot.minSeconds} seconds.`);
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
      toast.error('Finish step one first: save your handles and profile screenshots.', {
        label: 'Open',
        onPress: () => router.push('/(creator)/account-setup' as Href),
      });
      return;
    }
    const missing = RECORDING_SLOTS.filter(
      (slot) =>
        picked[slot.kind] === undefined && existingRecordingPath(slot.kind) === null,
    );
    if (missing.length > 0) {
      toast.error(`Add your ${missing.map((s) => s.label).join(' and ')} recording first.`);
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
      companyId: profile.active_company_id,
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
      <Screen white>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.screen, gap: space[3] }}>
          <Animated.View
            entering={ZoomIn.duration(motion.sheet).easing(motion.spring)}
            style={{ width: 72, height: 72, borderRadius: radius.pill, backgroundColor: color.green, alignItems: 'center', justifyContent: 'center', marginBottom: space[2] }}
          >
            <Icon name="check" size={38} weight={700} color={color.white} />
          </Animated.View>
          <Animated.Text entering={FadeInDown.duration(motion.tabIn).delay(120)} style={[text.title, { fontSize: 26, lineHeight: 32, textAlign: 'center' }]}>
            Application submitted
          </Animated.Text>
          <Animated.Text entering={FadeInDown.duration(motion.tabIn).delay(180)} style={[text.body, { color: color.grey4, textAlign: 'center' }]}>
            We will let you know once your accounts are approved.
          </Animated.Text>
        </View>
        <View style={{ flexDirection: 'row', paddingHorizontal: space.screen, paddingBottom: space[8] }}>
          <Button label="Done" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const isLast = page === PAGE_COUNT - 1;
  const footer =
    !isLast ? (
      <Button label="Next" icon="arrow_forward" onPress={() => goTo(page + 1)} />
    ) : proofOpen ? (
      <Button label="Submit for review" disabled={!recordingsReady} onPress={submitProof} />
    ) : (
      <Button variant="quiet" label="Back to setup" onPress={() => router.back()} />
    );

  return (
    <Screen
      back
      title="Warm up"
      center={
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {Array.from({ length: PAGE_COUNT }, (_, i) => (
            <Animated.View
              key={i}
              layout={LinearTransition.duration(motion.pill)}
              style={{ width: i === page ? 18 : 7, height: 7, borderRadius: radius.pill, backgroundColor: i === page ? color.blue : color.grey2 }}
            />
          ))}
        </View>
      }
      footer={footer}
    >
      <ScrollView ref={scrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScrollEnd}>
        <ScrollView style={{ width }} contentContainerStyle={{ paddingHorizontal: space.screen, paddingTop: space[4], paddingBottom: space[6] }} showsVerticalScrollIndicator={false}>
          <PageHead icon={STEPS_PAGE.icon} title={STEPS_PAGE.title} />
          {steps.map((step, i) => (
            <Animated.View
              key={step}
              entering={FadeInDown.duration(240).delay(i * 50)}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, marginBottom: space[2], borderRadius: radius.card, backgroundColor: color.card, ...shadow.card }}
            >
              <Icon name="check_circle" size={20} color={color.green} />
              <Text style={[text.body, { flex: 1 }]}>{step}</Text>
            </Animated.View>
          ))}
        </ScrollView>

        <ScrollView style={{ width }} contentContainerStyle={{ paddingHorizontal: space.screen, paddingTop: space[4], paddingBottom: space[6] }} showsVerticalScrollIndicator={false}>
          <PageHead icon="videocam" title="Prove it" body="Screen record each app while you scroll." />
          {loading ? (
            <>
              <Skeleton h={68} />
              <Skeleton h={68} />
            </>
          ) : account === null ? (
            <Notice
              tone="amber"
              icon="info"
              title="Create your accounts first"
              right={<Button pill variant="secondary" label="Go" onPress={() => router.push('/(creator)/account-setup' as Href)} />}
            />
          ) : status === 'pending' ? (
            <Notice tone="amber" icon="schedule" title="Submitted. In review." />
          ) : status === 'approved' ? (
            <Notice tone="green" icon="check_circle" title="Approved." />
          ) : (
            <Animated.View entering={FadeIn.duration(200)}>
              {account.reason != null ? <SentBackNote reason={account.reason} /> : null}
              {RECORDING_SLOTS.map((slot, i) => (
                <UploadSlot
                  key={slot.kind}
                  icon="videocam"
                  label={slot.label}
                  hint={slot.hint}
                  index={i}
                  chosen={picked[slot.kind] !== undefined}
                  already={existingRecordingPath(slot.kind) !== null}
                  onPress={() => void pickRecording(slot)}
                />
              ))}
            </Animated.View>
          )}
        </ScrollView>
      </ScrollView>
    </Screen>
  );
}

function PageHead({ icon, title, body }: { icon: IconName; title: string; body?: string }) {
  return (
    <View style={{ gap: space[2], marginBottom: space[4] }}>
      <View style={{ width: 52, height: 52, borderRadius: radius.pill, backgroundColor: color.blueTint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={26} color={color.blueDeep} />
      </View>
      <Text style={[text.title, { fontSize: 26, lineHeight: 32 }]}>{title}</Text>
      {body ? <Text style={[text.body, { color: color.grey4 }]}>{body}</Text> : null}
    </View>
  );
}

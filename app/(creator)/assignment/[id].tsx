import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { FormatTag, TypeTag } from '../../../components/creator/Chips';
import {
  estimateDurationLabel,
  exampleHandle,
  scriptBlocks,
  usePostTypeMeta,
} from '../../../components/creator/PostCard';
import { SlideNav } from '../../../components/creator/SlideNav';
import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { StatusChip } from '../../../components/ui/StatusChip';
import { slotTimeLabel } from '../../../lib/creator-queue';
import {
  getAssignment,
  type AssignmentWithBrief,
} from '../../../lib/tasks-api';
import { color, radius, shadow, type } from '../../../theme/tokens';

function formatSeconds(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** linear-gradient(160deg, blue100, lineStrong) idle frame, as on MediaCard. */
function IdleGradient() {
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="taskIdleGrad" x1="0%" y1="0%" x2="34%" y2="94%">
          <Stop offset="0" stopColor={color.blue100} />
          <Stop offset="1" stopColor={color.lineStrong} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#taskIdleGrad)" />
    </Svg>
  );
}

function ExamplePlayer({ assignment }: { assignment: AssignmentWithBrief }) {
  const brief = assignment.briefs;
  const slideshow = brief.format === 'photo_carousel';
  const aspect = slideshow ? 4 / 5 : 9 / 16;

  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [durationSec, setDurationSec] = useState<number | null>(null);

  const videoSource = !slideshow ? brief.example_url : null;
  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = true;
  });

  useEffect(() => {
    if (!playing || slideshow) return;
    const t = setInterval(() => {
      if (player.duration > 0) {
        setDurationSec(player.duration);
        setProgress(Math.min(player.currentTime / player.duration, 1));
      }
    }, 250);
    return () => clearInterval(t);
  }, [playing, slideshow, player]);

  const togglePlay = () => {
    if (slideshow || videoSource === null) return;
    if (playing) {
      player.pause();
      setPlaying(false);
    } else {
      player.play();
      setPlaying(true);
      setStarted(true);
    }
  };

  const handle = exampleHandle(brief.example_url);
  const durationLabel =
    durationSec !== null
      ? formatSeconds(durationSec)
      : estimateDurationLabel(brief);

  // True post dimensions inside the remaining space: fit the aspect box to
  // the measured frame.
  let mediaW = 0;
  let mediaH = 0;
  if (frame !== null) {
    mediaH = frame.h;
    mediaW = mediaH * aspect;
    if (mediaW > frame.w) {
      mediaW = frame.w;
      mediaH = mediaW / aspect;
    }
  }

  return (
    <View
      style={styles.playerFrame}
      onLayout={(e) =>
        setFrame({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }
    >
      {frame !== null && mediaW > 0 ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={
            slideshow ? 'Example slideshow' : playing ? 'Pause example' : 'Play example'
          }
          onPress={togglePlay}
          style={[
            styles.media,
            shadow.shadowMedia,
            { width: mediaW, height: mediaH },
            playing && styles.mediaPlaying,
          ]}
        >
          {slideshow ? (
            <SlideNav
              variant="dark"
              slides={scriptBlocks(brief.script).map((text) => ({ text }))}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <>
              {!started ? <IdleGradient /> : null}
              {started && videoSource !== null ? (
                <VideoView
                  style={StyleSheet.absoluteFill}
                  player={player}
                  contentFit="cover"
                  nativeControls={false}
                />
              ) : null}
              {!playing ? (
                <View style={styles.playCenter} pointerEvents="none">
                  <View style={styles.playCircle}>
                    <Icon name="play" size={22} color={color.ink} />
                  </View>
                </View>
              ) : null}
              {started ? (
                <View style={styles.progressRow} pointerEvents="none">
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { flex: Math.max(progress, 0.001) },
                      ]}
                    />
                    <View style={{ flex: Math.max(1 - progress, 0.001) }} />
                  </View>
                  {durationLabel !== undefined ? (
                    <Text style={styles.progressTime}>{durationLabel}</Text>
                  ) : null}
                </View>
              ) : null}
            </>
          )}

          {handle !== null ? (
            <View style={styles.sourcePill} pointerEvents="none">
              <Icon name="music-2" size={12} color={color.ink} />
              <Text style={styles.sourceText} numberOfLines={1}>
                {handle}
              </Text>
            </View>
          ) : null}
        </PressableScale>
      ) : null}
    </View>
  );
}

export default function AssignmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [assignment, setAssignment] = useState<AssignmentWithBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const typeMeta = usePostTypeMeta(assignment?.briefs.post_type_id ?? null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setAssignment(await getAssignment(id));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={styles.loading}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={color.accent} />
      </View>
    );
  }

  if (!assignment) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.nav}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Icon name="chevron-left" size={20} color={color.ink} />
          </PressableScale>
          <Text style={styles.navTitle}>Task</Text>
          <View style={styles.navSpacer} />
        </View>
        <Text style={styles.missing}>Post not found.</Text>
      </View>
    );
  }

  const brief = assignment.briefs;
  const isVideo = brief.format !== 'photo_carousel';
  const canRecord =
    assignment.status === 'assigned' ||
    assignment.status === 'changes_requested' ||
    assignment.status === 'recorded';
  // Legacy carousels (null post_type_id) still record their script as video.
  const usesUpload = !isVideo && brief.post_type_id !== null;

  function onRecord() {
    if (!assignment) return;
    if (assignment.status === 'changes_requested') {
      router.push(`/(creator)/record/changes/${assignment.id}`);
      return;
    }
    if (usesUpload) {
      router.push(`/(creator)/upload/${assignment.id}`);
      return;
    }
    router.push(`/(creator)/record/${assignment.id}?assignment=1`);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.nav}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Icon name="chevron-left" size={20} color={color.ink} />
        </PressableScale>
        <Text style={styles.navTitle}>Task</Text>
        <View style={styles.navSpacer} />
      </View>

      <View style={styles.column}>
        <View style={styles.chipRow}>
          <StatusChip status={assignment.status} />
          <FormatTag format={brief.format} />
          {typeMeta !== null ? (
            <TypeTag label={typeMeta.label} typeKey={typeMeta.key} />
          ) : null}
          <Text style={styles.postsAt}>
            Posts {slotTimeLabel(assignment.slot_index)}
          </Text>
        </View>

        <Text style={styles.title}>{brief.title}</Text>

        <ExamplePlayer assignment={assignment} />

        {canRecord ? (
          <View
            style={[
              styles.cta,
              { paddingBottom: Math.max(16, insets.bottom + 4) },
            ]}
          >
            <Button
              variant="primary"
              size="lg"
              block
              icon={usesUpload ? 'images' : 'video'}
              onPress={onRecord}
            >
              {usesUpload ? 'Create slides' : 'Record'}
            </Button>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.white,
  },
  loading: {
    flex: 1,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missing: {
    paddingHorizontal: 24,
    paddingTop: 12,
    fontSize: type.size.bodySm,
    color: color.textMuted,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 6,
    minHeight: 46,
  },
  navTitle: {
    fontSize: type.size.action,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  navSpacer: {
    width: 34,
    height: 34,
  },
  backBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  column: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 6,
    gap: 12,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  postsAt: {
    fontSize: type.size.chip,
    color: color.slate400,
  },
  title: {
    fontSize: 24,
    lineHeight: 24 * 1.18,
    fontWeight: type.weight.bold,
    letterSpacing: -0.5,
    color: color.ink,
  },
  playerFrame: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  media: {
    borderRadius: radius['2xl'],
    backgroundColor: color.blue100,
    overflow: 'hidden',
  },
  mediaPlaying: {
    backgroundColor: color.ink900,
  },
  playCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 54,
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourcePill: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA92,
    maxWidth: '85%',
  },
  sourceText: {
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  progressRow: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA28,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: color.white,
    borderRadius: radius.pill,
  },
  progressTime: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
    color: color.whiteA90,
  },
  cta: {
    paddingTop: 2,
  },
});

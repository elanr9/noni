import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PinnedPlayer } from '../../../components/admin/PinnedPlayer';
import { RequestChangesSheet } from '../../../components/admin/RequestChangesSheet';
import { ScriptLineList } from '../../../components/admin/ScriptLineList';
import { SlideshowViewer } from '../../../components/admin/SlideshowViewer';
import { ThreadTab } from '../../../components/admin/ThreadTab';
import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import { InfoBlock } from '../../../components/ui/InfoBlock';
import { PressableScale } from '../../../components/ui/PressableScale';
import { Segmented } from '../../../components/ui/Segmented';
import {
  latestSubmissionsByAssignment,
  listAssignmentQueue,
  reviewAssignment,
  signedVideoUrl,
  type AssignmentQueueItem,
  type Submission,
} from '../../../lib/admin-api';
import {
  eventsToThread,
  scriptToLines,
  slidesFromScript,
  toAssignmentQueueRow,
} from '../../../lib/admin-queue-map';
import { useAuth } from '../../../lib/auth';
import { listAssignmentReviewEvents } from '../../../lib/review-events';
import type { MockQueueItem, MockThreadEntry } from '../../../lib/admin-review-types';
import { borderWidth, color, radius, type } from '../../../theme/tokens';

type ReviewItem = {
  assignment: AssignmentQueueItem;
  row: MockQueueItem;
  submission: Submission | null;
};

export default function ReviewScreen() {
  const { id, creator, brief } = useLocalSearchParams<{
    id: string;
    creator?: string;
    brief?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: winHeight } = useWindowDimensions();
  const { profile } = useAuth();

  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [index, setIndex] = useState(0);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [thread, setThread] = useState<MockThreadEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [tab, setTab] = useState(0);
  const [slideIndex, setSlideIndex] = useState(0);
  const [sheetVisible, setSheetVisible] = useState(false);

  /** Signed URLs by assignment id, so the next item starts instantly. */
  const urlCache = useRef(new Map<string, string>());

  const signedUrlFor = useCallback(async (item: ReviewItem): Promise<string | null> => {
    if (item.row.format !== 'video' || !item.submission?.video_path) return null;
    const cached = urlCache.current.get(item.assignment.id);
    if (cached !== undefined) return cached;
    const url = await signedVideoUrl(item.submission.video_path);
    urlCache.current.set(item.assignment.id, url);
    return url;
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

  // Load the current item's video and thread, autoplay, prefetch the next one.
  useEffect(() => {
    if (currentId === undefined || current === undefined) return;
    let cancelled = false;
    setPositionSec(0);
    setSlideIndex(0);
    setTab(current.row.resubmitted ? 2 : 0);
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
        const events = await listAssignmentReviewEvents(currentId);
        if (!cancelled) setThread(eventsToThread(events));
      } catch {
        if (!cancelled) setThread([]);
      }
      const next = queue[index + 1];
      if (next !== undefined) void signedUrlFor(next).catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  const durationSec = current?.submission?.duration_seconds ?? 0;

  useEffect(() => {
    if (durationSec > 0 && positionSec >= durationSec) setPlaying(false);
  }, [positionSec, durationSec]);

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={color.blue500} />
      </View>
    );
  }

  if (!current) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
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
  const counterLabel = `${index + 1} of ${Math.max(queue.length, 1)}`;
  const caption = briefRow.caption ?? '';
  const scriptLines = scriptToLines(briefRow.script);
  const slides = slidesFromScript(briefRow.script);
  // The video owns the screen; meta, tabs and footer share the remainder.
  const playerHeight = Math.max(330, winHeight - insets.top - 330);

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
    setThread([]);
    setQueue(rest);
    setIndex(Math.min(index, rest.length - 1));
  }

  async function runReview(action: 'approved' | 'changes_requested', note: string | null) {
    if (!profile || !current) return;
    if (!current.submission) {
      Alert.alert('Missing submission', 'This post has no video to review yet.');
      return;
    }
    setBusy(true);
    try {
      await reviewAssignment({
        assignment: current.assignment,
        submissionId: current.submission.id,
        reviewerId: profile.id,
        action,
        note,
      });
      advance();
    } catch (e) {
      Alert.alert(
        action === 'approved' ? "Couldn't approve" : "Couldn't send note",
        e instanceof Error ? e.message : 'Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const metaRow = (
    <View style={styles.metaRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarInitial}>{row.creator.initial}</Text>
      </View>
      <Text style={styles.metaName}>{row.creator.name}</Text>
      <Text style={styles.metaDot}>{'\u00b7'}</Text>
      <Text numberOfLines={1} style={styles.metaAge}>
        {`${row.title} \u00b7 ${row.ageLabel}`}
      </Text>
    </View>
  );

  const footer = (
    <View style={styles.footer}>
      <View style={styles.footerRow}>
        <Button
          variant="outline"
          size="md"
          block
          disabled={busy}
          style={styles.footerRequest}
          onPress={() => setSheetVisible(true)}
        >
          Request changes
        </Button>
        <Button
          variant="primary"
          size="md"
          icon="check"
          block
          disabled={busy}
          style={styles.footerApprove}
          onPress={() => void runReview('approved', null)}
        >
          Approve
        </Button>
      </View>
    </View>
  );

  const sheet = (
    <RequestChangesSheet
      visible={sheetVisible}
      creatorName={row.creator.name}
      onClose={() => setSheetVisible(false)}
      onSend={(note) => {
        setSheetVisible(false);
        void runReview('changes_requested', note);
      }}
    />
  );

  if (isReel) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar style="light" />
        <PinnedPlayer
          key={assignment.id}
          heightPx={playerHeight}
          playing={playing}
          onTogglePlay={togglePlay}
          positionSec={positionSec}
          durationSec={durationSec}
          videoUri={videoUri}
          onPositionSec={videoUri !== null ? setPositionSec : undefined}
          onBack={() => router.back()}
          counterLabel={counterLabel}
          takeChip={row.resubmitted ? `Take ${submission?.version ?? 2}` : undefined}
        />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {metaRow}
          <Segmented options={['Script', 'Caption', 'Thread']} value={tab} onChange={setTab} />
          {tab === 0 && (
            <ScriptLineList
              lines={scriptLines}
              positionSec={positionSec}
              hasTimings={false}
              onSeek={setPositionSec}
            />
          )}
          {tab === 1 && <InfoBlock label="CAPTION">{caption || 'No caption.'}</InfoBlock>}
          {tab === 2 &&
            (thread.length > 0 ? (
              <ThreadTab entries={thread} />
            ) : (
              <Text style={styles.emptyThread}>No notes yet on this post.</Text>
            ))}
        </ScrollView>
        {footer}
        {sheet}
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" />
      <View style={styles.header}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={{ top: 9, bottom: 9, left: 16, right: 9 }}
        >
          <Icon name="chevron-left" size={26} color={color.ink} />
        </PressableScale>
        <Text style={styles.headerTitle}>Review</Text>
        <View style={styles.headerCounter}>
          <Text style={styles.headerCounterText}>{counterLabel}</Text>
        </View>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <SlideshowViewer slides={slides} index={slideIndex} onSelect={setSlideIndex} />
        {metaRow}
        <Text style={styles.h1}>{row.title}</Text>
        <InfoBlock label={`SLIDE ${slideIndex + 1} COPY`}>
          {slides[slideIndex] ?? ''}
        </InfoBlock>
        <InfoBlock label="CAPTION">{caption || 'No caption.'}</InfoBlock>
      </ScrollView>
      {footer}
      {sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.white,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  missing: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 24,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.ink,
  },
  headerCounter: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
  },
  headerCounterText: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.slate500,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: type.size.micro11,
    fontWeight: '800',
    color: color.blue700,
  },
  metaName: {
    fontSize: type.size.meta,
    fontWeight: '700',
    color: color.ink,
  },
  metaDot: {
    fontSize: type.size.meta,
    color: color.slate300,
  },
  metaAge: {
    flexShrink: 1,
    fontSize: type.size.meta,
    fontWeight: '400',
    color: color.slate400,
  },
  h1: {
    fontSize: type.size.titleSm,
    lineHeight: 31,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: color.ink,
  },
  emptyThread: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
  },
  footer: {
    borderTopWidth: borderWidth.hair,
    borderTopColor: color.line,
    backgroundColor: color.white,
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: 30,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  footerRequest: {
    flex: 1,
  },
  footerApprove: {
    flex: 1.35,
  },
});

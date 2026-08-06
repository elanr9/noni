import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApprovedOverlay } from '../../../components/admin/review/ApprovedOverlay';
import { ReelSurface } from '../../../components/admin/review/ReelSurface';
import { ReviewMetaOverlay } from '../../../components/admin/review/ReviewMetaOverlay';
import { ReviewTopBar } from '../../../components/admin/review/ReviewTopBar';
import {
  RevisionMode,
  type RevisionSection,
} from '../../../components/admin/review/RevisionMode';
import { SentConfirmation } from '../../../components/admin/review/SentConfirmation';
import { SlideshowSurface } from '../../../components/admin/review/SlideshowSurface';
import { Button } from '../../../components/ui/Button';
import {
  latestSubmissionsByAssignment,
  listAssignmentQueue,
  reviewAssignment,
  signedVideoUrl,
  type AssignmentQueueItem,
  type Submission,
} from '../../../lib/admin-api';
import {
  scriptToLines,
  slidesFromScript,
  toAssignmentQueueRow,
} from '../../../lib/admin-queue-map';
import {
  listBriefSegments,
  listPostTypes,
  type BriefSegment,
} from '../../../lib/briefs-api';
import { useAuth } from '../../../lib/auth';
import type { MockQueueItem } from '../../../lib/admin-review-types';
import { borderWidth, color, type } from '../../../theme/tokens';

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

export default function ReviewScreen() {
  const { id, creator, brief } = useLocalSearchParams<{
    id: string;
    creator?: string;
    brief?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();

  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [index, setIndex] = useState(0);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [slideIndex, setSlideIndex] = useState(0);
  const [briefSegments, setBriefSegments] = useState<BriefSegment[]>([]);
  const [typeLabels, setTypeLabels] = useState<Map<string, string>>(new Map());

  const [revisionVisible, setRevisionVisible] = useState(false);
  const [approvedVisible, setApprovedVisible] = useState(false);
  const [sentVisible, setSentVisible] = useState(false);

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

  // The `type` in the bottom scrim's `type · age` line.
  useEffect(() => {
    let cancelled = false;
    void listPostTypes()
      .then((rows) => {
        if (!cancelled) setTypeLabels(new Map(rows.map((r) => [r.id, r.label])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
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

  // Load the current item's video and segments, autoplay, prefetch the next one.
  useEffect(() => {
    if (currentId === undefined || current === undefined) return;
    let cancelled = false;
    setPositionSec(0);
    setSlideIndex(0);
    setBriefSegments([]);
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
        const segments = await listBriefSegments(current.assignment.brief_id);
        if (!cancelled) setBriefSegments(segments);
      } catch {
        if (!cancelled) setBriefSegments([]);
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
      <View style={[styles.fallbackScreen, styles.centered]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={color.blue500} />
      </View>
    );
  }

  if (!current) {
    return (
      <View style={[styles.fallbackScreen, styles.centered, { paddingTop: insets.top }]}>
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
  const attempt = submission?.version ?? 1;
  const typeLabel =
    briefRow.post_type_id !== null
      ? typeLabels.get(briefRow.post_type_id) ?? null
      : null;

  const scriptTexts = isReel
    ? scriptToLines(briefRow.script).map((line) => line.text)
    : slidesFromScript(briefRow.script);
  // brief_segments carry the render fields; slot order matches slide order.
  const slideTexts = scriptTexts.map((text, i) => {
    const overlay = briefSegments[i]?.overlay_text;
    return overlay?.trim() ? overlay : text;
  });
  const hasScreenshot = scriptTexts.map(
    (_, i) => briefSegments[i]?.screenshot_url != null,
  );

  const sections: RevisionSection[] = [
    ...scriptTexts.map((text, i) => ({
      key: `segment-${i}`,
      label: sectionLabel(i, scriptTexts.length, isReel),
      text,
    })),
    { key: 'caption', label: 'Caption', text: caption || 'No caption.' },
  ];

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
    setPlaying(false);
    setQueue(rest);
    setIndex(Math.min(index, rest.length - 1));
  }

  async function runReview(
    action: 'approved' | 'changes_requested',
    note: string | null,
  ): Promise<boolean> {
    if (!profile || !current) return false;
    if (!current.submission) {
      Alert.alert('Missing submission', 'This post has no video to review yet.');
      return false;
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
      return true;
    } catch (e) {
      Alert.alert(
        action === 'approved' ? "Couldn't approve" : "Couldn't send back",
        e instanceof Error ? e.message : 'Check your connection and try again.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  const approve = async () => {
    const ok = await runReview('approved', null);
    if (ok) {
      setPlaying(false);
      setApprovedVisible(true);
    }
  };

  const sendBack = async (note: string) => {
    const ok = await runReview('changes_requested', note);
    if (ok) {
      setPlaying(false);
      setRevisionVisible(false);
      setSentVisible(true);
    }
  };

  const closeAndAdvance = () => {
    setApprovedVisible(false);
    setSentVisible(false);
    advance();
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      <View style={styles.media}>
        {isReel ? (
          <ReelSurface
            key={assignment.id}
            videoUri={videoUri}
            playing={playing}
            onTogglePlay={togglePlay}
            positionSec={positionSec}
            durationSec={durationSec}
            onPositionSec={setPositionSec}
          />
        ) : (
          <SlideshowSurface
            slides={slideTexts}
            index={slideIndex}
            onIndex={setSlideIndex}
            hasScreenshot={hasScreenshot}
          />
        )}

        <ReviewMetaOverlay
          creatorName={row.creator.name}
          handle={null}
          typeLabel={typeLabel}
          ageLabel={row.ageLabel}
          format={row.format}
          caption={caption}
          hashtags={briefRow.hashtags}
        />
        <ReviewTopBar
          topInset={insets.top}
          counterLabel={counterLabel}
          takeLabel={attempt > 1 ? `Take ${attempt}` : undefined}
          onBack={() => router.back()}
          onChat={() =>
            router.push({
              pathname: '/(admin)/chat/[creatorId]',
              params: { creatorId: assignment.creator_id, assignment: assignment.id },
            })
          }
        />
      </View>

      <View style={[styles.actionStrip, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Button
          variant="outline"
          size="md"
          disabled={busy}
          style={styles.request}
          onPress={() => setRevisionVisible(true)}
        >
          Request changes
        </Button>
        <Button
          variant="primary"
          size="md"
          icon="check"
          disabled={busy}
          style={styles.approve}
          onPress={() => void approve()}
        >
          Approve
        </Button>
      </View>

      {revisionVisible && (
        <RevisionMode
          sections={sections}
          busy={busy}
          onCancel={() => setRevisionVisible(false)}
          onSend={(note) => void sendBack(note)}
        />
      )}
      {approvedVisible && (
        <ApprovedOverlay
          title={row.title}
          format={row.format}
          creatorName={row.creator.name}
          onNext={closeAndAdvance}
        />
      )}
      {sentVisible && (
        <SentConfirmation creatorName={row.creator.name} onNext={closeAndAdvance} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.ink900,
  },
  fallbackScreen: {
    flex: 1,
    backgroundColor: color.offWhite,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  missing: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.semibold,
    color: color.slate500,
  },
  media: {
    flex: 1,
    overflow: 'hidden',
  },
  actionStrip: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
    paddingHorizontal: 20,
    borderTopWidth: borderWidth.hair,
    borderTopColor: color.line,
    backgroundColor: color.white,
  },
  request: {
    flex: 46,
  },
  approve: {
    flex: 54,
  },
});

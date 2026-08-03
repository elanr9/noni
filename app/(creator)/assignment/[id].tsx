import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { ReviewThread } from '../../../components/ReviewThread';
import { StatusChip } from '../../../components/StatusChip';
import { color } from '../../../theme/tokens';
import { useAuth } from '../../../lib/auth';
import {
  insertComment,
  latestChangesNote,
  listAssignmentReviewEvents,
  type ReviewEvent,
} from '../../../lib/review-events';
import {
  getAssignment,
  parseAssignmentMetrics,
  type AssignmentWithBrief,
} from '../../../lib/tasks-api';
import {
  DEFAULT_BOUNTY_AMOUNT_CENTS,
  DEFAULT_BOUNTY_VIEW_THRESHOLD,
  fetchBountySettings,
  type BountySettings,
} from '../../../lib/bounty';
import { formatViews } from '../../../components/creator/PostCard';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export default function AssignmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [assignment, setAssignment] = useState<AssignmentWithBrief | null>(null);
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [bounty, setBounty] = useState<BountySettings>({
    amountCents: DEFAULT_BOUNTY_AMOUNT_CENTS,
    viewThreshold: DEFAULT_BOUNTY_VIEW_THRESHOLD,
  });

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const a = await getAssignment(id);
      setAssignment(a);
      if (a) setEvents(await listAssignmentReviewEvents(a.id));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      if (!profile?.company_id) return;
      // Defaults stand if the settings read fails.
      fetchBountySettings(profile.company_id).then(setBounty, () => undefined);
    }, [profile?.company_id]),
  );

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
  const done = assignment.status === 'approved' || assignment.status === 'posted';
  const changesNote = latestChangesNote(events);
  const metrics = parseAssignmentMetrics(assignment.metrics);
  const bountyPaid = assignment.bounty_credited_at !== null;

  function onRecord() {
    if (!assignment) return;
    if (isVideo) {
      router.push(`/(creator)/record/${assignment.id}?assignment=1`);
      return;
    }
    Alert.alert(
      'Create slides',
      'Photo carousel posting is coming soon. Open the example above and shoot the slides to match.',
    );
  }

  async function sendComment(text: string) {
    if (!assignment || !profile || assignment.submission_id === null) {
      throw new Error('No submission to comment on');
    }
    await insertComment({
      submissionId: assignment.submission_id,
      authorId: profile.id,
      note: text,
      assignmentId: assignment.id,
    });
    setEvents(await listAssignmentReviewEvents(assignment.id));
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
        <StatusChip status={assignment.status} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.metaRow}>
          <View style={styles.formatChip}>
            <Icon
              name={isVideo ? 'video' : 'images'}
              size={13}
              color={color.blue700}
            />
            <Text style={styles.formatText}>
              {isVideo ? 'Reel' : 'Slideshow'}
            </Text>
          </View>
        </View>

        <Text style={styles.title}>{brief.title}</Text>
        {brief.hook ? <Text style={styles.hook}>{brief.hook}</Text> : null}
        {brief.why_it_works ? (
          <Text style={styles.why}>{brief.why_it_works}</Text>
        ) : null}

        {brief.example_url ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Watch the example"
            style={styles.exampleBtn}
            onPress={() => void Linking.openURL(brief.example_url as string)}
          >
            <Icon name="play" size={16} color={color.ink} />
            <Text style={styles.exampleText}>Watch the example</Text>
          </PressableScale>
        ) : null}

        {brief.script ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Script</Text>
            <Text style={styles.blockBody}>{brief.script}</Text>
          </View>
        ) : null}

        {brief.caption ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Caption</Text>
            <Text style={styles.blockBody}>{brief.caption}</Text>
          </View>
        ) : null}

        {done ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Your post</Text>
            {assignment.post_url !== null ? (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Open the live post"
                style={styles.postLink}
                onPress={() =>
                  void Linking.openURL(assignment.post_url as string)
                }
              >
                <Icon name="play" size={14} color={color.blue700} />
                <Text style={styles.postLinkText}>Open the live post</Text>
              </PressableScale>
            ) : (
              <Text style={styles.blockBody}>Posting is scheduled.</Text>
            )}
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {metrics.views !== undefined ? formatViews(metrics.views) : '—'}
                </Text>
                <Text style={styles.statLabel}>Views</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {metrics.likes !== undefined ? formatViews(metrics.likes) : '—'}
                </Text>
                <Text style={styles.statLabel}>Likes</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {metrics.revenue_cents !== undefined
                    ? formatMoney(metrics.revenue_cents)
                    : '—'}
                </Text>
                <Text style={styles.statLabel}>Revenue</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {bountyPaid
                    ? formatMoney(assignment.bounty_amount_cents ?? 0)
                    : `${formatViews(Math.min(metrics.views ?? 0, bounty.viewThreshold))} / ${formatViews(bounty.viewThreshold)}`}
                </Text>
                <Text style={styles.statLabel}>
                  {bountyPaid
                    ? 'Bounty paid'
                    : `${formatMoney(bounty.amountCents)} bounty`}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {changesNote !== null && assignment.status === 'changes_requested' ? (
          <View style={styles.changesBanner}>
            <Text style={styles.changesLabel}>Changes requested</Text>
            <Text style={styles.changesBody}>{changesNote}</Text>
          </View>
        ) : null}

        <ReviewThread
          events={events}
          onSendComment={sendComment}
          composerEnabled={!done && assignment.submission_id !== null}
        />
      </ScrollView>

      {canRecord ? (
        <View style={[styles.cta, { paddingBottom: Math.max(30, insets.bottom + 12) }]}>
          <Button
            variant="primary"
            size="lg"
            block
            icon={isVideo ? 'video' : 'images'}
            onPress={onRecord}
          >
            {isVideo ? 'Record' : 'Create'}
          </Button>
          <Text style={styles.caption}>
            {brief.script?.trim()
              ? 'Your script runs in the teleprompter.'
              : 'No script here. Say it your way.'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.surface,
  },
  loading: {
    flex: 1,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missing: {
    paddingHorizontal: 24,
    paddingTop: 12,
    fontSize: 15,
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
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 6,
    paddingBottom: 24,
    gap: 12,
  },
  metaRow: {
    flexDirection: 'row',
  },
  formatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: color.blue100,
  },
  formatText: {
    fontSize: 12,
    fontWeight: '700',
    color: color.blue700,
  },
  title: {
    fontSize: 26,
    lineHeight: 30.7,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: color.ink,
  },
  hook: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600',
    color: color.ink,
  },
  why: {
    fontSize: 14,
    lineHeight: 21,
    color: color.slate500,
  },
  exampleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 16,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
  },
  exampleText: {
    fontSize: 14,
    fontWeight: '700',
    color: color.ink,
  },
  block: {
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  blockLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: color.slate400,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  blockBody: {
    fontSize: 15,
    lineHeight: 22.5,
    color: color.ink,
  },
  postLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  postLinkText: {
    fontSize: 14,
    fontWeight: '700',
    color: color.blue700,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: color.ink,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: color.slate400,
  },
  changesBanner: {
    backgroundColor: color.amberSoft,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  changesLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: color.amber,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  changesBody: {
    fontSize: 15,
    lineHeight: 22.5,
    color: color.ink,
  },
  cta: {
    paddingTop: 14,
    paddingHorizontal: 24,
    gap: 10,
  },
  caption: {
    fontSize: 12,
    fontWeight: '600',
    color: color.slate400,
    textAlign: 'center',
  },
});

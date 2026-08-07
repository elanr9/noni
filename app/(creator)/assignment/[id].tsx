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
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';

import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { parseChangesNote, ReviewThread } from '../../../components/ReviewThread';
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
  markMusicAdded,
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
  const needsChanges = assignment.status === 'changes_requested';
  const changesNote = latestChangesNote(events);
  const changesSections =
    needsChanges && changesNote !== null ? parseChangesNote(changesNote) : [];
  const metrics = parseAssignmentMetrics(assignment.metrics);
  const bountyPaid = assignment.bounty_credited_at !== null;
  // Slideshow music loop: live post -> creator adds the song in each app ->
  // one tap here -> admin's music approval queue -> earnings unlock.
  const showMusicStep =
    !isVideo && assignment.status === 'posted' && assignment.music_approved_at === null;
  const musicMarked = assignment.music_marked_by_creator_at !== null;

  // Legacy carousels (null post_type_id) still record their script as video;
  // post-approved expects that path for them. Only new-world carousels pick
  // photos on the upload screen.
  const usesUpload = !isVideo && brief.post_type_id !== null;

  function onRecord() {
    if (!assignment) return;
    if (usesUpload) {
      router.push(`/(creator)/upload/${assignment.id}`);
      return;
    }
    router.push(`/(creator)/record/${assignment.id}?assignment=1`);
  }

  async function onMusicAdded() {
    if (!assignment) return;
    try {
      const updated = await markMusicAdded(assignment.id);
      setAssignment({ ...assignment, ...updated });
    } catch (e) {
      Alert.alert(
        'Could not send',
        e instanceof Error ? e.message : 'Try again',
      );
    }
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

        {needsChanges ? (
          <View style={styles.changesCard}>
            <View style={styles.changesHeader}>
              <Icon name="rotate-ccw" size={15} color={color.amber} />
              <Text style={styles.changesLabel}>Changes requested</Text>
            </View>
            {changesSections.length > 0 ? (
              <View style={styles.changesList}>
                {changesSections.map((section, i) => (
                  <View key={`${section.label ?? 'note'}-${i}`} style={styles.changesItem}>
                    {section.label !== null ? (
                      <Text style={styles.changesItemLabel}>{section.label}</Text>
                    ) : null}
                    <Text style={styles.changesBody}>{section.text}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.changesBody}>
                Your reviewer asked for another take. Check the feedback below.
              </Text>
            )}
            <Text style={styles.changesHint}>
              {isVideo
                ? 'Fix what is called out, then record again below.'
                : 'Fix what is called out, then redo your slides below.'}
            </Text>
          </View>
        ) : null}

        {brief.hook ? <Text style={styles.hook}>{brief.hook}</Text> : null}
        {brief.why_it_works ? (
          <Text style={styles.why}>{brief.why_it_works}</Text>
        ) : null}

        {brief.example_url ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Watch the example"
            style={styles.exampleBtn}
            onPress={() =>
              void WebBrowser.openBrowserAsync(brief.example_url as string)
            }
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

        {showMusicStep ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Music</Text>
            {musicMarked ? (
              <Text style={styles.blockBody}>
                Sent. The admin is confirming the song and your earnings unlock
                after that.
              </Text>
            ) : (
              <>
                <Text style={styles.blockBody}>
                  Open the post in TikTok and Instagram, add the song, then tap
                  once here.
                </Text>
                <Button variant="primary" block onPress={() => void onMusicAdded()}>
                  Music added
                </Button>
              </>
            )}
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
            icon={usesUpload ? 'images' : 'video'}
            onPress={onRecord}
          >
            {needsChanges
              ? usesUpload
                ? 'Redo your slides'
                : 'Record again'
              : usesUpload
                ? 'Create'
                : 'Record'}
          </Button>
          <Text style={styles.caption}>
            {needsChanges
              ? 'Only redo what the note calls out.'
              : brief.script?.trim()
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
  changesCard: {
    backgroundColor: color.amberSoft,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  changesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  changesLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: color.amber,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  changesList: {
    gap: 10,
  },
  changesItem: {
    gap: 2,
  },
  changesItemLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: color.ink,
  },
  changesBody: {
    fontSize: 15,
    lineHeight: 22.5,
    color: color.ink,
  },
  changesHint: {
    fontSize: 12,
    fontWeight: '600',
    color: color.amber,
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

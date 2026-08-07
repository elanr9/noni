import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Screen } from '../../../components/layout/Screen';
import { Icon } from '../../../components/ui/Icon';
import { InfoBlock } from '../../../components/ui/InfoBlock';
import { PressableScale } from '../../../components/ui/PressableScale';
import { StatusChip } from '../../../components/ui/StatusChip';
import { useAuth } from '../../../lib/auth';
import {
  DEFAULT_BOUNTY_AMOUNT_CENTS,
  DEFAULT_BOUNTY_VIEW_THRESHOLD,
  fetchBountySettings,
  type BountySettings,
} from '../../../lib/bounty';
import { formatCount } from '../../../lib/earnings';
import {
  getAssignment,
  parseAssignmentMetrics,
  type AssignmentWithBrief,
} from '../../../lib/tasks-api';
import { color, radius, shadow, space, type } from '../../../theme/tokens';

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

function formatMoney(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function platformLabel(url: string | null): 'TikTok' | 'Instagram' {
  if (url !== null && url.toLowerCase().includes('instagram')) {
    return 'Instagram';
  }
  return 'TikTok';
}

function postedDateLabel(scheduledDate: string): string {
  const [, m, d] = scheduledDate.split('-').map(Number);
  return `Posted ${MONTHS_SHORT[(m ?? 1) - 1]} ${d}`;
}

function metricNumber(metrics: Record<string, unknown>, key: string): number {
  const v = metrics[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export default function PostedDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const [assignment, setAssignment] = useState<AssignmentWithBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [bounty, setBounty] = useState<BountySettings>({
    amountCents: DEFAULT_BOUNTY_AMOUNT_CENTS,
    viewThreshold: DEFAULT_BOUNTY_VIEW_THRESHOLD,
  });

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const row = await getAssignment(id);
      setAssignment(row);
      if (row?.company_id) {
        setBounty(await fetchBountySettings(row.company_id));
      } else if (profile?.company_id) {
        setBounty(await fetchBountySettings(profile.company_id));
      }
    } catch {
      setAssignment(null);
    } finally {
      setLoading(false);
    }
  }, [id, profile?.company_id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const isPosted =
    assignment !== null &&
    (assignment.status === 'posted' || assignment.status === 'approved');

  useEffect(() => {
    if (assignment !== null && !isPosted) {
      router.replace({
        pathname: '/(creator)/assignment/[id]',
        params: { id: assignment.id },
      });
    }
  }, [assignment, isPosted, router]);

  if (loading) {
    return (
      <Screen contentStyle={styles.center}>
        <ActivityIndicator size="large" color={color.accent} />
      </Screen>
    );
  }

  if (assignment === null) {
    return (
      <Screen contentStyle={styles.center}>
        <Text style={styles.missing}>Post not found</Text>
        <PressableScale onPress={() => router.back()}>
          <Text style={styles.backLink}>Go back</Text>
        </PressableScale>
      </Screen>
    );
  }

  if (!isPosted) {
    return (
      <Screen contentStyle={styles.center}>
        <ActivityIndicator size="large" color={color.accent} />
      </Screen>
    );
  }

  const metrics = parseAssignmentMetrics(assignment.metrics);
  const raw =
    assignment.metrics !== null &&
    typeof assignment.metrics === 'object' &&
    !Array.isArray(assignment.metrics)
      ? (assignment.metrics as Record<string, unknown>)
      : {};
  const views = metrics.views ?? 0;
  const likes = metrics.likes ?? 0;
  const comments = metricNumber(raw, 'comments');
  const shares = metricNumber(raw, 'shares');
  const bountyCents = assignment.bounty_amount_cents ?? bounty.amountCents;
  const threshold = bounty.viewThreshold;
  const bountyPaid = assignment.bounty_credited_at !== null;
  const progress = Math.min(1, views / Math.max(threshold, 1));
  const earnedCents = bountyPaid
    ? bountyCents
    : Math.round(bountyCents * progress);
  const viewsNeeded = Math.max(0, threshold - views);
  const platform = platformLabel(assignment.post_url);
  const isPhoto = assignment.briefs.format === 'photo_carousel';
  const bountyLabel = formatMoney(bountyCents).replace(/\.00$/, '');

  const onShare = () => {
    const url = assignment.post_url;
    void Share.share({
      message: url !== null ? url : assignment.briefs.title,
    });
  };

  return (
    <Screen scroll bg={color.white} contentStyle={styles.content}>
      <View style={styles.topBar}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={styles.iconBtn}
        >
          <Icon name="chevron-left" size={22} color={color.ink} />
        </PressableScale>
        <StatusChip status="posted" />
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Share"
          onPress={onShare}
          style={styles.iconBtn}
        >
          <Icon name="share-2" size={20} color={color.ink} />
        </PressableScale>
      </View>

      <View style={[styles.player, shadow.shadowMedia]}>
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="postedPlayer" x1="0" y1="0" x2="0.35" y2="1">
              <Stop offset="0" stopColor={color.blue100} />
              <Stop offset="1" stopColor={color.lineStrong} />
            </LinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="url(#postedPlayer)"
          />
        </Svg>
        <View style={[styles.playBtn, shadow.shadowMedia]}>
          <Icon
            name={isPhoto ? 'images' : 'play'}
            size={20}
            color={color.ink}
          />
        </View>
        <View style={styles.platformPill}>
          <Icon
            name={platform === 'Instagram' ? 'at-sign' : 'music-2'}
            size={11}
            color={color.ink}
          />
          <Text style={styles.platformText}>{platform}</Text>
        </View>
        <View style={styles.datePill}>
          <Text style={styles.dateText}>
            {postedDateLabel(assignment.scheduled_date)}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        {(
          [
            { label: 'Views', value: formatCount(views) },
            { label: 'Likes', value: formatCount(likes) },
            { label: 'Comments', value: formatCount(comments) },
            { label: 'Shares', value: formatCount(shares) },
          ] as const
        ).map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.earningsCard}>
        <View style={styles.earningsHeader}>
          <Text style={styles.earningsAmount}>{formatMoney(earnedCents)}</Text>
          <Text style={styles.earningsOf}>{`of ${bountyLabel} bounty`}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${progress * 100}%` }]}
          />
        </View>
        <Text style={styles.earningsHint}>
          {bountyPaid
            ? 'Full bounty cleared.'
            : viewsNeeded === 0
              ? 'Bounty threshold hit. Cleared soon.'
              : `${viewsNeeded.toLocaleString('en-US')} more views and the full ${bountyLabel} clears.`}
        </Text>
      </View>

      {assignment.briefs.caption ? (
        <InfoBlock label="Caption">{assignment.briefs.caption}</InfoBlock>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space[5],
    paddingBottom: space[10],
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
  },
  missing: {
    fontSize: type.size.body,
    color: color.slate500,
  },
  backLink: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    color: color.blue700,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  player: {
    width: 180,
    height: 320,
    alignSelf: 'center',
    borderRadius: radius.cell,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformPill: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA92,
  },
  platformText: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  datePill: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(15,23,32,0.62)',
  },
  dateText: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    color: color.white,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
  },
  stat: {
    flex: 1,
    gap: 2,
    alignItems: 'flex-start',
  },
  statValue: {
    fontSize: type.size.cardLg,
    fontWeight: type.weight.heavy,
    letterSpacing: -0.4,
    color: color.ink,
  },
  statLabel: {
    fontSize: type.size.chip,
    color: color.slate500,
  },
  earningsCard: {
    gap: 10,
    paddingVertical: space[5],
    paddingHorizontal: space.cardPad,
    borderRadius: radius.lg,
    backgroundColor: color.blue50,
  },
  earningsHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  earningsAmount: {
    fontSize: type.size.titleSm,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.title,
    color: color.blue700,
  },
  earningsOf: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.blue700,
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(27,166,238,0.18)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: color.blue500,
    borderRadius: radius.pill,
  },
  earningsHint: {
    fontSize: type.size.meta,
    lineHeight: type.size.meta * type.leading.body,
    color: color.slate500,
  },
});

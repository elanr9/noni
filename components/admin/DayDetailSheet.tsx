import { Linking, StyleSheet, Text, View } from 'react-native';

import type { CompanyDay } from '../../lib/analytics-api';
import { formatMetric } from '../../lib/analytics';
import { formatCents } from '../../lib/wallet-api';
import { borderWidth, color, radius, type } from '../../theme/tokens';
import { PressableScale } from '../ui/PressableScale';
import { SheetShell } from '../ui/SheetShell';

export interface DayDetailSheetProps {
  day: CompanyDay | null;
  onClose: () => void;
}

function longDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/** Tap a day on the chart: which posts ran and what happened that day. */
export function DayDetailSheet({ day, onClose }: DayDetailSheetProps) {
  return (
    <SheetShell visible={day !== null} onClose={onClose}>
      {day ? (
        <View style={styles.body}>
          <Text style={styles.title}>{longDay(day.day)}</Text>

          <View style={styles.statsGrid}>
            <Stat label="Revenue" value={formatCents(day.metrics.revenue)} />
            <Stat label="Sales" value={`${day.metrics.sales}`} />
            <Stat label="New accounts" value={`${day.metrics.new_accounts}`} />
            <Stat label="Free trials" value={`${day.metrics.free_trials}`} />
            <Stat label="Views" value={formatMetric(day.metrics.views)} />
            <Stat label="Likes" value={formatMetric(day.metrics.likes)} />
          </View>

          <Text style={styles.section}>
            {day.posted === 0
              ? 'No posts went out this day'
              : day.posted === 1
                ? '1 post went out'
                : `${day.posted} posts went out`}
          </Text>
          {day.posts.map((post) => (
            <PressableScale
              key={post.postId}
              accessibilityRole={post.postUrl ? 'link' : 'text'}
              disabled={!post.postUrl}
              onPress={() => {
                if (post.postUrl) void Linking.openURL(post.postUrl);
              }}
              style={styles.postCard}
            >
              <Text style={styles.postTitle} numberOfLines={1}>
                {post.title}
              </Text>
              <Text style={styles.postMeta}>
                {post.creatorName}
                {post.platform ? ` · ${post.platform}` : ''}
                {` · ${formatMetric(post.views)} views`}
                {post.postUrl ? ' · open' : ''}
              </Text>
            </PressableScale>
          ))}
        </View>
      ) : null}
    </SheetShell>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{props.value}</Text>
      <Text style={styles.statLabel}>{props.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10 },
  title: {
    fontSize: type.size.titleSm,
    fontWeight: '800',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stat: {
    flexBasis: '31%',
    flexGrow: 1,
    backgroundColor: color.offWhite,
    borderRadius: radius.md,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    padding: 10,
    gap: 2,
  },
  statValue: {
    fontSize: type.size.bodySm,
    fontWeight: '800',
    color: color.ink,
  },
  statLabel: {
    fontSize: type.size.micro,
    fontWeight: '700',
    color: color.slate400,
    textTransform: 'uppercase',
    letterSpacing: type.tracking.label,
  },
  section: {
    marginTop: 6,
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.slate400,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
  },
  postCard: {
    backgroundColor: color.white,
    borderRadius: radius.md,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    padding: 12,
    gap: 3,
  },
  postTitle: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.ink,
  },
  postMeta: {
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.slate500,
  },
});

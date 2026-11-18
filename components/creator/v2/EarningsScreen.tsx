// Earnings tab: the creator's own Analytics pane (V2Analytics.jsx scoped to
// one creator) with payout figures in place of company money. Range pills,
// the blue hero (views and paid out), the trend chart, Top posts, then the
// payout card: allowed, pending, status, and the Payouts row.
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AnalyticsDay } from '../../../lib/analytics-api';
import { paidBetween, payoutSetupLabel, type PayoutSummary } from '../../../lib/payouts-api';
import { dayKey, fmt, money, shortDate } from '../../../lib/v2-format';
import type { V2Post } from '../../../lib/v2-posts';
import { color, editor, radius, shadow, text } from '../../../theme/v2';
import { byViews, chartPoints, firstDate, periodFor, postsBetween, RANGES, scopedPosts, viewsBetween, viewsByDay, type Range } from '../../admin/v2/analytics/periods';
import { TrendChart } from '../../admin/v2/analytics/TrendChart';
import { LoadError } from './LoadError';
import { PostFrame } from '../../admin/v2/posts/PostFrame';
import { ContextRow } from '../../shared';
import { Card, Chip, Icon, PillTabs, Press, RootTitle, Row, Screen, Skeleton, TabPane, tap } from '../../v2';

export interface EarningsScreenProps {
  /** Every post of this creator; the pane scopes to live ones. */
  posts: V2Post[];
  loaded: boolean;
  summary: PayoutSummary | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** The posts failed to load and nothing is on screen: shows Retry in place of the pane. */
  failed?: boolean;
  onRetry?: () => void;
  onPost: (p: V2Post) => void;
  onPayouts: () => void;
}

/** Views per day from the creator's own posts: each post's views land on the day it went live. */
export function daysFromPosts(posts: V2Post[]): AnalyticsDay[] {
  const m = new Map<string, AnalyticsDay>();
  for (const p of posts) {
    const day = dayKey(p.date);
    const d = m.get(day) ?? { day, views: 0, signups: 0, salesCents: 0, codedSignups: 0, codedSalesCents: 0, postIds: [] as string[] };
    d.views += p.views;
    d.postIds.push(p.id);
    m.set(day, d);
  }
  return [...m.values()].sort((a, b) => a.day.localeCompare(b.day));
}

function Arrow({ dir, on, onPress }: { dir: 'left' | 'right'; on: boolean; onPress: () => void }) {
  return (
    <Press accessibilityRole="button" accessibilityLabel={dir === 'left' ? 'Earlier' : 'Later'} disabled={!on} onPress={onPress} style={[styles.arrow, { opacity: on ? 1 : 0.3 }]}>
      <Icon name={dir === 'left' ? 'chevron_left' : 'chevron_right'} size={20} color={color.white} />
    </Press>
  );
}

export function EarningsScreen({ posts, loaded, summary, refreshing = false, onRefresh, failed = false, onRetry, onPost, onPayouts }: EarningsScreenProps) {
  const [range, setRange] = useState<Range>('week');
  const [off, setOff] = useState(0);
  const [sel, setSel] = useState<number | null>(null);

  const live = useMemo(() => scopedPosts(posts), [posts]);
  const days = useMemo(() => daysFromPosts(live), [live]);
  const byDay = useMemo(() => viewsByDay(days), [days]);
  const since = useMemo(() => firstDate(days, live), [days, live]);
  const period = periodFor(range, off, since);
  const points = useMemo(() => chartPoints(range, period, byDay), [range, period, byDay]);
  const selPt = sel != null ? (points[sel] ?? null) : null;
  const periodKey = `${range}:${off}`;
  const views = viewsBetween(byDay, period.from, period.to);
  const inPeriod = postsBetween(live, period.from, period.to);
  const top = byViews(selPt ? postsBetween(live, selPt.from, selPt.to) : inPeriod).slice(0, 3);
  const paid = summary ? paidBetween(summary.payouts, period.from, period.to) : 0;

  const pickRange = (r: Range) => {
    setRange(r);
    setOff(0);
    setSel(null);
  };
  const step = (d: number) => {
    tap();
    setOff(off + d);
    setSel(null);
  };

  return (
    <Screen tabRoot>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.grey4} /> : undefined}
      >
        <ContextRow />
        <RootTitle title="Earnings" />
        {!loaded ? (
          <>
            <Skeleton h={44} />
            <Skeleton h={150} />
            <Skeleton h={220} />
          </>
        ) : failed ? (
          <LoadError title="Could not load your earnings" onRetry={() => (onRetry ?? onRefresh)?.()} retrying={refreshing} />
        ) : (
          <>
            <PillTabs items={RANGES} value={range} onChange={pickRange} style={{ marginBottom: 12 }} />
            <View style={styles.hero}>
              <View style={styles.heroTop}>
                {range !== 'all' ? <Arrow dir="left" on={period.canBack} onPress={() => step(-1)} /> : <View style={{ width: 32 }} />}
                <TabPane k={periodKey} duration={220} style={styles.heroLabel}>
                  <Text style={styles.heroTitle}>{period.label}</Text>
                  {period.dates !== period.label ? <Text style={styles.heroDates}>{period.dates}</Text> : null}
                </TabPane>
                {range !== 'all' ? <Arrow dir="right" on={period.canFwd} onPress={() => step(1)} /> : <View style={{ width: 32 }} />}
              </View>
              <TabPane k={periodKey} style={styles.heroNums}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.big}>{fmt(views)}</Text>
                  <Text style={styles.bigLabel}>views</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.big}>{money(paid)}</Text>
                  <Text style={styles.bigLabel}>{`paid out · ${inPeriod.length} ${inPeriod.length === 1 ? 'post' : 'posts'}`}</Text>
                </View>
              </TabPane>
            </View>

            <Card style={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 8 }}>
              <TabPane k={periodKey} style={{ flexGrow: 0, flexShrink: 0, flexBasis: 'auto' }}>
                <TrendChart points={points} title={period.chartTitle} sel={sel} onSel={setSel} />
              </TabPane>
            </Card>

            <Card style={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                <Text style={text.card}>Top posts</Text>
                <TabPane k={`${sel}:${periodKey}`} duration={200} style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 18, fontWeight: '600', color: color.grey4 }}>{selPt ? selPt.name : range === 'all' ? '' : period.dates}</Text>
                </TabPane>
              </View>
              {top.length ? (
                top.map((p, i) => (
                  <Press key={p.id} accessibilityRole="button" onPress={() => onPost(p)} style={[styles.row, i ? styles.rowLine : null]}>
                    <PostFrame post={p} width={34} height={44} radius={8} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: color.ink }}>{p.title}</Text>
                      <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', color: color.grey4 }}>{shortDate(p.date)}</Text>
                    </View>
                    <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: color.ink }}>{fmt(p.views)}</Text>
                  </Press>
                ))
              ) : (
                <Text style={{ paddingTop: 10, paddingBottom: 14, fontSize: 14, lineHeight: 18, fontWeight: '500', color: color.grey4 }}>{selPt ? 'No posts in this span' : period.emptyTop}</Text>
              )}
            </Card>

            <Card pad={0} style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={text.meta}>Payout allowed</Text>
                  <Text style={[text.card, { fontVariant: ['tabular-nums'] }]}>{summary ? money(summary.wallet.available_cents) : '$0'}</Text>
                </View>
                {summary ? <Chip tone={summary.wallet.payout_ready ? 'green' : 'amber'} label={payoutSetupLabel(summary.wallet)} /> : null}
              </Row>
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={text.row}>Pending</Text>
                  <Text style={text.meta}>{summary && summary.wallet.pending_cents > 0 ? `${money(summary.wallet.pending_cents)} clears when posts finish review` : 'Nothing clearing right now'}</Text>
                </View>
              </Row>
              <Row last chevron onPress={onPayouts}>
                <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.greenTint, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="payments" size={22} color={color.green} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={text.row}>Payouts</Text>
                  <Text style={text.meta}>{summary ? `${money(summary.paidCents)} paid out` : 'Status and history'}</Text>
                </View>
              </Row>
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.card, backgroundColor: color.blue, backgroundImage: `linear-gradient(140deg, ${color.blue} 0%, ${color.blueDeep} 100%)`, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16, marginBottom: 12, ...shadow.blueHero },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -6, marginHorizontal: -8 },
  arrow: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: editor.w16 },
  heroLabel: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, minHeight: 0 },
  heroTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: color.white },
  heroDates: { fontSize: 13, lineHeight: 20, fontWeight: '600', color: color.white, opacity: 0.85 },
  heroNums: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', flexDirection: 'row', gap: 12, paddingTop: 12 },
  big: { fontSize: 36, lineHeight: 40, fontWeight: '800', letterSpacing: -1, color: color.white, fontVariant: ['tabular-nums'] },
  bigLabel: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: color.white, opacity: 0.85 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  rowLine: { borderTopWidth: 1, borderTopColor: color.grey1 },
});

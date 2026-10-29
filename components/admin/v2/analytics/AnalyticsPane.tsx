// Analytics pane (ANALYTICS.md 1a): range pills, the blue hero with period
// arrows and keyed fades, the trend chart with a controlled selection, and
// Top posts scoped to the period or the tapped point. Fits without scrolling.
import { useId, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { AnalyticsDay } from '../../../../lib/analytics-api';
import { fmt, shortDate } from '../../../../lib/v2-format';
import type { V2Post } from '../../../../lib/v2-posts';
import { color, radius, text } from '../../../../theme/v2';
import { Card, Icon, PillTabs, Press, TabPane, tap } from '../../../v2';
import { PostFrame } from '../posts/PostFrame';
import { byViews, chartPoints, firstDate, periodFor, postsBetween, RANGES, viewsBetween, viewsByDay, type Range } from './periods';
import { TrendChart } from './TrendChart';

export interface AnalyticsPaneProps {
  /** Live posts in scope (scopedPosts). */
  posts: V2Post[];
  days: AnalyticsDay[];
  onPost: (id: string) => void;
  onSeeAll: () => void;
  bottomInset: number;
}

function Arrow({ dir, on, onPress }: { dir: 'left' | 'right'; on: boolean; onPress: () => void }) {
  return (
    <Press accessibilityRole="button" accessibilityLabel={dir === 'left' ? 'Earlier' : 'Later'} disabled={!on} onPress={onPress} style={[styles.arrow, { opacity: on ? 1 : 0.3 }]}>
      <Icon name={dir === 'left' ? 'chevron_left' : 'chevron_right'} size={20} color={color.white} />
    </Press>
  );
}

export function AnalyticsPane({ posts, days, onPost, onSeeAll, bottomInset }: AnalyticsPaneProps) {
  const [range, setRange] = useState<Range>('week');
  const [off, setOff] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const gradId = useId();

  const byDay = useMemo(() => viewsByDay(days), [days]);
  const since = useMemo(() => firstDate(days, posts), [days, posts]);
  const period = periodFor(range, off, since);
  const points = useMemo(() => chartPoints(range, period, byDay), [range, period, byDay]);
  const selPt = sel != null ? (points[sel] ?? null) : null;
  const periodKey = `${range}:${off}`;

  const views = viewsBetween(byDay, period.from, period.to);
  const inPeriod = postsBetween(posts, period.from, period.to);
  const top = byViews(selPt ? postsBetween(posts, selPt.from, selPt.to) : inPeriod).slice(0, 3);

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
    <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: bottomInset }}>
      <PillTabs items={RANGES} value={range} onChange={pickRange} style={{ marginBottom: 12 }} />

      <View style={styles.hero}>
        <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1 1" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={gradId} x1={0} y1={0} x2={0.77} y2={0.64}>
              <Stop offset="0" stopColor={color.blue} />
              <Stop offset="1" stopColor={color.blueDeep} />
            </LinearGradient>
          </Defs>
          <Rect width={1} height={1} fill={`url(#${gradId})`} />
        </Svg>
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
            <Text style={styles.big}>{inPeriod.length}</Text>
            <Text style={styles.bigLabel}>{inPeriod.length === 1 ? 'post' : 'posts'}</Text>
          </View>
        </TabPane>
      </View>

      <Card style={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 8 }}>
        <TabPane k={periodKey} style={{ flex: 0 }}>
          <TrendChart points={points} title={period.chartTitle} sel={sel} onSel={setSel} />
        </TabPane>
      </Card>

      <Card style={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: 4, marginBottom: 0, flexShrink: 1, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flex: 1, minWidth: 0 }}>
            <Text style={text.card}>Top posts</Text>
            <TabPane k={`${sel}:${periodKey}`} duration={200} style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 18, fontWeight: '600', color: color.grey4 }}>
                {selPt ? selPt.name : range === 'all' ? '' : period.dates}
              </Text>
            </TabPane>
          </View>
          <Press accessibilityRole="button" onPress={onSeeAll} hitSlop={8}>
            <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: color.blueDeep }}>See all</Text>
          </Press>
        </View>
        {top.length ? (
          top.map((p, i) => (
            <Press key={p.id} accessibilityRole="button" onPress={() => onPost(p.id)} style={[styles.row, i ? styles.rowLine : null]}>
              <PostFrame post={p} width={34} height={44} radius={8} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: color.ink }}>
                  {p.title}
                </Text>
                <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', color: color.grey4 }}>
                  {p.creatorName} {'·'} {shortDate(p.date)}
                </Text>
              </View>
              <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: color.ink }}>{fmt(p.views)}</Text>
            </Press>
          ))
        ) : (
          <Text style={{ paddingTop: 10, paddingBottom: 14, fontSize: 14, lineHeight: 18, fontWeight: '500', color: color.grey4 }}>{selPt ? 'No posts in this span' : period.emptyTop}</Text>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.card, overflow: 'hidden', paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16, marginBottom: 12, boxShadow: '0 8px 24px rgba(27,166,238,0.35)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -6, marginHorizontal: -8 },
  arrow: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  heroLabel: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, minHeight: 0 },
  heroTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: color.white },
  heroDates: { fontSize: 13, lineHeight: 20, fontWeight: '600', color: color.white, opacity: 0.85 },
  heroNums: { flex: 0, flexDirection: 'row', gap: 12, paddingTop: 12 },
  big: { fontSize: 36, lineHeight: 40, fontWeight: '800', letterSpacing: -1, color: color.white, fontVariant: ['tabular-nums'] },
  bigLabel: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: color.white, opacity: 0.85 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  rowLine: { borderTopWidth: 1, borderTopColor: color.grey1 },
});


// Creator profile (ANALYTICS.md 3, V2Review CreatorScreen): pinned header
// with Message, avatar, name and handle, three figures, the Posts row with
// the list / calendar toggle, the shared week card (with a month grid behind
// the month label) and the only scrolling list of post cards.
import { useMemo, useState, type ReactElement } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, type RefreshControlProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addDays, credit, signupsLabel, dayKey, fmt, MONTHS, sales, sameDay, sunday, today, weekOffset } from '../../../../lib/v2-format';
import { creatorById, platformStats, useV2Data, type V2Post } from '../../../../lib/v2-posts';
import { color, shadow } from '../../../../theme/v2';
import { Avatar, Button, Field, Icon, IconToggle, Press, Screen, Sheet, Skeleton, TabPane, TextButton } from '../../../v2';
import { LoadError, StateCard } from '../posts/LoadError';
import { useV2Failed } from '../posts/useV2Refresh';
import { useSalesView } from '../useSalesView';
import { PostCard } from '../posts/PostCard';
import { DayCell, HOT_VIEWS, WeekCard, weekDays, type DayMark } from '../posts/WeekCard';

type Mode = 'list' | 'cal';
const MODES = [
  { key: 'list', icon: 'format_list_bulleted', label: 'List' },
  { key: 'cal', icon: 'calendar_month', label: 'Calendar' },
] as const;
/** Weeks reachable in the calendar: three back, one ahead. */
const MIN_WEEK = -3;
const MAX_WEEK = 1;

export interface CreatorScreenProps {
  id: string;
  /** Admin: the Message word in the header. */
  onMessage?: () => void;
  /** Creator app: the settings disc in the header. */
  onSettings?: () => void;
  /** Tab root: no back chevron, bottom clear of the tab bar. */
  tabRoot?: boolean;
  onPost: (p: V2Post) => void;
  /** Pull to refresh. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Try again after a failed load. */
  onRetry?: () => void;
}

function Figure({ v, label }: { v: string | number; label: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={styles.figure}>{v}</Text>
      <Text style={styles.figureLabel}>{label}</Text>
    </View>
  );
}

/** Rows of the month holding `m`, Sunday first; days outside the month are null. */
function monthRows(m: Date): (Date | null)[][] {
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  const start = sunday(first);
  const rows: (Date | null)[][] = [];
  for (let w = 0; w < 6; w++) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i));
    if (w > 0 && days[0].getMonth() !== m.getMonth() && days[0] > first) break;
    rows.push(days.map((d) => (d.getMonth() === m.getMonth() ? d : null)));
  }
  return rows;
}

/** Months from the month holding `now` to the one holding `d`. */
function monthIndex(d: Date, now: Date): number {
  return (d.getFullYear() - now.getFullYear()) * 12 + d.getMonth() - now.getMonth();
}

/** The first day of the month `m` months from the one holding `now`. */
function monthAt(m: number, now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth() + m, 1);
}

export function CreatorScreen({ id, onMessage, onSettings, tabRoot = false, onPost, refreshing = false, onRefresh, onRetry }: CreatorScreenProps) {
  const insets = useSafeAreaInsets();
  const posts = useV2Data((s) => s.posts);
  const creators = useV2Data((s) => s.creators);
  const loaded = useV2Data((s) => s.loaded);
  const loading = useV2Data((s) => s.loading);
  const failed = useV2Failed();
  const refresh: ReactElement<RefreshControlProps> | undefined = onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.grey4} colors={[color.blue]} /> : undefined;
  const [mode, setMode] = useState<Mode>('list');
  const [k, setK] = useState(0);
  const [sel, setSel] = useState<Date | null>(null);
  const [grid, setGrid] = useState(false);
  const view = useSalesView();
  const setCreatorCode = useV2Data((s) => s.setCreatorCode);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeDraft, setCodeDraft] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeSaving, setCodeSaving] = useState(false);

  const now = today();
  const c = creatorById(creators, id);
  const mine = useMemo(() => posts.filter((p) => p.creatorId === id && p.state !== 'Open'), [posts, id]);
  const live = useMemo(() => mine.filter((p) => p.state === 'Posted'), [mine]);
  const views = live.reduce((n, p) => n + p.views, 0);
  const likes = live.reduce((n, p) => n + platformStats(p, 'all').likes, 0);

  // Posts on a day, never after today.
  const byDay = useMemo(() => {
    const m = new Map<string, V2Post[]>();
    for (const p of mine) {
      if (p.date > now) continue;
      const key = dayKey(p.date);
      m.set(key, [...(m.get(key) ?? []), p]);
    }
    return m;
  }, [mine, now]);
  const postsOn = (d: Date): V2Post[] => byDay.get(dayKey(d)) ?? [];
  const marks = (d: Date): DayMark => {
    const ps = postsOn(d);
    return { count: ps.length, hot: ps.some((p) => p.views > HOT_VIEWS) };
  };

  const days = weekDays(k);
  const shown =
    mode === 'list'
      ? [0, -1, -2, -3]
          .flatMap((w) => weekDays(w).flatMap(postsOn))
          .sort((a, b) => b.date.getTime() - a.date.getTime())
      : sel
        ? postsOn(sel)
        : days.flatMap(postsOn);
  const month = sel ?? days[3];
  const listKey = mode === 'list' ? 'list' : sel ? `day:${dayKey(sel)}` : `week:${k}`;
  const empty = mode === 'list' ? 'No posts yet' : sel ? 'No posts this day' : 'No posts this week';

  const pickMode = (m: Mode) => {
    setMode(m);
    setGrid(false);
  };
  const pickGridDay = (d: Date) => {
    setSel(sameDay(sel, d) ? null : d);
    setK(weekOffset(d, now));
    setGrid(false);
  };

  // Months the calendar reaches: those holding the middle of its first and last week.
  const minMonth = monthIndex(weekDays(MIN_WEEK)[3], now);
  const maxMonth = monthIndex(weekDays(MAX_WEEK)[3], now);
  // Paging the month grid lands on the week holding the 15th, or the nearest week the calendar reaches.
  const pickMonth = (m: number) => {
    const mid = monthAt(m, now);
    mid.setDate(15);
    setSel(null);
    setK(Math.min(MAX_WEEK, Math.max(MIN_WEEK, weekOffset(mid, now))));
  };

  const right = onSettings ? (
    <Press accessibilityRole="button" accessibilityLabel="Settings" onPress={onSettings} style={{ width: 36, height: 36, borderRadius: 999, backgroundColor: color.grey2, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
      <Icon name="settings" size={20} color={color.ink} />
    </Press>
  ) : onMessage ? (
    <TextButton label="Message" onPress={onMessage} />
  ) : undefined;
  const header = tabRoot ? <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 12 }}>{right}</View> : null;

  if (failed || (!tabRoot && loaded && !loading && !c)) {
    return (
      <Screen back={!tabRoot} tabRoot={tabRoot} right={c ? right : undefined}>
        {header}
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 2, paddingBottom: insets.bottom + 40 }} refreshControl={refresh}>
          {failed ? (
            <LoadError onRetry={onRetry ?? onRefresh ?? (() => undefined)} what="this creator" />
          ) : (
            <StateCard icon="person" title="Creator not found" body="They may have left your team, or this link is for a different company." />
          )}
        </ScrollView>
      </Screen>
    );
  }

  if (!loaded || (loading && !c && !tabRoot)) {
    return (
      <Screen back={!tabRoot} tabRoot={tabRoot} right={right}>
        {header}
        <View style={{ paddingHorizontal: 20, paddingTop: 2, gap: 18 }}>
          <Skeleton h={60} />
          <Skeleton h={46} />
          <Skeleton h={94} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen back={!tabRoot} tabRoot={tabRoot} right={right}>
      {header}
      <View style={{ paddingHorizontal: 20, paddingTop: 2 }}>
        <View style={styles.who}>
          <Avatar name={c?.name} photo={c?.photo} tone={c?.tone ?? 'grey'} size={60} ring={false} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={styles.name}>
              {c?.name ?? 'Creator'}
            </Text>
            {c?.handle ? (
              <Text numberOfLines={1} style={styles.handle}>
                {c.handle}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.figures}>
          <Figure v={fmt(views)} label="views" />
          <Figure v={fmt(likes)} label="likes" />
          <Figure v={live.length} label="posts" />
        </View>
        {onMessage && c && (c.code ? view.any : view.sales) ? (
          <Press
            accessibilityRole="button"
            accessibilityLabel={c.code ? `Promo code ${c.code}` : 'Add a promo code'}
            onPress={() => {
              setCodeDraft(c.code ?? '');
              setCodeError(null);
              setCodeOpen(true);
            }}
            style={styles.code}
          >
            <View style={styles.codeIcon}>
              <Icon name="payments" size={18} color={color.green} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={styles.codeTitle}>
                {c.code ? [view.sales ? `${sales(c.salesCents)} sales` : null, view.signups ? signupsLabel(c.signups) : null].filter(Boolean).join(' · ') : 'Add a promo code'}
              </Text>
              <Text numberOfLines={1} style={styles.codeMeta}>
                {c.code ? `On code ${c.code}` : 'See the sales this creator brings in'}
              </Text>
            </View>
            <Icon name="chevron_right" size={20} color={color.grey3} />
          </Press>
        ) : null}
        <View style={styles.postsRow}>
          {mode === 'cal' ? (
            <Press accessibilityRole="button" accessibilityState={{ expanded: grid }} onPress={() => setGrid((g) => !g)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.heading}>
                {MONTHS[month.getMonth()]} {month.getFullYear()}
              </Text>
              <Icon name={grid ? 'expand_less' : 'expand_more'} size={22} color={color.blue} />
            </Press>
          ) : (
            <Text style={styles.heading}>Posts</Text>
          )}
          <IconToggle options={MODES} value={mode} onChange={pickMode} />
        </View>
        {mode === 'cal' ? (
          <View style={{ marginBottom: 14 }}>
            <WeekCard
              week={k}
              onWeek={setK}
              minWeek={MIN_WEEK}
              maxWeek={MAX_WEEK}
              selected={sel}
              onSelect={setSel}
              marks={marks}
              months={
                grid
                  ? {
                      month: Math.min(maxMonth, Math.max(minMonth, monthIndex(month, now))),
                      onMonth: pickMonth,
                      minMonth,
                      maxMonth,
                      rows: (m) => monthRows(monthAt(m, now)).length,
                      render: (m) =>
                        monthRows(monthAt(m, now)).map((row, r) => (
                          <View key={r} style={{ flexDirection: 'row' }}>
                            {row.map((d, i) => (d ? <DayCell key={d.getTime()} day={d} compact selected={!!sel && sameDay(sel, d)} mark={marks(d)} onPress={() => pickGridDay(d)} /> : <View key={`e${i}`} style={{ flex: 1 }} />))}
                          </View>
                        )),
                    }
                  : undefined
              }
            />
          </View>
        ) : null}
      </View>
      <TabPane k={listKey} duration={220}>
        <ScrollView refreshControl={refresh} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 10, paddingHorizontal: 20, paddingBottom: tabRoot ? 12 : insets.bottom + 40, gap: 10 }}>
          {shown.length === 0 ? <Text style={styles.empty}>{empty}</Text> : shown.map((p) => <PostCard key={p.id} p={p} onPress={() => onPost(p)} />)}
        </ScrollView>
      </TabPane>
      <Sheet
        open={codeOpen}
        onClose={() => setCodeOpen(false)}
        title="Promo code"
        footer={
          <>
            {c?.code ? (
              <Button
                variant="secondary"
                label="Remove"
                onPress={async () => {
                  setCodeSaving(true);
                  const error = await setCreatorCode(id, '');
                  setCodeSaving(false);
                  if (error) setCodeError(error);
                  else setCodeOpen(false);
                }}
              />
            ) : null}
            <Button
              label={codeSaving ? 'Saving' : 'Save'}
              disabled={codeSaving || !codeDraft.trim()}
              onPress={async () => {
                setCodeSaving(true);
                const error = await setCreatorCode(id, codeDraft);
                setCodeSaving(false);
                if (error) setCodeError(error);
                else setCodeOpen(false);
              }}
            />
          </>
        }
      >
        <Text style={{ fontSize: 14, lineHeight: 20, color: color.grey4, marginBottom: 12 }}>
          Make a promotion code in your Stripe dashboard, give it to {c?.name.split(' ')[0] ?? 'this creator'} to share in posts, then enter the same code here. Every customer who uses it counts toward this creator and their posts. New sales show up after the next daily sync.
        </Text>
        <Field value={codeDraft} onChange={(v) => { setCodeDraft(v.toUpperCase()); setCodeError(null); }} placeholder="MAYA10" autoCapitalize="characters" autoCorrect={false} maxLength={32} style={{ marginBottom: 4 }} />
        {codeError ? <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: '600', color: color.pink }}>{codeError}</Text> : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  who: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 2, paddingBottom: 18 },
  name: { fontSize: 24, lineHeight: 28, fontWeight: '800', letterSpacing: -0.5, color: color.ink },
  handle: { marginTop: 2, fontSize: 14, lineHeight: 18, fontWeight: '500', color: color.grey4 },
  figures: { flexDirection: 'row', gap: 28, paddingHorizontal: 2, paddingBottom: 18 },
  code: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 16, borderRadius: 16, backgroundColor: color.card, ...shadow.card },
  codeIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: color.greenTint, alignItems: 'center', justifyContent: 'center' },
  codeTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: color.ink },
  codeMeta: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: color.grey4 },
  figure: { fontSize: 26, lineHeight: 30, fontWeight: '800', letterSpacing: -0.6, color: color.ink, fontVariant: ['tabular-nums'] },
  figureLabel: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: color.grey4 },
  postsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, paddingBottom: 10 },
  heading: { fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.3, color: color.ink },
  empty: { paddingVertical: 32, textAlign: 'center', fontSize: 15, lineHeight: 20, fontWeight: '600', color: color.grey4 },
});

// Creator profile (ANALYTICS.md 3, V2Review CreatorScreen): pinned header
// with Message, avatar, name and handle, three figures, the Posts row with
// the list / calendar toggle, the shared week card (with a month grid behind
// the month label) and the only scrolling list of post cards.
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addDays, dayKey, fmt, MONTHS, sameDay, sunday, today, weekOffset } from '../../../../lib/v2-format';
import { creatorById, platformStats, useV2Data, type V2Post } from '../../../../lib/v2-posts';
import { color } from '../../../../theme/v2';
import { Avatar, Icon, IconToggle, Press, Screen, Skeleton, TabPane, TextButton, tap } from '../../../v2';
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

export function CreatorScreen({ id, onMessage, onSettings, tabRoot = false, onPost }: CreatorScreenProps) {
  const insets = useSafeAreaInsets();
  const posts = useV2Data((s) => s.posts);
  const creators = useV2Data((s) => s.creators);
  const loaded = useV2Data((s) => s.loaded);
  const [mode, setMode] = useState<Mode>('list');
  const [k, setK] = useState(0);
  const [sel, setSel] = useState<Date | null>(null);
  const [grid, setGrid] = useState(false);

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
    tap();
    setSel(sameDay(sel, d) ? null : d);
    setK(weekOffset(d, now));
    setGrid(false);
  };

  const right = onSettings ? (
    <Press accessibilityRole="button" accessibilityLabel="Settings" onPress={onSettings} style={{ width: 36, height: 36, borderRadius: 999, backgroundColor: color.grey2, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
      <Icon name="settings" size={20} color={color.ink} />
    </Press>
  ) : onMessage ? (
    <TextButton label="Message" onPress={onMessage} />
  ) : undefined;
  const header = tabRoot ? <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 12 }}>{right}</View> : null;

  if (!loaded) {
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
            <WeekCard week={k} onWeek={setK} minWeek={MIN_WEEK} maxWeek={MAX_WEEK} selected={sel} onSelect={setSel} marks={marks}>
              {grid ? (
                <TabPane k={`${month.getFullYear()}-${month.getMonth()}`} duration={160} style={{ flex: 0 }}>
                  {monthRows(month).map((row, r) => (
                    <View key={r} style={{ flexDirection: 'row' }}>
                      {row.map((d, i) => (d ? <DayCell key={d.getTime()} day={d} compact selected={!!sel && sameDay(sel, d)} mark={marks(d)} onPress={() => pickGridDay(d)} /> : <View key={`e${i}`} style={{ flex: 1 }} />))}
                    </View>
                  ))}
                </TabPane>
              ) : undefined}
            </WeekCard>
          </View>
        ) : null}
      </View>
      <TabPane k={listKey} duration={220}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 10, paddingHorizontal: 20, paddingBottom: tabRoot ? 12 : insets.bottom + 40, gap: 10 }}>
          {shown.length === 0 ? <Text style={styles.empty}>{empty}</Text> : shown.map((p) => <PostCard key={p.id} p={p} onPress={() => onPost(p)} />)}
        </ScrollView>
      </TabPane>
    </Screen>
  );
}

const styles = StyleSheet.create({
  who: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 2, paddingBottom: 18 },
  name: { fontSize: 24, lineHeight: 28, fontWeight: '800', letterSpacing: -0.5, color: color.ink },
  handle: { marginTop: 2, fontSize: 14, lineHeight: 18, fontWeight: '500', color: color.grey4 },
  figures: { flexDirection: 'row', gap: 28, paddingHorizontal: 2, paddingBottom: 18 },
  figure: { fontSize: 26, lineHeight: 30, fontWeight: '800', letterSpacing: -0.6, color: color.ink, fontVariant: ['tabular-nums'] },
  figureLabel: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: color.grey4 },
  postsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, paddingBottom: 10 },
  heading: { fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.3, color: color.ink },
  empty: { paddingVertical: 32, textAlign: 'center', fontSize: 15, lineHeight: 20, fontWeight: '600', color: color.grey4 },
});

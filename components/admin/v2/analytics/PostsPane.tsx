// Posts pane (ANALYTICS.md 1c): pinned toolbar with the by-posts / by-creators
// toggle, the list / calendar toggle and the filter button; in calendar mode
// the month label and the shared week card; then the only scrolling list,
// as post cards or as expanding creator cards. Filter sheet: creator, format,
// sort.
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { fmt, MONTHS, sameDay, shortDate } from '../../../../lib/v2-format';
import { creatorFor, type V2Creator, type V2Post } from '../../../../lib/v2-posts';
import { color, motion, radius, shadow } from '../../../../theme/v2';
import { Avatar, Button, FilterButton, Icon, IconToggle, Label, Press, Sheet, TabPane, tap } from '../../../v2';
import { Marks, PostCard, Views } from '../posts/PostCard';
import { PostFrame } from '../posts/PostFrame';
import { HOT_VIEWS, WeekCard, weekDays } from '../posts/WeekCard';

type By = 'posts' | 'creators';
type Mode = 'list' | 'cal';
type Sort = 'views' | 'new' | 'old';
type Format = 'All' | 'Reel' | 'Slideshow';

const SORTS: readonly [Sort, string][] = [
  ['views', 'Most views'],
  ['new', 'Newest'],
  ['old', 'Oldest'],
];
const FORMATS: readonly Format[] = ['All', 'Reel', 'Slideshow'];

export interface PostsPaneProps {
  posts: V2Post[];
  creators: V2Creator[];
  onPost: (id: string) => void;
  bottomInset: number;
}

function CreatorGroup({ creator, posts, views, open, onToggle, onPost }: { creator: V2Creator; posts: V2Post[]; views: number; open: boolean; onToggle: () => void; onPost: (id: string) => void }) {
  const rot = useSharedValue(open ? 180 : 0);
  useEffect(() => {
    rot.set(withTiming(open ? 180 : 0, { duration: 220, easing: motion.tabEase }));
  }, [open, rot]);
  const chev = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.get()}deg` }] }));
  return (
    <View style={styles.group}>
      <Press accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} style={styles.groupHead}>
        <Avatar name={creator.name} photo={creator.photo} tone={creator.tone} size={48} ring={false} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', color: color.ink }}>
            {creator.name}
          </Text>
          <Text style={[styles.meta, { marginTop: 2 }]}>
            {posts.length} {posts.length === 1 ? 'post' : 'posts'}
          </Text>
        </View>
        <Views n={views} />
        <Animated.View style={chev}>
          <Icon name="expand_more" size={22} color={color.grey3} />
        </Animated.View>
      </Press>
      {open ? (
        <TabPane k={creator.id} duration={220} style={{ flex: 0, paddingHorizontal: 12, paddingBottom: 12, gap: 8 }}>
          {posts.map((p) => (
            <Press key={p.id} accessibilityRole="button" onPress={() => onPost(p.id)} style={styles.inner}>
              <PostFrame post={p} width={40} height={54} radius={9} />
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text numberOfLines={2} style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: color.ink }}>
                  {p.title}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Marks />
                  <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', color: color.grey4 }}>{shortDate(p.date)}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: color.ink }}>{fmt(p.views)}</Text>
              <Icon name="chevron_right" size={18} color={color.grey3} />
            </Press>
          ))}
        </TabPane>
      ) : null}
    </View>
  );
}

export function PostsPane({ posts, creators, onPost, bottomInset }: PostsPaneProps) {
  const [by, setBy] = useState<By>('posts');
  const [mode, setMode] = useState<Mode>('list');
  const [week, setWeek] = useState(0);
  const [day, setDay] = useState<Date | null>(null);
  const [filt, setFilt] = useState(false);
  const [fCreator, setFCreator] = useState('All');
  const [fFormat, setFFormat] = useState<Format>('All');
  const [sort, setSort] = useState<Sort>('views');
  const [expanded, setExpanded] = useState<string | null>(null);

  const active = (fCreator !== 'All' ? 1 : 0) + (fFormat !== 'All' ? 1 : 0) + (sort !== 'views' ? 1 : 0);
  const filtered = useMemo(() => posts.filter((p) => (fCreator === 'All' || p.creatorId === fCreator) && (fFormat === 'All' || p.format === fFormat)), [posts, fCreator, fFormat]);
  const days = weekDays(week);
  const postsOn = (d: Date) => filtered.filter((p) => sameDay(p.date, d));
  const list = (mode === 'cal' ? (day ? postsOn(day) : days.flatMap(postsOn)) : filtered)
    .slice()
    .sort((a, b) => (sort === 'views' ? b.views - a.views : sort === 'new' ? b.date.getTime() - a.date.getTime() : a.date.getTime() - b.date.getTime()));

  const groups = useMemo(() => {
    const map = new Map<string, { creator: V2Creator; posts: V2Post[]; views: number }>();
    for (const p of list) {
      const c = creatorFor(creators, p);
      const g = map.get(c.id) ?? { creator: c, posts: [], views: 0 };
      g.posts.push(p);
      g.views += p.views;
      map.set(c.id, g);
    }
    return [...map.values()].sort((x, y) => (sort === 'views' ? y.views - x.views : y.posts.length - x.posts.length));
  }, [list, creators, sort]);

  const monthOf = day ?? days[3];
  const empty = mode === 'cal' ? (day ? 'No posts this day' : 'No posts this week') : 'No posts';

  const opt = (on: boolean, label: string, onPress: () => void) => (
    <Press key={label} onPress={onPress} style={{ height: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: on ? color.blue : color.grey1, justifyContent: 'center' }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: on ? color.white : color.ink }}>{label}</Text>
    </Press>
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
          <IconToggle
            options={[
              { key: 'posts', icon: 'movie', label: 'By posts' },
              { key: 'creators', icon: 'person', label: 'By creators' },
            ]}
            value={by}
            onChange={(v) => {
              setBy(v);
              setExpanded(null);
            }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconToggle
              options={[
                { key: 'list', icon: 'format_list_bulleted', label: 'List' },
                { key: 'cal', icon: 'calendar_month', label: 'Calendar' },
              ]}
              value={mode}
              onChange={setMode}
            />
            <FilterButton active={active} onPress={() => setFilt(true)} />
          </View>
        </View>
        {mode === 'cal' ? (
          <TabPane k="cal" duration={220} style={{ flex: 0 }}>
            <Text style={{ fontSize: 18, lineHeight: 24, fontWeight: '700', letterSpacing: -0.3, color: color.ink, paddingHorizontal: 2, paddingBottom: 8 }}>
              {MONTHS[monthOf.getMonth()]} {monthOf.getFullYear()}
            </Text>
            <View style={{ marginBottom: 14 }}>
              <WeekCard
                week={week}
                onWeek={setWeek}
                selected={day}
                onSelect={setDay}
                marks={(d) => {
                  const ps = postsOn(d);
                  return { count: ps.length, hot: ps.some((p) => p.views > HOT_VIEWS) };
                }}
              />
            </View>
          </TabPane>
        ) : null}
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 2, paddingHorizontal: 20, paddingBottom: bottomInset + 24, gap: 10 }}>
        {list.length === 0 ? (
          <Text style={{ paddingVertical: 32, textAlign: 'center', fontSize: 15, lineHeight: 20, fontWeight: '600', color: color.grey4 }}>{empty}</Text>
        ) : by === 'posts' ? (
          list.map((p) => <PostCard key={p.id} p={p} creator={creatorFor(creators, p)} onPress={() => onPost(p.id)} />)
        ) : (
          groups.map((g) => (
            <CreatorGroup
              key={g.creator.id}
              creator={g.creator}
              posts={g.posts}
              views={g.views}
              open={expanded === g.creator.id}
              onToggle={() => {
                tap();
                setExpanded(expanded === g.creator.id ? null : g.creator.id);
              }}
              onPost={onPost}
            />
          ))
        )}
      </ScrollView>
      <Sheet
        open={filt}
        onClose={() => setFilt(false)}
        title="Filter and sort"
        footer={
          <>
            <Button
              variant="secondary"
              label="Reset"
              onPress={() => {
                setFCreator('All');
                setFFormat('All');
                setSort('views');
              }}
            />
            <Button label={`Show ${list.length}`} onPress={() => setFilt(false)} />
          </>
        }
      >
        <Label style={{ marginTop: 4, marginBottom: 10 }}>Creator</Label>
        <View style={styles.chips}>
          {opt(fCreator === 'All', 'All', () => setFCreator('All'))}
          {creators.map((c) => opt(fCreator === c.id, c.name, () => setFCreator(c.id)))}
        </View>
        <Label style={{ marginTop: 4, marginBottom: 10 }}>Format</Label>
        <View style={styles.chips}>{FORMATS.map((f) => opt(fFormat === f, f, () => setFFormat(f)))}</View>
        <Label style={{ marginTop: 4, marginBottom: 10 }}>Sort</Label>
        <View style={[styles.chips, { marginBottom: 0 }]}>{SORTS.map(([k, l]) => opt(sort === k, l, () => setSort(k)))}</View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: color.grey4 },
  group: { borderRadius: 18, backgroundColor: color.card, overflow: 'hidden', ...shadow.card },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingLeft: 16, paddingRight: 14 },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, backgroundColor: color.grey1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
});

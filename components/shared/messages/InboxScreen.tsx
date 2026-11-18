import { useMemo, useRef, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';
import { useScrollToTop } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, radius, space, text } from '../../../theme/v2';
import { Avatar, Button, Card, Chip, Chips, Empty, Field, Icon, IconButton, Press, Row, RootTitle, SectionTitle, Skeleton, useTabBarInset } from '../../v2';
import { inboxAt, unreadTotal, type InboxChannel, type InboxData, type InboxDm, type InboxFilter } from './model';

export interface InboxScreenProps {
  /** Null while the first load runs: skeletons. */
  data: InboxData | null;
  filters: readonly InboxFilter[];
  refreshing?: boolean;
  onRefresh?: () => void;
  onOpenReview?: () => void;
  onOpenDm: (dm: InboxDm) => void;
  onOpenChannel: (c: InboxChannel) => void;
  /** The pencil in the header; hidden when absent. */
  onNew?: () => void;
  /** "+ New" beside Channels; hidden when absent. */
  onNewChannel?: () => void;
  /** Above the title: the company switcher row. */
  top?: ReactNode;
  /** The first load failed: an error card with Retry in place of skeletons. */
  error?: boolean;
  onRetry?: () => void;
  /** Shown instead of "Nothing here." when there are no threads at all. */
  firstRun?: ReactNode;
}

/** Messages tab root: pinned title, unread chip, search and filter chips; only the cards scroll. */
export function InboxScreen({ data, filters, refreshing = false, onRefresh, onOpenReview, onOpenDm, onOpenChannel, onNew, onNewChannel, top, error, onRetry, firstRun }: InboxScreenProps) {
  const insets = useSafeAreaInsets();
  const barInset = useTabBarInset();
  const [filter, setFilter] = useState<InboxFilter>('All');
  const [q, setQ] = useState('');
  const loaded = data !== null;
  const needle = q.trim().toLowerCase();
  const scrollRef = useRef<ScrollViewInstance>(null);
  useScrollToTop(scrollRef);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.dms
      .filter((d) => filter === 'All' || (filter === 'Unread' && d.unread > 0) || (filter === 'Creators' && d.kind === 'creator') || (filter === 'Team' && d.kind === 'team'))
      .filter((d) => !needle || d.name.toLowerCase().includes(needle));
  }, [data, filter, needle]);
  const chans = useMemo(() => {
    if (!data) return [];
    return data.channels.filter(() => filter === 'All' || filter === 'Channels').filter((c) => !needle || c.name.toLowerCase().includes(needle));
  }, [data, filter, needle]);
  const unread = unreadTotal(data);
  const review = data?.review ?? null;
  const showFirstRun = !!firstRun && data !== null && data.dms.length === 0 && filter === 'All' && !needle;
  const showReview = loaded && review !== null && review.count > 0 && (filter === 'All' || filter === 'Unread') && !needle;

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: space.screen }}>
        {top}
        <RootTitle title="Messages" right={onNew ? <IconButton name="edit" label="New message" onPress={onNew} /> : undefined} />
        <View style={{ marginTop: -8, marginBottom: 14, height: 26, justifyContent: 'center' }}>
          {loaded ? <Chip tone="blue" icon="mark_chat_unread" label={`${unread} unread`} /> : null}
        </View>
        <Field value={q} onChange={setQ} placeholder="Search" autoCapitalize="none" autoCorrect={false} right={<Icon name="search" size={20} color={color.grey3} />} />
        <Chips options={filters} value={filter} onChange={setFilter} />
        <View style={{ height: 12 }} />
      </View>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: space.screen, paddingBottom: barInset }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.grey4} /> : undefined}
      >
        {!loaded && error ? (
          <Animated.View entering={FadeIn.duration(260)}>
            <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
              <Icon name="cloud_off" size={32} color={color.grey3} />
              <Text style={[text.row, { textAlign: 'center' }]}>Could not load messages</Text>
              <Text style={[text.body, { color: color.grey4, textAlign: 'center' }]}>Check your connection and try again.</Text>
              {onRetry ? <Button pill variant="secondary" icon="refresh" label="Try again" onPress={onRetry} /> : null}
            </Card>
          </Animated.View>
        ) : null}
        {!loaded && !error ? [0, 1, 2, 3].map((i) => <Skeleton key={i} h={76} />) : null}
        {showReview && review ? (
          <Card onPress={onOpenReview} accessibilityLabel={`${review.count} posts to review`} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: color.blue, boxShadow: '0 6px 16px rgba(27,166,238,0.3)' }}>
            <View style={{ width: 48, height: 48, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="inbox" size={24} color={color.white} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[text.row, { color: color.white }]}>{`${review.count} ${review.count === 1 ? 'post' : 'posts'} to review`}</Text>
              <Text numberOfLines={1} style={[text.meta, { color: 'rgba(255,255,255,0.8)' }]}>{review.names.join(', ')}</Text>
            </View>
            <Icon name="chevron_right" size={22} color={color.white} />
          </Card>
        ) : null}
        {showFirstRun ? firstRun : null}
        {loaded && rows.length ? (
          <Card pad={0} style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
            {rows.map((d, i) => <DmRow key={d.id} dm={d} last={i === rows.length - 1} onPress={() => onOpenDm(d)} />)}
          </Card>
        ) : null}
        {loaded && (chans.length || (onNewChannel && (filter === 'All' || filter === 'Channels') && !needle)) ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <SectionTitle>Channels</SectionTitle>
              {onNewChannel ? (
                <Press accessibilityRole="button" accessibilityLabel="New channel" onPress={onNewChannel} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: color.blueTint, marginTop: 4 }}>
                  <Icon name="add" size={16} weight={700} color={color.blueDeep} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: color.blueDeep }}>New</Text>
                </Press>
              ) : null}
            </View>
            {!chans.length ? <Empty>No channels yet. Start one for a group topic.</Empty> : null}
            {chans.length ? <Card pad={0} style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
              {chans.map((c, i) => <ChannelRow key={c.id} channel={c} last={i === chans.length - 1} onPress={() => onOpenChannel(c)} />)}
            </Card> : null}
          </>
        ) : null}
        {loaded && !rows.length && !chans.length && !showReview && !showFirstRun ? <Empty>Nothing here.</Empty> : null}
      </ScrollView>
    </View>
  );
}

function DmRow({ dm, last, onPress }: { dm: InboxDm; last: boolean; onPress: () => void }) {
  const unread = dm.unread > 0;
  return (
    <Row last={last} onPress={onPress}>
      <Avatar name={dm.name} photo={dm.photo} tone={dm.tone} size={48} online={dm.online} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text numberOfLines={1} style={[text.row, { flex: 1 }]}>{dm.name}</Text>
          <Text style={[text.meta, unread ? { color: color.blue, fontWeight: '600' } : null]}>{inboxAt(dm.lastAt)}</Text>
        </View>
        <Text numberOfLines={1} style={[text.body, { color: unread ? color.ink : color.grey4, fontWeight: unread ? '600' : '400' }]}>{dm.last}</Text>
      </View>
      {unread ? (
        <View style={{ minWidth: 22, height: 22, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: color.blue, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, lineHeight: 22, fontWeight: '700', color: color.white, textAlign: 'center' }}>{dm.unread}</Text>
        </View>
      ) : null}
    </Row>
  );
}

function ChannelRow({ channel, last, onPress }: { channel: InboxChannel; last: boolean; onPress: () => void }) {
  return (
    <Row last={last} onPress={onPress}>
      <HashDisc size={48} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text numberOfLines={1} style={[text.row, { flex: 1 }]}>{channel.name}</Text>
          <Text style={text.meta}>{inboxAt(channel.lastAt)}</Text>
        </View>
        <Text numberOfLines={1} style={[text.body, { color: color.grey4 }]}>{channel.last}</Text>
      </View>
    </Row>
  );
}

/** Purple-tint disc with a bold "#": a channel's avatar. */
export function HashDisc({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius.pill, backgroundColor: color.purpleTint, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Text allowFontScaling={false} style={{ fontSize: Math.round(size * 0.42), fontWeight: '700', color: color.purple }}>#</Text>
    </View>
  );
}


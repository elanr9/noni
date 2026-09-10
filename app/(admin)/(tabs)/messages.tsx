import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import {
  ChannelLead,
  InboxRow,
  PersonLead,
  QueueSubline,
  QueueThumb,
} from '../../../components/admin/messages/inbox/InboxRow';
import { InboxSectionHeader } from '../../../components/admin/messages/inbox/InboxSectionHeader';
import { NewChannelSheet } from '../../../components/admin/messages/inbox/NewChannelSheet';
import { NewMessageSheet } from '../../../components/admin/messages/inbox/NewMessageSheet';
import { useInboxCollapse } from '../../../components/admin/messages/inbox/inboxCollapse';
import {
  AdminHeader,
  AdminScreen,
  Card,
  EmptyState,
  SkeletonCard,
} from '../../../components/admin/shared';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { useAuth } from '../../../lib/auth';
import { loadInbox, type DmInboxRow, type Inbox } from '../../../lib/inbox-api';
import type { InboxRow as ChannelRow } from '../../../lib/manager-messages-api';
import { subscribePresence } from '../../../lib/presence';
import { color, radiusAdmin, shadow, type } from '../../../theme/tokens';

const FILTERS = ['All', 'Unread', 'Creators', 'Team', 'Channels'] as const;
type Filter = (typeof FILTERS)[number];

const POLL_MS = 20_000;

export default function MessagesScreen() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const meId = profile?.id ?? null;

  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [composing, setComposing] = useState(false);
  const { isOpen, toggle } = useInboxCollapse();
  const [channelSheetKey, setChannelSheetKey] = useState(0);

  const hasLoaded = useRef(false);
  const load = useCallback(async () => {
    if (companyId === null || meId === null) return;
    try {
      setInbox(await loadInbox(companyId, meId));
      hasLoaded.current = true;
    } catch (e) {
      if (!hasLoaded.current) Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [companyId, meId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), POLL_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  useEffect(() => {
    if (companyId === null) return;
    return subscribePresence(companyId, setOnline);
  }, [companyId]);

  const dms = useMemo(() => {
    if (!inbox) return [];
    const q = query.trim().toLowerCase();
    return inbox.dms
      .map((d) => ({ ...d, online: d.kind === 'creator' && online.has(d.personId) }))
      .filter((d) => {
        if (filter === 'Unread') return d.unread > 0;
        if (filter === 'Creators') return d.kind === 'creator';
        if (filter === 'Team') return d.kind === 'member';
        return filter !== 'Channels';
      })
      .filter((d) => q.length === 0 || d.name.toLowerCase().includes(q));
  }, [inbox, filter, query, online]);

  const channels = useMemo(() => {
    if (!inbox) return [];
    const q = query.trim().toLowerCase();
    return inbox.channels
      .filter((c) => filter === 'All' || filter === 'Channels' || (filter === 'Unread' && c.unread > 0))
      .filter((c) => q.length === 0 || (c.name ?? c.title).toLowerCase().includes(q));
  }, [inbox, filter, query]);

  const showQueue = (filter === 'All' || filter === 'Unread') && (inbox?.queue.length ?? 0) > 0;
  const empty =
    !loading &&
    inbox !== null &&
    inbox.queue.length === 0 &&
    inbox.dms.length === 0 &&
    inbox.channels.length === 0;
  const nothingHere =
    !loading && !empty && !showQueue && dms.length === 0 && channels.length === 0 && filter !== 'All' && filter !== 'Channels';

  const subtitle = (() => {
    if (loading || inbox === null) return undefined;
    const unread = inbox.unreadTotal;
    const queue = inbox.queue.length;
    if (unread === 0 && queue === 0) return 'All caught up';
    return `${unread} unread \u00b7 ${queue} to review`;
  })();

  const openDm = (row: DmInboxRow) => {
    if (row.kind === 'creator') router.push(`/(admin)/chat/${row.targetId}`);
    else router.push(`/(admin)/messages/${row.targetId}`);
  };

  const openChannel = (row: ChannelRow) => {
    router.push(`/(admin)/messages/${row.chatId}`);
  };

  if (companyId === null || meId === null) return null;

  return (
    <AdminScreen
      contentStyle={styles.body}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
    >
      <AdminHeader
        title="Messages"
        subtitle={subtitle}
        trailing={
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="New message"
            onPress={() => setComposing(true)}
            style={[styles.newButton, shadow.shadowCard]}
          >
            <Icon name="pencil" size={18} color={color.ink} />
          </PressableScale>
        }
      />

      {loading && (
        <View style={styles.skeletons}>
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard key={i} height={66} radius={radiusAdmin.lg} />
          ))}
        </View>
      )}

      {empty && (
        <EmptyState
          icon="message-circle"
          title="No messages yet"
          body="Threads with creators open the moment a brief is assigned. Posts waiting on your review show up here first."
          style={styles.empty}
        />
      )}

      {!loading && !empty && inbox !== null && (
        <>
          <View style={styles.controls}>
            <View style={styles.search}>
              <Icon name="search" size={15} color={color.slate400} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search people, posts, channels"
                placeholderTextColor={color.slate400}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="while-editing"
                accessibilityLabel="Search people, posts, channels"
                style={styles.searchInput}
              />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {FILTERS.map((f) => {
                const on = filter === f;
                return (
                  <Pressable
                    key={f}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setFilter(f)}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{f}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {showQueue && (
            <>
              <InboxSectionHeader
                label="Waiting on you"
                count={inbox.queue.length}
                open={isOpen('review')}
                onToggle={() => toggle('review')}
              />
              {isOpen('review') && (
                <Card pad={0} style={styles.card}>
                  {inbox.queue.map((q, i) => (
                    <InboxRow
                      key={q.assignmentId}
                      last={i === inbox.queue.length - 1}
                      lead={<QueueThumb mediaPath={q.mediaPath} format={q.format} />}
                      title={q.title}
                      sub={
                        <QueueSubline
                          creatorShort={q.creatorShort}
                          typeLabel={q.typeLabel}
                          lengthLabel={q.lengthLabel}
                          attempt={q.attempt}
                        />
                      }
                      time={q.ageLabel}
                      unread={0}
                      onPress={() => router.push(`/(admin)/review/${q.assignmentId}`)}
                    />
                  ))}
                </Card>
              )}
            </>
          )}

          {filter !== 'Channels' && dms.length > 0 && (
            <>
              <InboxSectionHeader
                label="Direct messages"
                open={isOpen('dms')}
                onToggle={() => toggle('dms')}
              />
              {isOpen('dms') && (
                <Card pad={0} style={styles.card}>
                  {dms.map((d, i) => (
                    <InboxRow
                      key={d.id}
                      last={i === dms.length - 1}
                      lead={
                        <PersonLead
                          name={d.name}
                          tone={d.kind === 'creator' ? 'brand' : 'quiet'}
                          online={d.online}
                        />
                      }
                      title={d.name}
                      titleSuffix={d.kind === 'member' ? (d.role ?? undefined) : undefined}
                      sub={d.preview}
                      time={d.timeLabel}
                      unread={d.unread}
                      onPress={() => openDm(d)}
                    />
                  ))}
                </Card>
              )}
            </>
          )}

          {filter !== 'Creators' && filter !== 'Team' && (channels.length > 0 || filter === 'Channels' || filter === 'All') && (
            <>
              <InboxSectionHeader
                label="Channels"
                open={isOpen('channels')}
                onToggle={() => toggle('channels')}
                trailing={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="New channel"
                    hitSlop={10}
                    onPress={() => {
                      setChannelSheetKey((k) => k + 1);
                      setCreating(true);
                    }}
                    style={styles.newChannel}
                  >
                    <Icon name="plus" size={12} color={color.blue700} strokeWidth={2.5} />
                    <Text style={styles.newChannelText}>New</Text>
                  </Pressable>
                }
              />
              {isOpen('channels') && channels.length > 0 && (
                <Card pad={0} style={styles.card}>
                  {channels.map((c, i) => (
                    <InboxRow
                      key={c.chatId}
                      last={i === channels.length - 1}
                      lead={<ChannelLead />}
                      title={c.title}
                      sub={c.preview}
                      time={c.timeLabel}
                      unread={c.unread}
                      onPress={() => openChannel(c)}
                    />
                  ))}
                </Card>
              )}
            </>
          )}

          {nothingHere && <Text style={styles.nothing}>Nothing here</Text>}
        </>
      )}

      {inbox !== null && (
        <NewChannelSheet
          key={channelSheetKey}
          visible={creating}
          onClose={() => setCreating(false)}
          companyId={companyId}
          meId={meId}
          team={inbox.team}
          approvedCreatorCount={inbox.approvedCreatorCount}
          onCreated={(chatId) => {
            setCreating(false);
            void load();
            router.push(`/(admin)/messages/${chatId}`);
          }}
        />
      )}
      {inbox !== null && (
        <NewMessageSheet
          visible={composing}
          onClose={() => setComposing(false)}
          people={inbox.dms}
          onPick={(row) => {
            setComposing(false);
            openDm(row);
          }}
        />
      )}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingBottom: 40,
  },
  newButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletons: {
    paddingTop: 12,
    gap: 8,
  },
  empty: {
    marginTop: 40,
  },
  controls: {
    paddingTop: 10,
    gap: 10,
  },
  search: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    fontSize: type.size.meta,
    fontWeight: type.weight.medium,
    color: color.ink,
  },
  chips: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: {
    backgroundColor: color.blue500,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: type.weight.bold,
    color: color.slate500,
  },
  chipTextOn: {
    color: color.white,
  },
  card: {
    overflow: 'hidden',
  },
  newChannel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue100,
  },
  newChannelText: {
    fontSize: 11.5,
    fontWeight: type.weight.bold,
    color: color.blue700,
  },
  nothing: {
    marginVertical: 40,
    textAlign: 'center',
    fontSize: type.size.meta,
    fontWeight: type.weight.medium,
    color: color.slate400,
  },
});

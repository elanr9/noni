import { useCallback, useState } from 'react';
import { Alert, RefreshControl, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { InboxRowCard } from '../../../components/admin/messages/InboxRowCard';
import {
  AdminHeader,
  AdminScreen,
  CreatorAvatar,
  SectionLabel,
  SkeletonCard,
} from '../../../components/admin/shared';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon } from '../../../components/ui/Icon';
import { useAuth } from '../../../lib/auth';
import {
  inboxTimeLabel,
  listManagerInbox,
  type InboxRow,
} from '../../../lib/manager-messages-api';
import { listCreatorInbox, type CreatorInboxRow } from '../../../lib/messages-api';
import { color } from '../../../theme/tokens';

export default function MessagesScreen() {
  const { profile } = useAuth();
  const [creators, setCreators] = useState<CreatorInboxRow[]>([]);
  const [briefChats, setBriefChats] = useState<InboxRow[]>([]);
  const [dms, setDms] = useState<InboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const [creatorRows, inbox] = await Promise.all([
        listCreatorInbox(profile.company_id),
        listManagerInbox(profile.company_id, profile.id),
      ]);
      setCreators(creatorRows);
      setBriefChats(inbox.briefChats);
      setDms(inbox.dms);
    } catch (e) {
      Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const managerChats = [...briefChats, ...dms];
  const empty = !loading && creators.length === 0 && managerChats.length === 0;

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
      <AdminHeader title="Messages" />

      {empty && (
        <EmptyState
          icon="message-circle"
          title="No conversations yet"
          body="Creators show up here once they join. Brief chats open from each week."
          compact
        />
      )}

      {(loading || creators.length > 0) && (
        <SectionLabel style={styles.label}>Creators</SectionLabel>
      )}
      {loading ? (
        <InboxSkeletons count={3} />
      ) : (
        creators.map((row) => (
          <InboxRowCard
            key={row.creatorId}
            title={row.name}
            preview={row.preview}
            timeLabel={row.lastMessageAt ? inboxTimeLabel(row.lastMessageAt) : ''}
            unread={0}
            avatar={<CreatorAvatar name={row.name} size={42} />}
            onPress={() => router.push(`/(admin)/chat/${row.creatorId}`)}
          />
        ))
      )}

      {briefChats.length > 0 && (
        <>
          <SectionLabel style={styles.label}>Brief chats</SectionLabel>
          {briefChats.map((row) => (
            <InboxRowCard
              key={row.chatId}
              title={row.title}
              preview={row.preview}
              timeLabel={row.timeLabel}
              unread={row.unread}
              avatar={<BriefAvatar />}
              onPress={() => router.push(`/(admin)/messages/${row.chatId}`)}
            />
          ))}
        </>
      )}

      {dms.length > 0 && (
        <>
          <SectionLabel style={styles.label}>Managers</SectionLabel>
          {dms.map((row) => (
            <InboxRowCard
              key={row.chatId}
              title={row.title}
              preview={row.preview}
              timeLabel={row.timeLabel}
              unread={row.unread}
              avatar={<CreatorAvatar name={row.otherName ?? row.title} size={42} />}
              onPress={() => router.push(`/(admin)/messages/${row.chatId}`)}
            />
          ))}
        </>
      )}
    </AdminScreen>
  );
}

function BriefAvatar() {
  return (
    <View style={styles.briefAvatar}>
      <Icon name="layout-list" size={19} color={color.blue700} />
    </View>
  );
}

function InboxSkeletons({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} height={68} radius={18} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 8,
    paddingBottom: 40,
  },
  label: {
    paddingTop: 10,
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  briefAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

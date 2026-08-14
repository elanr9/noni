import { useCallback, useState, type ReactElement } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';

import {
  AdminScreen,
  Card,
  CreatorAvatar,
  PushHeader,
  SectionLabel,
  SkeletonCard,
} from '../../../components/admin/shared';
import { Icon } from '../../../components/ui/Icon';
import { useAuth } from '../../../lib/auth';
import {
  listManagerInbox,
  type InboxRow,
} from '../../../lib/manager-messages-api';
import { color } from '../../../theme/tokens';

export default function ManagerMessagesHome() {
  const { profile } = useAuth();
  const [briefChats, setBriefChats] = useState<InboxRow[]>([]);
  const [dms, setDms] = useState<InboxRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const inbox = await listManagerInbox(profile.company_id, profile.id);
      setBriefChats(inbox.briefChats);
      setDms(inbox.dms);
    } catch (e) {
      Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <AdminScreen contentStyle={styles.body}>
      <Stack.Screen options={{ headerShown: false }} />
      <PushHeader
        title="Messages"
        subtitle="Campaign managers on this account"
        onBack={() => router.back()}
      />

      <SectionLabel style={styles.briefLabel}>Brief chats</SectionLabel>
      {loading ? (
        <InboxSkeletons />
      ) : (
        briefChats.map((row) => (
          <InboxRowCard
            key={row.chatId}
            row={row}
            avatar={<BriefAvatar />}
            onPress={() => router.push(`/(admin)/messages/${row.chatId}`)}
          />
        ))
      )}

      <SectionLabel style={styles.dmLabel}>Direct messages</SectionLabel>
      {loading ? (
        <InboxSkeletons count={2} />
      ) : (
        dms.map((row) => (
          <InboxRowCard
            key={row.chatId}
            row={row}
            avatar={
              <CreatorAvatar name={row.otherName ?? row.title} size={42} />
            }
            onPress={() => router.push(`/(admin)/messages/${row.chatId}`)}
          />
        ))
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

function InboxSkeletons({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} height={68} radius={18} />
      ))}
    </>
  );
}

function InboxRowCard({
  row,
  avatar,
  onPress,
}: {
  row: InboxRow;
  avatar: ReactElement;
  onPress: () => void;
}) {
  const unread = row.unread > 0;
  return (
    <Card pad={13} onPress={onPress} style={styles.row}>
      {avatar}
      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {row.title}
        </Text>
        {row.preview.length > 0 ? (
          <Text
            numberOfLines={1}
            style={[
              styles.rowPreview,
              {
                fontWeight: unread ? '700' : '600',
                color: unread ? color.ink : color.slate400,
              },
            ]}
          >
            {row.preview}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowMeta}>
        {row.timeLabel.length > 0 ? (
          <Text
            style={[
              styles.rowTime,
              { color: unread ? color.blue600 : color.slate400 },
            ]}
          >
            {row.timeLabel}
          </Text>
        ) : null}
        {unread ? (
          <View style={styles.unreadPill}>
            <Text style={styles.unreadText}>{row.unread}</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 8,
    paddingBottom: 40,
  },
  briefLabel: {
    paddingTop: 4,
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  dmLabel: {
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: color.ink,
  },
  rowPreview: {
    marginTop: 2,
    fontSize: 12.5,
  },
  rowMeta: {
    alignItems: 'flex-end',
    gap: 5,
  },
  rowTime: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  unreadPill: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: color.blue500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: {
    fontSize: 11,
    fontWeight: '700',
    color: color.white,
  },
});

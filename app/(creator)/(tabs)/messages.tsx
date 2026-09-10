import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { Screen } from '../../../components/layout/Screen';
import { PressableScale } from '../../../components/ui/PressableScale';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import { useAuth } from '../../../lib/auth';
import { listCampaignManagers } from '../../../lib/briefs-api';
import { loadCreatorInbox, type CreatorInbox } from '../../../lib/creator-inbox-api';
import { inboxTimeLabel } from '../../../lib/manager-messages-api';
import { getCompany } from '../../../lib/onboarding';
import { borderWidth, color, radius, shadow, space, type } from '../../../theme/tokens';

const POLL_MS = 20_000;

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function managersLine(names: string[]): string {
  const firsts = names.map(firstNameOf).filter((n) => n.length > 0);
  if (firsts.length === 0) return 'Your team';
  if (firsts.length === 1) return firsts[0];
  if (firsts.length === 2) return `${firsts[0]} and ${firsts[1]}`;
  return `${firsts[0]}, ${firsts[1]} and ${firsts.length - 2} more`;
}

function InboxRow(props: {
  lead: ReactNode;
  title: string;
  sub: string;
  time: string | null;
  unread: number;
  last: boolean;
  onPress: () => void;
}) {
  const hasUnread = props.unread > 0;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={hasUnread ? `${props.title}, ${props.unread} unread` : props.title}
      onPress={props.onPress}
      style={[styles.row, !props.last && styles.rowBorder]}
    >
      {props.lead}
      <View style={styles.rowText}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.rowTitle}>
            {props.title}
          </Text>
          {props.time !== null && (
            <Text style={[styles.time, hasUnread && styles.timeUnread]}>{props.time}</Text>
          )}
        </View>
        <View style={styles.subRow}>
          <Text numberOfLines={1} style={[styles.rowSub, hasUnread && styles.rowSubUnread]}>
            {props.sub}
          </Text>
          {hasUnread && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{props.unread > 99 ? '99+' : String(props.unread)}</Text>
            </View>
          )}
        </View>
      </View>
    </PressableScale>
  );
}

export default function CreatorMessagesScreen() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const meId = profile?.id ?? null;

  const [inbox, setInbox] = useState<CreatorInbox | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [managerNames, setManagerNames] = useState<string[]>([]);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (companyId === null || meId === null) return;
    const mine = ++seq.current;
    try {
      const fresh = await loadCreatorInbox(companyId, meId);
      if (mine === seq.current) setInbox(fresh);
    } catch {
      // Poll retries; keep what is on screen.
    } finally {
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
    let cancelled = false;
    void getCompany(companyId)
      .then((c) => {
        if (!cancelled) setCompanyName(c.name);
      })
      .catch(() => undefined);
    void listCampaignManagers(companyId)
      .then((managers) => {
        if (!cancelled) setManagerNames(managers.map((m) => m.name));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (!profile) return null;

  const company = companyName ?? 'Your team';
  const team = inbox?.team ?? null;
  const channels = inbox?.channels ?? [];

  return (
    <Screen scroll={false} bg={color.offWhite} contentStyle={styles.content}>
      <Text style={styles.title}>Messages</Text>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={color.slate400}
          />
        }
      >
        {inbox === null ? (
          <View style={styles.skeletons}>
            <SkeletonCard height={72} radius={radius.lg} />
            <SkeletonCard height={72} radius={radius.lg} />
          </View>
        ) : (
          <>
            <View style={[styles.card, shadow.shadowCard]}>
              <InboxRow
                lead={
                  <View style={styles.companyAvatar}>
                    <Text style={styles.companyAvatarText}>{company.charAt(0).toUpperCase()}</Text>
                  </View>
                }
                title={company}
                sub={team?.preview || `Campaign manager · ${managersLine(managerNames)}`}
                time={team?.lastMessageAt ? inboxTimeLabel(team.lastMessageAt) : null}
                unread={team?.unread ?? 0}
                last
                onPress={() => router.push('/(creator)/chat')}
              />
            </View>

            {channels.length > 0 && (
              <View style={styles.group}>
                <Text style={styles.groupLabel}>Channels</Text>
                <View style={[styles.card, shadow.shadowCard]}>
                  {channels.map((c, i) => (
                    <InboxRow
                      key={c.chatId}
                      lead={
                        <View style={styles.hashAvatar}>
                          <Text style={styles.hashText}>#</Text>
                        </View>
                      }
                      title={`#${c.name}`}
                      sub={c.preview}
                      time={c.lastMessageAt ? inboxTimeLabel(c.lastMessageAt) : null}
                      unread={c.unread}
                      last={i === channels.length - 1}
                      onPress={() =>
                        router.push({
                          pathname: '/(creator)/channel/[chatId]',
                          params: { chatId: c.chatId },
                        })
                      }
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space[5],
    paddingBottom: 0,
    gap: space[4],
    flex: 1,
  },
  flex: { flex: 1 },
  title: {
    fontSize: type.size.title,
    lineHeight: type.size.title * type.leading.title,
    letterSpacing: type.tracking.title,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  list: {
    gap: space[5],
    paddingBottom: space[8],
  },
  skeletons: { gap: space[3] },
  group: { gap: space[2] },
  groupLabel: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
    marginLeft: 2,
  },
  card: {
    backgroundColor: color.white,
    borderRadius: radius.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: 72,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
  },
  rowBorder: {
    borderBottomWidth: borderWidth.hair,
    borderBottomColor: color.line,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  rowTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  time: {
    fontSize: type.size.label,
    fontWeight: type.weight.regular,
    color: color.slate400,
  },
  timeUnread: {
    color: color.accent,
    fontWeight: type.weight.bold,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  rowSub: {
    flex: 1,
    minWidth: 0,
    fontSize: type.size.chip,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
  rowSubUnread: {
    color: color.ink,
    fontWeight: type.weight.semibold,
  },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    color: color.white,
  },
  companyAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyAvatarText: {
    fontSize: type.size.body,
    fontWeight: type.weight.heavy,
    color: color.blue700,
  },
  hashAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hashText: {
    fontSize: type.size.body,
    fontWeight: type.weight.heavy,
    color: color.slate500,
  },
});

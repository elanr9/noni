import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatThread } from '../../components/ChatThread';
import { Icon } from '../../components/ui/Icon';
import { PressableScale } from '../../components/ui/PressableScale';
import { StatusChip } from '../../components/ui/StatusChip';
import { useAuth } from '../../lib/auth';
import {
  listMyAssignments,
  type AssignmentWithBrief,
} from '../../lib/tasks-api';
import {
  borderWidth,
  color,
  radius,
  space,
  type,
} from '../../theme/tokens';

/** One admin thread per creator, with pinned Changes requested cards. */
export default function CreatorChat() {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [revisions, setRevisions] = useState<AssignmentWithBrief[]>([]);

  const loadRevisions = useCallback(async () => {
    if (!profile) return;
    try {
      const all = await listMyAssignments(profile.id);
      setRevisions(all.filter((a) => a.status === 'changes_requested'));
    } catch {
      // Pinned strip is best effort; the thread still loads.
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      void loadRevisions();
      if (profile) {
        void AsyncStorage.setItem(
          `noni.chat.seenAt.${profile.id}`,
          new Date().toISOString(),
        ).catch(() => undefined);
      }
    }, [loadRevisions, profile]),
  );

  if (!profile) return null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backBtn}
          onPress={() => router.back()}
        >
          <Icon name="chevron-left" size={22} color={color.ink} />
        </PressableScale>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={styles.headerSpacer} />
      </View>

      {revisions.length > 0 ? (
        <View style={styles.pinned}>
          <Text style={styles.pinnedLabel}>Needs your attention</Text>
          {revisions.map((a) => (
            <PressableScale
              key={a.id}
              accessibilityRole="button"
              accessibilityLabel={`Open changes requested on ${a.briefs.title}`}
              style={styles.pinnedCard}
              onPress={() =>
                router.push({
                  pathname: '/(creator)/assignment/[id]',
                  params: { id: a.id },
                })
              }
            >
              <View style={styles.pinnedTop}>
                <StatusChip status="changes_requested" />
                <Icon name="chevron-right" size={18} color={color.slate400} />
              </View>
              <Text numberOfLines={2} style={styles.pinnedTitle}>
                {a.briefs.title}
              </Text>
              <Text style={styles.pinnedHint}>Tap to review notes and record again</Text>
            </PressableScale>
          ))}
        </View>
      ) : null}

      <ChatThread
        companyId={profile.company_id}
        creatorId={profile.id}
        meId={profile.id}
        keyboardOffset={insets.top + 52}
        onOpenPostRef={(ref) => {
          if (ref.assignmentId !== null) {
            router.push({
              pathname: '/(creator)/assignment/[id]',
              params: { id: ref.assignmentId },
            });
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.offWhite,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.gutter,
    paddingBottom: space[3],
    gap: space[3],
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: type.size.action,
    fontWeight: type.weight.heavy,
    color: color.ink,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  pinned: {
    paddingHorizontal: space.gutter,
    paddingBottom: space[3],
    gap: space[2],
    borderBottomWidth: borderWidth.hair,
    borderBottomColor: color.line,
  },
  pinnedLabel: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
    marginBottom: 2,
  },
  pinnedCard: {
    backgroundColor: color.white,
    borderRadius: radius.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    paddingVertical: space[4],
    paddingHorizontal: space.cardPad,
    gap: 8,
  },
  pinnedTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pinnedTitle: {
    fontSize: type.size.body,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  pinnedHint: {
    fontSize: type.size.meta,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
});

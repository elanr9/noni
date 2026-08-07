import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';

import { ChatThread } from '../../components/ChatThread';
import { Icon } from '../../components/ui/Icon';
import { PressableScale } from '../../components/ui/PressableScale';
import { useAuth } from '../../lib/auth';
import {
  listMyAssignments,
  type AssignmentWithBrief,
} from '../../lib/tasks-api';
import { borderWidth, color, radius, type } from '../../theme/tokens';

/** The creator's side of the same one-thread-per-creator system. */
export default function CreatorChat() {
  const { profile } = useAuth();
  const headerHeight = useHeaderHeight();
  const [revisions, setRevisions] = useState<AssignmentWithBrief[]>([]);

  const loadRevisions = useCallback(async () => {
    if (!profile) return;
    try {
      const all = await listMyAssignments(profile.id);
      setRevisions(all.filter((a) => a.status === 'changes_requested'));
    } catch {
      // The pinned strip is best effort; the thread itself still loads.
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      void loadRevisions();
      // Same key the Home bell reads: opening chat by any path clears the dot.
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
    <View style={styles.screen}>
      {revisions.length > 0 ? (
        <View style={styles.pinned}>
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
              <Icon name="rotate-ccw" size={16} color={color.amber} />
              <View style={styles.pinnedText}>
                <Text style={styles.pinnedLabel}>Changes requested</Text>
                <Text numberOfLines={1} style={styles.pinnedTitle}>
                  {a.briefs.title}
                </Text>
              </View>
              <Icon name="chevron-right" size={16} color={color.amber} />
            </PressableScale>
          ))}
        </View>
      ) : null}
      <ChatThread
        companyId={profile.company_id}
        creatorId={profile.id}
        meId={profile.id}
        keyboardOffset={headerHeight}
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
  screen: { flex: 1, backgroundColor: color.offWhite },
  pinned: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 8,
    borderBottomWidth: borderWidth.hair,
    borderBottomColor: color.line,
  },
  pinnedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: color.amberSoft,
    borderRadius: radius.cell,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  pinnedText: {
    flex: 1,
    gap: 1,
  },
  pinnedLabel: {
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
    color: color.amber,
    textTransform: 'uppercase',
    letterSpacing: type.tracking.label,
  },
  pinnedTitle: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.semibold,
    color: color.ink,
  },
});

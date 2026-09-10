import { useMemo, type RefObject } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ManagerMessage } from '../../../../lib/manager-messages-api';
import type { PostSummary } from '../../../../lib/post-event-labels';
import { color, space } from '../../../../theme/tokens';
import { SkeletonCard } from '../../shared';
import { DayDivider } from '../DayDivider';
import { MsgRow } from '../MsgRow';
import { buildThreadItems } from '../thread/threadRows';
import { ManagerMessageView } from './ManagerMessageView';

export type ManagerThreadProps = {
  scrollRef: RefObject<ScrollView | null>;
  loading: boolean;
  messages: ManagerMessage[];
  meId: string;
  teamIds: Set<string>;
  summaries: Map<string, PostSummary>;
  playingId: string | null;
  onPlayVoice: (message: ManagerMessage) => void;
  onToggleReaction: (message: ManagerMessage, emoji: string) => void;
  onLongPress: (message: ManagerMessage) => void;
  onOpenPost: (assignmentId: string) => void;
};

type ThreadRow = ManagerMessage & { at: string };

export function ManagerThread({
  scrollRef,
  loading,
  messages,
  meId,
  teamIds,
  summaries,
  playingId,
  onPlayVoice,
  onToggleReaction,
  onLongPress,
  onOpenPost,
}: ManagerThreadProps) {
  const items = useMemo(
    () => buildThreadItems<ThreadRow>(messages.map((m) => ({ ...m, at: m.createdAt }))),
    [messages],
  );

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.fill}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {loading ? (
        <View style={styles.skeletons}>
          <SkeletonCard height={56} radius={12} />
          <SkeletonCard height={56} radius={12} />
          <SkeletonCard height={56} radius={12} />
        </View>
      ) : items.length === 0 ? (
        <Text style={styles.empty}>No messages yet. Say hello.</Text>
      ) : (
        items.map((entry) => {
          if (entry.type === 'divider') return <DayDivider key={entry.id} label={entry.label} />;
          const m = entry.item;
          const mine = m.authorId === meId;
          const assignmentId = m.postRef?.assignmentId ?? null;
          return (
            <MsgRow
              key={entry.id}
              authorName={mine ? 'You' : m.authorName}
              tone={mine || teamIds.has(m.authorId) ? 'quiet' : 'brand'}
              timeLabel={entry.timeLabel}
              collapsed={entry.collapsed}
              onLongPress={() => onLongPress(m)}
            >
              <ManagerMessageView
                message={m}
                meId={meId}
                playing={playingId === m.id}
                summary={assignmentId !== null ? summaries.get(assignmentId) : undefined}
                onPlayVoice={() => onPlayVoice(m)}
                onToggleReaction={(emoji) => onToggleReaction(m, emoji)}
                onOpenPost={onOpenPost}
              />
            </MsgRow>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  list: {
    paddingTop: 4,
    paddingHorizontal: space.gutterAdmin,
    paddingBottom: 16,
  },
  skeletons: {
    paddingTop: 10,
    gap: 10,
  },
  empty: {
    marginTop: 24,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: color.slate500,
  },
});

import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  formatVoiceDuration,
  signedChatUrl,
  type ManagerMessage,
} from '../../../../lib/manager-messages-api';
import { summaryCardState, type PostSummary } from '../../../../lib/post-event-labels';
import { color, radiusAdmin } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { MediaBlock } from '../MediaBlock';
import { MsgBody } from '../MsgRow';
import { PostCard } from '../PostCard';

export type ManagerMessageViewProps = {
  message: ManagerMessage;
  meId: string;
  playing: boolean;
  summary?: PostSummary;
  onPlayVoice: () => void;
  onToggleReaction: (emoji: string) => void;
  onOpenPost: (assignmentId: string) => void;
};

function reactionLabel(emoji: string, count: number): string {
  const glyph = emoji === 'heart' ? '\u2764' : emoji;
  return `${glyph} ${count}`;
}

export function ManagerMessageView({
  message,
  meId,
  playing,
  summary,
  onPlayVoice,
  onToggleReaction,
  onOpenPost,
}: ManagerMessageViewProps) {
  const body = message.body.trim();
  const mediaPath = message.mediaPath;
  const isMedia = message.mediaKind === 'image' || message.mediaKind === 'video';
  const assignmentId = message.postRef?.assignmentId ?? null;

  return (
    <View>
      {message.replyTo !== null && (
        <View style={styles.quote}>
          <Text style={styles.quoteWho}>{message.replyTo.authorName}</Text>
          <Text numberOfLines={1} style={styles.quoteSnippet}>
            {message.replyTo.snippet}
          </Text>
        </View>
      )}
      {message.forwardLabel !== null && (
        <Text style={styles.forward}>{message.forwardLabel}</Text>
      )}
      {body.length > 0 && <MsgBody text={message.body} />}
      {isMedia && mediaPath !== null && message.mediaKind !== null && message.mediaKind !== 'voice' && (
        <MediaBlock
          kind={message.mediaKind}
          cacheKey={mediaPath}
          resolveUrl={() => signedChatUrl(mediaPath)}
          lenLabel={
            message.voiceDurationMs !== null ? formatVoiceDuration(message.voiceDurationMs) : undefined
          }
        />
      )}
      {message.mediaKind === 'voice' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause voice note' : 'Play voice note'}
          onPress={onPlayVoice}
          style={styles.voice}
        >
          <Icon name={playing ? 'pause' : 'play'} size={16} color={color.blue700} />
          <Text style={styles.voiceLabel}>{formatVoiceDuration(message.voiceDurationMs ?? 0)}</Text>
        </Pressable>
      )}
      {assignmentId !== null && summary !== undefined && (
        <PostCard
          summary={summary}
          {...summaryCardState(summary)}
          onOpen={() => onOpenPost(assignmentId)}
        />
      )}
      {message.reactions.length > 0 && (
        <View style={styles.reactions}>
          {message.reactions.map((r) => {
            const mine = r.profileIds.includes(meId);
            return (
              <Pressable
                key={r.emoji}
                accessibilityRole="button"
                accessibilityState={{ selected: mine }}
                onPress={() => onToggleReaction(r.emoji)}
                hitSlop={8}
                style={[styles.pill, mine && styles.pillMine]}
              >
                <Text style={[styles.pillText, mine && styles.pillTextMine]}>
                  {reactionLabel(r.emoji, r.count)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  quote: {
    marginTop: 4,
    borderLeftWidth: 2,
    borderLeftColor: color.blue300,
    paddingLeft: 8,
  },
  quoteWho: {
    fontSize: 12,
    fontWeight: '700',
    color: color.blue700,
  },
  quoteSnippet: {
    marginTop: 1,
    fontSize: 12.5,
    fontWeight: '500',
    color: color.slate500,
  },
  forward: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: color.slate400,
  },
  voice: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue100,
  },
  voiceLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: color.blue700,
  },
  reactions: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
  },
  pillMine: {
    backgroundColor: color.blue100,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: color.ink,
  },
  pillTextMine: {
    color: color.blue700,
  },
});

import { StyleSheet, Text, View } from 'react-native';

import type { MessagePostRef, ThreadMessage } from '../../../lib/messages-api';
import { color, type } from '../../../theme/tokens';
import { PostRefBlock } from './PostRefBlock';

export interface MessageBubbleProps {
  message: ThreadMessage;
  onOpenPostRef?: (ref: MessagePostRef) => void;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Admin handoff §10 — admin bubbles blue-500 with 16/16/4/16 radius, creator
 * bubbles quiet fill mirrored.
 */
export function MessageBubble({ message, onOpenPostRef }: MessageBubbleProps) {
  const admin = !message.fromCreator;

  return (
    <View style={[styles.entry, admin ? styles.entryAdmin : styles.entryCreator]}>
      <Text style={styles.meta}>
        {admin
          ? timeLabel(message.createdAt)
          : `${message.authorName} · ${timeLabel(message.createdAt)}`}
      </Text>
      <View style={[styles.bubble, admin ? styles.bubbleAdmin : styles.bubbleCreator]}>
        {message.postRef !== null && (
          <PostRefBlock
            postRef={message.postRef}
            onBlue={admin}
            onPress={
              onOpenPostRef !== undefined && message.postRef !== null
                ? () => {
                    if (message.postRef !== null) onOpenPostRef(message.postRef);
                  }
                : undefined
            }
          />
        )}
        <Text style={admin ? styles.bodyAdmin : styles.bodyCreator}>
          {message.body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  entry: {
    maxWidth: '82%',
    gap: 3,
  },
  entryAdmin: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  entryCreator: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  meta: {
    fontSize: type.size.micro,
    fontWeight: '600',
    color: color.slate400,
  },
  bubble: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
  },
  // 16px 16px 4px 16px — the tail corner tucks toward the sender.
  bubbleAdmin: {
    backgroundColor: color.blue500,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 16,
  },
  bubbleCreator: {
    backgroundColor: color.fillQuiet,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 4,
  },
  bodyAdmin: {
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    fontWeight: '500',
    color: color.white,
  },
  bodyCreator: {
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    fontWeight: '500',
    color: color.ink,
  },
});

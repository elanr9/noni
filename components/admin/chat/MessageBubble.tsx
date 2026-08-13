import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  parseMessageMedia,
  signedChatMediaUrl,
  type MessageMedia,
  type MessagePostRef,
  type ThreadMessage,
} from '../../../lib/messages-api';
import { color, type } from '../../../theme/tokens';
import { PostThumb } from '../shared';
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
 * The 168-wide media block inside a media bubble: images load through a
 * signed URL over the gradient placeholder, videos keep the placeholder with
 * the play disc and duration badge. Shared by the admin and creator threads.
 */
export function ChatMediaBlock({ media }: { media: MessageMedia }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (media.media !== 'image') return;
    let cancelled = false;
    void signedChatMediaUrl(media.url)
      .then((signed) => {
        if (!cancelled) setUrl(signed);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [media]);

  return (
    <PostThumb
      uri={media.media === 'image' ? url : null}
      format={media.media === 'video' ? 'video' : 'photo_carousel'}
      badge={media.len}
      width={168}
      height={media.media === 'video' ? 224 : 118}
      radius={12}
    />
  );
}

/**
 * Admin handoff §10 — admin bubbles blue-500 with 16/16/4/16 radius, creator
 * bubbles quiet fill mirrored. Media messages render as a 168-wide media
 * block with optional caption and the timestamp inside the bubble.
 */
export function MessageBubble({ message, onOpenPostRef }: MessageBubbleProps) {
  const admin = !message.fromCreator;
  const { media, text } = parseMessageMedia(message.body);

  if (media !== null) {
    return (
      <View
        style={[
          styles.mediaBubble,
          admin ? styles.mediaBubbleAdmin : styles.mediaBubbleCreator,
        ]}
      >
        <ChatMediaBlock media={media} />
        {text.length > 0 && (
          <Text style={admin ? styles.mediaCaptionAdmin : styles.mediaCaptionCreator}>
            {text}
          </Text>
        )}
        <Text style={admin ? styles.mediaTimeAdmin : styles.mediaTimeCreator}>
          {timeLabel(message.createdAt)}
        </Text>
      </View>
    );
  }

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
  mediaBubble: {
    padding: 5,
    borderRadius: 16,
  },
  mediaBubbleAdmin: {
    alignSelf: 'flex-end',
    backgroundColor: color.blue500,
  },
  mediaBubbleCreator: {
    alignSelf: 'flex-start',
    backgroundColor: color.fillQuiet,
  },
  mediaCaptionAdmin: {
    paddingHorizontal: 8,
    paddingTop: 7,
    fontSize: type.size.meta,
    lineHeight: type.size.meta * type.leading.snug,
    color: color.white,
  },
  mediaCaptionCreator: {
    paddingHorizontal: 8,
    paddingTop: 7,
    fontSize: type.size.meta,
    lineHeight: type.size.meta * type.leading.snug,
    color: color.ink,
  },
  mediaTimeAdmin: {
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 3,
    textAlign: 'right',
    fontSize: type.size.micro11,
    fontWeight: '600',
    color: color.whiteA75,
  },
  mediaTimeCreator: {
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 3,
    textAlign: 'right',
    fontSize: type.size.micro11,
    fontWeight: '600',
    color: color.slate400,
  },
});

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  listThread,
  parseMessageMedia,
  sendMessage,
  type MessagePostRef,
  type ThreadMessage,
} from '../lib/messages-api';
import { borderWidth, color, radius, type } from '../theme/tokens';
import { ChatMediaBlock } from './admin/chat/MessageBubble';
import { Icon } from './ui/Icon';
import { PressableScale } from './ui/PressableScale';

const POLL_MS = 5000;

/** Post reference attached to the composer before sending. */
export type PendingPostRef = {
  assignmentId?: string;
  briefId?: string;
  title: string;
};

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * The one thread per creator. Both the admin screen and the creator screen
 * render this; entry points differ, the system does not.
 */
export function ChatThread(props: {
  companyId: string;
  creatorId: string;
  meId: string;
  initialRef?: PendingPostRef | null;
  scrollToAssignmentId?: string;
  onOpenPostRef?: (ref: MessagePostRef) => void;
  keyboardOffset?: number;
}) {
  const {
    companyId,
    creatorId,
    meId,
    initialRef = null,
    scrollToAssignmentId,
    onOpenPostRef,
    keyboardOffset = 0,
  } = props;

  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [pendingRef, setPendingRef] = useState<PendingPostRef | null>(initialRef);
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const messageY = useRef(new Map<string, number>());
  const didInitialScroll = useRef(false);

  const load = useCallback(async () => {
    try {
      setMessages(await listThread(companyId, creatorId));
    } catch {
      // Poll retries; keep what is on screen.
    } finally {
      setLoading(false);
    }
  }, [companyId, creatorId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Scroll once: to the referenced post's latest message, else to the bottom.
  useEffect(() => {
    if (loading || didInitialScroll.current) return;
    didInitialScroll.current = true;
    const target =
      scrollToAssignmentId !== undefined
        ? [...messages]
            .reverse()
            .find((m) => m.postRef?.assignmentId === scrollToAssignmentId)
        : undefined;
    setTimeout(() => {
      if (target !== undefined) {
        const y = messageY.current.get(target.id);
        if (y !== undefined) {
          scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: false });
          return;
        }
      }
      scrollRef.current?.scrollToEnd({ animated: false });
    }, 120);
  }, [loading, messages, scrollToAssignmentId]);

  const send = async () => {
    const body = draft.trim();
    if (body.length === 0 || sending) return;
    setSending(true);
    try {
      await sendMessage({
        companyId,
        creatorId,
        authorId: meId,
        body,
        briefId: pendingRef?.briefId,
        assignmentId: pendingRef?.assignmentId,
      });
      setDraft('');
      setPendingRef(null);
      await load();
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardOffset}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Text style={styles.empty}>Loading messages…</Text>
        ) : messages.length === 0 ? (
          <Text style={styles.empty}>No messages yet. Say hello.</Text>
        ) : (
          messages.map((m) => {
            const mine = m.authorId === meId;
            const { media, text } = parseMessageMedia(m.body);
            if (media !== null) {
              return (
                <View
                  key={m.id}
                  onLayout={(e) =>
                    messageY.current.set(m.id, e.nativeEvent.layout.y)
                  }
                  style={[
                    styles.mediaBubble,
                    mine ? styles.mediaBubbleMine : styles.mediaBubbleTheirs,
                  ]}
                >
                  <ChatMediaBlock media={media} />
                  {text.length > 0 && (
                    <Text style={mine ? styles.mediaCaptionMine : styles.mediaCaptionTheirs}>
                      {text}
                    </Text>
                  )}
                  <Text style={mine ? styles.mediaTimeMine : styles.mediaTimeTheirs}>
                    {timeLabel(m.createdAt)}
                  </Text>
                </View>
              );
            }
            return (
              <View
                key={m.id}
                onLayout={(e) =>
                  messageY.current.set(m.id, e.nativeEvent.layout.y)
                }
                style={[styles.entry, mine ? styles.entryMine : styles.entryTheirs]}
              >
                <Text style={styles.meta}>
                  {mine ? timeLabel(m.createdAt) : `${m.authorName} · ${timeLabel(m.createdAt)}`}
                </Text>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {m.postRef !== null && (
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${m.postRef.title}`}
                      disabled={onOpenPostRef === undefined}
                      onPress={() => {
                        if (m.postRef !== null) onOpenPostRef?.(m.postRef);
                      }}
                      style={styles.postRef}
                    >
                      <Icon
                        name={m.postRef.format === 'video' ? 'video' : 'images'}
                        size={15}
                        color={color.blue700}
                      />
                      <Text numberOfLines={1} style={styles.postRefTitle}>
                        {m.postRef.title}
                      </Text>
                      <Icon name="chevron-right" size={14} color={color.slate400} />
                    </PressableScale>
                  )}
                  <Text style={mine ? styles.bodyMine : styles.bodyTheirs}>{m.body}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={styles.composer}>
        {pendingRef !== null && (
          <View style={styles.pendingRef}>
            <Icon name="link" size={14} color={color.blue700} />
            <Text numberOfLines={1} style={styles.pendingRefTitle}>
              {pendingRef.title}
            </Text>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Remove post reference"
              onPress={() => setPendingRef(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="x" size={14} color={color.slate400} />
            </PressableScale>
          </View>
        )}
        <View style={styles.composerRow}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            placeholderTextColor={color.slate400}
            multiline
          />
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Send"
            disabled={draft.trim().length === 0 || sending}
            onPress={() => void send()}
            style={[
              styles.sendButton,
              (draft.trim().length === 0 || sending) && styles.sendButtonDisabled,
            ]}
          >
            <Icon name="arrow-right" size={18} color={color.white} />
          </PressableScale>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  empty: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
    textAlign: 'center',
    marginTop: 24,
  },
  entry: { maxWidth: '82%', gap: 3 },
  entryMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  entryTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  meta: {
    fontSize: type.size.micro,
    fontWeight: '600',
    color: color.slate400,
  },
  bubble: {
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
  },
  bubbleMine: { backgroundColor: color.blue600 },
  bubbleTheirs: { backgroundColor: color.white },
  bodyMine: {
    fontSize: type.size.bodySm,
    lineHeight: 21,
    fontWeight: '500',
    color: color.white,
  },
  bodyTheirs: {
    fontSize: type.size.bodySm,
    lineHeight: 21,
    fontWeight: '500',
    color: color.ink,
  },
  postRef: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: color.blue100,
    borderRadius: radius.cell,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  postRefTitle: {
    flexShrink: 1,
    fontSize: type.size.chip,
    fontWeight: '700',
    color: color.blue700,
  },
  mediaBubble: {
    padding: 5,
    borderRadius: 16,
  },
  mediaBubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: color.blue600,
  },
  mediaBubbleTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: color.white,
  },
  mediaCaptionMine: {
    paddingHorizontal: 8,
    paddingTop: 7,
    fontSize: type.size.meta,
    lineHeight: type.size.meta * 1.4,
    color: color.white,
  },
  mediaCaptionTheirs: {
    paddingHorizontal: 8,
    paddingTop: 7,
    fontSize: type.size.meta,
    lineHeight: type.size.meta * 1.4,
    color: color.ink,
  },
  mediaTimeMine: {
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 3,
    textAlign: 'right',
    fontSize: type.size.micro11,
    fontWeight: '600',
    color: color.whiteA75,
  },
  mediaTimeTheirs: {
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 3,
    textAlign: 'right',
    fontSize: type.size.micro11,
    fontWeight: '600',
    color: color.slate400,
  },
  composer: {
    borderTopWidth: borderWidth.hair,
    borderTopColor: color.line,
    backgroundColor: color.white,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 26,
    gap: 8,
  },
  pendingRef: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: color.blue100,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  pendingRefTitle: {
    flexShrink: 1,
    fontSize: type.size.chip,
    fontWeight: '700',
    color: color.blue700,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: radius.md,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    backgroundColor: color.offWhite,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: type.size.bodySm,
    color: color.ink,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.blue600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.4 },
});

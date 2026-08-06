// The one thread per creator (README §10). Reached from the profile's chat
// button and from Review's per-post chat entry, which lands here with the
// post reference attached — same thread, never a per-post thread. Data layer
// is lib/messages-api, unchanged from the previous chat surface.

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
  sendMessage,
  type MessagePostRef,
  type ThreadMessage,
} from '../../../lib/messages-api';
import { color, radiusAdmin, shadow, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { SkeletonCard } from '../shared';
import { MessageBubble } from './MessageBubble';

const POLL_MS = 5000;

/** Post reference attached to the composer before sending. */
export type PendingPostRef = {
  assignmentId?: string;
  briefId?: string;
  title: string;
};

export interface AdminChatThreadProps {
  companyId: string;
  creatorId: string;
  meId: string;
  initialRef?: PendingPostRef | null;
  scrollToAssignmentId?: string;
  onOpenPostRef?: (ref: MessagePostRef) => void;
  keyboardOffset?: number;
}

export function AdminChatThread({
  companyId,
  creatorId,
  meId,
  initialRef = null,
  scrollToAssignmentId,
  onOpenPostRef,
  keyboardOffset = 0,
}: AdminChatThreadProps) {
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

  const canSend = draft.trim().length > 0 && !sending;

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
          <View style={styles.skeletons}>
            <SkeletonCard height={56} radius={16} style={styles.skeletonTheirs} />
            <SkeletonCard height={56} radius={16} style={styles.skeletonMine} />
            <SkeletonCard height={56} radius={16} style={styles.skeletonTheirs} />
          </View>
        ) : messages.length === 0 ? (
          <Text style={styles.empty}>No messages yet. Say hello.</Text>
        ) : (
          messages.map((m) => (
            <View
              key={m.id}
              onLayout={(e) => messageY.current.set(m.id, e.nativeEvent.layout.y)}
            >
              <MessageBubble message={m} onOpenPostRef={onOpenPostRef} />
            </View>
          ))
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
            disabled={!canSend}
            onPress={() => void send()}
            style={[
              styles.sendButton,
              canSend ? shadow.shadowAccent : styles.sendButtonDisabled,
            ]}
          >
            <Icon name="arrow-right" size={19} color={color.white} />
          </PressableScale>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  list: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  skeletons: {
    gap: 12,
  },
  skeletonTheirs: {
    width: '62%',
    alignSelf: 'flex-start',
  },
  skeletonMine: {
    width: '62%',
    alignSelf: 'flex-end',
  },
  empty: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
    textAlign: 'center',
    marginTop: 24,
  },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
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
    borderRadius: radiusAdmin.pill,
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
    minHeight: 44,
    maxHeight: 120,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: type.size.bodySm,
    color: color.ink,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.blue500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});

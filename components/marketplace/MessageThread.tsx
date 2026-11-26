// The thread on one application: the company and the creator write to each
// other in plain text. Both sides draw this one. Mine sit right in the
// campaign's colour, theirs left in grey, newest at the bottom.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View, useWindowDimensions, type ScrollViewInstance, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { useKeyboardHeight } from '../../lib/keyboard';
import { MESSAGE_MAX, coverColor, isLightColor, mergeThread, messageBody, type ThreadMessage } from '../../lib/marketplace';
import { loadThread, sendThreadMessage } from '../../lib/marketplace-api';
import { color, radius, text } from '../../theme/v2';
import { Press, Sheet } from '../v2';

/** Where a thread reads and writes. The dev preview feeds its own. */
export interface ThreadSource {
  load: () => Promise<ThreadMessage[]>;
  send: (body: string) => Promise<ThreadMessage>;
}

/** How often an open thread asks for new messages. */
const POLL_MS = 15_000;

export interface MessageThreadProps {
  applicationId: string;
  /** The campaign's colour: my bubbles and Send wear it. */
  tint?: string | null;
  source?: ThreadSource;
  /** The thread was read, so the caller can drop its unread dot. */
  onRead?: () => void;
  /** Fills its parent by default; pass a height to size it. */
  style?: StyleProp<ViewStyle>;
}

export function MessageThread({ applicationId, tint, source, onRead, style }: MessageThreadProps) {
  const brand = coverColor(tint);
  const onBrand = isLightColor(brand) ? color.ink : color.white;
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Ids sent from this screen: only these pop in. */
  const [fresh, setFresh] = useState<string[]>([]);
  const list = useRef<ScrollViewInstance>(null);

  // The newest props without restarting the poll.
  const live = useRef({ source, onRead });
  useEffect(() => {
    live.current = { source, onRead };
  });

  const read = useCallback(async () => {
    const rows = await (live.current.source ? live.current.source.load() : loadThread(applicationId));
    setMessages((cur) => mergeThread(cur, rows));
    live.current.onRead?.();
  }, [applicationId]);

  useEffect(() => {
    let on = true;
    const tick = () =>
      read()
        .then(() => on && setError(null))
        .catch((e: unknown) => {
          if (!on) return;
          // A failed poll keeps what is on screen and says why.
          setMessages((cur) => cur ?? []);
          setError(e instanceof Error ? e.message : 'Could not load');
        });
    void tick();
    const t = setInterval(() => void tick(), POLL_MS);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [read]);

  const body = messageBody(draft);
  const send = async () => {
    if (!body || sending) return;
    setSending(true);
    setError(null);
    setDraft('');
    try {
      const sent = await (source ? source.send(body) : sendThreadMessage(applicationId, body));
      setMessages((cur) => [...(cur ?? []).filter((m) => m.id !== sent.id), sent]);
      setFresh((ids) => [...ids, sent.id]);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (e) {
      setDraft(body);
      setError(e instanceof Error ? e.message : 'Could not send');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[{ minHeight: 0 }, style ?? { flex: 1 }]}>
      {messages === null ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={color.grey3} />
        </View>
      ) : messages.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[text.row, { color: color.grey3 }]}>No messages yet</Text>
        </View>
      ) : (
        <ScrollView
          ref={list}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          onLayout={() => list.current?.scrollToEnd({ animated: false })}
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', gap: 6, paddingBottom: 4 }}
        >
          {messages.map((m, i) => {
            const joined = i > 0 && messages[i - 1].mine === m.mine;
            const bubble = (
              <View
                style={{
                  maxWidth: '82%',
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 20,
                  backgroundColor: m.mine ? brand : color.grey1,
                }}
              >
                <Text style={[text.body, { color: m.mine ? onBrand : color.ink }]}>{m.body}</Text>
              </View>
            );
            const row: ViewStyle = { flexDirection: 'row', justifyContent: m.mine ? 'flex-end' : 'flex-start', marginTop: joined || i === 0 ? 0 : 6 };
            return fresh.includes(m.id) ? (
              <Animated.View key={m.id} entering={ZoomIn.springify().damping(12)} style={[row, { transformOrigin: 'right bottom' }]}>
                {bubble}
              </Animated.View>
            ) : (
              <View key={m.id} style={row}>
                {bubble}
              </View>
            );
          })}
        </ScrollView>
      )}

      {error ? <Text numberOfLines={1} style={[text.meta, { color: color.pink, paddingTop: 6 }]}>{error}</Text> : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10 }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message"
          placeholderTextColor={color.grey3}
          maxLength={MESSAGE_MAX}
          returnKeyType="send"
          submitBehavior="submit"
          onSubmitEditing={() => void send()}
          accessibilityLabel="Message"
          style={{ flex: 1, minWidth: 0, height: 44, paddingHorizontal: 16, paddingVertical: 0, borderRadius: radius.pill, backgroundColor: color.grey1, fontSize: 15, color: color.ink }}
        />
        <Press
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !body || sending }}
          disabled={!body || sending}
          onPress={() => void send()}
          style={{ height: 44, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: brand, alignItems: 'center', justifyContent: 'center', opacity: !body || sending ? 0.4 : 1 }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: onBrand }}>Send</Text>
        </Press>
      </View>
    </View>
  );
}

export interface ThreadSheetProps {
  /** The application whose thread is open; null closes the sheet. */
  applicationId: string | null;
  /** Who is on the other side. */
  title: string;
  tint?: string | null;
  source?: ThreadSource;
  onRead?: () => void;
  onClose: () => void;
}

/** The thread in a bottom sheet. It stops asking for messages once it is shut. */
export function ThreadSheet({ applicationId, title, tint, source, onRead, onClose }: ThreadSheetProps) {
  const { height } = useWindowDimensions();
  const keyboard = useKeyboardHeight();
  // Keep the last thread while the sheet slides shut.
  const [shown, setShown] = useState({ applicationId, title });
  if (applicationId && (applicationId !== shown.applicationId || title !== shown.title)) setShown({ applicationId, title });
  const id = applicationId ?? shown.applicationId;
  if (!id) return null;
  // The sheet's own header and padding take about 160; the rest is the thread, shorter while typing.
  const room = Math.max(200, Math.min(460, height - keyboard - 160));
  return (
    <Sheet open={applicationId !== null} onClose={onClose} title={applicationId ? title : shown.title}>
      <MessageThread key={id} applicationId={id} tint={tint} source={source} onRead={onRead} style={{ height: room }} />
    </Sheet>
  );
}

import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors } from './Screen';
import type { ReviewEvent } from '../lib/review-events';

function actionLabel(action: ReviewEvent['action']): string {
  switch (action) {
    case 'approved':
      return 'Approved';
    case 'changes_requested':
      return 'Requested changes';
    case 'comment':
      return 'Comment';
  }
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ReviewThread({
  events,
  onSendComment,
  composerEnabled = true,
}: {
  events: ReviewEvent[];
  onSendComment: (text: string) => Promise<void>;
  composerEnabled?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await onSendComment(text);
      setDraft('');
    } catch (e) {
      Alert.alert(
        'Could not send',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Feedback</Text>

      {events.length === 0 ? (
        <Text style={styles.empty}>No feedback yet.</Text>
      ) : (
        <View style={styles.list}>
          {events.map((e) => {
            const name = e.profiles?.full_name?.trim() || 'Someone';
            const role = e.profiles?.role === 'admin' ? 'Admin' : 'Creator';
            return (
              <View key={e.id} style={styles.item}>
                <View style={styles.itemMeta}>
                  <Text style={styles.itemWho}>
                    {name} · {role}
                  </Text>
                  <Text style={styles.itemWhen}>
                    {e.created_at ? formatWhen(e.created_at) : ''}
                  </Text>
                </View>
                <Text style={styles.itemAction}>{actionLabel(e.action)}</Text>
                {e.note?.trim() ? (
                  <Text style={styles.itemNote}>{e.note.trim()}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      {composerEnabled ? (
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="Write a comment"
            placeholderTextColor="#9A9AA3"
            value={draft}
            onChangeText={setDraft}
            multiline
            editable={!sending}
          />
          <Pressable
            style={[styles.send, (sending || !draft.trim()) && styles.disabled]}
            disabled={sending || !draft.trim()}
            onPress={() => void send()}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.sendText}>Send</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  heading: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  empty: { fontSize: 15, color: colors.muted },
  list: { gap: 10 },
  item: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E6E2DA',
    gap: 4,
  },
  itemMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  itemWho: { fontSize: 13, fontWeight: '700', color: colors.ink },
  itemWhen: { fontSize: 12, color: colors.muted },
  itemAction: { fontSize: 12, fontWeight: '600', color: colors.accent },
  itemNote: { fontSize: 15, lineHeight: 22, color: colors.ink, marginTop: 2 },
  composer: { gap: 10 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#D9D6D0',
    borderRadius: 14,
    padding: 14,
    minHeight: 64,
    fontSize: 15,
    color: colors.ink,
  },
  send: {
    alignSelf: 'flex-end',
    backgroundColor: colors.ink,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    minWidth: 88,
    alignItems: 'center',
  },
  sendText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.45 },
});

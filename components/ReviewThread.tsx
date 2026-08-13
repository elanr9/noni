import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { borderWidth, color, radius, type } from '../theme/tokens';
import { PressableScale } from './ui/PressableScale';
import type { ReviewEvent } from '../lib/review-events';

/**
 * One section of an admin revision note. The admin's RevisionMode flattens
 * per-section notes into "Label: text" blocks separated by blank lines;
 * this is the parsed shape.
 */
export type ChangesNoteSection = {
  label: string | null;
  text: string;
};

const SECTION_LABEL = /^(Hook|Outro|Cover|Close|Caption|Clip \d+|Slide \d+):\s*([\s\S]*)$/;

/**
 * Split a changes_requested note back into its sections. A note written as
 * one whole-post paragraph comes back as a single section with no label.
 */
export function parseChangesNote(note: string): ChangesNoteSection[] {
  const blocks = note
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
  return blocks.map((block) => {
    const match = SECTION_LABEL.exec(block);
    if (match) return { label: match[1], text: match[2].trim() };
    return { label: null, text: block };
  });
}

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

function actionTone(action: ReviewEvent['action']): { fg: string; bg: string } {
  switch (action) {
    case 'approved':
      return { fg: color.green, bg: color.greenSoft };
    case 'changes_requested':
      return { fg: color.amber, bg: color.amberSoft };
    case 'comment':
      return { fg: color.blue700, bg: color.blue100 };
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
            const role =
              e.profiles?.role === 'campaign_manager' ? 'Campaign manager' : 'Creator';
            const tone = actionTone(e.action);
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
                <View style={[styles.actionChip, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.actionText, { color: tone.fg }]}>
                    {actionLabel(e.action)}
                  </Text>
                </View>
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
            placeholderTextColor={color.slate400}
            value={draft}
            onChangeText={setDraft}
            multiline
            editable={!sending}
          />
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Send comment"
            style={[styles.send, (sending || !draft.trim()) && styles.disabled]}
            disabled={sending || !draft.trim()}
            onPress={() => void send()}
          >
            {sending ? (
              <ActivityIndicator color={color.white} />
            ) : (
              <Text style={styles.sendText}>Send</Text>
            )}
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  heading: {
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
    color: color.slate400,
    textTransform: 'uppercase',
    letterSpacing: type.tracking.label,
  },
  empty: {
    fontSize: type.size.bodySm,
    color: color.textMuted,
  },
  list: { gap: 10 },
  item: {
    backgroundColor: color.white,
    borderRadius: radius.cell,
    padding: 14,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    gap: 6,
  },
  itemMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  itemWho: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  itemWhen: {
    fontSize: type.size.label,
    color: color.slate400,
  },
  actionChip: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  actionText: {
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
  },
  itemNote: {
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    color: color.ink,
  },
  composer: { gap: 10 },
  input: {
    backgroundColor: color.white,
    borderWidth: borderWidth.field,
    borderColor: color.lineStrong,
    borderRadius: radius.cell,
    padding: 14,
    minHeight: 64,
    fontSize: type.size.bodySm,
    color: color.ink,
  },
  send: {
    alignSelf: 'flex-end',
    backgroundColor: color.ink,
    borderRadius: radius.sm,
    paddingHorizontal: 18,
    paddingVertical: 12,
    minWidth: 88,
    alignItems: 'center',
  },
  sendText: {
    color: color.white,
    fontWeight: type.weight.bold,
    fontSize: type.size.bodySm,
  },
  disabled: { opacity: 0.45 },
});

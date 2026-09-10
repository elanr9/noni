import { StyleSheet, Text, View } from 'react-native';

import type { PostEventKind, PostNote } from '../../../lib/post-event-labels';
import { color, radiusAdmin } from '../../../theme/tokens';
import { Icon, type IconName } from '../../ui/Icon';

export type PostEventCardKind = Exclude<PostEventKind, 'comment'>;

export const EVENT_TONE: Record<PostEventCardKind, { icon: IconName; bg: string; fg: string }> = {
  assigned: { icon: 'layout-list', bg: color.fillQuiet, fg: color.slate500 },
  submitted: { icon: 'inbox', bg: color.blue100, fg: color.blue700 },
  sent_back: { icon: 'rotate-ccw', bg: color.amberSoft, fg: color.amber },
  approved: { icon: 'check', bg: color.greenSoft, fg: color.green },
  live: { icon: 'trending-up', bg: color.greenSoft, fg: color.green },
};

export type PostEventPillProps = {
  kind: PostEventCardKind;
  label: string;
  size: 'card' | 'thread';
};

export function PostEventPill({ kind, label, size }: PostEventPillProps) {
  const tone = EVENT_TONE[kind];
  const card = size === 'card';
  return (
    <View style={[styles.pill, card ? styles.pillCard : styles.pillThread, { backgroundColor: tone.bg }]}>
      <Icon name={tone.icon} size={card ? 11 : 12} color={tone.fg} strokeWidth={2.5} />
      <Text
        numberOfLines={1}
        style={[styles.pillText, card ? styles.pillTextCard : styles.pillTextThread, { color: tone.fg }]}
      >
        {label}
      </Text>
    </View>
  );
}

export type NoteRowsProps = {
  notes: PostNote[];
  variant: 'card' | 'thread';
};

export function NoteRows({ notes, variant }: NoteRowsProps) {
  const card = variant === 'card';
  return (
    <View style={styles.notes}>
      {notes.map((note, i) => (
        <View key={`${note.label}:${i}`} style={[styles.note, card ? styles.noteCard : styles.noteThread]}>
          <Text style={styles.noteLabel}>{note.label}</Text>
          <Text style={[styles.noteText, card ? styles.noteTextCard : styles.noteTextThread]}>
            {note.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: 5,
    borderRadius: radiusAdmin.pill,
  },
  pillCard: {
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 6,
    paddingRight: 8,
  },
  pillThread: {
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 7,
    paddingRight: 9,
  },
  pillText: {
    flexShrink: 1,
    fontWeight: '700',
  },
  pillTextCard: {
    fontSize: 11,
  },
  pillTextThread: {
    fontSize: 12,
  },
  notes: {
    gap: 4,
  },
  note: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: color.offWhite,
  },
  noteCard: {
    borderRadius: radiusAdmin.sm,
    paddingVertical: 7,
    paddingHorizontal: 9,
  },
  noteThread: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderLeftWidth: 3,
    borderLeftColor: color.blue300,
  },
  noteLabel: {
    minWidth: 46,
    marginTop: 1,
    fontSize: 11,
    fontWeight: '700',
    color: color.blue700,
  },
  noteText: {
    flex: 1,
    fontWeight: '500',
    color: color.ink,
  },
  noteTextCard: {
    fontSize: 12.5,
    lineHeight: 12.5 * 1.4,
  },
  noteTextThread: {
    fontSize: 13,
    lineHeight: 13 * 1.4,
  },
});

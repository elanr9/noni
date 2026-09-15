import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { BriefFormat, PostType } from '../../../lib/briefs-api';
import { borderWidth, color, postTypeTone, radiusAdmin, space, type } from '../../../theme/tokens';
import { Icon, type IconName } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { Sheet } from '../shared';

/** "auto" lets the model pick the kind from the source. */
export const AUTO_KIND = 'auto';

function familyOf(postType: PostType): BriefFormat {
  return postType.family === 'photo_carousel' ? 'photo_carousel' : 'video';
}

function toneFor(key: string): { bg: string; fg: string } {
  return key in postTypeTone
    ? postTypeTone[key as keyof typeof postTypeTone]
    : { bg: color.fillQuiet, fg: color.slate500 };
}

export type FormatChoice = 'video' | 'photo_carousel' | 'both';

export const FAMILIES_FOR: Record<FormatChoice, BriefFormat[]> = {
  video: ['video'],
  photo_carousel: ['photo_carousel'],
  both: ['video', 'photo_carousel'],
};

const OPTIONS: { id: FormatChoice; icon: IconName; title: string; body: string }[] = [
  { id: 'video', icon: 'video', title: 'Video', body: 'A reel with hook, clips and outro' },
  { id: 'photo_carousel', icon: 'images', title: 'Slideshow', body: 'A swipe post, one slide per point' },
  { id: 'both', icon: 'sparkles', title: 'Both', body: 'One of each, ready to use' },
];

export interface MakeFormatSheetProps {
  visible: boolean;
  /** "“The one note editors leave…”", "@handle · TikTok", or "3 ideas". */
  sourceLabel: string;
  busy: boolean;
  /** null hides the field (ideas). A string shows it for references. */
  notes: string | null;
  onChangeNotes: (text: string) => void;
  /** The company's post types; the kind row lists them after "You choose". */
  postTypes: PostType[];
  /** AUTO_KIND or a post_types.key. */
  kind: string;
  onChangeKind: (kind: string) => void;
  onPick: (choice: FormatChoice) => void;
  onClose: () => void;
}

/** Right after capture: what should the AI make this into. A tap makes it. */
export function MakeFormatSheet({
  visible,
  sourceLabel,
  busy,
  notes,
  onChangeNotes,
  postTypes,
  kind,
  onChangeKind,
  onPick,
  onClose,
}: MakeFormatSheetProps) {
  const pinned = kind === AUTO_KIND ? null : (postTypes.find((t) => t.key === kind) ?? null);
  const pinnedFamily = pinned ? familyOf(pinned) : null;

  function bodyFor(option: (typeof OPTIONS)[number]): string {
    if (!pinned) return option.body;
    const lanes = FAMILIES_FOR[option.id];
    if (lanes.length === 1) {
      return lanes[0] === pinnedFamily
        ? `As a ${pinned.label.toLowerCase()}`
        : `${option.body}. AI picks the kind`;
    }
    return `${pinned.label} here, AI picks the other kind`;
  }

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Make it into"
      subtitle={`From ${sourceLabel}. The whole post is written now and saved ready.`}
    >
      {notes !== null && (
        <>
          <Text style={styles.notesLabel}>How should this translate to our product? Optional</Text>
          <TextInput
            value={notes}
            onChangeText={onChangeNotes}
            placeholder="e.g. Same hook and pacing, but show Reply AI answering a college coach instead of the spreadsheet"
            placeholderTextColor={color.slate400}
            multiline
            editable={!busy}
            style={styles.notesInput}
          />
        </>
      )}
      <Text style={styles.notesLabel}>Kind of post</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.kindRow}
        style={styles.kindScroll}
      >
        <PressableScale
          accessibilityRole="button"
          accessibilityState={{ selected: kind === AUTO_KIND }}
          disabled={busy}
          onPress={() => onChangeKind(AUTO_KIND)}
          style={[styles.kind, styles.kindAuto, kind === AUTO_KIND && styles.kindOn]}
        >
          <Icon name="sparkles" size={12} color={color.blue700} />
          <Text style={[styles.kindText, { color: color.blue700 }]}>You choose</Text>
        </PressableScale>
        {postTypes.map((t) => {
          const tone = toneFor(t.key);
          const on = kind === t.key;
          return (
            <PressableScale
              key={t.id}
              accessibilityRole="button"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: on }}
              disabled={busy}
              onPress={() => onChangeKind(t.key)}
              style={[styles.kind, { backgroundColor: tone.bg }, on && styles.kindOn]}
            >
              <Icon
                name={familyOf(t) === 'photo_carousel' ? 'images' : 'video'}
                size={12}
                color={tone.fg}
              />
              <Text style={[styles.kindText, { color: tone.fg }]}>{t.label}</Text>
            </PressableScale>
          );
        })}
      </ScrollView>
      <View style={styles.card}>
        {OPTIONS.map((option, i) => (
          <PressableScale
            key={option.id}
            accessibilityRole="button"
            accessibilityLabel={option.title}
            disabled={busy}
            onPress={() => onPick(option.id)}
            style={[styles.row, i < OPTIONS.length - 1 && styles.rowDivider, busy && styles.rowDim]}
          >
            <View style={styles.glyph}>
              <Icon name={option.icon} size={18} color={color.blue700} />
            </View>
            <View style={styles.body}>
              <Text style={styles.title}>{option.title}</Text>
              <Text style={styles.sub}>{bodyFor(option)}</Text>
            </View>
            {busy ? (
              <ActivityIndicator size="small" color={color.blue600} />
            ) : (
              <Icon name="chevron-right" size={16} color={color.slate300} />
            )}
          </PressableScale>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  notesLabel: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.slate500,
    marginBottom: 6,
  },
  notesInput: {
    minHeight: 88,
    textAlignVertical: 'top',
    borderWidth: borderWidth.field,
    borderColor: color.lineStrong,
    borderRadius: radiusAdmin.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.ink,
    backgroundColor: color.white,
    marginBottom: 12,
  },
  kindScroll: {
    marginHorizontal: -space.gutterAdmin,
    marginBottom: 12,
  },
  kindRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: space.gutterAdmin,
  },
  kind: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 30,
    paddingHorizontal: 11,
    borderRadius: radiusAdmin.pill,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  kindAuto: {
    backgroundColor: color.blue50,
  },
  kindOn: {
    borderColor: color.ink,
  },
  kindText: {
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    backgroundColor: color.white,
    borderRadius: radiusAdmin.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    overflow: 'hidden',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowDivider: {
    borderBottomWidth: borderWidth.hair,
    borderBottomColor: color.line,
  },
  rowDim: {
    opacity: 0.55,
  },
  glyph: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: color.blue50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.ink,
  },
  sub: {
    fontSize: type.size.label,
    fontWeight: '600',
    color: color.slate400,
  },
});

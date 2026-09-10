import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { BriefFormat } from '../../../lib/briefs-api';
import { borderWidth, color, radiusAdmin, type } from '../../../theme/tokens';
import { Icon, type IconName } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { Sheet } from '../shared';

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
  onPick: (choice: FormatChoice) => void;
  onClose: () => void;
}

/** Right after capture: what should the AI make this into. A tap makes it. */
export function MakeFormatSheet({ visible, sourceLabel, busy, onPick, onClose }: MakeFormatSheetProps) {
  return (
    <Sheet
      visible={visible}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Make it into"
      subtitle={`From ${sourceLabel}. The whole post is written now and saved ready.`}
    >
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
              <Text style={styles.sub}>{option.body}</Text>
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

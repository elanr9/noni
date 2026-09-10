import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { PostType } from '../../../lib/briefs-api';
import { color, radiusAdmin, shadow } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { SheetShell } from '../../ui/SheetShell';
import { PostTypeChip } from '../shared';

function hintFor(type: PostType): string {
  const slideshow = type.family === 'photo_carousel';
  const count =
    type.min_points === type.max_points
      ? `${type.min_points}`
      : `${type.min_points} to ${type.max_points}`;
  const unit = slideshow
    ? type.max_points === 1 ? 'slide' : 'slides'
    : type.max_points === 1 ? 'clip' : 'clips';
  return slideshow ? `Cover, ${count} ${unit}, close` : `Hook, ${count} ${unit}, outro`;
}

/**
 * One card of rows, every type in the lane. Opens first on a slot with no
 * type and cannot be dismissed until one is picked.
 */
export function KindOfPostSheet(props: {
  visible: boolean;
  postTypes: PostType[];
  family: 'video' | 'photo_carousel';
  selectedId: string | null;
  /** When false the scrim does nothing; a pick is the only way out. */
  dismissable: boolean;
  onSelect: (postType: PostType) => void;
  onClose: () => void;
}): JSX.Element {
  const { visible, postTypes, family, selectedId, dismissable, onSelect, onClose } = props;
  const rows = postTypes.filter((t) => t.family === family);

  return (
    <SheetShell visible={visible} onClose={dismissable ? onClose : () => undefined}>
      <Text style={styles.title}>Kind of post</Text>
      <View style={[styles.card, shadow.shadowCard]}>
        {rows.map((t, i) => {
          const selected = t.id === selectedId;
          return (
            <PressableScale
              key={t.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onSelect(t)}
              style={[styles.row, i > 0 && styles.rowDivider]}
            >
              <View style={styles.rowBody}>
                <View style={styles.chipWrap}>
                  <PostTypeChip typeKey={t.key} label={t.label} />
                </View>
                <Text style={styles.hint}>{hintFor(t)}</Text>
              </View>
              {selected ? <Icon name="check" size={18} color={color.blue500} /> : null}
            </PressableScale>
          );
        })}
      </View>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: color.ink,
    marginBottom: 14,
  },
  card: {
    backgroundColor: color.white,
    borderRadius: radiusAdmin.lg,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
  rowBody: { flex: 1, gap: 6 },
  chipWrap: { flexDirection: 'row' },
  hint: {
    fontSize: 13,
    fontWeight: '400',
    color: color.slate500,
  },
});

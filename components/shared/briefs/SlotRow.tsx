// Week slot rows (SSManager.jsx WeekScreen). Filled: white card, two digit
// number, title, kind chip and post type chip, chevron. Empty: dashed row with
// "Empty" and a plus. Both are fixed height so the list never jumps.
// A filled row swipes left to show Clear; a long press asks to clear too.

import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Icon } from '../../ui/Icon';
import { color, radius, shadow, type as typeToken } from '../../../theme/tokens';
import type { BriefKind, BriefMediaFormat } from '../../../lib/briefs-api';
import { slotLabel } from '../../../lib/brief-copy';
import { KindChip, PostTypeChip } from './BriefChip';

export const SLOT_ROW_HEIGHT = 78;
export const EMPTY_SLOT_ROW_HEIGHT = 56;

export function FilledSlotRow({
  index,
  title,
  kind,
  format,
  postTypeName,
  onPress,
  onClear,
}: {
  index: number;
  title: string;
  kind: BriefKind;
  format: BriefMediaFormat;
  postTypeName: string | null;
  onPress: () => void;
  /** Empty the slot again. Swipe left or long press. */
  onClear?: () => void;
}) {
  const swipe = useRef<SwipeableMethods>(null);
  const clear = () => {
    swipe.current?.close();
    onClear?.();
  };
  const row = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Slot ${slotLabel(index)}, ${title}`}
      accessibilityHint={onClear ? 'Swipe left or long press to clear' : undefined}
      onPress={onPress}
      onLongPress={onClear ? clear : undefined}
      delayLongPress={450}
      style={({ pressed }) => [styles.filled, pressed ? styles.pressed : null]}
    >
      <Text style={styles.number}>{slotLabel(index)}</Text>
      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        <View style={styles.chips}>
          <KindChip kind={kind} format={format} />
          {postTypeName ? <PostTypeChip name={postTypeName} /> : null}
        </View>
      </View>
      <Icon name="chevron-right" size={18} color={color.slate300} />
    </Pressable>
  );
  if (!onClear) return row;
  return (
    <ReanimatedSwipeable
      ref={swipe}
      friction={1.6}
      rightThreshold={48}
      overshootRight={false}
      containerStyle={styles.swipe}
      renderRightActions={() => (
        <Pressable accessibilityRole="button" accessibilityLabel={`Clear slot ${slotLabel(index)}`} onPress={clear} style={({ pressed }) => [styles.clear, pressed ? styles.pressed : null]}>
          <Icon name="x" size={18} color={color.white} />
          <Text style={styles.clearText}>Clear</Text>
        </Pressable>
      )}
    >
      {row}
    </ReanimatedSwipeable>
  );
}

export function EmptySlotRow({ index, onPress }: { index: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Slot ${slotLabel(index)}, empty`}
      onPress={onPress}
      style={({ pressed }) => [styles.empty, pressed ? styles.pressed : null]}
    >
      <Text style={styles.number}>{slotLabel(index)}</Text>
      <Text style={styles.emptyLabel}>Empty</Text>
      <Icon name="plus" size={18} color={color.slate400} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filled: {
    height: SLOT_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.white,
    ...shadow.shadowCard,
  },
  empty: {
    height: EMPTY_SLOT_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.lineStrong,
    backgroundColor: 'transparent',
  },
  pressed: { opacity: 0.85 },
  swipe: { overflow: 'visible' },
  clear: {
    width: 88,
    height: SLOT_ROW_HEIGHT,
    marginLeft: 10,
    borderRadius: radius.lg,
    backgroundColor: color.danger,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  clearText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 13, color: color.white },
  number: { width: 22, fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 13, color: color.slate400 },
  body: { flex: 1, minWidth: 0, gap: 6 },
  title: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 16, letterSpacing: -0.2, color: color.ink },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  emptyLabel: { flex: 1, fontFamily: typeToken.font.ui, fontWeight: '600', fontSize: 15, color: color.slate400 },
});

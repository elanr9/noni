import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, radius } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';

export interface NoteBlockProps {
  children: string;
  /** Renders the trailing x when provided. */
  onRemove?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Admin handoff — blue-50 block: message-circle icon, 600 13px ink text, x to remove. */
export function NoteBlock({ children, onRemove, style }: NoteBlockProps) {
  return (
    <View style={[styles.block, style]}>
      <View style={styles.iconWrap}>
        <Icon name="message-circle" size={14} color={color.blue600} />
      </View>
      <Text style={styles.text}>{children}</Text>
      {onRemove !== undefined && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove note"
          hitSlop={15}
          onPress={onRemove}
        >
          <Icon name="x" size={14} color={color.slate400} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 11,
    borderRadius: radius.sm,
    backgroundColor: color.blue50,
  },
  iconWrap: {
    marginTop: 2,
  },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 13 * 1.4,
    fontWeight: '600',
    color: color.ink,
  },
});

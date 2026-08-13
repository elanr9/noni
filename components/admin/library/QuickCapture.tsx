import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { isCaptureUrl } from '../../../lib/library-api';
import {
  borderWidth,
  color,
  motion,
  radiusAdmin,
  ringFocus,
  type,
} from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { Icon, type IconName } from '../../ui/Icon';

export type IdeaFormat = 'video' | 'photo_carousel';

const FORMAT_CHIPS: Array<{ format: IdeaFormat; icon: IconName; label: string }> = [
  { format: 'video', icon: 'video', label: 'Video' },
  { format: 'photo_carousel', icon: 'images', label: 'Slideshow' },
];

export interface QuickCaptureProps {
  value: string;
  onChangeText: (text: string) => void;
  onSave: () => void;
  /** Transient confirmation after a save, e.g. "3 ideas saved". */
  note: string | null;
  /**
   * Ideas lane composer (design handoff, Library): "Type a post idea"
   * placeholder, Video / Slideshow format chips, Save disabled until text.
   */
  ideas?: {
    format: IdeaFormat;
    onChangeFormat: (format: IdeaFormat) => void;
  };
}

/** Selected format chip: blue-500 fill, white text, scale 1.04, fast ease-out. */
function FormatChip({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: IconName;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const anim = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: selected ? 1 : 0,
      duration: motion.fast,
      easing: motion.easeOut,
      // Background colour interpolation requires the JS driver.
      useNativeDriver: false,
    }).start();
  }, [selected, anim]);

  const backgroundColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [color.fillQuiet, color.blue500],
  });
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8 }}
    >
      <Animated.View
        style={[styles.formatChip, { backgroundColor, transform: [{ scale }] }]}
      >
        <Icon name={icon} size={12} color={selected ? color.white : color.slate500} />
        <Text style={[styles.formatChipText, selected && styles.formatChipTextOn]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Admin handoff §9 — quick capture pinned to the top. One field with a plus
 * icon, focus ring, Save once there is text, and a bulk line when a multiline
 * paste will fan out into one idea per line. The Ideas lane swaps in the
 * post-idea composer: format chips and an always-visible Save, disabled
 * until text.
 */
export function QuickCapture({
  value,
  onChangeText,
  onSave,
  note,
  ideas,
}: QuickCaptureProps) {
  const [focused, setFocused] = useState(false);

  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const bulkCount = !isCaptureUrl(value) && lines.length >= 2 ? lines.length : 0;
  const hasText = value.trim().length > 0;

  return (
    <View style={styles.block}>
      <View style={[styles.ring, focused && { borderColor: ringFocus.borderColor }]}>
        {ideas !== undefined ? (
          <View style={[styles.ideaField, hasText && styles.ideaFieldFilled]}>
            <TextInput
              value={value}
              onChangeText={onChangeText}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onSubmitEditing={onSave}
              placeholder="Type a post idea"
              placeholderTextColor={color.slate400}
              multiline
              submitBehavior="blurAndSubmit"
              returnKeyType="done"
              style={styles.ideaInput}
            />
            <View style={styles.formatRow}>
              {FORMAT_CHIPS.map((chip) => (
                <FormatChip
                  key={chip.format}
                  icon={chip.icon}
                  label={chip.label}
                  selected={ideas.format === chip.format}
                  onPress={() => ideas.onChangeFormat(chip.format)}
                />
              ))}
              <View style={styles.flex} />
              <Button size="sm" disabled={!hasText} onPress={onSave}>
                Save
              </Button>
            </View>
          </View>
        ) : (
          <View style={styles.field}>
            <Icon name="plus" size={18} color={color.slate400} />
            <TextInput
              value={value}
              onChangeText={onChangeText}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onSubmitEditing={onSave}
              placeholder="Idea or link. Paste lines for many at once."
              placeholderTextColor={color.slate400}
              multiline
              submitBehavior="blurAndSubmit"
              returnKeyType="done"
              style={styles.input}
            />
            {hasText && (
              <Button size="sm" onPress={onSave}>
                Save
              </Button>
            )}
          </View>
        )}
      </View>
      {bulkCount > 0 && (
        <Text style={styles.bulk}>{`${bulkCount} ideas will be saved`}</Text>
      )}
      {note !== null && <Text style={styles.note}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 6,
  },
  flex: {
    flex: 1,
  },
  // The ring is always 3px so focus never shifts layout; it only gains colour.
  ring: {
    borderWidth: ringFocus.borderWidth,
    borderColor: 'transparent',
    borderRadius: radiusAdmin.md + 3,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 8,
    borderWidth: borderWidth.field,
    borderColor: color.lineStrong,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.white,
  },
  input: {
    flex: 1,
    minHeight: 32,
    maxHeight: 110,
    paddingVertical: 4,
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.ink,
  },
  ideaField: {
    padding: 12,
    borderWidth: borderWidth.field,
    borderColor: color.lineStrong,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.white,
    gap: 9,
  },
  ideaFieldFilled: {
    borderColor: color.blue500,
  },
  ideaInput: {
    minHeight: 24,
    maxHeight: 110,
    padding: 0,
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * 1.4,
    fontWeight: '400',
    color: color.ink,
  },
  formatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  formatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: radiusAdmin.pill,
  },
  formatChipText: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.slate500,
  },
  formatChipTextOn: {
    color: color.white,
  },
  bulk: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.blue700,
  },
  note: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.green,
  },
});

// Post-wide on-screen text style. One choice covers every clip's text boxes:
// Classic (white with a black outline) or Theme (the company color).
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '../../ui/PressableScale';
import { overlayBoxFill, styleColors, type OverlayTextStyle } from '../../../lib/overlay-boxes';
import { color, radiusAdmin, shadow } from '../../../theme/tokens';

const OPTIONS: { value: OverlayTextStyle; label: string }[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'theme', label: 'Theme' },
];

export interface TextStyleCardProps {
  value: OverlayTextStyle;
  themeColor: string | null;
  disabled?: boolean;
  onChange: (value: OverlayTextStyle) => void;
}

export function TextStyleCard({ value, themeColor, disabled, onChange }: TextStyleCardProps) {
  return (
    <View style={[styles.card, shadow.shadowCard]}>
      <View style={styles.copy}>
        <Text style={styles.title}>Text style</Text>
        <Text style={styles.hint}>Applies to every clip in this post.</Text>
      </View>
      <View style={styles.row}>
        {OPTIONS.map((o) => {
          const isOn = o.value === value;
          return (
            <PressableScale
              key={o.value}
              accessibilityRole="button"
              accessibilityLabel={`${o.label} text style`}
              accessibilityState={{ selected: isOn }}
              disabled={disabled}
              onPress={() => onChange(o.value)}
              style={[styles.btn, isOn && styles.btnOn]}
            >
              <View
                style={[
                  styles.dot,
                  o.value === 'theme'
                    ? { backgroundColor: overlayBoxFill(styleColors('theme', themeColor).color) }
                    : styles.dotClassic,
                ]}
              />
              <Text style={[styles.label, isOn && styles.labelOn]}>{o.label}</Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 16 * 1.4,
    color: color.ink,
  },
  hint: {
    fontSize: 13,
    lineHeight: 13 * 1.4,
    color: color.slate500,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.surfaceQuiet,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radiusAdmin.pill,
  },
  btnOn: {
    backgroundColor: color.white,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  dotClassic: {
    backgroundColor: color.white,
    borderWidth: 2,
    borderColor: color.ink,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: color.slate500,
  },
  labelOn: {
    color: color.ink,
  },
});

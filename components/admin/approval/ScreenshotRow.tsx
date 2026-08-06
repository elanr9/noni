import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { borderWidth, color, radiusAdmin, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export interface ScreenshotRowProps {
  items: Array<{ label: string; uri: string | null }>;
}

/** Admin handoff §5 — profile-screenshots row, two 38×50 thumbs; tap expands. */
export function ScreenshotRow({ items }: ScreenshotRowProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const open = openIndex !== null ? items[openIndex] : undefined;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.label}>Profile screenshots</Text>
        <View style={styles.thumbs}>
          {items.map((item, i) => (
            <PressableScale
              key={item.label}
              accessibilityRole="button"
              accessibilityLabel={`${item.label} screenshot`}
              disabled={item.uri === null}
              onPress={() => setOpenIndex((prev) => (prev === i ? null : i))}
              style={[styles.thumb, openIndex === i && styles.thumbOpen]}
            >
              {item.uri !== null ? (
                <Image source={{ uri: item.uri }} resizeMode="cover" style={StyleSheet.absoluteFill} />
              ) : (
                <View style={styles.thumbGlyph}>
                  <Icon name="images" size={12} color={color.slate300} />
                </View>
              )}
            </PressableScale>
          ))}
        </View>
      </View>

      {open !== undefined && open.uri !== null && (
        <View style={styles.fullWrap}>
          <Image source={{ uri: open.uri }} resizeMode="cover" style={styles.full} />
          <Text style={styles.fullLabel}>{open.label}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 12,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    fontSize: type.size.meta,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  thumbs: {
    flexDirection: 'row',
    gap: 6,
  },
  thumb: {
    width: 38,
    height: 50,
    borderRadius: radiusAdmin.sm,
    backgroundColor: color.fillQuiet,
    overflow: 'hidden',
  },
  thumbOpen: {
    borderWidth: borderWidth.select,
    borderColor: color.blue500,
  },
  thumbGlyph: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWrap: {
    gap: 6,
  },
  full: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.fillQuiet,
  },
  fullLabel: {
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.slate400,
  },
});

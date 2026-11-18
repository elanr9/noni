// Creator pick for the look of one on-screen text box: classic white or
// black outlined letters, or a TikTok colored bubble. Sits on dark surfaces.
import { useState, type JSX } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  CREATOR_TEXT_PALETTE,
  overlayBoxFill,
  overlayTextContrast,
  type OverlayBox,
} from '../../lib/overlay-boxes';
import { color, editor, editorTextColorNames, editorType, radius } from '../../theme/v2';
import { Press } from '../v2';

export type TextColorPick = { color: string; bg: boolean };

const SWATCH = 32;
const CHIP_LABEL_CHARS = 18;

const COLOR_NAMES: Record<string, string> = editorTextColorNames;

function pickLabel(pick: TextColorPick): string {
  const name = COLOR_NAMES[pick.color.toUpperCase()] ?? pick.color;
  return pick.bg ? `${name} bubble` : `Classic ${name.toLowerCase()} text`;
}

function samePick(a: TextColorPick | null, b: TextColorPick): boolean {
  return a !== null && a.bg === b.bg && a.color.toUpperCase() === b.color.toUpperCase();
}

function chipLabel(box: OverlayBox): string {
  const text = box.text.trim();
  return text.length > CHIP_LABEL_CHARS ? `${text.slice(0, CHIP_LABEL_CHARS)}…` : text;
}

function Swatch(props: {
  pick: TextColorPick;
  selected: boolean;
  onPress: () => void;
}): JSX.Element {
  const { pick, selected, onPress } = props;
  const fill = pick.bg ? overlayBoxFill(pick.color) : pick.color;
  const classicDark = !pick.bg && pick.color.toUpperCase() === editor.black;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={pickLabel(pick)}
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={4}
      style={[styles.outerRing, selected && styles.outerRingOn]}
    >
      <View style={[styles.innerRing, selected && styles.innerRingOn]}>
        <View
          style={[
            styles.circle,
            { backgroundColor: fill },
            pick.bg ? styles.bubbleRing : classicDark ? styles.classicDarkRing : styles.classicLightRing,
          ]}
        >
          {pick.bg ? (
            <Text style={[styles.glyph, { color: overlayTextContrast(pick.color) }]}>A</Text>
          ) : null}
        </View>
      </View>
    </Press>
  );
}

export function TextColorPicker(props: {
  boxes: OverlayBox[];
  onChange: (boxId: string, pick: TextColorPick) => void;
}): JSX.Element | null {
  const { boxes, onChange } = props;
  const [pickedBoxId, setPickedBoxId] = useState<string | null>(null);
  const selectedBox =
    boxes.find((b) => b.id === pickedBoxId) ?? boxes[0] ?? null;
  if (selectedBox === null) return null;
  const value: TextColorPick = { color: selectedBox.color, bg: selectedBox.bg };

  return (
    <View style={styles.root}>
      {boxes.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          keyboardShouldPersistTaps="handled"
        >
          {boxes.map((box) => {
            const on = box.id === selectedBox.id;
            return (
              <Press
                key={box.id}
                accessibilityRole="button"
                accessibilityLabel={`Style text ${chipLabel(box)}`}
                accessibilityState={{ selected: on }}
                onPress={() => setPickedBoxId(box.id)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                  {chipLabel(box)}
                </Text>
              </Press>
            );
          })}
        </ScrollView>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.swatchRow}
        keyboardShouldPersistTaps="handled"
      >
        {CREATOR_TEXT_PALETTE.map((pick) => (
          <Swatch
            key={`${pick.color}-${pick.bg ? 'bubble' : 'classic'}`}
            pick={pick}
            selected={samePick(value, pick)}
            onPress={() => onChange(selectedBox.id, pick)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 8,
  },
  chipRow: {
    paddingHorizontal: 12,
    gap: 6,
  },
  chip: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: editor.w16,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 180,
  },
  chipOn: {
    backgroundColor: color.white,
  },
  chipText: {
    color: color.white,
    fontSize: editorType.size.label,
    fontWeight: '600',
  },
  chipTextOn: {
    color: color.ink,
  },
  swatchRow: {
    paddingHorizontal: 12,
    gap: 6,
    alignItems: 'center',
  },
  outerRing: {
    padding: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  outerRingOn: {
    borderColor: editor.w45,
  },
  innerRing: {
    padding: 2,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  innerRingOn: {
    borderColor: color.white,
  },
  circle: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: SWATCH / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  classicLightRing: {
    borderWidth: 1,
    borderColor: editor.k40,
  },
  classicDarkRing: {
    borderWidth: 1,
    borderColor: editor.w45,
  },
  bubbleRing: {
    borderWidth: 1,
    borderColor: editor.w28,
  },
  glyph: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 18,
  },
});

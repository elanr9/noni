// Bottom panel for one selected text box: edit the words, switch between
// classic outlined letters and a TikTok bubble, pick the colour, or delete.
// Every change applies to the stage immediately.
import { useEffect, useRef, useState, type JSX } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import {
  CREATOR_TEXT_PALETTE,
  overlayBoxFill,
  overlayTextContrast,
  type OverlayBox,
} from '../../../lib/overlay-boxes';
import { color, radius, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

const SWATCH = 30;

export function TextEditPanel(props: {
  box: OverlayBox;
  onChange: (box: OverlayBox) => void;
  onDelete: () => void;
  /** Receives the words as typed; empty means the creator cleared the box. */
  onDone: (finalText: string) => void;
  autoFocus?: boolean;
}): JSX.Element {
  const { box, onChange, onDelete, onDone, autoFocus = false } = props;
  const inputRef = useRef<TextInput>(null);
  // Stored boxes drop empty text, so the words live here while typing.
  const [draft, setDraft] = useState(box.text);

  useEffect(() => {
    if (autoFocus) {
      const handle = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(handle);
    }
    return undefined;
  }, [autoFocus]);

  const palette = CREATOR_TEXT_PALETTE.filter((p) => p.bg === box.bg);
  const classicSelected = !box.bg;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.label}>Text</Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Done editing text"
          onPress={() => onDone(draft)}
          style={styles.doneBtn}
        >
          <Text style={styles.doneText}>Done</Text>
        </PressableScale>
      </View>

      <TextInput
        ref={inputRef}
        value={draft}
        onChangeText={(text) => {
          setDraft(text);
          if (text.trim().length > 0) onChange({ ...box, text });
        }}
        multiline
        selectTextOnFocus={autoFocus}
        placeholder="Type your text"
        placeholderTextColor={color.slate400}
        style={styles.input}
        accessibilityLabel="Slide text"
      />

      <View style={styles.row}>
        <View style={styles.toggle}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Classic text"
            accessibilityState={{ selected: classicSelected }}
            onPress={() => onChange({ ...box, bg: false, color: '#FFFFFF' })}
            style={[styles.toggleBtn, classicSelected && styles.toggleBtnOn]}
          >
            <Text style={[styles.toggleText, classicSelected && styles.toggleTextOn]}>
              Classic
            </Text>
          </PressableScale>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Bubble text"
            accessibilityState={{ selected: !classicSelected }}
            onPress={() => onChange({ ...box, bg: true, color: box.bg ? box.color : '#FFFFFF' })}
            style={[styles.toggleBtn, !classicSelected && styles.toggleBtnOn]}
          >
            <Text style={[styles.toggleText, !classicSelected && styles.toggleTextOn]}>
              Bubble
            </Text>
          </PressableScale>
        </View>

        <View style={styles.swatches}>
          {palette.map((pick) => {
            const on = pick.color.toUpperCase() === box.color.toUpperCase();
            const fill = pick.bg ? overlayBoxFill(pick.color) : pick.color;
            return (
              <PressableScale
                key={pick.color}
                accessibilityRole="button"
                accessibilityLabel={`Colour ${pick.color}`}
                accessibilityState={{ selected: on }}
                hitSlop={4}
                onPress={() => onChange({ ...box, color: pick.color })}
                style={[styles.swatchRing, on && styles.swatchRingOn]}
              >
                <View style={[styles.swatch, { backgroundColor: fill }]}>
                  {pick.bg ? (
                    <Text style={[styles.glyph, { color: overlayTextContrast(pick.color) }]}>
                      A
                    </Text>
                  ) : null}
                </View>
              </PressableScale>
            );
          })}
        </View>

        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Delete text"
          onPress={onDelete}
          style={styles.deleteBtn}
        >
          <Icon name="trash-2" size={18} color={color.danger} />
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: type.size.micro,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
  },
  doneBtn: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    color: color.white,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
  },
  input: {
    minHeight: 64,
    maxHeight: 120,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.offWhite,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: type.size.body,
    lineHeight: type.size.body * 1.3,
    color: color.ink,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toggle: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    padding: 3,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnOn: {
    backgroundColor: color.white,
  },
  toggleText: {
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
    color: color.slate500,
  },
  toggleTextOn: {
    color: color.ink,
  },
  swatches: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  swatchRing: {
    padding: 2,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  swatchRingOn: {
    borderColor: color.ink,
  },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: SWATCH / 2,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 16,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

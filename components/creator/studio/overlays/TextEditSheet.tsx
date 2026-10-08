// Bottom sheet for one text pop-up: the words, a color swatch row, the
// background toggle and delete. Every change shows live on the stage through
// one open gesture so Done records a single undo step and Cancel reverts.
import { useEffect, useRef, useState, type JSX } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { removeOverlay, updateOverlay, type TextOverlay } from '../../../../lib/edit-document';
import {
  CREATOR_TEXT_PALETTE,
  overlayBoxFill,
  overlayTextContrast,
} from '../../../../lib/overlay-boxes';
import { useStudioStore } from '../../../../lib/studio-store';
import { color, radius, type } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { PressableScale } from '../../../ui/PressableScale';
import { beginGesture, endGesture, selectOverlay, updateGesture } from './overlay-actions';
import { useOverlayUi } from './overlay-ui-store';

const MAX_CHARS = 160;
const SWATCH = 30;

function Swatch(props: { pick: { color: string; bg: boolean }; selected: boolean; onPress: () => void }): JSX.Element {
  const { pick, selected, onPress } = props;
  const fill = pick.bg ? overlayBoxFill(pick.color) : pick.color;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${pick.color} ${pick.bg ? 'bubble' : 'text'}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={4}
      style={[styles.swatchRing, selected && styles.swatchRingOn]}
    >
      <View style={[styles.swatch, { backgroundColor: fill }]}>
        {pick.bg ? <Text style={[styles.swatchGlyph, { color: overlayTextContrast(pick.color) }]}>A</Text> : null}
      </View>
    </PressableScale>
  );
}

export function TextEditSheet(props: { overlay: TextOverlay }): JSX.Element {
  const { overlay } = props;
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(overlay.text);
  const [pick, setPick] = useState({ color: overlay.color, bg: overlay.bg });
  const base = useRef(useStudioStore.getState().gestureBase ?? useStudioStore.getState().document);
  const startedEmpty = useRef(overlay.text.trim().length === 0);

  useEffect(() => {
    beginGesture();
  }, []);

  function close() {
    useOverlayUi.getState().closeEditor();
  }

  function changeText(next: string) {
    setText(next);
    updateGesture((doc) => updateOverlay(doc, overlay.id, { text: next }));
  }

  function changePick(next: { color: string; bg: boolean }) {
    setPick(next);
    updateGesture((doc) => updateOverlay(doc, overlay.id, next));
  }

  function save() {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      remove();
      return;
    }
    updateGesture((doc) => updateOverlay(doc, overlay.id, { text: trimmed }));
    endGesture();
    close();
  }

  function cancel() {
    const original = base.current;
    if (original) {
      useStudioStore.getState().gestureUpdate(() =>
        startedEmpty.current && original.format === 'video'
          ? removeOverlay(original, overlay.id)
          : original,
      );
    }
    endGesture();
    if (startedEmpty.current) selectOverlay(null);
    close();
  }

  function remove() {
    updateGesture((doc) => removeOverlay(doc, overlay.id));
    endGesture();
    selectOverlay(null);
    close();
  }

  const canSave = text.trim().length > 0;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={cancel}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessibilityLabel="Close" style={styles.scrim} onPress={cancel} />
        <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.header}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={cancel}
              hitSlop={10}
              style={styles.headerBtn}
            >
              <Icon name="x" size={20} color={color.white} />
            </PressableScale>
            <Text style={styles.title}>Text</Text>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Done"
              onPress={save}
              disabled={!canSave}
              hitSlop={10}
              style={[styles.headerBtn, !canSave && styles.headerBtnOff]}
            >
              <Icon name="check" size={20} color={color.white} />
            </PressableScale>
          </View>
          <TextInput
            value={text}
            onChangeText={changeText}
            multiline
            autoFocus
            maxLength={MAX_CHARS}
            placeholder="Type your text"
            placeholderTextColor={color.whiteA45}
            selectionColor={color.white}
            keyboardAppearance="dark"
            accessibilityLabel="Text words"
            style={styles.input}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.swatchRow}
            keyboardShouldPersistTaps="handled"
          >
            {CREATOR_TEXT_PALETTE.map((p) => (
              <Swatch
                key={`${p.color}-${p.bg ? 'bubble' : 'classic'}`}
                pick={p}
                selected={p.bg === pick.bg && p.color.toUpperCase() === pick.color.toUpperCase()}
                onPress={() => changePick({ color: p.color, bg: p.bg })}
              />
            ))}
          </ScrollView>
          <View style={styles.footer}>
            <PressableScale
              accessibilityRole="switch"
              accessibilityLabel="Background"
              accessibilityState={{ checked: pick.bg }}
              onPress={() => changePick({ color: pick.color, bg: !pick.bg })}
              style={[styles.pill, pick.bg && styles.pillOn]}
            >
              <Text style={[styles.pillText, pick.bg && styles.pillTextOn]}>Background</Text>
            </PressableScale>
            <View style={styles.footerSpacer} />
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Delete text"
              onPress={remove}
              hitSlop={8}
              style={styles.deleteBtn}
            >
              <Icon name="trash-2" size={18} color={color.white} />
            </PressableScale>
            <Text style={styles.counter}>{`${text.length}/${MAX_CHARS}`}</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  panel: {
    backgroundColor: '#111114',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 40,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
  },
  headerBtnOff: {
    opacity: 0.4,
  },
  title: {
    color: color.white,
    fontSize: type.size.bodySm,
    fontWeight: '700',
  },
  input: {
    minHeight: 84,
    maxHeight: 160,
    color: color.white,
    fontSize: type.size.bodySm,
    lineHeight: 22,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#1C1C1E',
    textAlignVertical: 'top',
  },
  swatchRow: {
    gap: 8,
    alignItems: 'center',
    paddingVertical: 2,
  },
  swatchRing: {
    padding: 2,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchRingOn: {
    borderColor: color.white,
  },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: SWATCH / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.whiteA28,
  },
  swatchGlyph: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 17,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  footerSpacer: {
    flex: 1,
  },
  pill: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillOn: {
    backgroundColor: color.white,
  },
  pillText: {
    color: color.white,
    fontSize: type.size.chip,
    fontWeight: '600',
  },
  pillTextOn: {
    color: color.ink,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.danger,
  },
  counter: {
    color: color.whiteA60,
    fontSize: type.size.label,
    fontVariant: ['tabular-nums'],
  },
});

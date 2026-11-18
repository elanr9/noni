import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardHeight } from '../../../../../lib/keyboard';
import { color, motion, radius, shadow, text } from '../../../../../theme/v2';
import { Button, Icon, Press } from '../../../../v2';
import { noteLabel, saveLabel, type ReviewNote } from './notes';

const SHEET_H = 320;
const SHEET_SHADOW = '0 -8px 30px rgba(16,24,40,0.12)';

export interface NotesSheetProps {
  open: boolean;
  onClose: () => void;
  creatorName: string;
  isReel: boolean;
  notes: ReviewNote[];
  /** Where a pinned note lands: seconds for a reel, slide index for a slideshow. */
  pinAt: number;
  onAdd: (note: { at: number | null; text: string }) => void;
  onDelete: (id: string) => void;
  onSeek: (at: number) => void;
  /** Notes already sent back: list only, no composer. */
  readOnly?: boolean;
}

/**
 * Notes for the creator: a pinned or whole post toggle, the composer with its
 * send disc, the list with time pills that seek, and the Save button.
 */
export function NotesSheet({ open, onClose, creatorName, isReel, notes, pinAt, onAdd, onDelete, onSeek, readOnly }: NotesSheetProps) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const [pinned, setPinned] = useState(true);
  const [draft, setDraft] = useState('');
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withTiming(open ? 1 : 0, { duration: motion.sheet, easing: motion.sheetEase }));
  }, [open, p]);
  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - p.get()) * (SHEET_H + 60) }] }));

  const pinText = noteLabel(pinAt, isReel);
  const whole = isReel ? 'Whole video' : 'Whole post';
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    onAdd({ at: pinned ? pinAt : null, text: t });
    setDraft('');
  };
  const count = notes.length + (draft.trim() ? 1 : 0);
  const bottomPad = keyboard > 0 ? 12 : Math.max(insets.bottom, 20) + 14;

  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      style={[styles.sheet, { height: SHEET_H + (keyboard > 0 ? 0 : Math.max(0, insets.bottom - 20)), bottom: keyboard, paddingBottom: bottomPad }, panel]}
    >
      <View style={styles.head}>
        <Press accessibilityRole="button" accessibilityLabel="Close notes" onPress={onClose} style={styles.close}>
          <Icon name="close" size={18} color={color.ink} />
        </Press>
        <Text style={[text.row, { flex: 1 }]} numberOfLines={1}>
          {readOnly ? 'Changes sent' : `Notes for ${creatorName}`}
        </Text>
        {readOnly ? null : (
          <View style={styles.toggle}>
            {([
              [true, isReel ? `At ${pinText}` : pinText],
              [false, whole],
            ] as const).map(([v, l]) => {
              const on = pinned === v;
              return (
                <Press key={String(v)} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setPinned(v)} style={[styles.toggleItem, on && styles.toggleOn, v && { minWidth: 64 }]}>
                  <Text style={[styles.toggleText, { color: on ? color.ink : color.grey4 }]}>{l}</Text>
                </Press>
              );
            })}
          </View>
        )}
      </View>

      <View style={{ flex: 1, minHeight: 0, gap: 8, marginBottom: readOnly ? 0 : 10 }}>
        {readOnly ? null : (
          <View style={notes.length ? undefined : { flex: 1 }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={pinned ? `Note ${isReel ? 'at ' : 'on '}${isReel ? pinText : pinText.toLowerCase()}` : 'Note'}
              placeholderTextColor={color.grey3}
              multiline
              submitBehavior="blurAndSubmit"
              returnKeyType="done"
              onSubmitEditing={add}
              style={[styles.input, notes.length ? { height: 64 } : { flex: 1, minHeight: 64 }]}
            />
            <Press
              accessibilityRole="button"
              accessibilityLabel="Add note"
              disabled={!draft.trim()}
              onPress={add}
              style={[styles.send, { backgroundColor: draft.trim() ? (pinned ? color.amber : color.blue) : color.grey2 }]}
            >
              <Icon name={pinned ? 'push_pin' : 'add_comment'} size={18} color={color.white} />
            </Press>
          </View>
        )}
        {notes.length ? (
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {notes.map((n) => {
              const pin = n.at !== null;
              return (
                <View key={n.id} style={styles.noteRow}>
                  <Press
                    accessibilityRole="button"
                    accessibilityLabel={pin ? `Jump to ${noteLabel(n.at, isReel)}` : 'Whole post note'}
                    disabled={!pin}
                    onPress={() => n.at !== null && onSeek(n.at)}
                    style={[styles.pill, { backgroundColor: pin ? color.amberTint : color.blueTint }]}
                  >
                    <Text style={[styles.pillText, { color: pin ? color.amber : color.blueDeep }]}>{noteLabel(n.at, isReel)}</Text>
                  </Press>
                  <Text style={[text.body, { flex: 1 }]}>{n.text}</Text>
                  {readOnly ? null : (
                    <Press accessibilityRole="button" accessibilityLabel="Delete note" onPress={() => onDelete(n.id)} style={styles.del}>
                      <Icon name="close" size={16} color={color.grey3} />
                    </Press>
                  )}
                </View>
              );
            })}
          </ScrollView>
        ) : readOnly ? (
          <Text style={[text.body, { color: color.grey4 }]}>The notes went to {creatorName} as a message.</Text>
        ) : null}
      </View>

      {readOnly ? null : (
        <View style={{ flexDirection: 'row' }}>
          <Button
            label={saveLabel(count)}
            disabled={count === 0}
            onPress={() => {
              add();
              onClose();
            }}
          />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, zIndex: 5, paddingTop: 12, paddingHorizontal: 16, backgroundColor: color.card, borderTopLeftRadius: radius.sheetLg, borderTopRightRadius: radius.sheetLg, boxShadow: SHEET_SHADOW },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  close: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: color.grey1, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', backgroundColor: color.grey1, borderRadius: radius.pill, padding: 3 },
  toggleItem: { height: 26, paddingHorizontal: 10, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  toggleOn: { backgroundColor: color.card, ...shadow.card },
  toggleText: { fontSize: 12, fontWeight: '600' },
  input: { borderRadius: radius.option, backgroundColor: color.grey1, paddingTop: 12, paddingBottom: 12, paddingLeft: 14, paddingRight: 56, fontSize: 15, lineHeight: 20, color: color.ink, textAlignVertical: 'top' },
  send: { position: 'absolute', right: 8, bottom: 8, width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  pill: { height: 24, paddingHorizontal: 8, borderRadius: radius.pill, justifyContent: 'center' },
  pillText: { fontSize: 12, fontWeight: '700' },
  del: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
});

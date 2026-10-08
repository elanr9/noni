import { useEffect, useMemo, useState, type JSX } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { color, motion, radius, space, type } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { TeleprompterOverlay } from '../../TeleprompterOverlay';

/** Past this many characters the drawer offers the auto-scrolling prompter. */
const PROMPTER_MIN_CHARS = 160;

export type CaptureNotes = { title: string; lines: string[] };

export type NotesDrawerProps = {
  notes: CaptureNotes;
  open: boolean;
  onClose(): void;
  recording: boolean;
  height: number;
  bottomInset: number;
};

export function NotesDrawer({ notes, open, onClose, recording, height, bottomInset }: NotesDrawerProps): JSX.Element {
  const offset = useSharedValue(height);
  const [prompter, setPrompter] = useState(false);
  const script = useMemo(() => notes.lines.join(' '), [notes.lines]);
  const canPrompt = script.length >= PROMPTER_MIN_CHARS;

  useEffect(() => {
    offset.value = withTiming(open ? 0 : height, { duration: motion.base, easing: motion.easeOut });
  }, [open, height, offset]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  return (
    <Animated.View
      style={[styles.sheet, { height, paddingBottom: bottomInset + space[3] }, sheetStyle]}
      pointerEvents={open ? 'auto' : 'none'}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>Brief notes</Text>
          <Text style={styles.title} numberOfLines={2}>
            {notes.title}
          </Text>
        </View>
        {canPrompt ? (
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: prompter }}
            onPress={() => setPrompter((p) => !p)}
            style={[styles.toggle, prompter && styles.toggleOn]}
          >
            <Text style={[styles.toggleText, prompter && styles.toggleTextOn]}>Prompter</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Hide notes" onPress={onClose} hitSlop={8} style={styles.close}>
          <Icon name="chevron-down" size={22} color={color.white} />
        </Pressable>
      </View>
      {prompter && canPrompt ? (
        <TeleprompterOverlay text={script} speed={1} running={recording} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
          {notes.lines.map((line, i) => (
            <View key={`${i}-${line.slice(0, 12)}`} style={styles.row}>
              <View style={styles.bullet} />
              <Text style={styles.line}>{line}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space[4],
    paddingHorizontal: space[5],
    gap: space[3],
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    backgroundColor: 'rgba(11,15,20,0.92)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  kicker: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.heavy,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: color.whiteA60,
  },
  title: {
    fontSize: type.size.body,
    fontWeight: type.weight.bold,
    color: color.white,
  },
  toggle: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.whiteA28,
  },
  toggleOn: {
    backgroundColor: color.white,
    borderColor: color.white,
  },
  toggleText: {
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
    color: color.white,
  },
  toggleTextOn: {
    color: color.ink,
  },
  close: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    gap: space[3],
    paddingBottom: space[3],
  },
  row: {
    flexDirection: 'row',
    gap: space[3],
    alignItems: 'flex-start',
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
    backgroundColor: color.accent,
  },
  line: {
    flex: 1,
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    color: color.whiteA92,
  },
});

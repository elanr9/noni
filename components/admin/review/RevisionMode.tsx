import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { borderWidth, color, motion, radiusAdmin, type } from '../../../theme/tokens';
import { Segmented } from '../shared';
import { Button } from '../../ui/Button';
import { SectionNoteCard } from './SectionNoteCard';

export interface RevisionSection {
  key: string;
  /** "Hook" / "Clip 2" / "Slide 3" / "Caption". */
  label: string;
  text: string;
}

export interface RevisionModeProps {
  /** Spoken segments plus the caption, in order. */
  sections: RevisionSection[];
  busy: boolean;
  onCancel: () => void;
  /** Flattened note text plus how many sections it covers. */
  onSend: (note: string, count: number) => void;
}

/**
 * Admin handoff §3 revision mode — Section by section | Whole post. Only
 * noted sections go back.
 */
export function RevisionMode({ sections, busy, onCancel, onSend }: RevisionModeProps) {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;

  const [mode, setMode] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [wholeNote, setWholeNote] = useState('');

  useEffect(() => {
    Animated.timing(slide, {
      toValue: 1,
      duration: motion.base,
      easing: motion.easeOut,
      useNativeDriver: true,
    }).start();
  }, [slide]);

  const count = mode === 0 ? Object.keys(notes).length : wholeNote.trim().length > 0 ? 1 : 0;

  const send = () => {
    const note =
      mode === 0
        ? sections
            .filter((s) => notes[s.key] !== undefined)
            .map((s) => `${s.label}: ${notes[s.key]}`)
            .join('\n\n')
        : wholeNote.trim();
    onSend(note, count);
  };

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          opacity: slide,
          transform: [
            { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [32, 0] }) },
          ],
        },
      ]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <Text style={styles.title}>Request changes</Text>
          <Segmented
            options={[{ label: 'Section by section' }, { label: 'Whole post' }]}
            value={mode}
            onChange={(next) => {
              setMode(next);
              setOpenKey(null);
            }}
          />
          <Text style={styles.helper}>
            {mode === 0 ? 'Only noted sections go back.' : 'One note, one re-record.'}
          </Text>
        </View>

        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
        >
          {mode === 0 ? (
            sections.map((section) => (
              <SectionNoteCard
                key={section.key}
                label={section.label}
                text={section.text}
                note={notes[section.key] ?? null}
                open={openKey === section.key}
                onOpen={() => setOpenKey(section.key)}
                onCancel={() => setOpenKey(null)}
                onSave={(note) => {
                  setNotes((prev) => ({ ...prev, [section.key]: note }));
                  setOpenKey(null);
                }}
                onRemove={() =>
                  setNotes((prev) => {
                    const next = { ...prev };
                    delete next[section.key];
                    return next;
                  })
                }
              />
            ))
          ) : (
            <View style={styles.wholeBox}>
              <TextInput
                multiline
                value={wholeNote}
                onChangeText={setWholeNote}
                placeholder="What should change"
                placeholderTextColor={color.slate400}
                style={styles.wholeInput}
              />
            </View>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <Button
            variant="outline"
            size="md"
            disabled={busy}
            style={styles.footerCancel}
            onPress={onCancel}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={busy || count === 0}
            style={styles.footerSend}
            onPress={send}
          >
            {mode === 0
              ? `Send back \u00b7 ${count} ${count === 1 ? 'note' : 'notes'}`
              : 'Send back'}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: color.offWhite,
  },
  fill: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  title: {
    fontSize: type.size.action,
    fontWeight: type.weight.bold,
    letterSpacing: type.tracking.title,
    color: color.ink,
    textAlign: 'center',
  },
  helper: {
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.slate400,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 10,
  },
  wholeBox: {
    padding: 14,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  wholeInput: {
    minHeight: 140,
    textAlignVertical: 'top',
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * 1.45,
    color: color.ink,
    padding: 0,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: borderWidth.hair,
    borderTopColor: color.line,
    backgroundColor: color.white,
  },
  footerCancel: {
    flex: 46,
  },
  footerSend: {
    flex: 54,
  },
});

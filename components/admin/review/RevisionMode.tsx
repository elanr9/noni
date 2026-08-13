import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ContentFormat } from '../../../lib/admin-review-types';
import { borderWidth, color, motion, radiusAdmin, type } from '../../../theme/tokens';
import { ActionBar, Card, PushHeader, SectionLabel, Segmented } from '../shared';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { RequestChangesSheet } from '../RequestChangesSheet';
import { SectionNoteCard } from './SectionNoteCard';

export interface RevisionSection {
  key: string;
  /** "Hook" / "Clip 2" / "Slide 3". Spoken sections only; captions come
   * from the brief and are placed automatically, so they are never here. */
  label: string;
  text: string;
}

export interface RevisionModeProps {
  /** Creator first name, e.g. "Fabri". */
  creatorShort: string;
  postTitle: string;
  format: ContentFormat;
  sections: RevisionSection[];
  busy: boolean;
  onCancel: () => void;
  /** Notes flattened to `Label: text` blocks (ReviewThread parses this). */
  onSend: (note: string, count: number) => void;
}

/**
 * Admin handoff §3 revision mode — Section by section | Whole post. One card
 * per spoken section, tap opens the watch sheet, plus opens the inline
 * editor. Only the sections with notes go back.
 */
export function RevisionMode({
  creatorShort,
  postTitle,
  format,
  sections,
  busy,
  onCancel,
  onSend,
}: RevisionModeProps) {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;

  const [mode, setMode] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [wholeNotes, setWholeNotes] = useState<string[]>(['']);
  const [watchKey, setWatchKey] = useState<string | null>(null);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: 1,
      duration: motion.base,
      easing: motion.easeOut,
      useNativeDriver: true,
    }).start();
  }, [slide]);

  const watch = useMemo(
    () => sections.find((s) => s.key === watchKey) ?? null,
    [sections, watchKey],
  );

  const filledWhole = wholeNotes.filter((t) => t.trim().length > 0);
  const count = mode === 0 ? Object.keys(notes).length : filledWhole.length;
  const lastWhole = wholeNotes[wholeNotes.length - 1] ?? '';

  const send = () => {
    const note =
      mode === 0
        ? sections
            .filter((s) => notes[s.key] !== undefined)
            .map((s) => `${s.label}: ${notes[s.key]}`)
            .join('\n\n')
        : filledWhole.map((t) => t.trim()).join('\n\n');
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
        <ScrollView
          style={styles.fill}
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 6 }]}
          keyboardShouldPersistTaps="handled"
        >
          <PushHeader
            title={`What should ${creatorShort} fix?`}
            subtitle={postTitle}
            onBack={onCancel}
          />
          <Segmented
            options={[{ label: 'Section by section' }, { label: 'Whole post' }]}
            value={mode}
            onChange={(next) => {
              setMode(next);
              setOpenKey(null);
            }}
          />

          {mode === 0 ? (
            <>
              <Text style={styles.helper}>
                Tap a section to leave a note. Only the sections you note come
                back. The rest stay approved.
              </Text>
              <View style={styles.cards}>
                {sections.map((section) => (
                  <SectionNoteCard
                    key={section.key}
                    label={section.label}
                    text={section.text}
                    format={format}
                    note={notes[section.key] ?? null}
                    open={openKey === section.key}
                    onWatch={() => setWatchKey(section.key)}
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
                ))}
              </View>
            </>
          ) : (
            <Card pad={14}>
              <SectionLabel>Notes for the whole post</SectionLabel>
              <View style={styles.wholeList}>
                {wholeNotes.map((text, i) => (
                  <View key={i}>
                    <TextInput
                      multiline
                      value={text}
                      onChangeText={(next) =>
                        setWholeNotes(wholeNotes.map((t, j) => (j === i ? next : t)))
                      }
                      placeholder={
                        i === 0
                          ? `What has to change before ${creatorShort} records again`
                          : 'Another note'
                      }
                      placeholderTextColor={color.slate400}
                      style={styles.wholeInput}
                    />
                    {wholeNotes.length > 1 && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Remove note"
                        hitSlop={10}
                        onPress={() =>
                          setWholeNotes(wholeNotes.filter((_, j) => j !== i))
                        }
                        style={styles.wholeRemove}
                      >
                        <Icon name="x" size={13} color={color.slate400} />
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add another note"
                disabled={lastWhole.trim().length === 0}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                onPress={() => setWholeNotes([...wholeNotes, ''])}
                style={[
                  styles.addNote,
                  lastWhole.trim().length === 0 && styles.addNoteDisabled,
                ]}
              >
                <Icon name="plus" size={14} color={color.blue700} />
                <Text style={styles.addNoteText}>Add another note</Text>
              </Pressable>
            </Card>
          )}
        </ScrollView>

        <ActionBar style={styles.actionBar}>
          <Button
            variant="ghost"
            size="md"
            disabled={busy}
            style={styles.cancel}
            onPress={onCancel}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            icon="send"
            disabled={busy || count === 0}
            style={styles.send}
            onPress={send}
          >
            {count === 0
              ? 'Send back'
              : `Send back \u00b7 ${count} ${count === 1 ? 'note' : 'notes'}`}
          </Button>
        </ActionBar>
      </KeyboardAvoidingView>

      <RequestChangesSheet
        visible={watch !== null}
        label={watch?.label ?? ''}
        text={watch?.text ?? ''}
        format={format}
        creatorShort={creatorShort}
        initialNote={watch !== null ? notes[watch.key] ?? '' : ''}
        onClose={() => setWatchKey(null)}
        onSave={(note) => {
          if (watch !== null) {
            setNotes((prev) => ({ ...prev, [watch.key]: note }));
          }
          setWatchKey(null);
        }}
      />
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
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    gap: 12,
  },
  helper: {
    marginHorizontal: 2,
    fontSize: type.size.chip,
    lineHeight: type.size.chip * 1.45,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
  cards: {
    gap: 8,
  },
  wholeList: {
    marginTop: 10,
    gap: 8,
  },
  wholeInput: {
    minHeight: 78,
    paddingTop: 13,
    paddingBottom: 13,
    paddingLeft: 13,
    paddingRight: 38,
    borderRadius: radiusAdmin.md,
    borderWidth: borderWidth.field,
    borderColor: color.borderStrong,
    backgroundColor: color.white,
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * 1.5,
    color: color.ink,
    textAlignVertical: 'top',
  },
  wholeRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addNote: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue100,
  },
  addNoteDisabled: {
    opacity: 0.45,
  },
  addNoteText: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.blue700,
  },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  cancel: {
    flex: 30,
  },
  send: {
    flex: 70,
  },
});

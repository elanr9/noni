import { useEffect, useState, type JSX } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import type { BriefFormat } from '../../lib/briefs-api';
import { borderWidth, color, radius, ringFocus, type } from '../../theme/tokens';
import { Button } from '../ui/Button';
import { PressableScale } from '../ui/PressableScale';
import { Segmented } from '../ui/Segmented';
import { SheetShell } from '../ui/SheetShell';

export type BriefEditValues = {
  title: string;
  format: BriefFormat;
  hook: string;
  script: string;
  caption: string;
  whyItWorks: string;
  pinnedDay: number | null;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Short weekday labels for day offsets 0-6 from the campaign drop date. */
export function dayLabels(dropDate: string | null): string[] {
  const start = dropDate ? new Date(`${dropDate}T00:00:00`).getDay() : 0;
  return Array.from({ length: 7 }, (_, i) => WEEKDAYS[(start + i) % 7]);
}

export function BriefEditSheet(props: {
  visible: boolean;
  mode: 'create' | 'edit';
  initial: BriefEditValues;
  dropDate: string | null;
  exampleUrl?: string | null;
  busy?: boolean;
  onClose: () => void;
  onSave: (values: BriefEditValues) => void;
  onRemove?: () => void;
}): JSX.Element {
  const {
    visible,
    mode,
    initial,
    dropDate,
    exampleUrl,
    busy = false,
    onClose,
    onSave,
    onRemove,
  } = props;

  const [title, setTitle] = useState(initial.title);
  const [format, setFormat] = useState<BriefFormat>(initial.format);
  const [hook, setHook] = useState(initial.hook);
  const [script, setScript] = useState(initial.script);
  const [caption, setCaption] = useState(initial.caption);
  const [whyItWorks, setWhyItWorks] = useState(initial.whyItWorks);
  const [pinnedDay, setPinnedDay] = useState<number | null>(initial.pinnedDay);
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitle(initial.title);
    setFormat(initial.format);
    setHook(initial.hook);
    setScript(initial.script);
    setCaption(initial.caption);
    setWhyItWorks(initial.whyItWorks);
    setPinnedDay(initial.pinnedDay);
  }, [visible, initial]);

  function confirmRemove() {
    Alert.alert(
      'Remove from this campaign?',
      'The brief stays in your backlog with its history.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: onRemove },
      ],
    );
  }

  const labels = dayLabels(dropDate);
  const bodyLabel = format === 'photo_carousel' ? 'Slide copy' : 'Script';

  return (
    <SheetShell
      visible={visible}
      onClose={onClose}
      pinnedTop={64}
      footer={
        <>
          <Button
            size="lg"
            variant="primary"
            block
            disabled={busy || !title.trim()}
            onPress={() =>
              onSave({ title, format, hook, script, caption, whyItWorks, pinnedDay })
            }
          >
            {busy ? 'Saving…' : mode === 'create' ? 'Save to campaign' : 'Save brief'}
          </Button>
          {mode === 'edit' && onRemove ? (
            <PressableScale
              accessibilityRole="button"
              onPress={confirmRemove}
              style={styles.removeBtn}
            >
              <Text style={styles.removeLabel}>Remove from campaign</Text>
            </PressableScale>
          ) : null}
        </>
      }
    >
      <View style={styles.headerRow}>
        <Text style={styles.h2} numberOfLines={1}>
          {mode === 'create' ? 'New brief' : 'Edit brief'}
        </Text>
        {exampleUrl ? (
          <View style={styles.metaChip}>
            <Text style={styles.metaChipText}>From link</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Title</Text>
        <View style={[styles.fieldRing, focused === 'title' && ringFocus]}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            onFocus={() => setFocused('title')}
            onBlur={() => setFocused(null)}
            style={styles.field}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Format</Text>
        <Segmented
          options={['Reel', 'Slideshow']}
          value={format === 'video' ? 0 : 1}
          onChange={(i) => setFormat(i === 0 ? 'video' : 'photo_carousel')}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Pin to a day</Text>
        <Text style={styles.helper}>
          Pinned briefs land on the same day for every creator.
        </Text>
        <View style={styles.pillRow}>
          <PressableScale
            accessibilityRole="button"
            accessibilityState={{ selected: pinnedDay === null }}
            onPress={() => setPinnedDay(null)}
            style={[styles.pill, pinnedDay === null && styles.pillSelected]}
          >
            <Text
              style={[styles.pillText, pinnedDay === null && styles.pillTextSelected]}
            >
              None
            </Text>
          </PressableScale>
          {labels.map((label, i) => {
            const selected = pinnedDay === i;
            return (
              <PressableScale
                key={`${label}-${i}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setPinnedDay(i)}
                style={[styles.pill, selected && styles.pillSelected]}
              >
                <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
                  {label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Hook</Text>
        <View style={[styles.fieldRing, focused === 'hook' && ringFocus]}>
          <TextInput
            multiline
            value={hook}
            onChangeText={setHook}
            onFocus={() => setFocused('hook')}
            onBlur={() => setFocused(null)}
            style={[styles.field, styles.multiline]}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>{bodyLabel}</Text>
        <View style={[styles.fieldRing, focused === 'script' && ringFocus]}>
          <TextInput
            multiline
            value={script}
            onChangeText={setScript}
            onFocus={() => setFocused('script')}
            onBlur={() => setFocused(null)}
            style={[styles.field, styles.scriptField]}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Caption</Text>
        <View style={[styles.fieldRing, focused === 'caption' && ringFocus]}>
          <TextInput
            multiline
            value={caption}
            onChangeText={setCaption}
            onFocus={() => setFocused('caption')}
            onBlur={() => setFocused(null)}
            style={[styles.field, styles.multiline]}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Why this works</Text>
        <View style={[styles.fieldRing, focused === 'why' && ringFocus]}>
          <TextInput
            multiline
            value={whyItWorks}
            onChangeText={setWhyItWorks}
            onFocus={() => setFocused('why')}
            onBlur={() => setFocused(null)}
            style={[styles.field, styles.multiline]}
          />
        </View>
      </View>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  h2: {
    flexShrink: 1,
    fontSize: type.size.titleSm,
    fontWeight: '800',
    color: color.ink,
    letterSpacing: type.tracking.title,
  },
  metaChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: color.blue100,
  },
  metaChipText: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.blue700,
  },
  section: { gap: 8, marginBottom: 16 },
  label: {
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.slate400,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
  },
  helper: {
    fontSize: type.size.meta,
    color: color.slate400,
  },
  fieldRing: { borderRadius: radius.sm },
  field: {
    borderWidth: borderWidth.field,
    borderColor: color.lineStrong,
    borderRadius: radius.sm,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontSize: type.size.body,
    fontWeight: '600',
    color: color.ink,
    backgroundColor: color.white,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  scriptField: {
    minHeight: 140,
    textAlignVertical: 'top',
    fontWeight: '400',
    lineHeight: type.size.body * type.leading.body,
    color: color.slate500,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
  },
  pillSelected: { backgroundColor: color.blue100 },
  pillText: {
    fontSize: type.size.meta,
    fontWeight: '700',
    color: color.slate500,
  },
  pillTextSelected: { color: color.blue700 },
  removeBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  removeLabel: {
    color: color.danger,
    fontSize: type.size.bodySm,
    fontWeight: '700',
  },
});

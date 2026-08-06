import { useEffect, useState, type JSX } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';

import type { BriefFormat, TalkingPoint } from '../../lib/briefs-api';
import { borderWidth, color, radius, ringFocus, type } from '../../theme/tokens';
import { Button } from '../ui/Button';
import { PressableScale } from '../ui/PressableScale';
import { Segmented } from '../ui/Segmented';
import { SheetShell } from '../ui/SheetShell';

export type BriefEditValues = {
  title: string;
  format: BriefFormat;
  /** Legacy single hook, only edited when the brief predates hook options. */
  hook: string;
  hookOptions: string[];
  chosenHookIndex: number;
  talkingPoints: TalkingPoint[];
  hashtags: string[];
  searchQuery: string;
  /** Slide copy for carousels, or the legacy video script. */
  script: string;
  caption: string;
  whyItWorks: string;
  targetWords: number;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Short weekday labels for day offsets 0-6 from the campaign drop date. */
export function dayLabels(dropDate: string | null): string[] {
  const start = dropDate ? new Date(`${dropDate}T00:00:00`).getDay() : 0;
  return Array.from({ length: 7 }, (_, i) => WEEKDAYS[(start + i) % 7]);
}

const CAPTION_MAX = 200;
const REQUIRED_HASHTAGS = 5;

export function BriefEditSheet(props: {
  visible: boolean;
  mode: 'create' | 'edit';
  initial: BriefEditValues;
  hashtagBank: string[];
  exampleUrl?: string | null;
  warnings?: string[];
  busy?: boolean;
  onClose: () => void;
  onSave: (values: BriefEditValues) => void;
  onRemove?: () => void;
}): JSX.Element {
  const {
    visible,
    mode,
    initial,
    hashtagBank,
    exampleUrl,
    warnings = [],
    busy = false,
    onClose,
    onSave,
    onRemove,
  } = props;

  const [title, setTitle] = useState(initial.title);
  const [format, setFormat] = useState<BriefFormat>(initial.format);
  const [hook, setHook] = useState(initial.hook);
  const [hookOptions, setHookOptions] = useState(initial.hookOptions);
  const [chosenHookIndex, setChosenHookIndex] = useState(initial.chosenHookIndex);
  const [points, setPoints] = useState<TalkingPoint[]>(initial.talkingPoints);
  const [hashtags, setHashtags] = useState(initial.hashtags);
  const [searchQuery, setSearchQuery] = useState(initial.searchQuery);
  const [script, setScript] = useState(initial.script);
  const [caption, setCaption] = useState(initial.caption);
  const [whyItWorks, setWhyItWorks] = useState(initial.whyItWorks);
  const [focused, setFocused] = useState<string | null>(null);

  // Old briefs have prose instead of points; they stay editable exactly as
  // they were, with the new structure rules switched off.
  const legacy =
    initial.talkingPoints.length === 0 && initial.script.trim().length > 0;

  useEffect(() => {
    if (!visible) return;
    setTitle(initial.title);
    setFormat(initial.format);
    setHook(initial.hook);
    setHookOptions(initial.hookOptions);
    setChosenHookIndex(initial.chosenHookIndex);
    setPoints(initial.talkingPoints);
    setHashtags(initial.hashtags);
    setSearchQuery(initial.searchQuery);
    setScript(initial.script);
    setCaption(initial.caption);
    setWhyItWorks(initial.whyItWorks);
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

  function updatePoint(id: string, text: string) {
    setPoints((prev) =>
      prev.map((p) => (p.id === id ? { ...p, text, edited_by_admin: true } : p)),
    );
  }

  function movePoint(index: number, delta: -1 | 1) {
    setPoints((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function deletePoint(id: string) {
    setPoints((prev) => prev.filter((p) => p.id !== id));
  }

  function addPoint() {
    setPoints((prev) => [
      ...prev,
      {
        id: Crypto.randomUUID(),
        text: '',
        is_product: false,
        edited_by_admin: true,
        claim_id: null,
      },
    ]);
  }

  function markProduct(id: string) {
    setPoints((prev) =>
      prev.map((p) => ({ ...p, is_product: p.id === id })),
    );
  }

  function toggleHashtag(tag: string) {
    setHashtags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= REQUIRED_HASHTAGS) return prev;
      return [...prev, tag];
    });
  }

  function validate(): string | null {
    if (!title.trim()) return 'Give the brief a title.';
    if (legacy) return null;
    if (points.length < 2) return 'A brief needs at least 2 talking points.';
    if (points.filter((p) => p.is_product).length !== 1) {
      return 'Exactly one talking point must be the product point. Tap FV on the right one.';
    }
    if (hashtags.length !== REQUIRED_HASHTAGS) {
      return `Pick exactly ${REQUIRED_HASHTAGS} hashtags.`;
    }
    if (caption.length > CAPTION_MAX) {
      return `Caption is ${caption.length} characters. Max ${CAPTION_MAX}.`;
    }
    return null;
  }

  function save() {
    const problem = validate();
    if (problem) {
      Alert.alert('Not quite', problem);
      return;
    }
    onSave({
      title,
      format,
      hook,
      hookOptions,
      chosenHookIndex,
      talkingPoints: points,
      hashtags,
      searchQuery,
      script,
      caption,
      whyItWorks,
      targetWords: initial.targetWords,
    });
  }

  const showSlideCopy = legacy || format === 'photo_carousel';
  const bodyLabel = format === 'photo_carousel' ? 'Slide copy' : 'Script';
  const bankTags = hashtagBank.length > 0 ? hashtagBank : hashtags;

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
            onPress={save}
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

      {warnings.length > 0 ? (
        <View style={styles.warnCard}>
          {warnings.map((w) => (
            <Text key={w} style={styles.warnText}>
              {w}
            </Text>
          ))}
        </View>
      ) : null}

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
        {!legacy ? (
          <View style={[styles.fieldRing, focused === 'query' && ringFocus]}>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setFocused('query')}
              onBlur={() => setFocused(null)}
              placeholder="Search query this answers"
              placeholderTextColor={color.slate400}
              autoCapitalize="none"
              style={[styles.field, styles.queryField]}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Format</Text>
        <Segmented
          options={['Reel', 'Slideshow']}
          value={format === 'video' ? 0 : 1}
          onChange={(i) => setFormat(i === 0 ? 'video' : 'photo_carousel')}
        />
      </View>

      {legacy ? (
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
      ) : (
        <View style={styles.section}>
          <Text style={styles.label}>Hook</Text>
          {hookOptions.map((option, i) => {
            const selected = chosenHookIndex === i;
            return (
              <View key={`hook-${i}`} style={styles.hookRow}>
                <PressableScale
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setChosenHookIndex(i)}
                  style={[styles.radio, selected && styles.radioOn]}
                >
                  <Text style={[styles.radioText, selected && styles.radioTextOn]}>
                    {i === 0 ? 'A' : 'B'}
                  </Text>
                </PressableScale>
                <View
                  style={[
                    styles.fieldRing,
                    styles.hookField,
                    focused === `hook-${i}` && ringFocus,
                  ]}
                >
                  <TextInput
                    multiline
                    value={option}
                    onChangeText={(text) =>
                      setHookOptions((prev) =>
                        prev.map((h, j) => (j === i ? text : h)),
                      )
                    }
                    onFocus={() => setFocused(`hook-${i}`)}
                    onBlur={() => setFocused(null)}
                    style={styles.field}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {!legacy ? (
        <View style={styles.section}>
          <Text style={styles.label}>Talking points</Text>
          {points.map((point, i) => (
            <View
              key={point.id}
              style={[styles.pointCard, point.is_product && styles.productCard]}
            >
              <View style={styles.pointHead}>
                <Text style={styles.pointIndex}>{i + 1}</Text>
                {point.is_product ? (
                  <View style={styles.fvTag}>
                    <Text style={styles.fvTagText}>FV</Text>
                  </View>
                ) : (
                  <PressableScale
                    accessibilityRole="button"
                    onPress={() => markProduct(point.id)}
                    style={styles.fvGhost}
                  >
                    <Text style={styles.fvGhostText}>FV</Text>
                  </PressableScale>
                )}
                <View style={styles.pointTools}>
                  <PressableScale
                    accessibilityRole="button"
                    onPress={() => movePoint(i, -1)}
                    style={styles.toolBtn}
                  >
                    <Text style={styles.toolText}>↑</Text>
                  </PressableScale>
                  <PressableScale
                    accessibilityRole="button"
                    onPress={() => movePoint(i, 1)}
                    style={styles.toolBtn}
                  >
                    <Text style={styles.toolText}>↓</Text>
                  </PressableScale>
                  <PressableScale
                    accessibilityRole="button"
                    onPress={() => deletePoint(point.id)}
                    style={styles.toolBtn}
                  >
                    <Text style={[styles.toolText, styles.toolDanger]}>✕</Text>
                  </PressableScale>
                </View>
              </View>
              <TextInput
                multiline
                value={point.text ?? ''}
                onChangeText={(text) => updatePoint(point.id, text)}
                placeholder={
                  point.is_product
                    ? 'Product point. Write it from an approved claim.'
                    : 'Beat, not a line. Under 25 words.'
                }
                placeholderTextColor={color.slate400}
                style={styles.pointInput}
              />
            </View>
          ))}
          <Button size="sm" variant="tint" onPress={addPoint}>
            Add point
          </Button>
        </View>
      ) : null}

      {!legacy ? (
        <View style={styles.section}>
          <Text style={styles.label}>
            {`Hashtags (${hashtags.length} of ${REQUIRED_HASHTAGS})`}
          </Text>
          <View style={styles.pillRow}>
            {bankTags.map((tag) => {
              const selected = hashtags.includes(tag);
              return (
                <PressableScale
                  key={tag}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => toggleHashtag(tag)}
                  style={[styles.pill, selected && styles.pillSelected]}
                >
                  <Text
                    style={[styles.pillText, selected && styles.pillTextSelected]}
                  >
                    {tag}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>
      ) : null}

      {showSlideCopy ? (
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
      ) : null}

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
        {!legacy ? (
          <Text
            style={[
              styles.helper,
              caption.length > CAPTION_MAX && styles.helperDanger,
            ]}
          >
            {caption.length} of {CAPTION_MAX} characters
          </Text>
        ) : null}
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
  warnCard: {
    gap: 4,
    padding: 12,
    marginBottom: 16,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.danger,
    backgroundColor: color.white,
  },
  warnText: {
    fontSize: type.size.meta,
    color: color.danger,
    fontWeight: '600',
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
  helperDanger: { color: color.danger },
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
  queryField: {
    fontWeight: '400',
    fontSize: type.size.bodySm,
    color: color.slate500,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  scriptField: {
    minHeight: 140,
    textAlignVertical: 'top',
    fontWeight: '400',
    lineHeight: type.size.body * type.leading.body,
    color: color.slate500,
  },
  hookRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  hookField: { flex: 1 },
  radio: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.fillQuiet,
  },
  radioOn: { backgroundColor: color.blue100 },
  radioText: {
    fontSize: type.size.bodySm,
    fontWeight: '800',
    color: color.slate400,
  },
  radioTextOn: { color: color.blue700 },
  pointCard: {
    gap: 6,
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: borderWidth.field,
    borderColor: color.lineStrong,
    backgroundColor: color.white,
  },
  productCard: {
    borderColor: color.blue700,
    borderWidth: 2,
  },
  pointHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pointIndex: {
    fontSize: type.size.bodySm,
    fontWeight: '800',
    color: color.slate400,
    width: 18,
  },
  fvTag: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: color.blue700,
  },
  fvTagText: {
    fontSize: type.size.micro,
    fontWeight: '800',
    color: color.white,
  },
  fvGhost: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.lineStrong,
  },
  fvGhostText: {
    fontSize: type.size.micro,
    fontWeight: '800',
    color: color.slate400,
  },
  pointTools: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 'auto',
  },
  toolBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.fillQuiet,
  },
  toolText: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.slate500,
  },
  toolDanger: { color: color.danger },
  pointInput: {
    fontSize: type.size.bodySm,
    color: color.ink,
    minHeight: 40,
    textAlignVertical: 'top',
    paddingVertical: 0,
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

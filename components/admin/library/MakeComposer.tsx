import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { BriefMediaFormat } from '../../../lib/briefs-api';
import { borderWidth, color, radiusAdmin, ringFocus, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

/** null: the AI picks the format. */
export type FormatPick = BriefMediaFormat | null;

const FORMATS: { id: FormatPick; label: string }[] = [
  { id: null, label: 'Auto' },
  { id: 'slideshow', label: 'Slideshow' },
  { id: 'reel', label: 'Reel' },
];

export type MakeComposerProps =
  | {
      mode: 'idea';
      idea: string;
      onChangeIdea: (t: string) => void;
      format: FormatPick;
      onChangeFormat: (f: FormatPick) => void;
      canMake: boolean;
      onMake: () => void;
    }
  | {
      mode: 'reference';
      link: string;
      onChangeLink: (t: string) => void;
      direction: string;
      onChangeDirection: (t: string) => void;
      /** Reads the clipboard into the link field. */
      onPaste: () => void;
      canMake: boolean;
      onMake: () => void;
    };

function Field({
  value,
  onChangeText,
  placeholder,
  multiline = false,
  right,
  onSubmit,
  label,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  multiline?: boolean;
  right?: ReactNode;
  onSubmit?: () => void;
  label: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.ring, focused && { borderColor: ringFocus.borderColor }]}>
      <View style={styles.field}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmit}
          placeholder={placeholder}
          placeholderTextColor={color.slate400}
          multiline={multiline}
          submitBehavior={multiline ? 'blurAndSubmit' : undefined}
          returnKeyType="done"
          autoCapitalize={multiline ? 'sentences' : 'none'}
          autoCorrect={multiline}
          style={[styles.input, multiline && styles.inputMulti]}
        />
        {right}
      </View>
    </View>
  );
}

function MakeButton({ enabled, onPress }: { enabled: boolean; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel="Make the post"
      disabled={!enabled}
      onPress={onPress}
      style={[styles.make, !enabled && styles.makeOff]}
    >
      <Icon name="sparkles" size={15} color={enabled ? color.white : color.slate400} strokeWidth={2.4} />
      <Text style={[styles.makeText, !enabled && styles.makeTextOff]}>Make</Text>
    </PressableScale>
  );
}

/**
 * The top of Ideas and References. Ideas: one line, a format pick, Make.
 * References: the link, what ours should be about, Make.
 */
export function MakeComposer(props: MakeComposerProps) {
  if (props.mode === 'idea') {
    return (
      <View style={styles.block}>
        <Field
          label="Post idea"
          value={props.idea}
          onChangeText={props.onChangeIdea}
          placeholder="Type a post idea"
          multiline
          onSubmit={props.canMake ? props.onMake : undefined}
        />
        <View style={styles.row}>
          <View style={styles.pills}>
            {FORMATS.map((f) => {
              const on = props.format === f.id;
              return (
                <PressableScale
                  key={f.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => props.onChangeFormat(f.id)}
                  style={[styles.pill, on && styles.pillOn]}
                >
                  <Text style={[styles.pillText, on && styles.pillTextOn]}>{f.label}</Text>
                </PressableScale>
              );
            })}
          </View>
          <MakeButton enabled={props.canMake} onPress={props.onMake} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <Field
        label="Link to a TikTok or Instagram post"
        value={props.link}
        onChangeText={props.onChangeLink}
        placeholder="Paste a TikTok or Instagram link"
        right={
          <PressableScale accessibilityRole="button" accessibilityLabel="Paste the link" onPress={props.onPaste} style={styles.paste}>
            <Icon name="clipboard-paste" size={14} color={color.blue700} strokeWidth={2.4} />
            <Text style={styles.pasteText}>Paste</Text>
          </PressableScale>
        }
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field
            label="What should ours be about"
            value={props.direction}
            onChangeText={props.onChangeDirection}
            placeholder="What should ours be about? (optional)"
            onSubmit={props.canMake ? props.onMake : undefined}
          />
        </View>
        <MakeButton enabled={props.canMake} onPress={props.onMake} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 8,
  },
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ring: {
    borderWidth: ringFocus.borderWidth,
    borderColor: 'transparent',
    borderRadius: radiusAdmin.md + 3,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 46,
    paddingVertical: 6,
    paddingLeft: 14,
    paddingRight: 6,
    borderWidth: borderWidth.field,
    borderColor: color.lineStrong,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.white,
  },
  input: {
    flex: 1,
    minHeight: 32,
    paddingVertical: 4,
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.ink,
  },
  inputMulti: {
    maxHeight: 110,
  },
  pills: {
    flex: 1,
    flexDirection: 'row',
    gap: 3,
    padding: 3,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
  },
  pill: {
    flex: 1,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radiusAdmin.pill,
  },
  pillOn: {
    backgroundColor: color.white,
  },
  pillText: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.slate500,
  },
  pillTextOn: {
    color: color.ink,
  },
  make: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 16,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue500,
  },
  makeOff: {
    backgroundColor: color.fillQuiet,
  },
  makeText: {
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.white,
  },
  makeTextOff: {
    color: color.slate400,
  },
  paste: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    paddingHorizontal: 11,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue50,
  },
  pasteText: {
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.blue700,
  },
});

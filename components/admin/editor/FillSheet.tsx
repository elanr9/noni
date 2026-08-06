import { useState, type JSX } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { color, radius, type } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { SheetShell } from '../../ui/SheetShell';

/**
 * Fill the whole post, on demand only. Two sources for one action: the
 * row's search phrase, or a specific TikTok/Instagram post to remake.
 */
export function FillSheet(props: {
  visible: boolean;
  searchPhrase: string;
  busy: boolean;
  onClose: () => void;
  onFillFromPhrase: () => void;
  onFillFromLink: (url: string, context: string) => void;
}): JSX.Element {
  const { visible, searchPhrase, busy, onClose, onFillFromPhrase, onFillFromLink } =
    props;
  const [url, setUrl] = useState('');
  const [context, setContext] = useState('');

  return (
    <SheetShell visible={visible} onClose={busy ? () => undefined : onClose} pinnedTop={120}>
      <Text style={styles.h2}>Fill this post</Text>
      <Text style={styles.subtitle}>
        Generates every field at once. You review and save; nothing posts on
        its own.
      </Text>

      <View style={styles.option}>
        <Text style={styles.optionLabel}>From the search phrase</Text>
        <Text style={styles.phrase} numberOfLines={2}>
          {searchPhrase.trim() ? `"${searchPhrase.trim()}"` : 'No search phrase set'}
        </Text>
        <Button
          size="md"
          variant="primary"
          block
          disabled={busy || !searchPhrase.trim()}
          onPress={onFillFromPhrase}
        >
          {busy ? 'Generating…' : 'Fill from phrase'}
        </Button>
      </View>

      <View style={styles.option}>
        <Text style={styles.optionLabel}>From a link</Text>
        <Text style={styles.optionHint}>
          Remake a specific post you saw. Paste the TikTok or Instagram link.
        </Text>
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder="https://www.tiktok.com/@…"
          placeholderTextColor={color.slate400}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.field}
        />
        <TextInput
          value={context}
          onChangeText={setContext}
          placeholder="Angle or context (optional)"
          placeholderTextColor={color.slate400}
          multiline
          textAlignVertical="top"
          style={[styles.field, styles.contextField]}
        />
        <Button
          size="md"
          variant="tint"
          block
          disabled={busy || !url.trim()}
          onPress={() => onFillFromLink(url.trim(), context)}
        >
          {busy ? 'Watching the post…' : 'Fill from link'}
        </Button>
      </View>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  h2: {
    fontSize: type.size.titleSm,
    fontWeight: '800',
    color: color.ink,
    letterSpacing: type.tracking.title,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 16,
    fontSize: type.size.bodySm,
    color: color.slate400,
  },
  option: {
    gap: 8,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
  optionLabel: {
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.slate400,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
  },
  optionHint: {
    fontSize: type.size.meta,
    color: color.slate500,
  },
  phrase: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.ink,
  },
  field: {
    borderWidth: 1.5,
    borderColor: color.lineStrong,
    borderRadius: radius.sm,
    paddingVertical: 11,
    paddingHorizontal: 12,
    fontSize: type.size.bodySm,
    color: color.ink,
    backgroundColor: color.white,
  },
  contextField: { minHeight: 60 },
});

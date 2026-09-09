import { useState } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';

import type { MediaKind } from '../../../lib/media-library-api';
import { borderWidth, color, radiusAdmin, type } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../shared';

export interface NameMediaPrompt {
  kind: MediaKind;
  /** Poster to show while naming; null for a fresh recording pick. */
  previewUri: string | null;
  /** "mov · 0:12 · 38 MB" or "png · 1170 × 2532". */
  fileMeta: string;
  initialTitle: string;
}

export interface NameMediaSheetProps {
  prompt: NameMediaPrompt | null;
  busy?: boolean;
  /** Upload failure shown inline; the sheet stays open. */
  error?: string | null;
  onSave: (title: string) => void;
  onClose: () => void;
}

const PLACEHOLDER: Record<MediaKind, string> = {
  screenshot: 'e.g. Chapter view, editor',
  recording: 'e.g. Highlight video',
};

/** Names a screenshot or recording. The title is the label every picker shows. */
export function NameMediaSheet({
  prompt,
  busy = false,
  error = null,
  onSave,
  onClose,
}: NameMediaSheetProps) {
  const [draft, setDraft] = useState('');
  const [seededFor, setSeededFor] = useState<NameMediaPrompt | null>(null);

  if (prompt !== null && seededFor !== prompt) {
    setSeededFor(prompt);
    setDraft(prompt.initialTitle);
  }

  const kind = prompt?.kind ?? 'screenshot';
  const trimmed = draft.trim();
  const isRename = (prompt?.initialTitle ?? '').length > 0;

  return (
    <Sheet
      visible={prompt !== null}
      onClose={onClose}
      title={kind === 'recording' ? 'Name this recording' : 'Name this screenshot'}
      subtitle="This is the label you will see when adding it to a post."
      footer={
        <Button
          size="lg"
          block
          disabled={busy || trimmed.length === 0}
          onPress={() => onSave(trimmed)}
        >
          {busy ? 'Saving' : isRename ? 'Save name' : 'Save to media'}
        </Button>
      }
    >
      <View style={styles.row}>
        <View style={styles.preview}>
          {prompt?.previewUri ? (
            <Image source={{ uri: prompt.previewUri }} style={styles.previewImage} resizeMode="cover" />
          ) : null}
          {kind === 'recording' && (
            <View style={styles.playDisc}>
              <Icon name="play" size={12} color={color.ink} />
            </View>
          )}
        </View>
        <View style={styles.fieldWrap}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={PLACEHOLDER[kind]}
            placeholderTextColor={color.slate400}
            autoFocus
            autoCapitalize="sentences"
            returnKeyType="done"
            onSubmitEditing={() => {
              if (trimmed.length > 0 && !busy) onSave(trimmed);
            }}
            style={[styles.input, trimmed.length > 0 && styles.inputActive]}
          />
          <Text style={[styles.meta, error !== null && styles.metaError]} numberOfLines={2}>
            {error ?? prompt?.fileMeta ?? ''}
          </Text>
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  preview: {
    width: 72,
    height: 96,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  playDisc: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 1,
  },
  fieldWrap: {
    flex: 1,
    gap: 6,
  },
  input: {
    borderWidth: borderWidth.field,
    borderColor: color.lineStrong,
    borderRadius: radiusAdmin.md,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '600',
    color: color.ink,
    backgroundColor: color.white,
  },
  inputActive: {
    borderColor: color.blue500,
  },
  meta: {
    fontSize: type.size.label,
    fontWeight: '600',
    color: color.slate400,
  },
  metaError: {
    color: color.danger,
  },
});

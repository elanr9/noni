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
  initialDescription: string;
}

export interface NameMediaSheetProps {
  prompt: NameMediaPrompt | null;
  busy?: boolean;
  /** Upload failure shown inline; the sheet stays open. */
  error?: string | null;
  onSave: (title: string, description: string | null) => void;
  onClose: () => void;
}

const PLACEHOLDER: Record<MediaKind, string> = {
  screenshot: 'e.g. Chapter view, editor',
  recording: 'e.g. Highlight video',
};

const DESCRIPTION_PLACEHOLDER: Record<MediaKind, string> = {
  screenshot: 'What it shows and how it works, optional',
  recording: 'e.g. Reply AI drafts a reply to a college coach in one tap',
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
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [seededFor, setSeededFor] = useState<NameMediaPrompt | null>(null);

  if (prompt !== null && seededFor !== prompt) {
    setSeededFor(prompt);
    setDraft(prompt.initialTitle);
    setDescriptionDraft(prompt.initialDescription);
  }

  const kind = prompt?.kind ?? 'screenshot';
  const trimmed = draft.trim();
  const description = descriptionDraft.trim() || null;
  const isRename = (prompt?.initialTitle ?? '').length > 0;

  return (
    <Sheet
      visible={prompt !== null}
      onClose={onClose}
      title={kind === 'recording' ? 'Name this recording' : 'Name this screenshot'}
      subtitle="The name is the label you see when adding it to a post. The description tells the AI what it shows."
      footer={
        <Button
          size="lg"
          block
          disabled={busy || trimmed.length === 0}
          onPress={() => onSave(trimmed, description)}
        >
          {busy ? 'Saving' : isRename ? 'Save name' : 'Save to media'}
        </Button>
      }
    >
      <View style={styles.body}>
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
                if (trimmed.length > 0 && !busy) onSave(trimmed, description);
              }}
              style={[styles.input, trimmed.length > 0 && styles.inputActive]}
            />
            <Text style={[styles.meta, error !== null && styles.metaError]} numberOfLines={2}>
              {error ?? prompt?.fileMeta ?? ''}
            </Text>
          </View>
        </View>
        <View style={styles.descriptionWrap}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            value={descriptionDraft}
            onChangeText={setDescriptionDraft}
            placeholder={DESCRIPTION_PLACEHOLDER[kind]}
            placeholderTextColor={color.slate400}
            multiline
            autoCapitalize="sentences"
            style={[styles.input, styles.descriptionInput, description !== null && styles.inputActive]}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 16,
  },
  descriptionWrap: {
    gap: 6,
  },
  label: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.slate500,
  },
  descriptionInput: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
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

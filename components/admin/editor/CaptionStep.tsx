// Admin handoff §8 step 6 — caption with a live count, 3–5 hashtag chips
// with Add, then the merged preview: Instagram reads tags inside the
// caption, so both save as one string.
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { color, radiusAdmin, shadow } from '../../../theme/tokens';
import { PressableScale } from '../../ui/PressableScale';
import { CreatorAvatar, SectionLabel } from '../shared';
import { AiPill } from './AiPill';

const CAPTION_MAX = 200;

export interface CaptionStepProps {
  caption: string;
  onChangeCaption: (text: string) => void;
  busy: boolean;
  onRegenerate: () => void;
  hashtags: string[];
  bankTags: string[];
  onToggleTag: (tag: string) => void;
  onAddTag: (tag: string) => void;
  /** Caption and tags as one saved string. */
  merged: string;
  /** The brand account the preview posts as. */
  accountName: string;
}

export function CaptionStep({
  caption,
  onChangeCaption,
  busy,
  onRegenerate,
  hashtags,
  bankTags,
  onToggleTag,
  onAddTag,
  merged,
  accountName,
}: CaptionStepProps) {
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState('');
  const over = caption.length > CAPTION_MAX;

  function commitNewTag() {
    const tag = newTag.replace(/^#/, '').replace(/\s+/g, '').trim();
    if (tag) onAddTag(tag);
    setNewTag('');
    setAdding(false);
  }

  return (
    <View style={styles.stack}>
      <View style={[styles.card, shadow.shadowCard]}>
        <View style={styles.headRow}>
          <AiPill icon="rotate-ccw" label="Regenerate" busy={busy} onPress={onRegenerate} />
        </View>
        <TextInput
          multiline
          value={caption}
          onChangeText={onChangeCaption}
          placeholder="What the post says under the video"
          placeholderTextColor={color.slate400}
          style={styles.captionField}
        />
        {over ? (
          <Text style={styles.countOver}>
            {`${caption.length} of ${CAPTION_MAX}`}
          </Text>
        ) : null}
      </View>

      <View style={styles.tagBlock}>
        <SectionLabel>Hashtags</SectionLabel>
        <View style={styles.tagRow}>
          {bankTags.map((tag) => {
            const selected = hashtags.includes(tag);
            return (
              <PressableScale
                key={tag}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onToggleTag(tag)}
                style={[styles.tag, selected && styles.tagSelected]}
              >
                <Text style={[styles.tagText, selected && styles.tagTextSelected]}>
                  {tag.startsWith('#') ? tag : `#${tag}`}
                </Text>
              </PressableScale>
            );
          })}
          {adding ? (
            <TextInput
              value={newTag}
              onChangeText={setNewTag}
              onSubmitEditing={commitNewTag}
              onBlur={commitNewTag}
              placeholder="#hashtag"
              placeholderTextColor={color.slate400}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              style={styles.tagInput}
            />
          ) : (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Add a hashtag"
              onPress={() => setAdding(true)}
              style={[styles.tag, styles.tagAdd]}
            >
              <Text style={styles.tagAddText}>Add</Text>
            </PressableScale>
          )}
        </View>
      </View>

      {merged ? (
        <View style={[styles.preview, shadow.shadowCard]}>
          <View style={styles.previewHead}>
            <CreatorAvatar uri={null} name={accountName} size={28} />
            <Text style={styles.previewName}>{accountName}</Text>
          </View>
          <Text style={styles.previewText}>{merged}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
  card: {
    gap: 10,
    padding: 16,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  captionField: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 15 * 1.45,
    color: color.ink,
    minHeight: 80,
    textAlignVertical: 'top',
    padding: 0,
  },
  countOver: {
    fontSize: 12,
    fontWeight: '600',
    color: color.danger,
    textAlign: 'right',
  },
  tagBlock: {
    gap: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  tag: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
  },
  tagSelected: {
    backgroundColor: color.blue100,
  },
  tagText: {
    fontSize: 13,
    fontWeight: '700',
    color: color.slate500,
  },
  tagTextSelected: {
    color: color.blue700,
  },
  tagAdd: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.lineStrong,
    backgroundColor: 'transparent',
  },
  tagAddText: {
    fontSize: 13,
    fontWeight: '700',
    color: color.slate400,
  },
  tagInput: {
    minWidth: 110,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radiusAdmin.pill,
    borderWidth: 1.5,
    borderColor: color.blue500,
    fontSize: 13,
    fontWeight: '700',
    color: color.ink,
    backgroundColor: color.white,
  },
  preview: {
    gap: 10,
    padding: 16,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
  },
  previewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewName: {
    fontSize: 13,
    fontWeight: '700',
    color: color.ink,
  },
  previewText: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 14 * 1.45,
    color: color.ink,
  },
});

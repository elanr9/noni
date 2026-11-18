// Caption and hashtags on a Guided compose (BRIEFS.md 2a, 4a). Fill in with
// AI writes both; the campaign manager edits the caption in place and adds or
// removes hashtag chips.
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { addTags, removeTag } from '../../../../lib/brief-tags';
import { color, motion, radius, shadow } from '../../../../theme/v2';
import { Icon, Label, Press } from '../../../v2';
import { ShimmerLine } from './ClipFrame';

export interface CaptionCardProps {
  caption: string;
  tags: string[];
  onCaption: (t: string) => void;
  onTags: (tags: string[]) => void;
  /** The AI is writing the caption: shimmer in place of the fields. */
  pending?: boolean;
}

export function CaptionCard({ caption, tags, onCaption, onTags, pending }: CaptionCardProps) {
  const [draft, setDraft] = useState('');
  const commit = (raw = draft) => {
    if (/\S/.test(raw)) onTags(addTags(tags, raw));
    setDraft('');
  };
  return (
    <View style={{ backgroundColor: color.card, borderRadius: radius.card, paddingTop: 10, paddingHorizontal: 16, paddingBottom: 12, gap: 6, ...shadow.card }}>
      <Label>Caption</Label>
      {pending ? (
        <>
          <ShimmerLine />
          <ShimmerLine width="45%" />
        </>
      ) : (
        <>
          <TextInput
            multiline
            value={caption}
            onChangeText={onCaption}
            placeholder="What creators post under the video"
            placeholderTextColor={color.grey3}
            accessibilityLabel="Caption"
            style={{ fontSize: 15, lineHeight: 21, color: color.ink, padding: 0, minHeight: 21 }}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 }}>
            {tags.map((t) => (
              <Animated.View key={t} entering={FadeIn.duration(motion.tabInShort)} exiting={FadeOut.duration(160)} layout={LinearTransition.duration(motion.tabInShort)}>
                <Press
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${t}`}
                  onPress={() => onTags(removeTag(tags, t))}
                  style={{ height: 30, flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 10, paddingRight: 6, borderRadius: radius.pill, backgroundColor: color.blueTint }}
                >
                  <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: color.blueDeep }}>{t}</Text>
                  <Icon name="close" size={14} color={color.blueDeep} />
                </Press>
              </Animated.View>
            ))}
            <View style={{ height: 30, minWidth: 120, flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 8, paddingRight: 4, borderRadius: radius.pill, backgroundColor: color.grey1 }}>
              <TextInput
                value={draft}
                onChangeText={(t) => {
                  // A space or comma closes the tag being typed.
                  if (/[\s,]$/.test(t)) commit(t);
                  else setDraft(t);
                }}
                onSubmitEditing={() => commit()}
                onBlur={() => commit()}
                submitBehavior="submit"
                returnKeyType="done"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={tags.length ? 'Add hashtag' : '#hashtag'}
                placeholderTextColor={color.grey3}
                accessibilityLabel="Add hashtag"
                style={{ flex: 1, fontSize: 14, lineHeight: 18, color: color.ink, padding: 0 }}
              />
              {/\S/.test(draft) ? (
                <Press accessibilityRole="button" accessibilityLabel="Add" onPress={() => commit()} style={{ width: 24, height: 24, borderRadius: radius.pill, backgroundColor: color.blue, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="add" size={16} color={color.white} />
                </Press>
              ) : null}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

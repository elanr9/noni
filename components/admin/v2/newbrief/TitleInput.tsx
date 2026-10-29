import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { matchedWords, titleIdeas } from '../../../../lib/brief-ai';
import { color, shadow } from '../../../../theme/v2';
import { Icon, Press } from '../../../v2';

export const FIELD = { backgroundColor: color.card, borderRadius: 16, ...shadow.card } as const;

export interface TitleInputProps {
  value: string;
  onChange: (t: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  /** Editing an existing brief: no suggestions. */
  noIdeas?: boolean;
}

/** Wrapping title field, 600 16. While typing a popover lists up to five ideas; Return accepts the first. */
export function TitleInput({ value, onChange, placeholder = 'Title', readOnly, noIdeas }: TitleInputProps) {
  const [focus, setFocus] = useState(false);
  const ideas = noIdeas || readOnly ? [] : titleIdeas(value);
  const open = focus && ideas.length > 0;
  const accept = (t: string) => {
    onChange(t);
    setFocus(false);
  };
  return (
    <View style={{ zIndex: open ? 6 : 1 }}>
      <View style={[FIELD, { borderWidth: 2, borderColor: open ? color.blue : 'transparent', paddingHorizontal: 14, paddingVertical: 11 }]}>
        <TextInput
          value={value}
          editable={!readOnly}
          multiline
          blurOnSubmit
          returnKeyType="done"
          onChangeText={(t) => {
            onChange(t.replace(/\n/g, ' '));
            setFocus(true);
          }}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 120)}
          onSubmitEditing={() => {
            if (ideas[0] && focus) accept(ideas[0]);
          }}
          placeholder={placeholder}
          placeholderTextColor={color.grey3}
          autoCorrect
          style={{ fontSize: 16, lineHeight: 22, fontWeight: '600', color: color.ink, padding: 0, minHeight: 22 }}
        />
      </View>
      {open ? (
        <Animated.View entering={FadeIn.duration(120)} style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 6, backgroundColor: color.card, borderRadius: 16, overflow: 'hidden', paddingVertical: 6, zIndex: 10, ...shadow.float }}>
          {ideas.map((t) => (
            <Press key={t} onPress={() => accept(t)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10, paddingHorizontal: 16 }}>
              <Icon name="search" size={18} color={color.grey3} style={{ marginTop: 1 }} />
              <Text numberOfLines={2} style={{ flex: 1, fontSize: 15, lineHeight: 20, color: color.ink }}>
                {matchedWords(t, value).map((w, i) => (
                  <Text key={i} style={{ fontWeight: w.hit ? '700' : '400' }}>
                    {w.text}
                  </Text>
                ))}
              </Text>
              <Icon name="north_west" size={16} color={color.grey3} style={{ marginTop: 2 }} />
            </Press>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

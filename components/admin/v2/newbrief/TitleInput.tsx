import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { fetchTitleIdeas, matchedWords } from '../../../../lib/brief-ai';
import type { BriefType } from '../../../../lib/brief-library';
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
  /** The post type the ideas are for. */
  type?: BriefType | null;
}

/** Ideas written for this company once typing pauses; cached per typed prefix for the session. */
const ideaCache = new Map<string, string[]>();
function useTitleIdeas(value: string, enabled: boolean, type: BriefType | null): { ideas: string[]; loading: boolean } {
  const typed = value.trim();
  const key = `${type ?? ''}|${typed.toLowerCase()}`;
  const [state, setState] = useState<{ key: string; ideas: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    if (!enabled || typed.length < 3) return;
    const hit = ideaCache.get(key);
    if (hit) {
      setState({ key, ideas: hit });
      return;
    }
    const n = ++seq.current;
    const t = setTimeout(() => {
      setLoading(true);
      fetchTitleIdeas(typed, type)
        .then((ideas) => {
          ideaCache.set(key, ideas);
          if (n === seq.current) setState({ key, ideas });
        })
        .catch(() => undefined)
        .finally(() => {
          if (n === seq.current) setLoading(false);
        });
    }, 700);
    return () => clearTimeout(t);
  }, [enabled, key, typed, type]);
  const ideas = enabled && typed.length >= 3 && state ? state.ideas.filter((i) => i.toLowerCase() !== typed.toLowerCase()).slice(0, 5) : [];
  return { ideas, loading: enabled && loading };
}

/** Wrapping title field, 600 16. While typing a popover lists up to five ideas; Return accepts the first. */
export function TitleInput({ value, onChange, placeholder = 'Title', readOnly, noIdeas, type = null }: TitleInputProps) {
  const [focus, setFocus] = useState(false);
  const { ideas, loading } = useTitleIdeas(value, focus && !noIdeas && !readOnly, type);
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
      {focus && loading && !ideas.length ? (
        <Animated.View entering={FadeIn.duration(120)} style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 6, backgroundColor: color.card, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 10, ...shadow.float }}>
          <ActivityIndicator size="small" color={color.grey3} />
          <Text style={{ fontSize: 15, color: color.grey4 }}>Finding title ideas</Text>
        </Animated.View>
      ) : null}
      {open ? (
        <Animated.View entering={FadeIn.duration(120)} style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 6, backgroundColor: color.card, borderRadius: 16, overflow: 'hidden', paddingVertical: 6, zIndex: 10, ...shadow.float }}>
          {ideas.map((t: string) => (
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

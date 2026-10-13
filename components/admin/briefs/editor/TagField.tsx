// Hashtags as chips (SSManager.jsx TagField). Space, comma or return adds;
// backspace on an empty field removes the last one.

import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { color, radius, type as typeToken } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';

export function TagField({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [v, setV] = useState('');
  const ref = useRef<TextInput>(null);
  const add = (raw: string) => {
    const t = raw.replace(/^#+/, '').replace(/[^\w]/g, '').toLowerCase();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setV('');
  };
  return (
    <Pressable accessibilityRole="none" onPress={() => ref.current?.focus()} style={styles.field}>
      {tags.map((t) => (
        <View key={t} style={styles.chip}>
          <Text style={styles.chipText}>#{t}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${t}`} hitSlop={8} onPress={() => onChange(tags.filter((x) => x !== t))} style={styles.remove}>
            <Icon name="x" size={13} color={color.blue700} />
          </Pressable>
        </View>
      ))}
      <TextInput
        ref={ref}
        value={v}
        onChangeText={(next) => {
          if (/[\s,]$/.test(next)) add(next);
          else setV(next);
        }}
        onKeyPress={(e) => {
          if (e.nativeEvent.key === 'Backspace' && !v && tags.length) onChange(tags.slice(0, -1));
        }}
        onSubmitEditing={() => v && add(v)}
        onBlur={() => v && add(v)}
        blurOnSubmit={false}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={tags.length ? '' : 'collegesoccer'}
        placeholderTextColor={color.slate400}
        style={styles.input}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, minHeight: 56, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.lg, backgroundColor: color.white, borderWidth: 1, borderColor: color.border },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingLeft: 11, paddingRight: 6, borderRadius: 999, backgroundColor: color.blue100 },
  chipText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 14, color: color.blue700 },
  remove: { width: 22, height: 22, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minWidth: 90, height: 32, paddingVertical: 4, fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 16, color: color.ink },
});

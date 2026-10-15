// Which feature does this post sell (SSFlow.jsx FeatureSheet). One tap
// writes the CTA; "Write it myself" keeps the slide for typing.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { LibraryFeature } from '../../../../lib/library-api';
import { color, radius, shadow, type as typeToken } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { Sheet } from '../../shared';
import { FeatureThumb } from '../media/FeatureMedia';
import { featureToneFor } from '../Shot';

export function FeatureSheet({
  visible,
  features,
  current,
  video,
  onPick,
  onSelf,
  onClose,
}: {
  visible: boolean;
  features: LibraryFeature[];
  current: string | null;
  video: boolean;
  onPick: (feature: LibraryFeature) => void;
  onSelf: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const items = features.filter((it) => !q || `${it.title} ${it.description}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      pinnedTop={80}
      header={
        <View style={styles.head}>
          <Text style={styles.title}>Which feature does this post sell?</Text>
          <View style={styles.search}>
            <Icon name="search" size={16} color={color.slate400} />
            <TextInput value={q} onChangeText={setQ} placeholder="Search features" placeholderTextColor={color.slate400} style={styles.searchInput} />
          </View>
        </View>
      }
      footer={
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onClose();
            onSelf();
          }}
          style={styles.self}
        >
          <Text style={styles.selfText}>Write it myself</Text>
        </Pressable>
      }
    >
      <View style={styles.list}>
        {items.map((it) => {
          const on = current === it.id;
          return (
            <Pressable
              key={it.id}
              accessibilityRole="button"
              accessibilityLabel={it.title}
              onPress={() => {
                onClose();
                onPick(it);
              }}
              style={({ pressed }) => [styles.row, on ? styles.rowOn : null, pressed ? styles.pressed : null]}
            >
              <FeatureThumb feature={it} video={video} tone={featureToneFor(it.title)} style={styles.thumb} />
              <View style={styles.body}>
                <Text style={styles.name}>{it.title}</Text>
                <Text numberOfLines={2} style={styles.desc}>
                  {it.description}
                </Text>
              </View>
              {on ? <Text style={styles.current}>Current</Text> : <Icon name="sparkles" size={16} color={color.slate400} />}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { gap: 12, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10 },
  title: { fontFamily: typeToken.font.display, fontWeight: '800', fontSize: 24, letterSpacing: -0.5, color: color.ink },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, paddingHorizontal: 14, borderRadius: radius.sm, backgroundColor: color.white, borderWidth: 1, borderColor: color.border },
  searchInput: { flex: 1, fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 15, color: color.ink, padding: 0 },
  list: { gap: 10, paddingTop: 2, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, backgroundColor: color.white, ...shadow.shadowCard },
  rowOn: { borderWidth: 2, borderColor: color.blue500, margin: -1 },
  pressed: { opacity: 0.85 },
  thumb: { width: 56, height: 96, borderRadius: 10 },
  body: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 16, letterSpacing: -0.2, color: color.ink },
  desc: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 13, lineHeight: 13 * 1.35, color: color.slate500 },
  current: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 12.5, color: color.blue500 },
  self: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', padding: 4 },
  selfText: { fontFamily: typeToken.font.ui, fontWeight: '600', fontSize: 14, color: color.slate500, textDecorationLine: 'underline' },
});

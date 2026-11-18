import { ScrollView, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';

import { linkFrom } from '../../../../lib/brief-ai';
import { toast } from '../../../v2/Toast';
import { briefs, color, radius, shadow } from '../../../../theme/v2';
import { Icon, Press, Toggle, tap } from '../../../v2';
import { SpinIcon } from './GuidedForm';
import { TitleInput } from './TitleInput';

export type OutlineFields = { title: string; notes: string; link: string; music: boolean; filled: boolean };

export interface OutlineFormProps {
  st: OutlineFields;
  set: (patch: Partial<OutlineFields>) => void;
  /** The AI is filling the title and notes. */
  ai: boolean;
  onFill: () => void;
  editingExisting?: boolean;
}

const FIELD = { backgroundColor: color.card, borderRadius: radius.card, ...shadow.card } as const;

/** Outline compose: link row, Fill in with AI, title, Add music toggle, notes. */
export function OutlineForm({ st, set, ai, onFill, editingExisting }: OutlineFormProps) {
  const [pasting, setPasting] = useState(false);
  const hasLink = /\S/.test(st.link);
  const canAi = hasLink || /\S/.test(st.title);
  const paste = async () => {
    tap();
    setPasting(true);
    let t = '';
    try {
      t = (await Clipboard.getStringAsync()).trim();
    } catch {
      t = '';
    }
    setPasting(false);
    const link = linkFrom(t);
    if (link) set({ link });
    else toast.show('Copy a TikTok, Instagram or YouTube link first, then tap Paste.');
  };
  return (
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 12 }}>
      {editingExisting ? null : <Text style={{ textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '700', color: color.grey4 }}>Outline</Text>}
      {hasLink ? (
        <View style={[FIELD, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 8, height: 56 }]}>
          <Icon name="link" size={22} color={color.blueDeep} />
          <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: 20, fontWeight: '500', color: color.blueDeep }}>
            {st.link}
          </Text>
          <Press accessibilityLabel="Remove link" onPress={() => set({ link: '' })} style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: color.grey1, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" size={18} color={color.ink} />
          </Press>
        </View>
      ) : (
        <View style={[FIELD, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 8, height: 56 }]}>
          <Icon name="link" size={22} color={color.grey3} />
          <Text style={{ flex: 1, fontSize: 16, lineHeight: 22, color: color.grey3 }}>Paste a TikTok or IG link</Text>
          <Press onPress={() => void paste()} haptic={false} style={{ height: 40, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: color.blue, justifyContent: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: color.white }}>{pasting ? 'Pasting' : 'Paste'}</Text>
          </Press>
        </View>
      )}
      {editingExisting ? null : (
        <Press disabled={!canAi || ai} onPress={onFill} accessibilityRole="button" style={{ height: 52, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: canAi ? color.blue : color.grey1, boxShadow: canAi ? briefs.aiGlow : undefined }}>
          <SpinIcon spinning={ai} color={canAi ? color.white : color.grey3} />
          <Text style={{ fontSize: 15, fontWeight: '700', color: canAi ? color.white : color.grey3 }}>{ai ? 'Filling in' : st.filled ? 'Fill in again' : 'Fill in with AI'}</Text>
        </Press>
      )}
      <TitleInput value={st.title} onChange={(t) => set({ title: t })} placeholder="Title" noIdeas={!!editingExisting} />
      <View style={[FIELD, { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 }]}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: st.music ? color.blueTint : color.grey1, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="music_note" size={20} color={st.music ? color.blueDeep : color.grey3} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: color.ink }}>Add music</Text>
          <Text style={{ fontSize: 13, lineHeight: 16, color: color.grey4 }}>Creator picks a sound for Instagram and TikTok</Text>
        </View>
        <Toggle on={st.music} onChange={(v) => set({ music: v })} accessibilityLabel="Add music" />
      </View>
      <TextInput
        multiline
        value={st.notes}
        onChangeText={(t) => set({ notes: t })}
        placeholder={hasLink ? 'What changes from the reference' : 'Notes'}
        placeholderTextColor={color.grey3}
        textAlignVertical="top"
        style={[FIELD, { minHeight: hasLink ? 132 : 154, paddingVertical: 15, paddingHorizontal: 16, fontSize: 16, lineHeight: 22, color: color.ink, opacity: ai ? 0.5 : 1 }]}
      />
    </ScrollView>
  );
}

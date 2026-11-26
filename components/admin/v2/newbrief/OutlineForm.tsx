import { ScrollView, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';

import { linkFrom, type Declined } from '../../../../lib/brief-ai';
import { toast } from '../../../v2/Toast';
import { color, radius, shadow } from '../../../../theme/v2';
import { Icon, Press, Toggle, tap } from '../../../v2';
import { AiFillButton, OUTLINE_STEPS } from './AiFillButton';
import { AiNote } from './AiNote';
import { ShimmerLine } from './ClipFrame';
import { TitleInput } from './TitleInput';
import { useReference } from './useReference';

export type OutlineFields = { title: string; notes: string; link: string; music: boolean; filled: boolean };

export interface OutlineFormProps {
  st: OutlineFields;
  set: (patch: Partial<OutlineFields>) => void;
  /** The AI is filling the title and notes. */
  ai: boolean;
  onFill: () => void;
  /** Bumped by the screen when a fill has landed. */
  doneKey?: number;
  editingExisting?: boolean;
  /** The last fill was declined: the reason shows where the outline would have gone. */
  declined?: Declined | null;
  /** What the last fill could not read from the link. */
  referenceNote?: string | null;
}

const FIELD = { backgroundColor: color.card, borderRadius: radius.card, ...shadow.card } as const;

/** Outline compose: link row, Fill in with AI, title, Add music toggle, notes. */
export function OutlineForm({ st, set, ai, onFill, doneKey, editingExisting, declined, referenceNote }: OutlineFormProps) {
  const [pasting, setPasting] = useState(false);
  const hasLink = /\S/.test(st.link);
  // The post behind the link is read as soon as it is pasted, so the fill does not wait on it.
  const reference = useReference(editingExisting ? '' : st.link);
  const note = !hasLink ? null : (declined?.referenceNote ?? referenceNote ?? (reference.status === 'failed' ? (reference.reason ?? null) : null));
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
        <View style={{ flexDirection: 'row' }}>
          <AiFillButton label={st.filled ? 'Fill in again' : 'Fill in with AI'} enabled={canAi} phase={ai ? 'writing' : 'idle'} steps={OUTLINE_STEPS} doneKey={doneKey} onPress={onFill} height={52} />
        </View>
      )}
      {declined ? <AiNote body={declined.reason} lines={declined.questions} /> : null}
      {note && !editingExisting ? <AiNote icon="link_off" body={note} /> : null}
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
      {ai && !/\S/.test(st.notes) ? (
        <View style={[FIELD, { minHeight: hasLink ? 132 : 154, paddingVertical: 15, paddingHorizontal: 16, gap: 6 }]}>
          <ShimmerLine width="85%" />
          <ShimmerLine width="70%" />
          <ShimmerLine width="78%" />
          <ShimmerLine width="45%" />
        </View>
      ) : (
      <TextInput
        multiline
        value={st.notes}
        onChangeText={(t) => set({ notes: t })}
        placeholder={hasLink ? 'What changes from the reference' : 'Notes'}
        placeholderTextColor={color.grey3}
        textAlignVertical="top"
        style={[FIELD, { minHeight: hasLink ? 132 : 154, paddingVertical: 15, paddingHorizontal: 16, fontSize: 16, lineHeight: 22, color: color.ink, opacity: ai ? 0.5 : 1 }]}
      />
      )}
    </ScrollView>
  );
}

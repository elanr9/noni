import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { LONG_TEXT_NOTES, longTextPlan, type Declined, type LongTextPlan } from '../../../../lib/brief-ai';
import { toast } from '../../../v2/Toast';
import { stText, type LongTextState, type StText } from '../../../../lib/brief-library';
import { briefs, color, radius, shadow } from '../../../../theme/v2';
import { Icon, Label, Press } from '../../../v2';
import { AiNote } from './AiNote';
import { ClipFrame, ShimmerLine } from './ClipFrame';
import type { AiState } from './GuidedForm';
import { SpinIcon } from './GuidedForm';
import { TextOnScreenEditor } from './TextOnScreenEditor';
import { FIELD, TitleInput } from './TitleInput';

export interface LongTextFormProps {
  lt: LongTextState;
  set: (patch: Partial<LongTextState>) => void;
  ai: AiState | null;
  setAi: (a: AiState | null) => void;
  editingExisting?: boolean;
}

/** The on-screen text style: TikTok classic, centred at 44% (paragraphs) or 40% (one line), 63% wide. */
export function longTextStyle(onScreen: string): Pick<StText, 'y' | 'size' | 'w'> {
  const multi = /\n/.test(onScreen);
  return { y: multi ? 44 : 40, size: multi ? 15 : 24, w: 63 };
}

/** Long Text compose: title, the text on screen, notes. One 7 second clip. */
export function LongTextForm({ lt, set, ai, setAi, editingExisting }: LongTextFormProps) {
  const [edit, setEdit] = useState(false);
  const [declined, setDeclined] = useState<Declined | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);
  const typed = /\S/.test(lt.title);
  const fill = async () => {
    if (!typed || ai) return;
    setDeclined(null);
    setAi({ stage: 'onScreen', i: 0, n: 2 });
    let plan: LongTextPlan | null = null;
    try {
      plan = await longTextPlan(lt.title.trim());
    } catch {
      plan = null;
    }
    if (plan?.declined) {
      setAi(null);
      setDeclined(plan.declined);
      return;
    }
    const screen = plan?.onScreen ?? '';
    if (!plan || !screen) {
      setAi(null);
      toast.error("Couldn't write the text. Check your connection and try again.", { label: 'Retry', onPress: () => void fill() });
      return;
    }
    set({ onScreen: lt.onScreen.trim() || screen, doc: null, ai: plan.ai });
    setAi({ stage: 'notes', i: 1, n: 2 });
    timers.current.push(
      setTimeout(() => {
        set({ notes: lt.notes.trim() || LONG_TEXT_NOTES });
        setAi(null);
      }, 700),
    );
  };
  const pend = (k: string) => !!ai && ai.stage === k;
  const style = longTextStyle(lt.onScreen);
  const text: StText = lt.doc?.texts[0] ?? stText(lt.onScreen, { id: 'lt', ...style, style: 'outline' });
  const W = 96;
  return (
    <>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 10, flexGrow: 1 }}>
        {editingExisting ? null : <Text style={{ textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '700', color: color.grey4 }}>Long Text post</Text>}
        {editingExisting ? null : (
          <Press disabled={!typed || !!ai} onPress={() => void fill()} accessibilityRole="button" style={{ height: 56, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: typed ? color.blue : color.grey1, boxShadow: typed ? briefs.aiGlow : undefined }}>
            <SpinIcon spinning={!!ai} size={22} color={typed ? color.white : color.grey3} />
            <Text style={{ fontSize: 17, fontWeight: '700', color: typed ? color.white : color.grey3 }}>{ai ? 'Filling in' : 'Fill in with AI'}</Text>
          </Press>
        )}
        {declined ? <AiNote body={declined.reason} lines={declined.questions} /> : null}
        <TitleInput value={lt.title} onChange={(t) => set({ title: t })} placeholder="Title" noIdeas={!!editingExisting} type="Long Text" />
        <Press onPress={() => setEdit(true)} accessibilityRole="button" style={{ backgroundColor: color.card, borderRadius: radius.card, padding: 12, flexDirection: 'row', gap: 14, alignItems: 'center', ...shadow.card }}>
          <ClipFrame width={W} height={(W * 16) / 9} radius={12} texts={lt.onScreen ? [{ ...text, text: lt.onScreen }] : []} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Label>Text on screen</Label>
            {pend('onScreen') ? (
              <ShimmerLine />
            ) : (
              <Text numberOfLines={5} style={{ fontSize: 14, lineHeight: 21, fontWeight: lt.onScreen ? '500' : '400', color: lt.onScreen ? color.ink : color.grey3 }}>
                {lt.onScreen || 'Stays up for all 7 seconds'}
              </Text>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Icon name="edit" size={16} color={color.blueDeep} />
              <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '700', color: color.blueDeep }}>{lt.onScreen ? 'Edit' : 'Write it'}</Text>
            </View>
          </View>
        </Press>
        {pend('notes') ? (
          <View style={[FIELD, { flex: 1, minHeight: 140, paddingVertical: 13, paddingHorizontal: 16 }]}>
            <ShimmerLine />
          </View>
        ) : (
          <TextInput
            multiline
            value={lt.notes}
            onChangeText={(t) => set({ notes: t })}
            placeholder="Notes"
            placeholderTextColor={color.grey3}
            textAlignVertical="top"
            style={[FIELD, { flex: 1, minHeight: 140, paddingVertical: 13, paddingHorizontal: 16, fontSize: 16, lineHeight: 22, color: color.ink }]}
          />
        )}
      </ScrollView>
      <TextOnScreenEditor open={edit} title="7 seconds" text={text} onChange={(t) => set({ doc: { texts: t.text.trim() ? [t] : [], overlays: [] }, onScreen: t.text })} onDone={() => setEdit(false)} />
    </>
  );
}

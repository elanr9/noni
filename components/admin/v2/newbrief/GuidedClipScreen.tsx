import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { SlideInRight, SlideOutRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { clipOverlays, clipSeconds, clipTexts, stText, type BriefClip, type BriefType, type GsMedia, type StText } from '../../../../lib/brief-library';
import { useKeyboardHeight } from '../../../../lib/keyboard';
import { color, radius, shadow } from '../../../../theme/v2';
import { Button, Icon, Label, Press, Toggle } from '../../../v2';
import { ClipFrame } from './ClipFrame';
import { TextOnScreenEditor } from './TextOnScreenEditor';

export interface GuidedClipScreenProps {
  c: BriefClip;
  i: number;
  type: BriefType;
  label: string;
  title: string;
  fullGreen: boolean;
  gsAll: GsMedia | null;
  /** Another clip already carries the CTA. */
  ctaTaken: boolean;
  onChange: (patch: Partial<BriefClip>) => void;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onRemove?: () => void;
}

/** One clip: the teleprompter script, the CTA and green screen switches, and the on-screen preview. */
export function GuidedClipScreen({ c, i, type, label, title, fullGreen, gsAll, ctaTaken, onChange, onClose, onPrev, onNext, onRemove }: GuidedClipScreenProps) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const [edit, setEdit] = useState(false);
  const long = type === 'Long Text';
  const isGreen = type === 'Greenscreen';
  const green = isGreen && (fullGreen || c.green);
  const texts = clipTexts(c);
  const overlays = clipOverlays(c);
  const words = c.text.trim() ? c.text.trim().split(/\s+/).length : 0;
  const nb = (name: 'chevron_left' | 'chevron_right', fn?: () => void) => (
    <Press key={name} accessibilityLabel={name === 'chevron_left' ? 'Previous clip' : 'Next clip'} disabled={!fn} onPress={fn} style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center', opacity: fn ? 1 : 0.35, ...shadow.card }}>
      <Icon name={name} size={22} color={color.ink} />
    </Press>
  );
  const editText: StText = texts[0] ?? stText('', { id: `${c.id}-t`, y: 26, size: 20 });
  return (
    <Animated.View entering={SlideInRight.duration(240)} exiting={SlideOutRight.duration(200)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.bg, paddingTop: insets.top, paddingBottom: keyboard, zIndex: 5 }}>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingLeft: 4, paddingRight: 16, gap: 6 }}>
        <Press accessibilityLabel="Back" onPress={onClose} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevron_left" size={32} color={color.ink} />
        </Press>
        <Text style={{ flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '600', color: color.ink }}>{label}</Text>
        {!long ? (
          <>
            {nb('chevron_left', onPrev)}
            {nb('chevron_right', onNext)}
          </>
        ) : null}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 10 }}>
        {!long && i > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4, paddingBottom: 2 }}>
            <Icon name="bolt" size={18} color={c.cta ? color.blue : color.grey3} />
            <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', color: ctaTaken ? color.grey3 : color.ink }}>{ctaTaken ? 'CTA is on another clip' : 'CTA'}</Text>
            <Toggle small on={c.cta} onChange={(v) => !ctaTaken && onChange({ cta: v })} accessibilityLabel="CTA" />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2, marginHorizontal: 4 }}>
          <Label>Script</Label>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="subtitles" size={14} color={color.grey4} />
            <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: color.grey4 }}>{long ? '7 seconds' : 'Teleprompter'}</Text>
          </View>
        </View>
        <View style={{ borderRadius: 18, backgroundColor: color.ink, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 10, ...shadow.card }}>
          <TextInput
            autoFocus={!c.text}
            multiline
            value={c.text}
            onChangeText={(t) => onChange({ text: t })}
            placeholder={long ? 'One or two sentences the creator says' : 'What the creator reads, word for word'}
            placeholderTextColor="rgba(255,255,255,0.4)"
            style={{ minHeight: long ? 84 : 112, fontSize: 20, lineHeight: 28, fontWeight: '700', color: color.white, padding: 0 }}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: 'rgba(255,255,255,0.5)' }}>{words ? `${words} words · about ${clipSeconds(c, type)}s` : 'Shown to the creator while filming'}</Text>
            <View style={{ width: 28, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' }} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginHorizontal: 4 }}>
          <Label>On screen</Label>
          {!long && isGreen ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: green ? color.green : color.grey4 }}>{fullGreen ? 'Full green screen' : 'Green screen'}</Text>
              <Toggle small on={green} onChange={(v) => !fullGreen && onChange({ green: v })} accessibilityLabel="Green screen" />
            </View>
          ) : null}
        </View>
        <Press onPress={() => setEdit(true)} accessibilityRole="button" style={{ backgroundColor: color.card, borderRadius: radius.card, padding: 12, flexDirection: 'row', gap: 14, alignItems: 'center', ...shadow.card }}>
          <ClipFrame width={120} height={(120 * 16) / 9} radius={12} texts={texts} overlays={overlays} green={green} gs={c.gs || (fullGreen ? gsAll : null)} />
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', color: color.ink }}>{texts.length || overlays.length ? `${texts.length} text, ${overlays.length} ${overlays.length === 1 ? 'overlay' : 'overlays'}` : 'Nothing on screen yet'}</Text>
            <Text numberOfLines={3} style={{ fontSize: 13, lineHeight: 18, color: color.grey4 }}>
              {texts.length ? texts.map((x) => x.text).join(' · ') : long ? title || 'Text stays up for all 7 seconds' : 'Text and overlays stay up for the whole clip'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Icon name="edit" size={16} color={color.blueDeep} />
              <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '700', color: color.blueDeep }}>Edit on screen</Text>
            </View>
          </View>
        </Press>
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8, paddingTop: 12, paddingHorizontal: 20, paddingBottom: keyboard ? 12 : Math.max(insets.bottom, 20) + 14, backgroundColor: color.card, ...shadow.footer }}>
        {onRemove ? <Button variant="amber" label="Remove" onPress={onRemove} style={{ flex: 0, paddingHorizontal: 20 }} /> : null}
        <Button label="Done" onPress={onClose} />
      </View>
      <TextOnScreenEditor
        open={edit}
        title={long ? '7 seconds' : label}
        text={editText}
        green={green}
        gs={c.gs || (fullGreen ? gsAll : null)}
        onChange={(t) => onChange({ doc: { texts: t.text.trim() ? [t] : [], overlays }, onScreen: t.text.trim() })}
        onDone={() => setEdit(false)}
      />
    </Animated.View>
  );
}

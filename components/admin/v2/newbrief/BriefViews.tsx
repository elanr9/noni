import { useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { clipLabel, clipOverlays, clipTexts, stText, type BriefType, type GuidedState, type LongTextState, type StText } from '../../../../lib/brief-library';
import { color, radius, shadow } from '../../../../theme/v2';
import { Icon, Label, Press } from '../../../v2';
import { ClipFrame } from './ClipFrame';
import { longTextStyle } from './LongTextForm';
import { TextOnScreenEditor } from './TextOnScreenEditor';

const CARD18 = { backgroundColor: color.card, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, gap: 8, ...shadow.card } as const;

function NotesCard({ label, body, tags }: { label: string; body: string; tags?: string[] }) {
  return (
    <View style={CARD18}>
      <Label>{label}</Label>
      <Text style={{ fontSize: 15, lineHeight: 21, color: color.ink }}>{body}</Text>
      {tags && tags.length ? <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '500', color: color.blueDeep }}>{tags.join(' ')}</Text> : null}
    </View>
  );
}

/** Read-only template: full title, 3-column dark clip cards, Notes and Caption. `script` adds what the creator says, clip by clip. */
export function TemplateView({ g, type, onOpenClip, script }: { g: GuidedState; type: BriefType; onOpenClip: (id: string) => void; script?: boolean }) {
  const { width } = useWindowDimensions();
  const cols = type === 'Long Text' ? 2 : 3;
  const gap = 8;
  const tileW = (width - 40 - gap * (cols - 1)) / cols;
  return (
    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: 16, gap: 14 }}>
      <Text style={{ fontSize: 21, lineHeight: 26, fontWeight: '800', letterSpacing: -0.4, color: color.ink, paddingHorizontal: 2 }}>{g.title || 'Untitled'}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
        {g.clips.map((c, i) => (
          <Press key={c.id} onPress={() => onOpenClip(c.id)} accessibilityRole="button" style={{ width: tileW, borderRadius: 14, overflow: 'hidden', backgroundColor: color.card, ...shadow.card }}>
            <ClipFrame width={tileW} height={tileW * 1.1} texts={clipTexts(c)} overlays={clipOverlays(c)} />
            <Text numberOfLines={1} style={{ paddingTop: 5, paddingHorizontal: 8, paddingBottom: 6, fontSize: 12, lineHeight: 15, fontWeight: '700', color: c.cta ? color.blueDeep : color.ink }}>
              {clipLabel(i, type)}
              {c.cta ? ' (CTA)' : ''}
            </Text>
          </Press>
        ))}
      </View>
      {script && g.clips.some((c) => /\S/.test(c.text)) ? (
        <View style={CARD18}>
          <Label>Script</Label>
          {g.clips.map((c, i) =>
            /\S/.test(c.text) ? (
              <View key={c.id} style={{ gap: 1 }}>
                <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', color: c.cta ? color.blueDeep : color.grey4 }}>{c.cta ? 'CTA' : clipLabel(i, type)}</Text>
                <Text style={{ fontSize: 15, lineHeight: 21, color: color.ink }}>{c.text}</Text>
              </View>
            ) : null,
          )}
        </View>
      ) : null}
      {g.angle ? <NotesCard label="Angle" body={g.angle} /> : null}
      {g.notes ? <NotesCard label="Notes" body={g.notes} /> : null}
      {g.caption ? <NotesCard label="Caption" body={g.caption} tags={g.tags} /> : null}
    </ScrollView>
  );
}

/** Read-only Long Text: title, the 120px preview with the on-screen text, Notes. */
export function LongTextView({ lt, onChange }: { lt: LongTextState; onChange: (patch: Partial<LongTextState>) => void }) {
  const [edit, setEdit] = useState(false);
  const style = longTextStyle(lt.onScreen);
  const text: StText = lt.doc?.texts[0] ?? stText(lt.onScreen, { id: 'lt', ...style, style: 'outline' });
  return (
    <>
      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 20, paddingBottom: 24, gap: 16 }}>
        <Text style={{ fontSize: 24, lineHeight: 29, fontWeight: '800', letterSpacing: -0.5, color: color.ink, paddingHorizontal: 2 }}>{lt.title || 'Untitled'}</Text>
        <Press onPress={() => setEdit(true)} accessibilityRole="button" style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
          <ClipFrame width={120} height={(120 * 16) / 9} radius={14} texts={lt.onScreen ? [{ ...text, text: lt.onScreen }] : []} style={shadow.card} />
          <View style={{ flex: 1, minWidth: 0, gap: 6, paddingTop: 4 }}>
            <Label>On screen</Label>
            <Text style={{ fontSize: 15, lineHeight: 21, fontWeight: '600', color: color.ink }}>{lt.onScreen || 'Nothing yet'}</Text>
            <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: '500', color: color.grey4 }}>7 seconds</Text>
          </View>
        </Press>
        {lt.notes ? <NotesCard label="Notes" body={lt.notes} /> : null}
      </ScrollView>
      <TextOnScreenEditor open={edit} title="7 seconds" text={text} onChange={(t) => onChange({ doc: { texts: t.text.trim() ? [t] : [], overlays: [] }, onScreen: t.text })} onDone={() => setEdit(false)} />
    </>
  );
}

/** Read-only Outline: link row, title, sound line, Notes. */
export function OutlineView({ title, link, music, notes }: { title: string; link: string; music: boolean; notes: string }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 20, paddingBottom: 24, gap: 12 }}>
      {/\S/.test(link) ? (
        <View style={{ height: 56, borderRadius: radius.card, backgroundColor: color.card, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, ...shadow.card }}>
          <Icon name="link" size={22} color={color.blueDeep} />
          <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: 20, fontWeight: '500', color: color.blueDeep }}>
            {link}
          </Text>
        </View>
      ) : null}
      <Text style={{ fontSize: 24, lineHeight: 29, fontWeight: '800', letterSpacing: -0.5, color: color.ink, paddingTop: 4, paddingHorizontal: 2, paddingBottom: 2 }}>{title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 }}>
        <Icon name={music ? 'music_note' : 'music_off'} size={18} color={color.grey4} />
        <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '500', color: color.grey4 }}>{music ? 'Creator picks a sound' : 'No sound'}</Text>
      </View>
      {notes ? <NotesCard label="Notes" body={notes} /> : null}
    </ScrollView>
  );
}

// Brief detail pieces shared by the creator's Outline and Long Text screens
// (V2Library.jsx BriefHero, BriefNotes, BriefBeats).
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TYPE_META, stText, type Brief, type BriefClip } from '../../../lib/brief-library';
import { color, radius, shadow, tone as tones } from '../../../theme/v2';
import { GradientFill } from '../../admin/v2/newbrief/ClipFrame';
import { Chip, Icon, Label } from '../../v2';
import { StTextView } from '../../v2/StTextView';

export function BriefHero({ b, chips }: { b: Pick<Brief, 'type' | 'title'>; chips?: ReactNode }) {
  const m = TYPE_META[b.type] ?? TYPE_META['Talking Head'];
  const t = tones[m.tone];
  return (
    <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
      <GradientFill colors={[t.tint, color.card]} deg={160} style={StyleSheet.absoluteFill} />
      <View style={{ paddingTop: 22, paddingHorizontal: 20, paddingBottom: 18, gap: 14 }}>
        <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: t.fg, alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(16,24,40,0.14)' }}>
          <Icon name={m.icon} size={28} weight={700} color={color.white} />
        </View>
        <Text style={{ fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.3, color: color.ink }}>{b.title}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Chip tone={m.tone} label={b.type} />
          {chips}
        </View>
      </View>
    </View>
  );
}

export function BriefNotes({ notes }: { notes: string }) {
  if (!notes.trim()) return null;
  return (
    <View style={[styles.card, { flexDirection: 'row', gap: 14, paddingVertical: 16, paddingHorizontal: 18 }]}>
      <View style={{ width: 3, borderRadius: 2, backgroundColor: color.blue }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Label style={{ fontSize: 12, letterSpacing: 0.5, marginBottom: 6 }}>Direction</Label>
        <Text style={styles.body}>{notes}</Text>
      </View>
    </View>
  );
}

/** Hook, points and close as a numbered rail. */
export function BriefBeats({ clips }: { clips: BriefClip[] }) {
  const n = clips.length;
  const name = (i: number) => (n === 1 ? 'Line' : i === 0 ? 'Hook' : i === n - 1 ? 'Close' : `Point ${i}`);
  return (
    <View style={[styles.card, { paddingTop: 18, paddingHorizontal: 18, paddingBottom: 8 }]}>
      <Label style={{ fontSize: 12, letterSpacing: 0.5, marginBottom: 12 }}>{`${n} ${n === 1 ? 'beat' : 'beats'}`}</Label>
      {clips.map((c, i) => (
        <View key={c.id ?? i} style={{ flexDirection: 'row', gap: 14, paddingBottom: i === n - 1 ? 10 : 18 }}>
          <View style={{ width: 28, alignItems: 'center' }}>
            <View style={{ width: 28, height: 28, borderRadius: radius.pill, backgroundColor: i === 0 ? color.blue : color.blueTint, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, lineHeight: 28, fontWeight: '700', color: i === 0 ? color.white : color.blueDeep }}>{i + 1}</Text>
            </View>
            {i < n - 1 ? <View style={{ width: 2, flex: 1, backgroundColor: color.grey1, marginTop: 4 }} /> : null}
          </View>
          <View style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
            <Text style={{ fontSize: 13, lineHeight: 16, fontWeight: '700', color: color.grey4, marginBottom: 3 }}>{name(i)}</Text>
            <Text style={styles.body}>{c.text || c.onScreen || ''}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** A 7 second text post: the words in a small 9:16 frame and in full beside it. */
export function LongTextCard({ text: words }: { text: string }) {
  const W = 72;
  const H = 128;
  const x = stText(words, { x: 50, y: 46, w: 88, size: 22, style: 'none', color: '#FFFFFF' });
  return (
    <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
      <View style={{ width: W, height: H, borderRadius: 10, overflow: 'hidden', backgroundColor: '#1A1A1F' }}>
        <GradientFill colors={['#2B2B31', '#1A1A1F']} deg={180} style={StyleSheet.absoluteFill} />
        <StTextView x={x} width={W} height={H} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Label style={{ marginBottom: 6 }}>On screen</Label>
        <Text style={styles.body}>{words}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: 16, marginBottom: 12, ...shadow.card },
  body: { fontSize: 16, lineHeight: 23, color: color.ink },
});

import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { AUDIO_LIB, AU_SUGGEST, searchTracks, trackBars, trackLength, trackUses, type LibraryTrack } from '../../../../lib/audio-library';
import type { AudioTrack } from '../../../../lib/brief-library';
import { color, radius, shadow } from '../../../../theme/v2';
import { Button, Icon, Label, Press, Sheet } from '../../../v2';
import { AudioCover } from './AudioCover';

/** A chosen sound: the track, where it starts and the mix. */
export type AudioPick = { track: AudioTrack; start: number; vol: number; voice: number };

export interface AudioSheetProps {
  open: boolean;
  onClose: () => void;
  /** Video length in seconds; the trim window. */
  len?: number;
  value: AudioPick | null;
  onChange: (v: AudioPick) => void;
  title?: string;
}

/** Search a sound, preview it, then trim: the window stays put and the waveform scrolls under it. */
export function AudioSheet({ open, onClose, len = 15, value, onChange, title = 'Add sound' }: AudioSheetProps) {
  const [q, setQ] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(() => new Set(['s2']));
  const [draft, setDraft] = useState<AudioPick | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQ('');
      setPlaying(null);
      setDraft(value && value.track ? { ...value } : null);
    }
  }
  const results = searchTracks(q);
  const pick = (t: LibraryTrack) => {
    setPlaying(t.id);
    setDraft({ track: t, start: value && value.track && value.track.id === t.id ? value.start : 0, vol: value ? value.vol : 100, voice: value ? value.voice : 100 });
  };
  const toggleSave = (id: string) =>
    setSaved((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const row = (t: LibraryTrack) => (
    <AudioRow key={t.id} t={t} playing={playing === t.id} onPlay={() => setPlaying(playing === t.id ? null : t.id)} onPick={() => pick(t)} saved={saved.has(t.id)} onSave={() => toggleSave(t.id)} />
  );
  const section = (label: string, list: LibraryTrack[]) =>
    list.length ? (
      <View key={label}>
        <Label style={{ marginTop: 10, marginBottom: 2 }}>{label}</Label>
        {list.map(row)}
      </View>
    ) : null;
  const trending = AUDIO_LIB.filter((t) => t.trend);
  const forYou = AUDIO_LIB.filter((t) => t.tags.includes('soccer') || t.tags.includes('sport') || t.tags.includes('tutorial'));
  const savedList = AUDIO_LIB.filter((t) => saved.has(t.id));
  const footer = draft ? (
    <Button
      label="Use this sound"
      onPress={() => {
        onChange(draft);
        onClose();
      }}
    />
  ) : undefined;
  return (
    <Sheet open={open} onClose={onClose} title={draft ? undefined : title} footer={footer}>
      {draft ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: -6 }}>
            <Press
              accessibilityLabel="Back to search"
              onPress={() => {
                setDraft(null);
                setPlaying(null);
              }}
              style={{ width: 40, height: 40, marginLeft: -10, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="chevron_left" size={28} color={color.ink} />
            </Press>
            <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', color: color.ink }}>Trim</Text>
          </View>
          <AudioTrim t={draft.track} len={len} value={draft} onChange={setDraft} />
        </>
      ) : (
        <>
          <View style={{ height: 48, borderRadius: 14, backgroundColor: color.grey1, flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 6 }}>
            <Icon name="search" size={22} color={color.grey3} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search sounds, artists, moods"
              placeholderTextColor={color.grey3}
              autoCorrect={false}
              style={{ flex: 1, height: 48, paddingHorizontal: 8, fontSize: 16, color: color.ink }}
            />
            {q ? (
              <Press accessibilityLabel="Clear" onPress={() => setQ('')} style={{ width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="cancel" size={20} color={color.grey3} />
              </Press>
            ) : null}
          </View>
          {!q ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6, paddingTop: 10, paddingBottom: 2 }}>
              {AU_SUGGEST.map((s) => (
                <Press key={s} onPress={() => setQ(s)} style={{ height: 32, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: color.grey1, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: color.ink }}>{s}</Text>
                </Press>
              ))}
            </ScrollView>
          ) : null}
          <View style={{ marginTop: 4, maxHeight: 380 }}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} nestedScrollEnabled>
              {results ? (
                results.length ? (
                  <>
                    {section('Music', results.filter((t) => t.kind === 'music'))}
                    {section('Original sounds', results.filter((t) => t.kind === 'original'))}
                  </>
                ) : (
                  <Text style={{ paddingVertical: 24, textAlign: 'center', fontSize: 15, lineHeight: 20, color: color.grey4 }}>{`No sounds for "${q}"`}</Text>
                )
              ) : (
                <>
                  {section('Trending', trending)}
                  {section('For this post', forYou.filter((t) => !t.trend))}
                  {section('Saved', savedList)}
                </>
              )}
            </ScrollView>
          </View>
        </>
      )}
    </Sheet>
  );
}

function AudioRow({ t, playing, onPlay, onPick, saved, onSave }: { t: LibraryTrack; playing: boolean; onPlay: () => void; onPick: () => void; saved: boolean; onSave: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      <Press accessibilityLabel={playing ? 'Pause' : 'Preview'} onPress={onPlay} style={{ borderRadius: 10 }}>
        <AudioCover t={t} playing={playing} />
        {!playing ? (
          <View style={{ position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: radius.pill, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center', ...shadow.card }}>
            <Icon name="play_arrow" size={14} color={color.ink} />
          </View>
        ) : null}
      </Press>
      <Press onPress={onPick} style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: color.ink, flexShrink: 1 }}>
            {t.title}
          </Text>
          {t.trend ? <Icon name="trending_up" size={16} color={color.blue} /> : null}
        </View>
        <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 16, color: color.grey4 }}>
          {t.artist} · {trackLength(t.dur)} · {trackUses(t.uses)}
        </Text>
      </Press>
      <Press accessibilityLabel="Save" onPress={onSave} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="bookmark" size={22} color={saved ? color.ink : color.grey3} />
      </Press>
    </View>
  );
}

const PX = 12;

/** Trim: the window is the video length and stays put; drag the waveform under it. */
function AudioTrim({ t, len, value, onChange }: { t: AudioTrack; len: number; value: AudioPick; onChange: (v: AudioPick) => void }) {
  const [W, setW] = useState(300);
  const bars = useMemo(() => trackBars(t.id, Math.ceil((t.dur * PX) / 4)), [t.id, t.dur]);
  const loops = len > t.dur;
  const eff = Math.min(len, t.dur);
  const winW = Math.min(W, Math.max(40, eff * PX));
  const pad = (W - winW) / 2;
  const maxStart = Math.max(0, t.dur - eff);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const s = Math.min(maxStart, Math.max(0, e.nativeEvent.contentOffset.x / PX));
    if (Math.abs(s - value.start) > 0.05) onChange({ ...value, start: s });
  };
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <AudioCover t={t} size={64} playing />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', color: color.ink }}>
            {t.title}
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 18, color: color.grey4 }}>
            {t.artist} · {trackLength(t.dur)}
          </Text>
        </View>
      </View>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: 84, borderRadius: 16, backgroundColor: color.grey1, overflow: 'hidden' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16} contentOffset={{ x: value.start * PX, y: 0 }} contentContainerStyle={{ alignItems: 'center', gap: 2, height: 84, paddingLeft: pad, paddingRight: W - pad - winW }}>
          {bars.map((h, i) => {
            const x = i * 4;
            const inWin = x >= value.start * PX && x < (value.start + eff) * PX;
            return <View key={i} style={{ width: 2, height: h * 54, borderRadius: 1, backgroundColor: inWin ? color.blue : color.grey3 }} />;
          })}
        </ScrollView>
        <View pointerEvents="none" style={{ position: 'absolute', left: pad, width: winW, top: 6, bottom: 6, borderRadius: 10, borderWidth: 2, borderColor: color.ink }} />
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, width: pad, top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.35)' }} />
        <View pointerEvents="none" style={{ position: 'absolute', left: pad + winW, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.35)' }} />
        <Text style={{ position: 'absolute', left: pad + 8, top: 10, fontSize: 11, lineHeight: 14, fontWeight: '700', color: color.ink, backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 6, paddingHorizontal: 5, overflow: 'hidden' }}>{trackLength(value.start)}</Text>
        <Text style={{ position: 'absolute', right: W - pad - winW + 8, top: 10, fontSize: 11, lineHeight: 14, fontWeight: '700', color: color.ink, backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 6, paddingHorizontal: 5, overflow: 'hidden' }}>{trackLength(value.start + eff)}</Text>
      </View>
      <Text style={{ fontSize: 13, lineHeight: 16, color: color.grey4, textAlign: 'center' }}>{loops ? 'Sound loops to fit your video' : 'Drag the sound to choose where it starts'}</Text>
      <View style={{ gap: 8 }}>
        <MixSlider label="Sound" value={value.vol} onChange={(v) => onChange({ ...value, vol: v })} />
        <MixSlider label="Your voice" value={value.voice} onChange={(v) => onChange({ ...value, voice: v })} />
      </View>
    </View>
  );
}

/** 0 to 100 slider: label, blue fill on a grey-2 track, value at right. */
function MixSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [w, setW] = useState(1);
  const set = (x: number) => onChange(Math.round(Math.max(0, Math.min(100, (x / w) * 100))));
  const pan = Gesture.Pan()
    .onBegin((e) => {
      runOnJS(set)(e.x);
    })
    .onUpdate((e) => {
      runOnJS(set)(e.x);
    });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={{ width: 96, fontSize: 13, lineHeight: 16, fontWeight: '600', color: color.ink }}>{label}</Text>
      <GestureDetector gesture={pan}>
        <View onLayout={(e) => setW(Math.max(1, e.nativeEvent.layout.width))} style={{ flex: 1, height: 32, justifyContent: 'center' }} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ now: value, min: 0, max: 100 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: color.grey2 }}>
            <View style={{ width: `${value}%`, height: 4, borderRadius: 2, backgroundColor: color.blue }} />
          </View>
          <View pointerEvents="none" style={{ position: 'absolute', left: `${value}%`, marginLeft: -10, width: 20, height: 20, borderRadius: radius.pill, backgroundColor: color.card, boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }} />
        </View>
      </GestureDetector>
      <Text style={{ width: 36, textAlign: 'right', fontSize: 13, lineHeight: 16, fontWeight: '600', color: color.grey4, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

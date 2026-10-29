import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { planGuided } from '../../../../lib/brief-ai';
import { clipLabel, newClip, type AudioTrack, type BriefClip, type BriefType, type GsMedia, type GuidedState } from '../../../../lib/brief-library';
import { color, radius, shadow } from '../../../../theme/v2';
import { Icon, Label, Option, Press, Sheet, Toggle, tap } from '../../../v2';
import { AudioCover } from '../audio/AudioCover';
import { AudioSheet } from '../audio/AudioSheet';
import { ClipGrid } from './ClipGrid';
import { MediaFill, ShimmerLine } from './ClipFrame';
import { GuidedClipScreen } from './GuidedClipScreen';
import { LinkDialog } from './LinkDialog';
import { MediaPickerSheet } from './MediaPickerSheet';
import { FIELD, TitleInput } from './TitleInput';

/** Where the staged fill is: `title`, `clip0..n`, `caption`. */
export type AiState = { stage: string; i: number; n: number };

export interface GuidedFormProps {
  g: GuidedState;
  type: BriefType;
  update: (fn: (cur: GuidedState) => GuidedState) => void;
  ai: AiState | null;
  setAi: (a: AiState | null) => void;
  /** Editing a saved brief: no step label, no link or AI row, no title ideas. */
  editingExisting?: boolean;
}

const BIG = { height: 56, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, flex: 1, minWidth: 0 } as const;

/** Guided compose: pinned Add link / Fill in with AI, then title, sound, notes and the clip grid. */
export function GuidedForm({ g, type, update, ai, setAi, editingExisting }: GuidedFormProps) {
  const set = (patch: Partial<GuidedState>) => update((cur) => ({ ...cur, ...patch }));
  const setClip = (id: string, patch: Partial<BriefClip>) => update((cur) => ({ ...cur, clips: cur.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const [open, setOpen] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const [soundPick, setSoundPick] = useState(false);
  const [gsPick, setGsPick] = useState<'all' | string | null>(null);
  const [dragging, setDragging] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  const long = type === 'Long Text', isGreen = type === 'Greenscreen', slides = type === 'Slideshow';
  const au = g.audio || { mode: null, track: null };
  const setAu = (p: Partial<GuidedState['audio']>) => set({ audio: { ...au, ...p } });
  const auLabel = au.mode === 'none' ? 'No sound' : au.mode === 'pick' && au.track ? `${au.track.title} · ${au.track.artist}` : au.mode === 'creator' ? 'Creator picks a sound' : '(optional)';
  const typed = /\S/.test(g.title) || /\S/.test(g.link) || g.clips.some((c) => /\S/.test(c.text));
  const locked = !!(g.filled || ai) && !g.link;

  const fill = () => {
    if (!typed || ai) return;
    tap();
    const plan = planGuided(g, type);
    const steps: [string, () => void][] = [];
    steps.push(['title', () => set({ title: plan.title, phrase: plan.phrase })]);
    plan.clips.forEach((c, i) =>
      steps.push([
        `clip${i}`,
        () =>
          update((cur) => {
            const clips = cur.clips.slice();
            if (i < clips.length && /\S/.test(clips[i].text)) return cur;
            const prev = clips[i];
            clips[i] = {
              ...(prev || c),
              text: c.text,
              onScreen: c.onScreen,
              cta: c.cta,
              doc: prev?.doc ?? c.doc ?? null,
              ...(type === 'Greenscreen' && !cur.fullGreen ? { green: c.green, gs: prev?.gs || c.gs } : {}),
            };
            return { ...cur, clips };
          }),
      ]),
    );
    steps.push(['caption', () => set({ caption: plan.caption, tags: plan.tags, filled: true })]);
    setAi({ stage: 'title', i: 0, n: steps.length });
    steps.forEach(([, run], i) =>
      timers.current.push(
        setTimeout(() => {
          run();
          setAi(i === steps.length - 1 ? null : { stage: steps[i + 1][0], i: i + 1, n: steps.length });
        }, 600 + i * 520),
      ),
    );
  };
  const pend = (k: string) => !!ai && (ai.stage === k || (k.startsWith('clip') && ai.stage.startsWith('clip') && +ai.stage.slice(4) <= +k.slice(4)));
  const justFilled = (i: number) => !!ai && (ai.stage === `clip${i + 1}` || (ai.stage === 'caption' && i === g.clips.length - 1));

  const cur = open ? g.clips.find((c) => c.id === open) : null;
  const curIdx = cur ? g.clips.indexOf(cur) : -1;
  const gsLabel = g.gs ? (g.gs.kind === 'video' ? `Video, ${g.gs.dur}s. Creators record to its length` : 'Image, untimed') : 'Add an image or video';

  return (
    <>
      {editingExisting ? null : (
        <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 10 }}>
          <Text style={{ textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '700', color: color.grey4 }}>{long ? 'Long Text post' : 'Guided post'}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Press
              disabled={locked}
              onPress={() => setLinkOpen(true)}
              accessibilityRole="button"
              style={[BIG, { backgroundColor: g.link ? color.blueTint : locked ? color.grey1 : color.card, boxShadow: g.link || locked ? undefined : shadow.card.boxShadow }]}
            >
              <Icon name={g.link ? 'link' : locked ? 'link_off' : 'link'} size={20} color={g.link ? color.blueDeep : locked ? color.grey3 : color.grey4} />
              <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '700', color: g.link ? color.blueDeep : locked ? color.grey3 : color.ink }}>
                {g.link ? 'Link added' : 'Add link'}
              </Text>
            </Press>
            <Press disabled={!typed || !!ai} onPress={fill} accessibilityRole="button" style={[BIG, { backgroundColor: typed ? color.blue : color.grey1, boxShadow: typed ? '0 6px 16px rgba(27,166,238,0.35)' : undefined }]}>
              <SpinIcon spinning={!!ai} color={typed ? color.white : color.grey3} />
              <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '700', color: typed ? color.white : color.grey3 }}>
                {ai ? `Filling ${ai.i + 1} of ${ai.n}` : 'Fill in with AI'}
              </Text>
            </Press>
          </View>
          {g.link ? (
            <TextInput
              value={g.linkNotes}
              onChangeText={(t) => set({ linkNotes: t })}
              placeholder="What changes from the reference"
              placeholderTextColor={color.grey3}
              style={[FIELD, { paddingVertical: 11, paddingHorizontal: 16, fontSize: 16, lineHeight: 22, color: color.ink }]}
            />
          ) : null}
        </View>
      )}
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} scrollEnabled={!dragging} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 2, paddingHorizontal: 20, paddingBottom: 12, gap: 10 }}>
        {pend('title') ? (
          <View style={[FIELD, { paddingVertical: 13, paddingHorizontal: 16 }]}>
            <ShimmerLine />
          </View>
        ) : (
          <TitleInput value={g.title} onChange={(t) => set({ title: t })} placeholder="Title" noIdeas={!!editingExisting} />
        )}
        <Press onPress={() => setSoundOpen(true)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10, paddingBottom: 10, paddingLeft: 14, paddingRight: 12, borderRadius: radius.card, backgroundColor: color.card, ...shadow.card }}>
          {au.mode === 'pick' && au.track ? (
            <AudioCover t={au.track} size={36} />
          ) : (
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: au.mode === 'none' || !au.mode ? color.grey1 : color.blueTint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={au.mode === 'none' ? 'music_off' : 'music_note'} size={20} color={au.mode === 'none' || !au.mode ? color.grey3 : color.blueDeep} />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: color.ink }}>Sound</Text>
            <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 16, color: color.grey4 }}>
              {auLabel}
            </Text>
          </View>
          <Icon name="chevron_right" size={22} color={color.grey3} />
        </Press>
        <View style={{ backgroundColor: color.card, borderRadius: radius.card, paddingTop: 10, paddingHorizontal: 16, paddingBottom: 12, gap: 4, ...shadow.card }}>
          <Label>Notes</Label>
          <TextInput multiline value={g.notes || ''} onChangeText={(t) => set({ notes: t })} placeholder="Add a note" placeholderTextColor={color.grey3} style={{ fontSize: 15, lineHeight: 21, color: color.ink, padding: 0, minHeight: 21 }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2, marginHorizontal: 4 }}>
          <Label>{long ? 'Clip' : slides ? 'Slides' : 'Clips'}</Label>
          {long ? (
            <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: color.grey4 }}>7 seconds, one take</Text>
          ) : isGreen ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: color.grey4 }}>Same for whole video</Text>
              <Toggle small on={!!g.fullGreen} onChange={(v) => set({ fullGreen: v })} accessibilityLabel="Same for whole video" />
            </View>
          ) : null}
        </View>
        {isGreen && g.fullGreen ? (
          <Press onPress={() => setGsPick('all')} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.card, backgroundColor: color.card, ...shadow.card }}>
            <View style={{ width: 44, height: 58, borderRadius: 8, overflow: 'hidden' }}>
              <MediaFill src={g.gs?.src} />
              {g.gs && g.gs.kind === 'video' ? (
                <Text style={{ position: 'absolute', right: 3, bottom: 3, height: 14, paddingHorizontal: 4, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.6)', color: color.white, fontSize: 9, lineHeight: 14, fontWeight: '700' }}>
                  {Math.floor(g.gs.dur / 60)}:{String(g.gs.dur % 60).padStart(2, '0')}
                </Text>
              ) : null}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: color.ink }}>Background</Text>
              <Text style={{ fontSize: 13, lineHeight: 16, color: g.gs ? color.grey4 : color.grey3 }}>{gsLabel}</Text>
            </View>
            <Icon name={g.gs ? 'swap_horiz' : 'add'} size={22} color={color.grey3} />
          </Press>
        ) : null}
        <ClipGrid
          clips={g.clips}
          type={type}
          isGreen={isGreen}
          fullGreen={!!g.fullGreen}
          gsAll={g.gs}
          pending={(i) => pend(`clip${i}`)}
          justFilled={justFilled}
          onOpen={(id) => setOpen(id)}
          onAdd={() => {
            const c = newClip('');
            set({ clips: g.clips.concat([c]) });
            setOpen(c.id);
          }}
          onReorder={(from, to) =>
            update((cur) => {
              const a = cur.clips.slice();
              const [m] = a.splice(from, 1);
              a.splice(to, 0, m);
              return { ...cur, clips: a };
            })
          }
          onToggleGreen={(id) => update((cur) => ({ ...cur, clips: cur.clips.map((c) => (c.id === id ? { ...c, green: !c.green } : c)) }))}
          onDragging={setDragging}
        />
      </ScrollView>

      <Sheet open={soundOpen} onClose={() => setSoundOpen(false)} title="Sound">
        <Option
          on={au.mode === 'none'}
          meta="Voice only"
          onPress={() => {
            setAu({ mode: 'none' });
            setSoundOpen(false);
          }}
        >
          No sound
        </Option>
        <Option
          on={au.mode === 'pick'}
          meta={au.track ? `${au.track.title} · ${au.track.artist}` : 'Search the library'}
          onPress={() => {
            setAu({ mode: 'pick' });
            setSoundOpen(false);
            timers.current.push(setTimeout(() => setSoundPick(true), 340));
          }}
        >
          Choose the sound
        </Option>
        <Option
          on={au.mode === 'creator'}
          meta="On Instagram and TikTok"
          onPress={() => {
            setAu({ mode: 'creator' });
            setSoundOpen(false);
          }}
        >
          Creator picks a sound
        </Option>
      </Sheet>
      <AudioSheet
        open={soundPick}
        onClose={() => setSoundPick(false)}
        len={Math.max(6, g.clips.length * 6)}
        value={au.track ? { track: au.track, start: 0, vol: 100, voice: 100 } : null}
        onChange={(v) => {
          const t: AudioTrack = { id: v.track.id, title: v.track.title, artist: v.track.artist, dur: v.track.dur, cover: v.track.cover ?? null };
          setAu({ mode: 'pick', track: t });
        }}
        title="Choose the sound"
      />
      <LinkDialog open={linkOpen} link={g.link || ''} onClose={() => setLinkOpen(false)} onAdd={(link) => set({ link })} onRemove={() => set({ link: '', linkNotes: '' })} />
      <MediaPickerSheet
        open={!!gsPick}
        onClose={() => setGsPick(null)}
        onPick={(m: GsMedia) => {
          if (gsPick === 'all') set({ gs: m, clips: g.clips.map((c) => ({ ...c, gs: null })) });
          else if (gsPick) setClip(gsPick, { gs: m });
        }}
      />
      {cur ? (
        <GuidedClipScreen
          key={cur.id}
          c={cur}
          i={curIdx}
          type={type}
          label={clipLabel(curIdx, type)}
          title={g.title}
          fullGreen={!!g.fullGreen}
          gsAll={g.gs}
          ctaTaken={g.clips.some((x) => x.cta && x.id !== cur.id)}
          onChange={(patch) => setClip(cur.id, patch)}
          onClose={() => setOpen(null)}
          onPrev={curIdx > 0 ? () => setOpen(g.clips[curIdx - 1].id) : undefined}
          onNext={curIdx < g.clips.length - 1 ? () => setOpen(g.clips[curIdx + 1].id) : undefined}
          onRemove={
            !long && g.clips.length > 1
              ? () => {
                  set({ clips: g.clips.filter((c) => c.id !== cur.id) });
                  setOpen(null);
                }
              : undefined
          }
        />
      ) : null}
    </>
  );
}

/** auto_awesome that spins once a second while the AI runs. */
export function SpinIcon({ spinning, color: c, size = 20 }: { spinning: boolean; color: string; size?: number }) {
  const r = useSharedValue(0);
  useEffect(() => {
    if (spinning) r.set(withRepeat(withTiming(360, { duration: 1000, easing: Easing.linear }), -1, false));
    else r.set(0);
  }, [spinning, r]);
  const s = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.get()}deg` }] }));
  return (
    <Animated.View style={s}>
      <Icon name="auto_awesome" size={size} color={c} />
    </Animated.View>
  );
}


import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { askGuided, planGuided, referenceWithin, type AskAnswer, type AskQuestion, type Declined, type GuidedPlan } from '../../../../lib/brief-ai';
import { toast } from '../../../v2/Toast';
import { newClip, type BriefClip, type BriefHook, type BriefType, type GsMedia, type GuidedState } from '../../../../lib/brief-library';
import { color, editor, radius, shadow } from '../../../../theme/v2';
import { Icon, Label, Option, Press, Sheet, Toggle } from '../../../v2';
import { AiFillButton, DONE_MS, GUIDED_STEPS, SLIDES_STEPS, type AiPhase } from './AiFillButton';
import { AiNote } from './AiNote';
import { AskCard } from './AskCard';
import { CaptionCard } from './CaptionCard';
import { ClipGrid } from './ClipGrid';
import { MediaFill, ShimmerLine } from './ClipFrame';
import { LinkDialog } from './LinkDialog';
import { MediaPickerSheet } from './MediaPickerSheet';
import { FIELD, TitleInput } from './TitleInput';
import { useReference } from './useReference';

/** Where the staged fill is: `reference` while the link is read, then `title`, `clip0..n`, `caption`. */
export type AiState = { stage: string; i: number; n: number };

export interface GuidedFormProps {
  g: GuidedState;
  type: BriefType;
  update: (fn: (cur: GuidedState) => GuidedState) => void;
  ai: AiState | null;
  setAi: (a: AiState | null) => void;
  /** Editing a saved brief: no step label, no link or AI row, no title ideas. */
  editingExisting?: boolean;
  /** A clip tile or Add clip: the template opens in the creator's editor on that clip. */
  onOpenClip: (id: string) => void;
}

/** How long Fill in with AI waits on a link that is still being read before the writer takes over. */
const REFERENCE_WAIT_MS = 90_000;
/** Tiles that shimmer while the AI writes, before it is known how many clips the post has. */
const GHOST_CLIPS = 3;

/** Guided compose: pinned Add link / Fill in with AI, then title, sound, notes and the clip grid. */
export function GuidedForm({ g, type, update, ai, setAi, editingExisting, onOpenClip }: GuidedFormProps) {
  const set = (patch: Partial<GuidedState>) => update((cur) => ({ ...cur, ...patch }));
  const setClip = (id: string, patch: Partial<BriefClip>) => update((cur) => ({ ...cur, clips: cur.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const [linkOpen, setLinkOpen] = useState(false);
  const [gsPick, setGsPick] = useState<'all' | string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hookOpen, setHookOpen] = useState(false);
  const [declined, setDeclined] = useState<Declined | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [doneKey, setDoneKey] = useState(0);
  /** The pill is saying Done: it keeps the whole row for that beat. */
  const [celebrating, setCelebrating] = useState(false);
  /** Clips in the plan being placed, so the grid holds its shape while they land. */
  const [planned, setPlanned] = useState(0);
  /** The questions being answered before the writer starts, or null. */
  const [ask, setAsk] = useState<AskQuestion[] | null>(null);
  /** The questions are being fetched after a tap on Fill in with AI. */
  const [thinking, setThinking] = useState(false);
  /** Answers already given for an idea: a second fill of the same idea does not ask again. */
  const answered = useRef(new Map<string, AskAnswer[]>());
  const reference = useReference(editingExisting ? '' : g.link);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  const long = type === 'Long Text', isGreen = type === 'Greenscreen', slides = type === 'Slideshow';
  const typed = /\S/.test(g.title) || /\S/.test(g.link) || g.clips.some((c) => /\S/.test(c.text));
  const locked = !!(g.filled || ai) && !g.link;

  // Before the plan lands there is one step and nothing to place yet.
  const waiting = !!ai && ai.n === 1;
  const phase: AiPhase = thinking ? 'thinking' : !ai ? 'idle' : ai.stage === 'reference' ? 'reference' : waiting ? 'writing' : 'filling';
  // While the AI writes, the grid shows a few shimmering tiles so the post has its shape before the words land.
  const ghosts = useMemo(() => Array.from({ length: 12 }, () => newClip('')), []);
  const tiles = ai ? Math.min(ghosts.length, Math.max(GHOST_CLIPS, planned)) : 0;
  const shownClips = g.clips.length < tiles ? g.clips.concat(ghosts.slice(g.clips.length, tiles)) : g.clips;

  // The questions for this idea are fetched once typing pauses, so they are ready by the time Fill in with AI is tapped.
  const idea = g.title.trim();
  const canAsk = !editingExisting && !g.link && !g.filled && idea.length >= 8;
  useEffect(() => {
    if (!canAsk) return;
    const t = setTimeout(() => void askGuided(idea, type, g.notes || ''), 1200);
    return () => clearTimeout(t);
    // Notes are read when the timer fires; a change to them alone does not ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAsk, idea, type]);

  /** Fill in with AI: asks its few questions first when the idea is new, then writes. */
  const fill = async () => {
    if (!typed || ai || thinking) return;
    // Tapped while the questions are up: write now with nothing more asked.
    if (ask) {
      setAsk(null);
      void write([]);
      return;
    }
    const known = answered.current.get(idea.toLowerCase());
    if (known || !idea || g.link) {
      void write(known ?? []);
      return;
    }
    setThinking(true);
    const questions = await askGuided(idea, type, g.notes || '');
    setThinking(false);
    if (questions.length) setAsk(questions);
    else void write([]);
  };

  const write = async (answers: AskAnswer[]) => {
    if (ai) return;
    setAsk(null);
    if (idea) answered.current.set(idea.toLowerCase(), answers);
    setDeclined(null);
    setWarnings([]);
    // The post behind the link is read from the moment it is added; wait for it when it is not done yet.
    if (g.link && reference.status === 'pending') {
      setAi({ stage: 'reference', i: 0, n: 1 });
      await referenceWithin(g.link, REFERENCE_WAIT_MS);
    }
    setAi({ stage: 'title', i: 0, n: 1 });
    let plan: GuidedPlan;
    try {
      plan = await planGuided(g, type, answers);
    } catch {
      setAi(null);
      toast.error("Couldn't write this one. Check your connection and try again.", { label: 'Retry', onPress: () => void write(answers) });
      return;
    }
    if (plan.declined) {
      setAi(null);
      setDeclined(plan.declined);
      return;
    }
    setWarnings(plan.ai.warnings);
    const steps: [string, () => void][] = [];
    steps.push(['title', () => set({ title: plan.title, phrase: plan.phrase, angle: plan.angle, ai: plan.ai })]);
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
              ...(c.shot ? { shot: c.shot } : {}),
              doc: prev?.doc ?? c.doc ?? null,
              ...(type === 'Greenscreen' && !cur.fullGreen ? { green: c.green, gs: prev?.gs || c.gs } : {}),
            };
            return { ...cur, clips };
          }),
      ]),
    );
    // A caption or tags typed before the fill stay; the AI only fills what is empty.
    steps.push(['caption', () => update((cur) => ({ ...cur, caption: /\S/.test(cur.caption || '') ? cur.caption : plan.caption, tags: (cur.tags || []).length ? cur.tags : plan.tags, filled: true }))]);
    setPlanned(plan.clips.length);
    setAi({ stage: 'title', i: 0, n: steps.length });
    steps.forEach(([, run], i) =>
      timers.current.push(
        setTimeout(() => {
          run();
          const last = i === steps.length - 1;
          setAi(last ? null : { stage: steps[i + 1][0], i: i + 1, n: steps.length });
          if (last) {
            setPlanned(0);
            setDoneKey((k) => k + 1);
            setCelebrating(true);
            timers.current.push(setTimeout(() => setCelebrating(false), DONE_MS));
          }
        }, 200 + i * 420),
      ),
    );
  };
  // Fields land in order: title, each clip, caption. Everything not yet landed shimmers, and while the AI is
  // still writing that is every field it will fill. A title the manager typed stays readable.
  const at = (k: string) => (k === 'title' ? 0 : k === 'caption' ? Number.MAX_SAFE_INTEGER : 1 + +k.slice(4));
  const pend = (k: string) => !!ai && (k === 'title' && /\S/.test(g.title) ? false : waiting || at(k) >= at(ai.stage));
  const justFilled = (i: number) => !!ai && (ai.stage === `clip${i + 1}` || (ai.stage === 'caption' && i === g.clips.length - 1));

  // The other openings the fill offered for clip 1. Long Text has one clip and no hook to swap.
  const hooks: BriefHook[] = !editingExisting && !long && g.ai?.hooks && g.ai.hooks.length > 1 ? g.ai.hooks : [];
  const first = g.clips[0];
  const hookOn = (h: BriefHook) => !!first && (h.say && !slides ? first.text.trim() === h.say : first.onScreen.trim() === h.onScreen);
  const hookNow = hooks.find(hookOn);
  const swapHook = (h: BriefHook) =>
    update((cur) => {
      const c = cur.clips[0];
      if (!c) return cur;
      const doc = c.doc && c.doc.texts.length ? { ...c.doc, texts: c.doc.texts.map((t, i) => (i === 0 ? { ...t, text: h.onScreen } : t)) } : c.doc;
      return { ...cur, clips: [{ ...c, text: slides ? '' : h.say, onScreen: h.onScreen, doc, ...(h.visual ? { shot: h.visual } : {}) }, ...cur.clips.slice(1)] };
    });
  const referenceNote = !g.link ? null : (declined?.referenceNote ?? g.ai?.referenceNote ?? (reference.status === 'failed' ? (reference.reason ?? null) : null));

  const gsLabel = g.gs ? (g.gs.kind === 'video' ? `Video, ${g.gs.dur}s. Creators record to its length` : 'Image, untimed') : 'Add an image or video';

  return (
    <>
      {/* The idea first, then the one action: the writer. The link is a small second option beside it. */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 10 }}>
        {editingExisting ? null : <Text style={{ textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '700', color: color.grey4 }}>{long ? 'Long Text post' : 'Guided post'}</Text>}
        {pend('title') ? (
          <View style={[FIELD, { paddingVertical: 13, paddingHorizontal: 16 }]}>
            <ShimmerLine />
          </View>
        ) : (
          <TitleInput value={g.title} onChange={(t) => set({ title: t })} placeholder="What is the post about?" noIdeas={!!editingExisting} type={type} />
        )}
        {editingExisting ? null : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Animated.View layout={LinearTransition.duration(260).easing(Easing.bezier(0.2, 0.8, 0.2, 1))} style={{ flex: 1, minWidth: 0 }}>
              <AiFillButton label={ask ? 'Write it now' : g.filled ? 'Fill in again' : 'Fill in with AI'} enabled={typed} phase={phase} filled={ai && ai.n > 1 ? (ai.i + 1) / ai.n : 0} steps={slides ? SLIDES_STEPS : GUIDED_STEPS} doneKey={doneKey} onPress={() => void fill()} />
            </Animated.View>
            {/* While the AI works the pill takes the whole row. */}
            {ai || thinking || celebrating ? null : (
              <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(140)}>
                <Press
                  disabled={locked}
                  onPress={() => setLinkOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={g.link ? 'Link added' : 'Add a link'}
                  style={{ width: 56, height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: g.link ? color.blueTint : locked ? color.grey1 : color.card, boxShadow: g.link || locked ? undefined : shadow.card.boxShadow }}
                >
                  <Icon name={locked ? 'link_off' : 'link'} size={22} color={g.link ? color.blueDeep : locked ? color.grey3 : color.ink} />
                </Press>
              </Animated.View>
            )}
          </View>
        )}
        {g.link && !editingExisting ? (
          <TextInput
            value={g.linkNotes}
            onChangeText={(t) => set({ linkNotes: t })}
            placeholder="What changes from the reference"
            placeholderTextColor={color.grey3}
            style={[FIELD, { paddingVertical: 11, paddingHorizontal: 16, fontSize: 16, lineHeight: 22, color: color.ink }]}
          />
        ) : null}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} scrollEnabled={!dragging} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 2, paddingHorizontal: 20, paddingBottom: 12, gap: 10 }}>
        {referenceNote && !editingExisting ? <AiNote icon="link_off" body={referenceNote} /> : null}
        {warnings.length && !ai ? <AiNote title="To check" lines={warnings} /> : null}
        {ask ? (
          <AskCard questions={ask} onDone={(answers) => void write(answers)} />
        ) : (
          <>
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
                <Text style={{ position: 'absolute', right: 3, bottom: 3, height: 14, paddingHorizontal: 4, borderRadius: 4, overflow: 'hidden', backgroundColor: editor.k60, color: color.white, fontSize: 9, lineHeight: 14, fontWeight: '700' }}>
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
        {hooks.length ? (
          <Press onPress={() => setHookOpen(true)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10, paddingBottom: 10, paddingLeft: 14, paddingRight: 12, borderRadius: radius.card, backgroundColor: color.card, ...shadow.card }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: color.blueTint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="swap_horiz" size={20} color={color.blueDeep} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: color.ink }}>Hook</Text>
              <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 16, color: color.grey4 }}>
                {hookNow?.archetype || `${hooks.length} options`}
              </Text>
            </View>
            <Icon name="chevron_right" size={22} color={color.grey3} />
          </Press>
        ) : null}
        <ClipGrid
          clips={shownClips}
          type={type}
          isGreen={isGreen}
          fullGreen={!!g.fullGreen}
          gsAll={g.gs}
          pending={(i) => pend(`clip${i}`)}
          justFilled={justFilled}
          onOpen={ai ? () => undefined : onOpenClip}
          onAdd={() => {
            const c = newClip('');
            set({ clips: g.clips.concat([c]) });
            onOpenClip(c.id);
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
          onPickBackground={(id) => setGsPick(id)}
          onDragging={setDragging}
        />
        <CaptionCard caption={g.caption || ''} tags={g.tags || []} onCaption={(t) => set({ caption: t })} onTags={(tags) => set({ tags })} pending={pend('caption')} />
        <View style={{ backgroundColor: color.card, borderRadius: radius.card, paddingTop: 10, paddingHorizontal: 16, paddingBottom: 12, gap: 4, ...shadow.card }}>
          <Label>Notes for the creator</Label>
          <TextInput multiline value={g.notes || ''} onChangeText={(t) => set({ notes: t })} placeholder="Add a note" placeholderTextColor={color.grey3} style={{ fontSize: 15, lineHeight: 21, color: color.ink, padding: 0, minHeight: 21 }} />
        </View>
          </>
        )}
      </ScrollView>

      <Sheet open={hookOpen} onClose={() => setHookOpen(false)} title="Hook">
        {hooks.map((h) => (
          <Option
            key={`${h.say}|${h.onScreen}`}
            on={hookOn(h)}
            meta={h.archetype || undefined}
            onPress={() => {
              swapHook(h);
              setHookOpen(false);
            }}
          >
            {(slides ? h.onScreen : h.say) || h.onScreen}
          </Option>
        ))}
      </Sheet>
      <LinkDialog open={linkOpen} link={g.link || ''} onClose={() => setLinkOpen(false)} onAdd={(link) => set({ link })} onRemove={() => set({ link: '', linkNotes: '' })} />
      <MediaPickerSheet
        open={!!gsPick}
        onClose={() => setGsPick(null)}
        onPick={(m: GsMedia) => {
          if (gsPick === 'all') set({ gs: m, clips: g.clips.map((c) => ({ ...c, gs: null })) });
          else if (gsPick) setClip(gsPick, { gs: m });
        }}
      />
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


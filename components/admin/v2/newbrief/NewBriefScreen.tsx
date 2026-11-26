import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { logBriefEdit, planOutline, referenceWithin, type Declined } from '../../../../lib/brief-ai';
import { clearDraft, loadDraft, saveDraft, WIZ_V, type WizardState } from '../../../../lib/brief-drafts';
import { useLibStore } from '../../../../lib/brief-library-api';
import { briefWord, emptyGuided, emptyLongText, newClip, outlineTwinId, uid, type Brief, type BriefKind, type BriefType, type GuidedState, type LongTextState } from '../../../../lib/brief-library';
import { useKeyboardHeight } from '../../../../lib/keyboard';
import { color, radius, shadow, text } from '../../../../theme/v2';
import { postsForBrief, useV2Data } from '../../../../lib/v2-posts';
import { Button, Icon, Press, TabPane, TextButton, UnderlineTabs, type IconName } from '../../../v2';
import { BriefPostsPanel } from '../posts/BriefPostsPanel';
import { LongTextView, OutlineView, TemplateView } from './BriefViews';
import { toast } from '../../../v2/Toast';
import { Celebration } from './Celebration';
import { GuidedForm, type AiState } from './GuidedForm';
import { LongTextForm } from './LongTextForm';
import { OptionCards, type OptionDef } from './OptionCards';
import { OutlineForm } from './OutlineForm';
import { StepDots } from './StepDots';
import { TemplateEditor } from './TemplateEditor';

type Step = { key: 'type' | 'kind'; title: string; options: OptionDef[] } | { key: 'compose' };

const STEPS: Step[] = [
  {
    key: 'type',
    title: 'Post type',
    options: [
      { label: 'Talking Head', icon: 'record_voice_over', sub: 'Creator to camera' },
      { label: 'Long Text', icon: 'subject', sub: 'Text on screen, voiceover under it' },
      { label: 'Slideshow', icon: 'photo_library', sub: 'Images with text, swiped through' },
      { label: 'Greenscreen', icon: 'wallpaper', sub: 'Creator over a screenshot or clip' },
    ],
  },
  {
    key: 'kind',
    title: 'Which format?',
    options: [
      { label: 'Guided', icon: 'format_list_numbered' as IconName, sub: 'Clips, overlays, teleprompter' },
      { label: 'Outline', icon: 'segment', sub: 'Just a title and notes' },
    ],
  },
  { key: 'compose' },
];

export interface NewBriefScreenProps {
  /** `new` for a post from the Create button (its draft survives closing); a saved brief's id to edit it. */
  slot: string;
  /** Briefs tab root to land on after the celebration. */
  briefsHref: string;
  /** Route prefix for a post made from this brief, `<prefix>/<postId>`. */
  postHref: string;
  userId?: string | null;
  /** Brand library for the editor's Image tool. */
  companyId?: string;
}

/** The brief a saved template or outline reopens as. */
function fromBrief(b: Brief): Pick<WizardState, 'g' | 'lt'> {
  if (b.type === 'Long Text') {
    return { lt: b.lt || { title: b.title, notes: b.notes || '', onScreen: b.clips?.[0]?.onScreen || b.title, doc: b.clips?.[0]?.doc || null } };
  }
  if (b.kind !== 'Guided') return {};
  return {
    g: b.g || {
      ...emptyGuided(),
      title: b.title,
      notes: b.notes || '',
      link: b.link || '',
      audio: b.audio || { mode: 'creator', track: null },
      fullGreen: b.clips && b.clips.length ? b.clips.every((c) => c.green) : true,
      gs: b.clips?.[0]?.gs || null,
      clips: (b.clips || []).map((c) => newClip(c.text || '', { onScreen: c.onScreen || '', cta: !!c.cta, green: !!c.green, gs: c.gs || null, doc: c.doc || null })),
    },
  };
}

function draftOk(d: WizardState | null, existing: Brief | undefined): d is WizardState {
  if (!d) return false;
  if (!existing) return true;
  if (d.g) return /\S/.test(d.g.title) || d.g.clips.some((c) => /\S/.test(c.text));
  if (d.lt) return /\S/.test(d.lt.title);
  return /\S/.test(d.title || '');
}

/** Create a post (type, format, compose) or edit a saved brief. Drafts persist per slot. */
export function NewBriefScreen({ slot, briefsHref, postHref, userId = null, companyId = '' }: NewBriefScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const existing = useLibStore((s) => s.briefs.find((b) => b.id === slot));
  const saveBrief = useLibStore((s) => s.saveBrief);
  const removeBrief = useLibStore((s) => s.removeBrief);
  const setJustMade = useLibStore((s) => s.setJustMade);
  const key = `${existing ? 'edit.' : ''}${slot}`;
  const posts = useV2Data((s) => s.posts);
  const madeCount = existing ? postsForBrief(posts, existing).length : 0;

  const [st, setSt] = useState<WizardState | null>(null);
  const [editMode, setEditMode] = useState(!existing);
  const [page, setPage] = useState<'brief' | 'posts'>('brief');
  const [editor, setEditor] = useState<{ clip: string | null } | null>(null);
  const [gai, setGai] = useState<AiState | null>(null);
  const [oai, setOai] = useState(false);
  const [outlineDone, setOutlineDone] = useState(0);
  const [outlineNote, setOutlineNote] = useState<{ declined: Declined | null; referenceNote: string | null }>({ declined: null, referenceNote: null });
  const [party, setParty] = useState<{ id: string; twin: boolean } | null>(null);
  const [arm, setArm] = useState(false);
  const [saving, setSaving] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const advancing = useRef(false);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  // Restore the draft for this slot, or open the saved brief on its compose step.
  useEffect(() => {
    let live = true;
    void loadDraft(key).then((d) => {
      if (!live) return;
      const ex = useLibStore.getState().briefs.find((b) => b.id === slot);
      // A saved brief always opens as saved; only a new post resumes its draft.
      const init: WizardState = !ex && draftOk(d, ex)
        ? d
        : ex
          ? { v: WIZ_V, step: 2, type: ex.type, kind: ex.type === 'Long Text' ? 'Long Text' : ex.kind, title: ex.title, notes: ex.notes, link: ex.link || '', music: !!ex.audio && ex.audio.mode !== 'none', g: null, lt: null, ...fromBrief(ex) }
          : { v: WIZ_V, step: 0 };
      setSt(ex ? { ...init, step: 2, type: ex.type, kind: ex.type === 'Long Text' ? 'Long Text' : ex.kind, editingExisting: true } : init);
    });
    return () => {
      live = false;
    };
  }, [key, slot]);

  // Persist on every change, debounced a little. A saved brief only drafts while editing.
  useEffect(() => {
    if (!st || (existing && !editMode)) return;
    const t = setTimeout(() => saveDraft(key, st), 150);
    return () => clearTimeout(t);
  }, [st, key, existing, editMode]);

  const patch = (p: Partial<WizardState>) => setSt((x) => (x ? { ...x, ...p } : x));

  if (!st) return <View style={{ flex: 1, backgroundColor: color.bg }} />;

  const step = STEPS[st.step];
  const compose = step.key === 'compose';
  const longText = st.type === 'Long Text';
  const guided = compose && st.kind === 'Guided';
  const isLong = compose && st.kind === 'Long Text';
  const type = (st.type ?? 'Talking Head') as BriefType;
  const g: GuidedState = st.g ?? emptyGuided();
  const lt: LongTextState = st.lt ?? emptyLongText();
  const dots = longText ? [0, 2] : [0, 1, 2];
  const val = compose
    ? guided
      ? /\S/.test(g.title) && g.clips.some((c) => /\S/.test(c.text) || /\S/.test(c.onScreen) || !!c.doc?.texts.some((t) => /\S/.test(t.text)))
      : isLong
        ? /\S/.test(lt.title) && /\S/.test(lt.onScreen)
        : /\S/.test(st.title || '')
    : !!st[step.key as 'type' | 'kind'];

  const next = () =>
    setSt((x) => {
      if (!x) return x;
      if (x.step === 0 && x.type === 'Long Text') return { ...x, kind: 'Long Text', step: 2 };
      return { ...x, step: Math.min(2, x.step + 1) as WizardState['step'] };
    });
  const pick = (v: string) => {
    if (step.key === 'compose' || advancing.current) return;
    const k = step.key;
    advancing.current = true;
    setSt((x) => (x ? { ...x, [k]: v as BriefType & BriefKind } : x));
    timers.current.push(
      setTimeout(() => {
        advancing.current = false;
        next();
      }, 340),
    );
  };
  const back = () => {
    if (st.step === 0 || existing) {
      router.back();
      return;
    }
    setSt((x) => (x ? { ...x, step: (x.step === 2 && x.type === 'Long Text' ? 0 : x.step - 1) as WizardState['step'] } : x));
  };

  const fillOutline = async () => {
    if (oai) return;
    setOai(true);
    setOutlineNote({ declined: null, referenceNote: null });
    try {
      // The post behind the link is read from the moment it is pasted; give it a moment when it is not done yet.
      if (st.link) await referenceWithin(st.link, 90_000);
      const f = await planOutline({ title: st.title || '', link: st.link || '', notes: st.notes || '' });
      setOutlineNote({ declined: f.declined, referenceNote: f.referenceNote });
      if (!f.declined) {
        setSt((x) => (x ? { ...x, title: (x.title || '').trim() || f.title, notes: f.notes || x.notes, filled: true } : x));
        setOutlineDone((k) => k + 1);
      }
    } catch {
      toast.error("Couldn't write the outline. Check your connection and try again.", { label: 'Retry', onPress: () => void fillOutline() });
    } finally {
      setOai(false);
    }
  };

  const celebrate = (id: string, twin: boolean) => {
    if (existing) {
      router.back();
      return;
    }
    setParty({ id, twin });
    timers.current.push(
      setTimeout(() => {
        setJustMade(twin ? [id, outlineTwinId(id)] : [id]);
        try {
          router.dismissAll();
        } catch {
          // already at the root
        }
        router.navigate(briefsHref as Href);
      }, 2300),
    );
  };

  /** Waits for the server; a failed save stays queued on this device and offers a retry. */
  const afterSave = async (synced: Promise<string | null>, id: string, twin: boolean) => {
    setSaving(true);
    const err = await synced;
    setSaving(false);
    if (err) {
      toast.error("Couldn't save to your team yet. It's kept on this phone.", { label: 'Retry', onPress: () => void finish() });
      return;
    }
    // What the manager kept and changed of an AI fill teaches the next one.
    if (guided) {
      logBriefEdit({
        libraryBriefId: id,
        type,
        ai: g.ai,
        angle: g.angle,
        saved: { title: g.title.trim(), clips: g.clips.map((c) => ({ say: c.text, onScreen: c.onScreen, cta: c.cta })), caption: g.caption, tags: g.tags },
      });
    } else if (isLong) {
      logBriefEdit({ libraryBriefId: id, type: 'Long Text', ai: lt.ai, saved: { title: lt.title.trim(), clips: [{ say: '', onScreen: lt.onScreen, cta: false }], caption: '', tags: [] } });
    }
    clearDraft(key);
    celebrate(id, twin);
  };

  const finish = async () => {
    if (saving) return;
    const by = { userId, name: 'You' };
    const id = existing ? existing.id : slot === 'new' ? uid() : slot;
    if (guided) {
      const phrase = (g.phrase || g.title).trim();
      const notes = (g.notes || '').trim() || [`Search: ${phrase}`].concat(g.clips.map((c, i) => `${type === 'Long Text' ? 'Clip' : i === 0 ? 'Hook' : `Clip ${i}`}: ${c.text}`)).filter(Boolean).join('\n');
      const { synced } = saveBrief(
        {
          id,
          type,
          kind: 'Guided',
          title: g.title.trim(),
          notes,
          link: g.link || '',
          g,
          audio: g.audio,
          caption: g.caption,
          tags: g.tags,
          clips: g.clips.map((c) => ({ ...c, green: type === 'Greenscreen' && (g.fullGreen || c.green), gs: type === 'Greenscreen' ? (g.fullGreen ? g.gs : c.gs) : null })),
        },
        by,
      );
      await afterSave(synced, id, true);
      return;
    }
    if (isLong) {
      const { synced } = saveBrief({ id, type: 'Long Text', kind: 'Guided', noTwin: true, title: lt.title.trim(), notes: lt.notes || '', lt, clips: [newClip(lt.notes || '', { onScreen: lt.onScreen, doc: lt.doc || null })] }, by);
      await afterSave(synced, id, false);
      return;
    }
    // The music line is shown from audio.mode; strip any copy an older save appended to the notes.
    const notes = (st.notes || '').replace(/\n?Music: pick a sound that fits and add it on Instagram and TikTok\./g, '').trim();
    const { synced } = saveBrief(
      {
        id,
        type,
        kind: (st.kind ?? 'Outline') as BriefKind,
        title: (st.title || '').trim(),
        notes,
        audio: { mode: st.music ? 'creator' : 'none', track: null },
        link: (st.link || '').trim(),
      },
      by,
    );
    await afterSave(synced, id, false);
  };

  const del = () => {
    if (!existing) return;
    if (!arm) {
      setArm(true);
      timers.current.push(setTimeout(() => setArm(false), 2500));
      return;
    }
    const { synced } = removeBrief(existing.id);
    clearDraft(key);
    router.back();
    void synced.then((err) => {
      if (err) toast.error("Deleted on this phone. We'll remove it for your team when you're back online.");
    });
  };

  const word = existing ? briefWord(existing) : '';
  const busy = oai || !!gai;
  const viewing = !!existing && !editMode;
  const showPosts = viewing && page === 'posts';
  const updateG = (fn: (cur: GuidedState) => GuidedState) => setSt((x) => (x ? { ...x, g: fn(x.g ?? emptyGuided()) } : x));
  const setLt = (p: Partial<LongTextState>) => setSt((x) => (x ? { ...x, lt: { ...(x.lt ?? emptyLongText()), ...p } } : x));
  const startEdit = () => {
    setEditMode(true);
  };
  /** The template in the creator's editor, playhead on the tapped clip. */
  const openEditor = (clipId: string | null) => {
    setEditor({ clip: clipId });
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top, paddingBottom: keyboard }}>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingLeft: 4, paddingRight: 8 }}>
        <Press accessibilityRole="button" accessibilityLabel={st.step === 0 || existing ? 'Close' : 'Back'} onPress={back} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={st.step === 0 || existing ? 'close' : 'chevron_left'} size={st.step === 0 || existing ? 26 : 32} color={color.ink} />
        </Press>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {existing ? <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', color: color.ink }}>{viewing ? '' : word}</Text> : <StepDots steps={dots} step={st.step} />}
        </View>
        {existing && compose && viewing ? (
          <TextButton label="Edit" onPress={startEdit} />
        ) : existing && compose ? (
          <Press
            accessibilityRole="button"
            accessibilityLabel="Delete"
            onPress={del}
            style={{ height: 36, minWidth: 44, paddingHorizontal: arm ? 14 : 0, borderRadius: radius.pill, backgroundColor: arm ? color.amber : 'transparent', alignItems: 'center', justifyContent: 'center' }}
          >
            {arm ? <Text style={{ fontSize: 14, fontWeight: '700', color: color.white }}>Delete?</Text> : <Icon name="delete" size={22} color={color.amber} />}
          </Press>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      {viewing ? (
        <View style={{ paddingHorizontal: 20, marginBottom: 14 }}>
          <UnderlineTabs items={[{ key: 'brief' as const, label: word }, { key: 'posts' as const, label: 'Posts', count: madeCount }]} value={page} onChange={setPage} />
        </View>
      ) : null}

      {showPosts && existing ? (
        <TabPane k="posts">
          <BriefPostsPanel brief={existing} onOpen={(p) => router.push(`${postHref}/${p.id}` as Href)} />
        </TabPane>
      ) : viewing ? (
        <TabPane k="brief">
          {guided ? (
            <TemplateView g={g} type={type} onOpenClip={openEditor} />
          ) : isLong ? (
            <LongTextView
              lt={lt}
              onChange={(p) => {
                setLt(p);
                setEditMode(true);
              }}
            />
          ) : (
            <OutlineView title={st.title || ''} link={st.link || ''} music={!!st.music} notes={st.notes || ''} />
          )}
        </TabPane>
      ) : compose ? (
        <TabPane k="compose">
          {guided ? (
            <GuidedForm g={g} type={type} update={updateG} ai={gai} setAi={setGai} editingExisting={!!st.editingExisting} onOpenClip={openEditor} />
          ) : isLong ? (
            <LongTextForm lt={lt} set={setLt} ai={gai} setAi={setGai} editingExisting={!!st.editingExisting} />
          ) : (
            <OutlineForm
              st={{ title: st.title || '', notes: st.notes || '', link: st.link || '', music: !!st.music, filled: !!st.filled }}
              set={(p) => patch(p)}
              ai={oai}
              onFill={() => void fillOutline()}
              doneKey={outlineDone}
              editingExisting={!!st.editingExisting}
              declined={outlineNote.declined}
              referenceNote={outlineNote.referenceNote}
            />
          )}
        </TabPane>
      ) : (
        <TabPane k={`step${st.step}`}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 20, paddingBottom: 24 }}>
            <Text style={[text.meta, { fontWeight: '600' }]}>
              Step {st.step + 1} of {longText && st.step ? 2 : dots.length}
            </Text>
            <Text style={[text.title, { marginTop: 6, marginBottom: 20 }]}>{step.title}</Text>
            <OptionCards options={step.options} value={st[step.key]} onPick={pick} grid={step.options.length > 2} />
          </ScrollView>
        </TabPane>
      )}

      {compose && !showPosts ? (
        <View style={{ flexDirection: 'row', paddingTop: 12, paddingHorizontal: 20, paddingBottom: keyboard ? 12 : Math.max(insets.bottom, 20) + 14, backgroundColor: color.card, ...shadow.footer }}>
          {viewing ? (
            guided ? (
              <Button label="Open template" onPress={() => openEditor(g.clips[0]?.id ?? null)} />
            ) : (
              <Button variant="secondary" label="Edit" onPress={startEdit} />
            )
          ) : (
            <Button disabled={!val || busy || saving} onPress={() => void finish()} label={saving ? 'Saving…' : existing ? 'Save changes' : guided || isLong ? 'Save post' : 'Save outline'} />
          )}
        </View>
      ) : null}

      {editor ? (
        <TemplateEditor
          g={g}
          type={type}
          startClipId={editor.clip}
          ownerId={slot}
          companyId={companyId}
          onChange={(fn) => {
            updateG(fn);
            setEditMode(true);
          }}
          onClose={() => setEditor(null)}
        />
      ) : null}

      {party ? <Celebration twin={party.twin} /> : null}
    </View>
  );
}


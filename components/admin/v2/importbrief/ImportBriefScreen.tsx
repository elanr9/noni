// Upload brief: the manager adds a brief (files or a link) and Noni turns it
// into templates. Three views on one screen:
//
//   add      what to read: files and links, each shown as it is added
//   posts    every post the brief holds, listed the moment it is found and
//            written at the same time; a tick keeps it, a tap opens it
//   review   one post at a time as the template it will be saved as, with the
//            same template view and editor as a post made in Create
//
// The brief decides how many posts there are.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRouter, type Href } from 'expo-router';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, LinearTransition, ZoomIn, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  MAX_SOURCES,
  WARM_MS,
  WRITE_PARALLEL,
  fileSizeLabel,
  finishImport,
  guidedOf,
  importSaveInput,
  linkSource,
  pickImportFiles,
  planImport,
  writeImportPost,
  type ImportSource,
  type PlannedPost,
  type Skipped,
  type WrittenPost,
} from '../../../../lib/brief-import';
import { useLibStore } from '../../../../lib/brief-library-api';
import { clipTexts, outlineTwinId, uid, type GuidedState, type LongTextState } from '../../../../lib/brief-library';
import { color, motion, radius, shadow, space, text } from '../../../../theme/v2';
import { Button, Footer, Icon, Press, PushHeader, Sheet, type IconName } from '../../../v2';
import { toast } from '../../../v2/Toast';
import { TypeTile } from '../briefs/TypeTile';
import { AiNote } from '../newbrief/AiNote';
import { LongTextView, TemplateView } from '../newbrief/BriefViews';
import { Celebration } from '../newbrief/Celebration';
import { ClipFrame, Shimmer, ShimmerLine } from '../newbrief/ClipFrame';
import { TemplateEditor } from '../newbrief/TemplateEditor';

/** The server calls, swappable so the dev preview can run the flow without a session. */
export type ImportApi = {
  pick: typeof pickImportFiles;
  plan: typeof planImport;
  write: typeof writeImportPost;
  finish: typeof finishImport;
};
const REAL_API: ImportApi = { pick: pickImportFiles, plan: planImport, write: writeImportPost, finish: finishImport };

export interface ImportBriefScreenProps {
  companyId: string;
  userId: string | null;
  briefsHref: string;
  api?: ImportApi;
}

type Stage = 'add' | 'posts';
type RowState = { status: 'queued' | 'writing' | 'done' | 'failed'; written: WrittenPost | null; g: GuidedState | null; picked: boolean };
const QUEUED: RowState = { status: 'queued', written: null, g: null, picked: true };

const isImage = (s: ImportSource) => s.kind === 'file' && /^image\//.test(s.mime);
const sourceIcon = (s: ImportSource): IconName => (s.kind === 'link' ? 'link' : isImage(s) ? 'image' : 'description');
const sourceMeta = (s: ImportSource) => (s.kind === 'file' ? fileSizeLabel(s.size) : s.url.replace(/^https?:\/\/(www\.)?/, ''));
const posts = (n: number) => (n === 1 ? '1 post' : `${n} posts`);

export function ImportBriefScreen({ companyId, userId, briefsHref, api = REAL_API }: ImportBriefScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const saveBrief = useLibStore((s) => s.saveBrief);
  const setJustMade = useLibStore((s) => s.setJustMade);

  const [stage, setStage] = useState<Stage>('add');
  const [sources, setSources] = useState<ImportSource[]>([]);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState(false);
  const [picking, setPicking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const [found, setFound] = useState<PlannedPost[]>([]);
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const [planning, setPlanning] = useState(false);
  const [skipped, setSkipped] = useState<Skipped[]>([]);
  const [review, setReview] = useState<number | null>(null);
  const [editor, setEditor] = useState<{ index: number; clip: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [party, setParty] = useState<number | null>(null);
  const [leave, setLeave] = useState(false);

  // One upload at a time: a run that was left behind must not write into a newer one.
  const run = useRef(0);
  const importId = useRef<string | null>(null);
  const queue = useRef<PlannedPost[]>([]);
  const active = useRef(0);
  const warm = useRef<'cold' | 'warming' | 'warm'>('cold');
  const stop = useRef<AbortController | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      run.current += 1;
      stop.current?.abort();
      timers.current.forEach(clearTimeout);
      if (importId.current) api.finish(importId.current);
    },
    [api],
  );

  const full = sources.length >= MAX_SOURCES;
  const add = (more: ImportSource[]) => {
    setProblem(null);
    setSources((cur) => [...cur, ...more].slice(0, MAX_SOURCES));
  };

  const pick = async () => {
    if (picking || full) return;
    setPicking(true);
    try {
      const { sources: files, tooLarge } = await api.pick();
      if (files.length) add(files);
      if (tooLarge.length) toast.error(`${tooLarge[0]} is over 24 MB. Export a smaller copy.`);
    } catch {
      toast.error("Couldn't open your files. Try again.");
    } finally {
      setPicking(false);
    }
  };

  const addLink = (raw = link) => {
    const src = linkSource(raw);
    if (!src) {
      setLinkError(true);
      return;
    }
    add([src]);
    setLink('');
    setLinkError(false);
  };

  const paste = async () => {
    let t = '';
    try {
      t = (await Clipboard.getStringAsync()).trim();
    } catch {
      // nothing readable on the clipboard
    }
    if (linkSource(t)) addLink(t);
    else setLinkError(true);
  };

  const patch = (index: number, next: Partial<RowState>) => setRows((cur) => ({ ...cur, [index]: { ...(cur[index] ?? QUEUED), ...next } }));

  const writeOne = async (id: number, post: PlannedPost) => {
    const to = importId.current;
    if (run.current !== id || !to) return;
    patch(post.index, { status: 'writing' });
    try {
      const written = await api.write(to, post);
      if (run.current === id) patch(post.index, { status: 'done', written, g: guidedOf(written), picked: true });
    } catch {
      if (run.current === id) patch(post.index, { status: 'failed', picked: false });
    }
  };

  /** Starts as many queued posts as there is room for. The first goes alone for a moment so the rest read what it cached. */
  const pump = (id: number) => {
    if (run.current !== id || !importId.current) return;
    const begin = (post: PlannedPost) => {
      active.current += 1;
      void writeOne(id, post).finally(() => {
        active.current -= 1;
        pump(id);
      });
    };
    if (warm.current === 'cold') {
      const first = queue.current.shift();
      if (!first) return;
      warm.current = 'warming';
      timers.current.push(
        setTimeout(() => {
          warm.current = 'warm';
          pump(id);
        }, WARM_MS),
      );
      begin(first);
      return;
    }
    if (warm.current === 'warming') return;
    while (active.current < WRITE_PARALLEL && queue.current.length) begin(queue.current.shift()!);
  };

  const start = async () => {
    // A link still in the field counts.
    const typed = link.trim() ? linkSource(link) : null;
    if (link.trim() && !typed) {
      setLinkError(true);
      return;
    }
    const all = typed ? [...sources, typed].slice(0, MAX_SOURCES) : sources;
    if (!all.length) return;
    if (typed) {
      setSources(all);
      setLink('');
    }
    run.current += 1;
    const id = run.current;
    importId.current = null;
    queue.current = [];
    active.current = 0;
    warm.current = 'cold';
    stop.current = new AbortController();
    setProblem(null);
    setFound([]);
    setRows({});
    setSkipped([]);
    setReview(null);
    setPlanning(true);
    setStage('posts');
    let seen = 0;
    try {
      await api.plan(companyId, all, {
        signal: stop.current.signal,
        onSources: (s) => run.current === id && setSkipped(s),
        onPost: (post) => {
          if (run.current !== id) return;
          seen += 1;
          setFound((cur) => (cur.some((p) => p.index === post.index) ? cur : [...cur, post]));
          queue.current.push(post);
          pump(id);
        },
        onReady: (to) => {
          if (run.current !== id) return;
          importId.current = to;
          pump(id);
        },
      });
    } catch (e) {
      if (run.current !== id) return;
      // Posts that were already found and can be written are kept; with none, back to the start with the reason.
      if (!seen || !importId.current) {
        run.current += 1;
        setProblem(e instanceof Error && e.message ? e.message : "Couldn't read that brief. Try again.");
        setStage('add');
      }
    } finally {
      if (run.current === id) setPlanning(false);
    }
  };

  const retry = (post: PlannedPost) => {
    patch(post.index, { status: 'queued' });
    queue.current.push(post);
    pump(run.current);
  };

  const states = found.map((p) => rows[p.index] ?? QUEUED);
  const done = states.filter((s) => s.status === 'done').length;
  const failed = states.filter((s) => s.status === 'failed').length;
  const working = planning || states.some((s) => s.status === 'queued' || s.status === 'writing');
  const ready = useMemo(() => found.filter((p) => rows[p.index]?.status === 'done'), [found, rows]);
  const chosen = useMemo(() => ready.filter((p) => rows[p.index]?.picked), [ready, rows]);

  // The set is finished: a small reward.
  const finished = stage === 'posts' && !working && done > 0;
  useEffect(() => {
    if (finished) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [finished]);

  const save = async () => {
    if (saving || !chosen.length) return;
    setSaving(true);
    const by = { userId, name: 'You' };
    const ids: string[] = [];
    const synced: Promise<string | null>[] = [];
    for (const p of chosen) {
      const row = rows[p.index];
      if (!row?.written) continue;
      const input = importSaveInput(row.written, uid(), row.g ?? undefined);
      const out = saveBrief(input, by);
      ids.push(input.id, ...(input.noTwin ? [] : [outlineTwinId(input.id)]));
      synced.push(out.synced);
    }
    const errors = (await Promise.all(synced)).filter(Boolean);
    setSaving(false);
    run.current += 1;
    setJustMade(ids);
    if (errors.length) toast.error("Couldn't save to your team yet. They're kept on this phone.");
    setParty(chosen.length);
    timers.current.push(
      setTimeout(() => {
        try {
          router.dismissAll();
        } catch {
          // already at the root
        }
        router.navigate(briefsHref as Href);
      }, 1900),
    );
  };

  const close = () => {
    if (stage === 'posts') setLeave(true);
    else router.back();
  };

  const editing = editor ? rows[editor.index] : null;
  const editingPost = editor ? found.find((p) => p.index === editor.index) : null;
  const overlays = (
    <>
      <Sheet
        open={leave}
        onClose={() => setLeave(false)}
        title="Leave without saving?"
        footer={
          <>
            <Button variant="quiet" label="Leave" onPress={() => router.back()} />
            <Button label="Stay" onPress={() => setLeave(false)} />
          </>
        }
      >
        {null}
      </Sheet>
      {editor && editing?.g && editingPost ? (
        <TemplateEditor
          g={editing.g}
          type={editingPost.type}
          startClipId={editor.clip}
          ownerId={`import-${editor.index}`}
          companyId={companyId}
          onChange={(fn) => setRows((cur) => (cur[editor.index]?.g ? { ...cur, [editor.index]: { ...cur[editor.index], g: fn(cur[editor.index].g!) } } : cur))}
          onClose={() => setEditor(null)}
        />
      ) : null}
      {party !== null ? <Celebration twin={false} title={party === 1 ? '1 post saved!' : `${party} posts saved!`} sub="Saved to Briefs" /> : null}
    </>
  );

  if (stage === 'posts' && review !== null && ready.length) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top }}>
        <Review
          posts={ready}
          rows={rows}
          at={review}
          onClose={() => setReview(null)}
          onPick={(index, picked) => patch(index, { picked })}
          onOpenClip={(index, clip) => setEditor({ index, clip })}
          onLongText={(index, p) =>
            setRows((cur) => {
              const g = cur[index]?.g;
              if (!g) return cur;
              const first = g.clips[0];
              const clips = first ? [{ ...first, onScreen: p.onScreen ?? first.onScreen, doc: p.doc === undefined ? first.doc : p.doc }, ...g.clips.slice(1)] : g.clips;
              return { ...cur, [index]: { ...cur[index], g: { ...g, clips } } };
            })
          }
        />
        {overlays}
      </View>
    );
  }

  if (stage === 'posts') {
    const reading = !found.length;
    const title = reading ? 'Reading your brief' : working ? `Writing ${posts(found.length)}` : `${posts(done)} ready`;
    const label = saving ? 'Saving' : working ? (reading ? 'Reading' : `${done} of ${found.length} written`) : chosen.length ? `Save ${posts(chosen.length)}` : 'Pick a post';
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top }}>
        <PushHeader close onBack={close} />
        <View style={{ paddingHorizontal: space.screen, paddingBottom: 14, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Animated.Text key={title} entering={FadeInDown.duration(240)} style={[text.title, { fontSize: 28, lineHeight: 34, flexShrink: 1 }]}>
              {title}
            </Animated.Text>
            {finished ? (
              <Animated.View entering={ZoomIn.duration(360).easing(motion.spring)} style={{ width: 28, height: 28, borderRadius: radius.pill, backgroundColor: color.green, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check" size={18} weight={700} color={color.white} />
              </Animated.View>
            ) : null}
          </View>
          <Progress reading={reading} planning={planning} done={done + failed} total={found.length} complete={!working} />
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.screen, paddingTop: 2, paddingBottom: 24 }}>
          {skipped.length ? (
            <View style={{ marginBottom: 12 }}>
              <AiNote icon="error" lines={skipped.map((s) => s.reason)} />
            </View>
          ) : null}
          {reading ? (
            <Animated.View exiting={FadeOut.duration(160)}>
              {sources.map((s) => (
                <SourceRow key={s.id} source={s} busy />
              ))}
            </Animated.View>
          ) : null}
          {found.map((p) => (
            <Animated.View key={p.index} entering={FadeInDown.duration(260)} layout={LinearTransition.duration(200)}>
              <PostRow post={p} state={rows[p.index] ?? QUEUED} onOpen={() => setReview(p.index)} onPick={() => patch(p.index, { picked: !(rows[p.index]?.picked ?? true) })} onRetry={() => retry(p)} />
            </Animated.View>
          ))}
          {planning ? (
            <Animated.View layout={LinearTransition.duration(200)} exiting={FadeOut.duration(160)}>
              <GhostRow />
              {reading ? <GhostRow /> : null}
            </Animated.View>
          ) : null}
        </ScrollView>
        <Footer>
          <Button label={label} icon={working || saving || !chosen.length ? undefined : 'check'} disabled={working || saving || !chosen.length} onPress={() => void save()} />
        </Footer>
        {overlays}
      </View>
    );
  }

  const empty = !sources.length;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top }}>
      <PushHeader close onBack={close} />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.screen, paddingBottom: 24 }}>
        <Text style={[text.title, { marginBottom: 20 }]}>Add your brief</Text>

        {problem ? (
          <Animated.View entering={FadeIn.duration(200)} style={{ marginBottom: 12 }}>
            <AiNote icon="error" body={problem} />
          </Animated.View>
        ) : null}

        {sources.map((s) => (
          <Animated.View key={s.id} entering={FadeInDown.duration(220)} exiting={FadeOut.duration(140)} layout={LinearTransition.duration(180)}>
            <SourceRow source={s} onRemove={() => setSources((cur) => cur.filter((x) => x.id !== s.id))} />
          </Animated.View>
        ))}

        <Animated.View layout={LinearTransition.duration(220)} style={{ gap: 12 }}>
          <Press
            accessibilityRole="button"
            accessibilityLabel="Add files"
            onPress={() => void pick()}
            disabled={full || picking}
            style={{
              flexDirection: empty ? 'column' : 'row',
              alignItems: 'center',
              justifyContent: empty ? 'center' : 'flex-start',
              gap: 12,
              height: empty ? 168 : 64,
              paddingHorizontal: 14,
              borderRadius: radius.card,
              backgroundColor: color.card,
              opacity: full ? 0.4 : 1,
              ...shadow.card,
            }}
          >
            <View style={{ width: empty ? 56 : 36, height: empty ? 56 : 36, borderRadius: radius.pill, backgroundColor: color.blue, alignItems: 'center', justifyContent: 'center', boxShadow: empty ? shadow.glow.boxShadow : undefined }}>
              <Icon name={empty ? 'upload_file' : 'add'} size={empty ? 28 : 22} weight={700} color={color.white} />
            </View>
            <Text style={empty ? text.row : { fontSize: 16, lineHeight: 20, fontWeight: '600', color: color.ink }}>{empty ? 'Add files' : 'Add more'}</Text>
          </Press>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 64, paddingLeft: 14, paddingRight: 10, backgroundColor: color.card, borderRadius: radius.card, borderWidth: 2, borderColor: linkError ? color.pink : 'transparent', opacity: full ? 0.4 : 1, ...shadow.card }}>
            <View style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: color.blueTint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="link" size={20} color={color.blueDeep} />
            </View>
            <TextInput
              value={link}
              onChangeText={(t) => {
                setLinkError(false);
                // A whole address landing at once is a paste: take it.
                if (!link && t.length > 12 && linkSource(t) && /^https?:\/\//i.test(t.trim())) addLink(t);
                else setLink(t);
              }}
              onSubmitEditing={() => addLink()}
              placeholder="Paste a link"
              placeholderTextColor={color.grey3}
              accessibilityLabel="Paste a link"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              editable={!full}
              style={{ flex: 1, height: 48, fontSize: 16, color: color.ink }}
            />
            <Button pill variant="secondary" label={link.trim() ? 'Add' : 'Paste'} disabled={full} onPress={() => (link.trim() ? addLink() : void paste())} />
          </View>
        </Animated.View>
      </ScrollView>
      <Footer>
        <Button label="Write posts" icon="auto_awesome" disabled={empty && !link.trim()} onPress={() => void start()} />
      </Footer>
      {overlays}
    </KeyboardAvoidingView>
  );
}

/** One thing that was added: a picture of the page for a photo, an icon for the rest, its name and size. */
function SourceRow({ source, onRemove, busy }: { source: ImportSource; onRemove?: () => void; busy?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 64, paddingLeft: 12, paddingRight: 6, marginBottom: 12, borderRadius: radius.card, backgroundColor: color.card, overflow: 'hidden', ...shadow.card }}>
      <View style={{ width: 40, height: 40, borderRadius: radius.thumb, backgroundColor: color.blueTint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {isImage(source) && source.kind === 'file' ? <Image source={{ uri: source.uri }} resizeMode="cover" style={{ width: 40, height: 40 }} /> : <Icon name={sourceIcon(source)} size={22} color={color.blueDeep} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 20, fontWeight: '600', color: color.ink }}>
          {source.name}
        </Text>
        {busy ? (
          <ShimmerLine width="45%" />
        ) : sourceMeta(source) ? (
          <Text numberOfLines={1} style={text.meta}>
            {sourceMeta(source)}
          </Text>
        ) : null}
      </View>
      {onRemove ? (
        <Press accessibilityRole="button" accessibilityLabel={`Remove ${source.name}`} onPress={onRemove} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" size={20} color={color.grey3} />
        </Press>
      ) : null}
    </View>
  );
}

/** The bar under the title: creeps while the brief is read, then fills as posts land. */
function Progress({ reading, planning, done, total, complete }: { reading: boolean; planning: boolean; done: number; total: number; complete: boolean }) {
  const p = useSharedValue(0);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (complete) p.set(withTiming(1, { duration: 320, easing: motion.tabEase }));
    else if (reading) p.set(withTiming(0.14, { duration: 14_000, easing: Easing.out(Easing.cubic) }));
    // While posts are still being found the total is not final, so the bar keeps a little back.
    else p.set(withTiming(0.14 + (planning ? 0.7 : 0.82) * (total ? done / total : 0), { duration: 420, easing: motion.tabEase }));
  }, [reading, planning, done, total, complete, p]);
  const bar = useAnimatedStyle(() => ({ width: p.get() * width }));
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: 6, borderRadius: radius.pill, backgroundColor: color.grey2, overflow: 'hidden' }}>
      <Animated.View style={[{ height: 6, borderRadius: radius.pill, backgroundColor: complete ? color.green : color.blue }, bar]} />
    </View>
  );
}

const ROW = { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 82, paddingVertical: 10, paddingLeft: 12, paddingRight: 6, marginBottom: 12, borderRadius: radius.card, backgroundColor: color.card, ...shadow.card } as const;
const THUMB_W = 46;
const THUMB_H = 62;

/** A post still to be found. */
function GhostRow() {
  return (
    <View style={ROW}>
      <View style={{ width: THUMB_W, height: THUMB_H, borderRadius: radius.thumb, backgroundColor: color.grey1, overflow: 'hidden' }}>
        <Shimmer light />
      </View>
      <View style={{ flex: 1 }}>
        <ShimmerLine width="70%" />
        <ShimmerLine width="40%" />
      </View>
    </View>
  );
}

/** One post: named the moment it is found, shimmering while it is written, then its first frame and a tick to keep it. */
function PostRow({ post, state, onOpen, onPick, onRetry }: { post: PlannedPost; state: RowState; onOpen: () => void; onPick: () => void; onRetry: () => void }) {
  const { status, g } = state;
  const isDone = status === 'done' && !!g;
  const title = g?.title || post.title;
  const first = g?.clips[0];
  const count = g?.clips.length ?? 0;
  const unit = post.type === 'Slideshow' ? 'slide' : 'clip';

  // The tick pops when the post lands and each time it is kept.
  const pop = useSharedValue(1);
  useEffect(() => {
    if (isDone && state.picked) pop.set(withSequence(withTiming(0.6, { duration: 0 }), withTiming(1, { duration: 360, easing: motion.spring })));
  }, [isDone, state.picked, pop]);
  const tick = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  return (
    <View style={[ROW, { opacity: isDone && !state.picked ? 0.55 : 1 }]}>
      <Press accessibilityRole="button" accessibilityLabel={`${title}. ${isDone ? 'Open' : status}`} disabled={!isDone} onPress={onOpen} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {isDone && first ? (
          <Animated.View entering={FadeIn.duration(260)}>
            <ClipFrame width={THUMB_W} height={THUMB_H} radius={radius.thumb} texts={clipTexts(first)} />
          </Animated.View>
        ) : (
          <View style={{ borderRadius: radius.thumb, overflow: 'hidden' }}>
            <TypeTile type={post.type} size={THUMB_W} />
            {status === 'writing' ? <Shimmer light /> : null}
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={2} style={{ fontSize: 16, lineHeight: 20, fontWeight: '600', color: color.ink }}>
            {title}
          </Text>
          {isDone ? (
            <Text numberOfLines={1} style={[text.meta, { marginTop: 3 }]}>
              {post.type}
              {post.type === 'Long Text' ? '' : `, ${count} ${unit}${count === 1 ? '' : 's'}`}
            </Text>
          ) : status === 'failed' ? (
            <Text numberOfLines={1} style={[text.meta, { marginTop: 3, color: color.amber }]}>
              Not written
            </Text>
          ) : (
            <ShimmerLine width={status === 'writing' ? '55%' : '30%'} />
          )}
        </View>
      </Press>
      {status === 'failed' ? (
        <Button pill variant="quiet" icon="refresh" label="Retry" onPress={onRetry} style={{ marginRight: 6 }} />
      ) : isDone ? (
        <Press accessibilityRole="checkbox" accessibilityState={{ checked: state.picked }} accessibilityLabel={`Keep ${title}`} onPress={onPick} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={tick}>
            <Icon name={state.picked ? 'check_circle' : 'radio_button_unchecked'} size={28} color={state.picked ? color.blue : color.grey3} />
          </Animated.View>
        </Press>
      ) : (
        <View style={{ width: 44 }} />
      )}
    </View>
  );
}

interface ReviewProps {
  posts: PlannedPost[];
  rows: Record<number, RowState>;
  /** The post to open on. */
  at: number;
  onClose: () => void;
  onPick: (index: number, picked: boolean) => void;
  onOpenClip: (index: number, clip: string | null) => void;
  onLongText: (index: number, patch: Partial<LongTextState>) => void;
}

/** The written posts one at a time, each as the template it will be saved as. Swipe or tap Next. */
function Review({ posts: list, rows, at, onClose, onPick, onOpenClip, onLongText }: ReviewProps) {
  const { width } = useWindowDimensions();
  const pager = useRef<ScrollViewInstance>(null);
  const [page, setPage] = useState(() => Math.max(0, list.findIndex((p) => p.index === at)));
  const cur = list[Math.min(page, list.length - 1)];
  const row = rows[cur.index];
  const last = page >= list.length - 1;

  const go = (to: number) => {
    const next = Math.max(0, Math.min(list.length - 1, to));
    setPage(next);
    pager.current?.scrollTo({ x: next * width, animated: true });
  };
  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.max(0, Math.min(list.length - 1, Math.round(e.nativeEvent.contentOffset.x / width))));
  const next = () => (last ? onClose() : go(page + 1));

  return (
    <>
      <PushHeader
        onBack={onClose}
        center={
          <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', color: color.ink, fontVariant: ['tabular-nums'] }}>
            {page + 1} of {list.length}
          </Text>
        }
      />
      <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentOffset={{ x: page * width, y: 0 }} onMomentumScrollEnd={settle} scrollEventThrottle={32} onScroll={Platform.OS === 'web' ? settle : undefined} style={{ flex: 1 }}>
        {list.map((p, i) => {
          const g = rows[p.index]?.g;
          // Only the pages around the current one are drawn.
          if (!g || Math.abs(i - page) > 1) return <View key={p.index} style={{ width }} />;
          const first = g.clips[0];
          return (
            <View key={p.index} style={{ width, opacity: rows[p.index]?.picked ? 1 : 0.5 }}>
              {p.type === 'Long Text' ? (
                <LongTextView lt={{ title: g.title, onScreen: first?.doc?.texts[0]?.text ?? first?.onScreen ?? '', notes: '', doc: first?.doc ?? null }} onChange={(patch) => onLongText(p.index, patch)} />
              ) : (
                <TemplateView g={g} type={p.type} script onOpenClip={(id) => onOpenClip(p.index, id)} />
              )}
            </View>
          );
        })}
      </ScrollView>
      <Footer>
        <Button
          variant="quiet"
          label={row?.picked ? 'Remove' : 'Keep'}
          onPress={() => {
            const keep = !row?.picked;
            onPick(cur.index, keep);
            if (!keep) next();
          }}
        />
        <Button label={last ? 'Done' : 'Next'} onPress={next} />
      </Footer>
    </>
  );
}

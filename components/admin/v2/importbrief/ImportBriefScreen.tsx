// Upload brief: the manager adds an old brief (files, a link, pasted text),
// Noni reads it and lists the posts, writes them several at a time, and the
// manager saves the ones they want to the Briefs library in one tap.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  COUNT_OPTIONS,
  MAX_SOURCES,
  WRITE_PARALLEL,
  fileSizeLabel,
  importSaveInput,
  linkSource,
  pickImportFiles,
  planImport,
  pool,
  textSource,
  writeImportPost,
  type ImportPlanResult,
  type ImportSource,
  type PlannedPost,
  type WrittenPost,
} from '../../../../lib/brief-import';
import { useLibStore } from '../../../../lib/brief-library-api';
import { clipLabel, outlineTwinId, uid } from '../../../../lib/brief-library';
import { color, radius, shadow, space, text } from '../../../../theme/v2';
import { Button, Card, Chip, Footer, Icon, Label, Press, PushHeader, Seg, Sheet, TextButton, type IconName } from '../../../v2';
import { toast } from '../../../v2/Toast';
import { TypeTile } from '../briefs/TypeTile';
import { AiNote } from '../newbrief/AiNote';

/** The server calls, swappable so the dev preview can run the flow without a session. */
export type ImportApi = {
  pick: typeof pickImportFiles;
  plan: typeof planImport;
  write: typeof writeImportPost;
};
const REAL_API: ImportApi = { pick: pickImportFiles, plan: planImport, write: writeImportPost };

export interface ImportBriefScreenProps {
  companyId: string;
  userId: string | null;
  briefsHref: string;
  api?: ImportApi;
}

type Stage = 'add' | 'reading' | 'posts';
type RowState = { status: 'queued' | 'writing' | 'done' | 'failed'; written: WrittenPost | null; picked: boolean };

const READING_LINES = ['Reading every page', 'Finding the posts in it', 'Lifting the rules and claims', 'Planning the set'];
const SOURCE_ICON: Record<ImportSource['kind'], IconName> = { file: 'description', link: 'link', text: 'notes' };

export function ImportBriefScreen({ companyId, userId, briefsHref, api = REAL_API }: ImportBriefScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const saveBrief = useLibStore((s) => s.saveBrief);
  const setJustMade = useLibStore((s) => s.setJustMade);

  const [stage, setStage] = useState<Stage>('add');
  const [sources, setSources] = useState<ImportSource[]>([]);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const [count, setCount] = useState<number>(COUNT_OPTIONS[1]);
  const [picking, setPicking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [readingLine, setReadingLine] = useState(0);

  const [plan, setPlan] = useState<ImportPlanResult | null>(null);
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const [open, setOpen] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [leave, setLeave] = useState(false);
  // A run that was left behind must not write into a newer one.
  const run = useRef(0);
  useEffect(() => () => void (run.current += 1), []);

  useEffect(() => {
    if (stage !== 'reading') return;
    setReadingLine(0);
    const t = setInterval(() => setReadingLine((i) => Math.min(i + 1, READING_LINES.length - 1)), 9000);
    return () => clearInterval(t);
  }, [stage]);

  const full = sources.length >= MAX_SOURCES;
  const add = (more: ImportSource[]) => setSources((cur) => [...cur, ...more].slice(0, MAX_SOURCES));

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

  const addLink = () => {
    const src = linkSource(link);
    if (!src) {
      setLinkError(true);
      return;
    }
    add([src]);
    setLink('');
    setLinkError(false);
  };

  const addPasted = () => {
    const src = textSource(pasted);
    if (!src) return;
    add([src]);
    setPasted('');
    setPasteOpen(false);
  };

  const patch = (index: number, next: Partial<RowState>) => setRows((cur) => ({ ...cur, [index]: { ...cur[index], ...next } }));

  const writeOne = async (id: number, importId: string, post: PlannedPost) => {
    if (run.current !== id) return;
    patch(post.index, { status: 'writing' });
    try {
      const written = await api.write(importId, post);
      if (run.current === id) patch(post.index, { status: 'done', written, picked: true });
    } catch {
      if (run.current === id) patch(post.index, { status: 'failed', picked: false });
    }
  };

  const start = async () => {
    // A link still in the field counts.
    const typed = link.trim() ? linkSource(link) : null;
    const all = typed ? [...sources, typed].slice(0, MAX_SOURCES) : sources;
    if (!all.length) return;
    if (typed) {
      setSources(all);
      setLink('');
    }
    run.current += 1;
    const id = run.current;
    setProblem(null);
    setStage('reading');
    let result: ImportPlanResult;
    try {
      result = await api.plan(companyId, all, count);
    } catch (e) {
      if (run.current !== id) return;
      setProblem(e instanceof Error && e.message ? e.message : "Couldn't read that brief. Check your connection and try again.");
      setStage('add');
      return;
    }
    if (run.current !== id) return;
    setPlan(result);
    setRows(Object.fromEntries(result.posts.map((p) => [p.index, { status: 'queued', written: null, picked: true } satisfies RowState])));
    setOpen(null);
    setStage('posts');
    await pool(result.posts, WRITE_PARALLEL, (p) => writeOne(id, result.importId, p));
  };

  const retry = (post: PlannedPost) => {
    if (!plan) return;
    void writeOne(run.current, plan.importId, post);
  };

  const posts = plan?.posts ?? [];
  const states = posts.map((p) => rows[p.index]);
  const done = states.filter((s) => s?.status === 'done').length;
  const failed = states.filter((s) => s?.status === 'failed').length;
  const working = states.some((s) => s?.status === 'queued' || s?.status === 'writing');
  const chosen = useMemo(() => posts.filter((p) => rows[p.index]?.status === 'done' && rows[p.index]?.picked), [posts, rows]);

  const save = async () => {
    if (saving || !chosen.length) return;
    setSaving(true);
    const by = { userId, name: 'You' };
    const ids: string[] = [];
    const synced: Promise<string | null>[] = [];
    for (const p of chosen) {
      const written = rows[p.index]?.written;
      if (!written) continue;
      const input = importSaveInput(written, uid());
      const out = saveBrief(input, by);
      ids.push(input.id, ...(input.noTwin ? [] : [outlineTwinId(input.id)]));
      synced.push(out.synced);
    }
    const errors = (await Promise.all(synced)).filter(Boolean);
    setSaving(false);
    run.current += 1;
    setJustMade(ids);
    if (errors.length) toast.error("Couldn't save to your team yet. They're kept on this phone.");
    else toast.success(chosen.length === 1 ? '1 post saved' : `${chosen.length} posts saved`);
    try {
      router.dismissAll();
    } catch {
      // already at the root
    }
    router.navigate(briefsHref as Href);
  };

  const close = () => {
    if (stage === 'reading' || (stage === 'posts' && (working || done > 0))) setLeave(true);
    else router.back();
  };

  const header = <PushHeader close onBack={close} title={stage === 'posts' ? 'Your posts' : 'Upload brief'} />;

  if (stage === 'reading') {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top }}>
        {header}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 80 }}>
          <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: color.blueTint, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            <Icon name="auto_awesome" size={34} color={color.blue} />
          </View>
          <Text style={[text.card, { textAlign: 'center' }]}>Reading your brief</Text>
          <Animated.Text key={readingLine} entering={FadeIn.duration(260)} style={[text.body, { color: color.grey4, textAlign: 'center', marginTop: 8 }]}>
            {READING_LINES[readingLine]}
          </Animated.Text>
          <ActivityIndicator color={color.blue} style={{ marginTop: 24 }} />
          <Text style={[text.meta, { textAlign: 'center', marginTop: 24 }]}>About a minute. Keep this screen open.</Text>
        </View>
        <LeaveSheet open={leave} onStay={() => setLeave(false)} onLeave={() => router.back()} />
      </View>
    );
  }

  if (stage === 'posts' && plan) {
    const label = working ? `Writing ${Math.min(done + failed + 1, posts.length)} of ${posts.length}` : saving ? 'Saving' : chosen.length === 1 ? 'Save 1 post' : `Save ${chosen.length} posts`;
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top }}>
        {header}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.screen, paddingTop: 4, paddingBottom: 24 }}>
          {plan.summary ? <Text style={[text.body, { color: color.grey4, marginBottom: 14 }]}>{plan.summary}</Text> : null}
          {plan.skipped.length ? (
            <View style={{ marginBottom: 12 }}>
              <AiNote title={plan.skipped.length === 1 ? "One source couldn't be read" : `${plan.skipped.length} sources couldn't be read`} lines={plan.skipped.map((s) => s.reason)} />
            </View>
          ) : null}
          {posts.map((p, i) => (
            <Animated.View key={p.index} entering={FadeInDown.delay(Math.min(i, 10) * 45).duration(280)} layout={LinearTransition.duration(200)}>
              <PostRow
                post={p}
                state={rows[p.index]}
                open={open === p.index}
                onOpen={() => setOpen(open === p.index ? null : p.index)}
                onPick={() => patch(p.index, { picked: !rows[p.index]?.picked })}
                onRetry={() => retry(p)}
              />
            </Animated.View>
          ))}
        </ScrollView>
        <Footer>
          <Button label={label} icon={working || saving ? undefined : 'check'} disabled={working || saving || !chosen.length} onPress={() => void save()} />
        </Footer>
        <LeaveSheet open={leave} onStay={() => setLeave(false)} onLeave={() => router.back()} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top }}>
      {header}
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.screen, paddingTop: 4, paddingBottom: 24 }}>
        <Text style={text.card}>Turn a brief into posts</Text>
        <Text style={[text.body, { color: color.grey4, marginTop: 6, marginBottom: 18 }]}>Add an old brief, a content plan or your brand guidelines. Noni reads it and writes the posts as templates.</Text>

        {problem ? (
          <View style={{ marginBottom: 12 }}>
            <AiNote icon="error" title="That didn't work" body={problem} />
          </View>
        ) : null}

        <Press
          accessibilityRole="button"
          accessibilityLabel="Add files"
          onPress={() => void pick()}
          disabled={full}
          style={{ borderRadius: radius.card, borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.blue, backgroundColor: color.blueTint, paddingVertical: 22, alignItems: 'center', gap: 6, marginBottom: 12, opacity: full ? 0.4 : 1 }}
        >
          {picking ? <ActivityIndicator color={color.blue} /> : <Icon name="upload_file" size={30} color={color.blue} />}
          <Text style={{ fontSize: 16, lineHeight: 20, fontWeight: '700', color: color.blueDeep }}>Add files</Text>
          <Text style={{ fontSize: 13, lineHeight: 18, color: color.blueDeep, opacity: 0.8 }}>PDF, Word, slides, text or photos of pages</Text>
        </Press>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 52, paddingLeft: 14, paddingRight: 8, backgroundColor: color.card, borderRadius: radius.card, borderWidth: 2, borderColor: linkError ? color.pink : 'transparent', marginBottom: linkError ? 6 : 12, ...shadow.card }}>
          <Icon name="link" size={22} color={color.grey3} />
          <TextInput
            value={link}
            onChangeText={(t) => {
              setLink(t);
              setLinkError(false);
            }}
            onSubmitEditing={addLink}
            placeholder="Paste a Google Doc, Notion or web link"
            placeholderTextColor={color.grey3}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            editable={!full}
            style={{ flex: 1, height: 48, fontSize: 15, color: color.ink }}
          />
          {link.trim() ? <Button pill variant="secondary" label="Add" onPress={addLink} /> : null}
        </View>
        {linkError ? <Text style={[text.meta, { color: color.pink, marginBottom: 12 }]}>That doesn't look like a link.</Text> : null}

        <TextButton label="Or paste the text" onPress={() => setPasteOpen(true)} />

        {sources.length ? (
          <View style={{ marginTop: 18 }}>
            <Label style={{ marginBottom: 8 }}>{sources.length === 1 ? 'Added' : `Added (${sources.length})`}</Label>
            {sources.map((s) => (
              <Animated.View key={s.id} entering={FadeInDown.duration(220)} layout={LinearTransition.duration(180)}>
                <Card pad={0} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 14, paddingRight: 6, marginBottom: 8 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: color.grey1, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={SOURCE_ICON[s.kind]} size={20} color={color.grey4} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: color.ink }}>{s.name}</Text>
                    <Text numberOfLines={1} style={text.meta}>
                      {s.kind === 'file' ? fileSizeLabel(s.size) || 'File' : s.kind === 'link' ? s.url.replace(/^https?:\/\//, '') : `${s.text.length.toLocaleString()} characters`}
                    </Text>
                  </View>
                  <Press accessibilityRole="button" accessibilityLabel={`Remove ${s.name}`} onPress={() => setSources((cur) => cur.filter((x) => x.id !== s.id))} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="close" size={20} color={color.grey4} />
                  </Press>
                </Card>
              </Animated.View>
            ))}
          </View>
        ) : null}

        <Label style={{ marginTop: 18, marginBottom: 8 }}>Posts to make</Label>
        <Seg options={COUNT_OPTIONS.map((n) => ({ key: String(n), label: String(n) }))} value={String(count)} onChange={(k) => setCount(Number(k))} />
        <Text style={[text.meta, { marginTop: 8 }]}>Every post in the brief comes first. Noni adds new ones in its style up to this number.</Text>
      </ScrollView>
      <Footer>
        <Button label="Write posts" icon="auto_awesome" disabled={!sources.length && !link.trim()} onPress={() => void start()} />
      </Footer>

      <Sheet open={pasteOpen} onClose={() => setPasteOpen(false)} title="Paste the text" footer={<Button label="Add" disabled={pasted.trim().length < 20} onPress={addPasted} />}>
        <TextInput
          value={pasted}
          onChangeText={setPasted}
          placeholder="Paste your brief here"
          placeholderTextColor={color.grey3}
          multiline
          autoFocus
          style={{ minHeight: 160, maxHeight: 280, padding: 14, borderRadius: radius.option, backgroundColor: color.grey1, fontSize: 15, lineHeight: 20, color: color.ink, textAlignVertical: 'top' }}
        />
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function LeaveSheet({ open, onStay, onLeave }: { open: boolean; onStay: () => void; onLeave: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onStay}
      title="Leave without saving?"
      footer={
        <>
          <Button variant="quiet" label="Leave" onPress={onLeave} />
          <Button label="Stay" onPress={onStay} />
        </>
      }
    >
      <Text style={[text.body, { color: color.grey4 }]}>The posts written from this brief are not saved yet.</Text>
    </Sheet>
  );
}

/** One listed post: its state while it is written, then a tick to keep it and its clips on tap. */
function PostRow({ post, state, open, onOpen, onPick, onRetry }: { post: PlannedPost; state: RowState | undefined; open: boolean; onOpen: () => void; onPick: () => void; onRetry: () => void }) {
  const status = state?.status ?? 'queued';
  const written = state?.written ?? null;
  const title = written?.plan.title || post.title;
  const hook = written ? written.plan.clips[0]?.text || written.plan.clips[0]?.onScreen || '' : post.hook;
  const isDone = status === 'done' && !!written;

  return (
    <Card pad={0} style={{ overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingLeft: 14, paddingRight: 6, gap: 12, opacity: status === 'queued' ? 0.55 : 1 }}>
        <TypeTile type={post.type} size={36} />
        <Press accessibilityRole="button" accessibilityLabel={`${title}. ${isDone ? 'Show the post' : status}`} disabled={!isDone} onPress={onOpen} style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={2} style={{ fontSize: 16, lineHeight: 20, fontWeight: '600', color: color.ink }}>{title}</Text>
          <Text numberOfLines={open ? 1 : 2} style={[text.meta, { marginTop: 3 }]}>
            {status === 'failed' ? "Couldn't write this one." : hook || post.angle}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'center' }}>
            <Chip tone="grey" label={post.type} />
            <Chip tone={post.origin === 'document' ? 'blue' : 'purple'} label={post.origin === 'document' ? 'From your brief' : 'New idea'} />
          </View>
        </Press>
        {status === 'failed' ? (
          <Button pill variant="quiet" icon="refresh" label="Retry" onPress={onRetry} />
        ) : isDone ? (
          <Press accessibilityRole="checkbox" accessibilityState={{ checked: !!state?.picked }} accessibilityLabel={`Keep ${title}`} onPress={onPick} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={state?.picked ? 'check_circle' : 'radio_button_unchecked'} size={28} color={state?.picked ? color.blue : color.grey3} />
          </Press>
        ) : (
          <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>{status === 'writing' ? <ActivityIndicator color={color.blue} /> : <Icon name="schedule" size={22} color={color.grey3} />}</View>
        )}
      </View>
      {open && written ? (
        <Animated.View entering={FadeIn.duration(180)} style={{ borderTopWidth: 1, borderTopColor: color.grey1, paddingVertical: 12, paddingHorizontal: 14, gap: 12 }}>
          {written.plan.clips.map((c, i) => (
            <View key={c.id} style={{ gap: 2 }}>
              <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', color: color.grey4 }}>{c.cta ? 'Close' : clipLabel(i, post.type)}</Text>
              {c.text ? <Text style={[text.body, { lineHeight: 21 }]}>{c.text}</Text> : null}
              {c.onScreen ? <Text style={{ fontSize: 14, lineHeight: 19, fontWeight: '600', color: color.ink }}>{c.text ? `On screen: ${c.onScreen}` : c.onScreen}</Text> : null}
              {c.shot ? <Text style={text.meta}>{c.shot}</Text> : null}
            </View>
          ))}
          {written.plan.caption ? (
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', color: color.grey4 }}>Caption</Text>
              <Text style={text.body}>{written.plan.caption}</Text>
              {written.plan.tags.length ? <Text style={[text.meta, { color: color.blueDeep }]}>{written.plan.tags.join(' ')}</Text> : null}
            </View>
          ) : null}
          {written.plan.ai.warnings.length ? <AiNote title="Worth a look" lines={written.plan.ai.warnings} /> : null}
        </Animated.View>
      ) : null}
    </Card>
  );
}

// Edit my video: the raw takes go to the auto-edit function, which cuts the
// dead air and retakes, puts the hook and a header on each tip when it is
// said, adds captions and pops up a feature recording when the product is
// named. Then the creator edits like on TikTok (trim, split, move, text,
// pictures, captions), adds a caption for Story and Freestyle posts,
// reviews and sends. Adding a take later runs the auto edit again on every
// take.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { DetailsStep } from '../../../../components/creator/briefs/DetailsStep';
import { useAvatarUrl } from '../../../../components/creator/briefs/FypChrome';
import { hashtagList, splitCaption } from '../../../../components/creator/briefs/model';
import { AutoEditProgress } from '../../../../components/creator/briefs/raw/AutoEditProgress';
import { useRawProject } from '../../../../components/creator/briefs/raw/useRawProject';
import { MeasuredOverlayLayer, ReelEditor } from '../../../../components/creator/briefs/reel/ReelEditor';
import { ReviewStep, type ScriptRow } from '../../../../components/creator/briefs/ReviewStep';
import { VideoStage } from '../../../../components/creator/studio/timeline/VideoStage';
import { useAuth } from '../../../../lib/auth';
import {
  applyAutoEdit,
  autoFeatures,
  forgetAutoEdit,
  needsAutoEdit,
  readAutoEdit,
  runAutoEdit,
  skipAutoEdit,
  takeKey,
  takesOf,
} from '../../../../lib/auto-edit';
import type { VideoDocument } from '../../../../lib/edit-document';
import { pickFeature } from '../../../../lib/library-api';
import { saveProject } from '../../../../lib/projects-api';
import { onVideo, useStudioStore } from '../../../../lib/studio-store';
import { submitProject } from '../../../../lib/submissions';
import { color, space, type } from '../../../../theme/tokens';

type Phase = 'auto' | 'edit' | 'details' | 'review';

/** The server steps advance on a clock while the one call runs. */
const STEP_AT_MS = [0, 3500, 8000];

function ReviewStage({ doc }: { doc: VideoDocument }): JSX.Element {
  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoStage doc={doc}>
        <MeasuredOverlayLayer doc={doc} captions />
      </VideoStage>
    </View>
  );
}

function seconds(ms: number): string {
  return `${Math.max(1, Math.round(ms / 1000))}s`;
}

export default function CutRoute(): JSX.Element {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const raw = useRawProject(id);
  const { brief, document, features, scope, assignment, projectId, uploads } = raw;
  const avatarUri = useAvatarUrl(profile?.avatar_path);
  const handle = `@${(profile?.full_name?.split(' ')[0] ?? 'you').toLowerCase()}`;

  const [phase, setPhase] = useState<Phase>('auto');
  const [fromReview, setFromReview] = useState(false);
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(false);
  const [retry, setRetry] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [meta, setMeta] = useState({ caption: '', tags: '', search: '' });
  const runFor = useRef<string | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const takes = useMemo(() => (document ? takesOf(document) : []), [document]);
  const waitingOn = takes.filter((t) => !t.storagePath);
  const lost = takes.filter((t) => uploads.missing.includes(t.id));
  const ownDetails = brief?.kind === 'story' || brief?.kind === 'open';

  const toCamera = useCallback(
    (fromEdit: boolean) => router.replace({ pathname: '/(creator)/make/raw/[id]', params: { id, ...(fromEdit ? { from: 'edit' } : {}) } }),
    [router, id],
  );

  // A reel made before Edit my video, reopened for changes, keeps its cut as it is.
  useEffect(() => {
    if (from === 'changes' && document && readAutoEdit(document) === null && document.blocks.length > 0) {
      useStudioStore.getState().amend(onVideo(skipAutoEdit));
    }
  }, [from, document]);

  // Nothing to cut (opened from changes requested, or after Edit by hand): straight to the editor.
  const settled = phase === 'auto' && document !== null && !running && !needsAutoEdit(document);
  const view: Phase = settled && (document?.blocks.length ?? 0) > 0 ? 'edit' : phase;
  useEffect(() => {
    if (settled && document?.blocks.length === 0) toCamera(false);
  }, [settled, document, toCamera]);

  // A take that is gone from the phone and never uploaded cannot be cut.
  useEffect(() => {
    if (view !== 'auto' || lost.length === 0) return;
    Alert.alert(lost.length === 1 ? 'A clip was lost' : `${lost.length} clips were lost`, 'They are no longer on this phone. Record them again.', [
      { text: 'Open camera', onPress: () => toCamera(false) },
    ]);
  }, [view, lost.length, toCamera]);

  useEffect(() => {
    if (view === 'auto' && uploads.failed > 0) uploads.retry();
  }, [view, uploads]);

  const run = useCallback(async () => {
    const doc = useStudioStore.getState().document;
    if (!doc || doc.format !== 'video' || !scope || !needsAutoEdit(doc)) return;
    const list = takesOf(doc);
    if (list.length === 0 || list.some((t) => !t.storagePath)) return;
    const key = takeKey(list);
    if (runFor.current === key) return;
    runFor.current = key;
    setRunning(true);
    setStep(1);
    const timers = STEP_AT_MS.slice(1).map((at, k) => setTimeout(() => alive.current && setStep(k + 2), at));
    const featureList = autoFeatures(features);
    try {
      const known = readAutoEdit(doc)?.words ?? {};
      const reply = await runAutoEdit({ assignmentId: scope.assignmentId, takes: list, features: featureList, words: known });
      // Already heard takes skip the listening step on the server.
      if (list.every((t) => t.id in known)) setStep((n) => Math.max(n, 2));
      if (!alive.current) return;
      useStudioStore.getState().commit(onVideo((d) => applyAutoEdit(d, list, reply, featureList)));
      useStudioStore.getState().setPlayhead(0);
      setStep(4);
      setPhase('edit');
    } catch (e) {
      if (!alive.current) return;
      Alert.alert("Couldn't edit it", e instanceof Error ? e.message : 'Try again.', [
        {
          text: 'Edit by hand',
          style: 'cancel',
          onPress: () => {
            useStudioStore.getState().commit(onVideo(skipAutoEdit));
            setPhase('edit');
          },
        },
        {
          text: 'Try again',
          onPress: () => {
            runFor.current = null;
            setStep(0);
            setRetry((n) => n + 1);
          },
        },
      ]);
    } finally {
      timers.forEach(clearTimeout);
      if (alive.current) setRunning(false);
    }
  }, [scope, features]);

  // Run once every take has uploaded.
  useEffect(() => {
    if (phase !== 'auto' || raw.loading || !document || running || !needsAutoEdit(document)) return;
    if (takes.length === 0 || waitingOn.length > 0) return;
    const t = setTimeout(() => void run(), 0);
    return () => clearTimeout(t);
  }, [phase, raw.loading, document, running, takes.length, waitingOn.length, run, retry]);

  const redo = () => {
    Alert.alert('Redo the auto edit?', 'Your text and trims go back to what Noni picks.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Redo',
        onPress: () => {
          runFor.current = null;
          useStudioStore.getState().commit(onVideo(forgetAutoEdit));
          setStep(0);
          setPhase('auto');
        },
      },
    ]);
  };

  const addClip = () => {
    Alert.alert('Add to your video?', 'Record more and Noni edits the whole thing again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open camera', onPress: () => toCamera(true) },
    ]);
  };

  const submit = async () => {
    if (!assignment || !brief || !scope || !projectId || submitting) return;
    const doc = useStudioStore.getState().document;
    if (!doc || doc.format !== 'video' || doc.blocks.length === 0) {
      Alert.alert('Nothing recorded yet');
      return;
    }
    if (uploads.failed > 0) {
      uploads.retry();
      Alert.alert('Upload failed. Trying again.');
      return;
    }
    if (uploads.pending > 0) {
      Alert.alert('Still uploading your clips');
      return;
    }
    setSubmitting(true);
    try {
      await saveProject({ ...scope, document: doc });
      useStudioStore.getState().markSaved(doc);
      await submitProject({
        assignment,
        companyId: scope.companyId,
        creatorId: scope.creatorId,
        projectId,
        document: doc,
        ...(ownDetails ? { caption: meta.caption.trim(), hashtags: hashtagList(meta.tags) } : {}),
      });
      raw.forgetDraft();
      router.replace({
        pathname: '/(creator)/make/sent',
        params: { assignmentId: scope.assignmentId, title: brief.kind === 'open' && !brief.title ? 'Your freestyle post' : brief.title },
      });
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (raw.loading || !brief || !document || !scope) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        {raw.error ? <Text style={styles.error}>{raw.error}</Text> : <ActivityIndicator color={color.blue500} />}
      </View>
    );
  }

  const state = readAutoEdit(document);
  const status = state && state.cutMs > 0 ? `Cut ${seconds(state.cutMs)} of dead air` : 'Your video';
  const scriptRows: ScriptRow[] = document.overlays
    .filter((o) => o.kind === 'text')
    .sort((a, b) => a.startMs - b.startMs)
    .map((o, k) => ({ key: o.id, role: k === 0 && o.startMs === 0 ? 'cover' : 'point', text: o.kind === 'text' ? o.text : '' }));
  const capText = ownDetails ? meta.caption : splitCaption(brief.caption).text;
  const tagText = ownDetails
    ? meta.tags
    : brief.hashtags.length
      ? brief.hashtags.map((t) => `#${t.replace(/^#/, '')}`).join(' ')
      : splitCaption(brief.caption).tags;

  let body: JSX.Element;
  if (view === 'auto') {
    const uploaded = takes.length - waitingOn.length;
    body = (
      <AutoEditProgress
        step={waitingOn.length > 0 ? 0 : step}
        detail={takes.length > 1 ? `${uploaded} of ${takes.length}` : null}
        onBack={() => toCamera(false)}
      />
    );
  } else if (view === 'details') {
    body = (
      <DetailsStep
        brief={brief}
        lines={scriptRows.map((r) => r.text)}
        caption={meta.caption}
        tags={meta.tags}
        search={meta.search}
        onChange={(v) => setMeta((m) => ({ ...m, ...v }))}
        onBack={() => setPhase('edit')}
        onReview={() => setPhase('review')}
      />
    );
  } else if (view === 'review') {
    body = (
      <ReviewStep
        format="reel"
        slides={[]}
        feature={pickFeature(features, brief.cta.featureId)}
        caption={capText}
        tags={tagText}
        handle={handle}
        avatarUri={avatarUri}
        stage={<ReviewStage doc={document} />}
        scriptRows={scriptRows}
        submitting={submitting}
        onBack={() => setPhase(ownDetails ? 'details' : 'edit')}
        onEdit={() => {
          setFromReview(true);
          setPhase('edit');
        }}
        onSubmit={() => void submit()}
      />
    );
  } else {
    const backToReview = () => {
      setFromReview(false);
      setPhase('review');
    };
    body = (
      <ReelEditor
        doc={document}
        items={[]}
        companyId={scope.companyId}
        cuts={0}
        place="any"
        status={status}
        aiLabel="Redo"
        captions
        onBack={fromReview ? backToReview : () => router.back()}
        onNext={fromReview ? backToReview : () => setPhase(ownDetails ? 'details' : 'review')}
        onAddClip={addClip}
        onRedoClip={() => undefined}
        onAi={redo}
      />
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: view !== 'auto' }} />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink900 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.ink900 },
  error: { fontSize: type.size.body, color: color.white, textAlign: 'center', paddingHorizontal: space[8] },
});

// Record: the v2 camera for a free post, an outline or a guided brief. Kept
// clips go to recording_drafts as they land; Next builds the studio document
// and opens the editor; a Long Text post submits straight from here.
//
// One post per draft: the post id rides in the local draft, so closing and
// reopening the camera keeps filming into the same post instead of starting
// a new one. `post` resumes a post by id (Home, push); `add` films more clips
// for the editor that opened the camera and hands them back to it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { videoAsset } from '../../components/creator/studio/capture/media-assets';
import { RecordScreen } from '../../components/creator/v2/record/RecordScreen';
import {
  clearRecordDraft,
  loadRecordDraft,
  postDraftKey,
  recordToDoc,
  saveEditHandoff,
  saveRecordDraft,
  type RecordClip,
  type RecordDraft,
  type RecordMode,
} from '../../components/creator/v2/record/model';
import { toast } from '../../components/v2/Toast';
import { useAuth } from '../../lib/auth';
import { useLibStore } from '../../lib/brief-library-api';
import { ensureCreatorPost, findOpenCreatorPost, getOpenCreatorPost, startCreatorPost } from '../../lib/creator-posts-api';
import type { MediaAsset, VideoDocument } from '../../lib/edit-document';
import { loadProject, saveProject } from '../../lib/projects-api';
import { loadDraftSegments, saveDraftSegment } from '../../lib/recording-drafts';
import { useStudioStore } from '../../lib/studio-store';
import { supabase } from '../../lib/supabase';
import { draftClipPath, submitProject, uploadClip } from '../../lib/submissions';
import type { Assignment } from '../../lib/tasks';
import { color } from '../../theme/v2';

function param(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Clips already on the server for a post, as a local draft the camera can show. */
async function serverDraft(companyId: string, assignmentId: string): Promise<RecordDraft | null> {
  const segments = await loadDraftSegments(companyId, assignmentId).catch(() => []);
  if (segments.length === 0) return null;
  const { data } = await supabase.storage.from('videos').createSignedUrls(segments.map((s) => s.storage_path), 60 * 60 * 24);
  const urls = new Map((data ?? []).map((e) => [e.path, e.signedUrl]));
  const clips: (RecordClip | null)[] = [];
  for (const s of segments) {
    const asset: MediaAsset = { id: `srv-${s.slot_index}-${s.storage_path.split('/').pop() ?? ''}`, kind: 'video', localUri: urls.get(s.storage_path) ?? null, storagePath: s.storage_path, durationMs: s.duration_ms, width: null, height: null };
    clips[s.slot_index] = { slot: s.slot_index, asset, gs: null };
  }
  return { clips: Array.from(clips, (c) => c ?? null), gsMap: {}, myText: '', ci: Math.min(segments.length, clips.length), assignmentId };
}

/** New clips appended to the editor's timeline, in the order they were filmed. */
function appendClips(doc: VideoDocument, clips: RecordClip[]): VideoDocument {
  const { doc: extra } = recordToDoc(clips, null);
  return { ...doc, assets: [...doc.assets, ...extra.assets], blocks: [...doc.blocks, ...extra.blocks] };
}

export default function CaptureRoute() {
  const params = useLocalSearchParams<{ mode?: string; id?: string; text?: string; clip?: string; clipMs?: string; post?: string; add?: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const mode = (param(params.mode) as RecordMode | undefined) ?? 'free';
  const briefId = param(params.id);
  const postId = param(params.post);
  const adding = param(params.add) === '1' && !!postId;
  const companyId = profile?.active_company_id ?? null;
  const creatorId = profile?.id ?? null;
  const load = useLibStore((s) => s.load);
  const brief = useLibStore((s) => (briefId ? s.briefs.find((b) => b.id === briefId) : undefined));
  const loaded = useLibStore((s) => s.loaded);
  const [initialClip, setInitialClip] = useState<MediaAsset | null | undefined>(param(params.clip) ? undefined : null);
  const assignmentRef = useRef<Assignment | null>(null);
  const [draftKey, setDraftKey] = useState<string | null>(postId ? null : briefId ? `brief:${briefId}` : 'free');

  useEffect(() => {
    if (companyId && briefId) void load(companyId);
  }, [companyId, briefId, load]);

  const clipUri = param(params.clip);
  const clipMs = Number(param(params.clipMs) ?? 0);
  useEffect(() => {
    if (!clipUri) return;
    let live = true;
    void videoAsset(clipUri, clipMs).then((a) => live && setInitialClip(a)).catch(() => live && setInitialClip(null));
    return () => {
      live = false;
    };
  }, [clipUri, clipMs]);

  // Resuming a post: film into the local draft that already points at it,
  // else a per post draft seeded from the clips the server kept.
  useEffect(() => {
    if (!postId || !companyId || !creatorId) return;
    let live = true;
    void (async () => {
      const a = await getOpenCreatorPost(companyId, creatorId, postId).catch(() => null);
      if (!live) return;
      if (!a) {
        toast.error('This post was already sent or removed.');
        router.back();
        return;
      }
      assignmentRef.current = a;
      if (adding) {
        const key = `add:${postId}`;
        clearRecordDraft(key);
        setDraftKey(key);
        return;
      }
      for (const k of [briefId ? `brief:${briefId}` : 'free', postDraftKey(postId)]) {
        const d = await loadRecordDraft(k);
        if (d && d.assignmentId === postId && d.clips.some(Boolean)) {
          if (live) setDraftKey(k);
          return;
        }
      }
      const seeded = await serverDraft(companyId, postId);
      if (seeded) saveRecordDraft(postDraftKey(postId), seeded);
      if (live) setDraftKey(postDraftKey(postId));
    })();
    return () => {
      live = false;
    };
  }, [postId, adding, companyId, creatorId, briefId, router]);

  // A brief already being edited opens its editor instead of a blank camera
  // that would overwrite the edit on Next.
  useEffect(() => {
    if (postId || !briefId || !companyId || !creatorId) return;
    let live = true;
    void (async () => {
      const open = await findOpenCreatorPost(companyId, creatorId, briefId).catch(() => null);
      if (!open || !live) return;
      assignmentRef.current = open;
      const project = await loadProject(companyId, open.id).catch(() => null);
      if (live && project?.document.format === 'video' && project.document.blocks.length > 0) {
        toast.show('Picking up your draft');
        router.replace({ pathname: '/(creator)/edit/[id]', params: { id: open.id } });
      }
    })();
    return () => {
      live = false;
    };
  }, [postId, briefId, companyId, creatorId, router]);

  const title = brief?.title ?? 'New post';

  /** The post these clips belong to: the one already known, the draft's, an open one for the brief, or a new one. */
  const ensure = useCallback(
    async (draftAssignmentId: string | null) => {
      if (assignmentRef.current) return assignmentRef.current;
      if (!companyId || !creatorId) throw new Error('Not signed in');
      if (draftAssignmentId) {
        const open = await getOpenCreatorPost(companyId, creatorId, draftAssignmentId).catch(() => null);
        if (open) {
          assignmentRef.current = open;
          return open;
        }
      }
      const a = briefId
        ? await ensureCreatorPost({ companyId, creatorId, title, format: 'video', libraryBriefId: briefId })
        : await startCreatorPost({ companyId, title, format: 'video' });
      assignmentRef.current = a;
      return a;
    },
    [companyId, creatorId, title, briefId],
  );

  // Server side draft: upload the clip and record it, so another launch or phone can pick it up.
  const onClip = useCallback(
    async (clip: RecordClip, draftAssignmentId: string | null): Promise<string | null> => {
      if (!companyId || !creatorId || !clip.asset.localUri || adding) return null;
      try {
        const a = await ensure(draftAssignmentId);
        const path = draftClipPath(companyId, a.id, clip.slot);
        await uploadClip(clip.asset.localUri, path);
        await saveDraftSegment({ companyId, assignmentId: a.id, creatorId, segment: { slot_index: clip.slot, kind: clip.slot === 0 ? 'hook' : 'point', storage_path: path, duration_ms: clip.asset.durationMs ?? 0 } });
        clip.asset.storagePath = path;
        return a.id;
      } catch {
        // The clip stays on the phone; the editor uploads it again before sending.
        return assignmentRef.current?.id ?? null;
      }
    },
    [companyId, creatorId, ensure, adding],
  );

  const toEditor = useCallback(
    async (clips: RecordClip[], draft: RecordDraft) => {
      if (!companyId || !creatorId || !draftKey) return;
      if (adding && postId) {
        // Back to the editor that opened the camera, with the new clips at the end.
        const store = useStudioStore.getState();
        const current = store.ownerId === postId && store.document?.format === 'video' ? store.document : (await loadProject(companyId, postId))?.document;
        if (!current || current.format !== 'video') throw new Error('Could not find the edit for this post');
        const next = appendClips(current, clips);
        useStudioStore.getState().load(next, postId);
        await saveProject({ companyId, creatorId, assignmentId: postId, document: next });
        clearRecordDraft(draftKey);
        router.back();
        return;
      }
      const a = await ensure(draft.assignmentId);
      const { doc, scripts } = recordToDoc(clips, brief ?? null);
      useStudioStore.getState().load(doc, a.id);
      await saveProject({ companyId, creatorId, assignmentId: a.id, document: doc });
      // Free posts get named on the send step; brief posts keep the brief's title.
      await saveEditHandoff(a.id, { title: brief ? title : '', scripts, draftKey: null, soundMode: brief?.audio?.mode ?? null, talkingHead: brief?.type === 'Talking Head' });
      // The project holds the clips now; the camera draft would only start a second copy.
      clearRecordDraft(draftKey);
      router.replace({ pathname: '/(creator)/edit/[id]', params: { id: a.id } });
    },
    [companyId, creatorId, ensure, brief, title, draftKey, router, adding, postId],
  );

  const submitSeven = useCallback(
    async (clips: RecordClip[], text: string) => {
      if (!companyId || !creatorId || !draftKey) throw new Error('Not signed in');
      const draft = await loadRecordDraft(draftKey);
      const a = await ensure(draft?.assignmentId ?? null);
      const { doc } = recordToDoc(clips, brief ?? null, { text, seven: true });
      const projectId = await saveProject({ companyId, creatorId, assignmentId: a.id, document: doc });
      // The clips were uploaded as they landed; a clip still local uploads now.
      for (const asset of doc.assets) {
        if (asset.kind === 'video' && !asset.storagePath && asset.localUri) {
          const path = draftClipPath(companyId, a.id, 0);
          await uploadClip(asset.localUri, path);
          asset.storagePath = path;
        }
      }
      await saveProject({ companyId, creatorId, assignmentId: a.id, document: doc });
      await submitProject({ assignment: a, companyId, creatorId, projectId, document: doc });
      clearRecordDraft(draftKey);
    },
    [companyId, creatorId, ensure, brief, draftKey],
  );

  const initialText = useMemo(() => param(params.text) ?? '', [params.text]);
  const waiting = !profile || (briefId && !brief && !loaded) || initialClip === undefined || draftKey === null;
  if (waiting) return <View style={{ flex: 1, backgroundColor: color.ink }} />;
  return (
    <RecordScreen
      key={draftKey}
      mode={brief && !adding ? mode : 'free'}
      brief={adding ? null : (brief ?? null)}
      initialText={initialText}
      draftKey={draftKey}
      initialClip={initialClip}
      nextLabel={adding ? 'Add to edit' : undefined}
      onClose={() => router.back()}
      onNext={toEditor}
      onSubmit={submitSeven}
      onSent={() => router.dismissTo('/(creator)/(tabs)')}
      onClip={onClip}
    />
  );
}

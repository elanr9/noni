// Record: the v2 camera for a free post, an outline or a guided brief. Kept
// clips go to recording_drafts as they land; Next builds the studio document
// and opens the editor; a Long Text post submits straight from here.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { videoAsset } from '../../components/creator/studio/capture/media-assets';
import { RecordScreen } from '../../components/creator/v2/record/RecordScreen';
import { clearRecordDraft, recordToDoc, saveEditHandoff, type RecordClip, type RecordDraft, type RecordMode } from '../../components/creator/v2/record/model';
import { useAuth } from '../../lib/auth';
import { useLibStore } from '../../lib/brief-library-api';
import { ensureCreatorPost } from '../../lib/creator-posts-api';
import type { MediaAsset } from '../../lib/edit-document';
import { saveProject } from '../../lib/projects-api';
import { saveDraftSegment } from '../../lib/recording-drafts';
import { useStudioStore } from '../../lib/studio-store';
import { draftClipPath, submitProject, uploadClip } from '../../lib/submissions';
import type { Assignment } from '../../lib/tasks';

function param(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default function CaptureRoute() {
  const params = useLocalSearchParams<{ mode?: string; id?: string; text?: string; clip?: string; clipMs?: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const mode = (param(params.mode) as RecordMode | undefined) ?? 'free';
  const briefId = param(params.id);
  const companyId = profile?.active_company_id ?? null;
  const creatorId = profile?.id ?? null;
  const load = useLibStore((s) => s.load);
  const brief = useLibStore((s) => (briefId ? s.briefs.find((b) => b.id === briefId) : undefined));
  const loaded = useLibStore((s) => s.loaded);
  const [initialClip, setInitialClip] = useState<MediaAsset | null | undefined>(param(params.clip) ? undefined : null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);

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

  const draftKey = briefId ? `brief:${briefId}` : 'free';
  const title = brief?.title ?? 'New post';

  const ensure = useCallback(async () => {
    if (assignment) return assignment;
    if (!companyId || !creatorId) throw new Error('Not signed in');
    const a = await ensureCreatorPost({ companyId, creatorId, title, format: 'video', libraryBriefId: briefId ?? null });
    setAssignment(a);
    return a;
  }, [assignment, companyId, creatorId, title, briefId]);

  // Server side draft: upload the clip and record it, so another launch or phone can pick it up.
  const onClip = useCallback(
    async (clip: RecordClip): Promise<string | null> => {
      if (!companyId || !creatorId || !clip.asset.localUri) return null;
      try {
        const a = await ensure();
        const path = draftClipPath(companyId, a.id, clip.slot);
        await uploadClip(clip.asset.localUri, path);
        await saveDraftSegment({ companyId, assignmentId: a.id, creatorId, segment: { slot_index: clip.slot, kind: clip.slot === 0 ? 'hook' : 'point', storage_path: path, duration_ms: clip.asset.durationMs ?? 0 } });
        clip.asset.storagePath = path;
        return a.id;
      } catch {
        return null;
      }
    },
    [companyId, creatorId, ensure],
  );

  const toEditor = useCallback(
    async (clips: RecordClip[], draft: RecordDraft) => {
      if (!companyId || !creatorId) return;
      const a = await ensure();
      const { doc, scripts } = recordToDoc(clips, brief ?? null);
      useStudioStore.getState().load(doc, a.id);
      await saveProject({ companyId, creatorId, assignmentId: a.id, document: doc });
      await saveEditHandoff(a.id, { title, scripts, draftKey });
      void draft;
      router.replace({ pathname: '/(creator)/edit/[id]', params: { id: a.id } });
    },
    [companyId, creatorId, ensure, brief, title, draftKey, router],
  );

  const submitSeven = useCallback(
    async (clips: RecordClip[], text: string) => {
      if (!companyId || !creatorId) throw new Error('Not signed in');
      const a = await ensure();
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
  if (!profile) return null;
  if (briefId && !brief && !loaded) return null;
  if (initialClip === undefined) return null;
  return (
    <RecordScreen
      mode={brief ? mode : 'free'}
      brief={brief ?? null}
      initialText={initialText}
      draftKey={draftKey}
      initialClip={initialClip}
      onClose={() => router.back()}
      onNext={toEditor}
      onSubmit={submitSeven}
      onSent={() => router.dismissTo('/(creator)/(tabs)')}
      onClip={onClip}
    />
  );
}

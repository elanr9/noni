// Everything the record and edit screens share for one reel: the
// assignment and brief, the library features, the studio document (from
// creator_projects, kept in the studio store with autosave and background
// uploads), and the plan draft in AsyncStorage. A module cache keeps the
// document and plan across the record to edit hop, so nothing waits on the
// autosave debounce.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '../../../../lib/auth';
import { getCreatorBriefItem, type WeekBrief } from '../../../../lib/briefs-api';
import { useCompany } from '../../../../lib/company-context';
import type { VideoDocument } from '../../../../lib/edit-document';
import { listLibraryFeatures, type LibraryFeature } from '../../../../lib/library-api';
import { loadProject, saveProject, startingDocument } from '../../../../lib/projects-api';
import { saveDraftSegment, type DraftSegmentKind } from '../../../../lib/recording-drafts';
import { useProjectAutosave, useStudioStore } from '../../../../lib/studio-store';
import { useStudioUploads } from '../../../../lib/studio-uploads';
import { getAssignment, type AssignmentWithBrief } from '../../../../lib/tasks-api';
import { loadReelDraft, saveReelDraft, type ReelDraft } from '../drafts';
import { clipPlan, type ReelPlanItem } from './plan';
import { pruneBlockIds } from './sync';

export type ReelScope = { companyId: string; creatorId: string; assignmentId: string };

export type ReelMeta = { caption: string; tags: string; search: string; cuts: number };

const EMPTY_META: ReelMeta = { caption: '', tags: '', search: '', cuts: 0 };

/** The assignment whose document the studio store currently holds. */
let storeLoadedFor: string | null = null;
const draftCache = new Map<string, ReelDraft>();

export function useReelProject(assignmentId: string | undefined) {
  const { profile } = useAuth();
  const { active } = useCompany();
  const companyId = profile?.active_company_id ?? null;
  const creatorId = profile?.id ?? null;
  const scope = useMemo<ReelScope | null>(
    () => (companyId && creatorId && assignmentId ? { companyId, creatorId, assignmentId } : null),
    [companyId, creatorId, assignmentId],
  );

  const [assignment, setAssignment] = useState<AssignmentWithBrief | null>(null);
  const [brief, setBrief] = useState<WeekBrief | null>(null);
  const [features, setFeatures] = useState<LibraryFeature[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [items, setItemsState] = useState<ReelPlanItem[]>([]);
  const [meta, setMetaState] = useState<ReelMeta>(EMPTY_META);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useRef(false);

  const document = useStudioStore((s) => s.document);
  const load = useStudioStore((s) => s.load);
  useProjectAutosave(scope);
  const uploads = useStudioUploads(scope);

  useEffect(() => {
    if (!scope) return;
    let cancelled = false;
    (async () => {
      try {
        const [a, item, feats] = await Promise.all([
          getAssignment(scope.companyId, scope.assignmentId),
          getCreatorBriefItem({ companyId: scope.companyId, assignmentId: scope.assignmentId }),
          listLibraryFeatures(scope.companyId).catch(() => [] as LibraryFeature[]),
        ]);
        if (cancelled) return;
        if (!a || !item) {
          setError('Post not found.');
          return;
        }
        let doc = storeLoadedFor === scope.assignmentId ? useStudioStore.getState().document : null;
        let pid: string | null = null;
        if (!doc || doc.format !== 'video') {
          const project = await loadProject(scope.companyId, scope.assignmentId);
          if (cancelled) return;
          doc = project?.document.format === 'video' ? project.document : startingDocument('video', '9:16');
          pid = project?.id ?? (await saveProject({ ...scope, document: doc }));
          if (cancelled) return;
          load(doc);
          storeLoadedFor = scope.assignmentId;
        } else {
          const project = await loadProject(scope.companyId, scope.assignmentId);
          if (cancelled) return;
          pid = project?.id ?? (await saveProject({ ...scope, document: doc }));
        }
        const draft = draftCache.get(scope.assignmentId) ?? (await loadReelDraft(scope.assignmentId));
        if (cancelled) return;
        const video = doc as VideoDocument;
        const plan = draft ? pruneBlockIds(video, draft.items) : clipPlan(item.brief);
        setAssignment(a);
        setBrief(item.brief);
        setFeatures(feats);
        setProjectId(pid);
        setItemsState(plan);
        setMetaState(draft ? { caption: draft.caption, tags: draft.tags, search: draft.search, cuts: draft.cuts } : EMPTY_META);
        hydrated.current = true;
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load this post.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, load]);

  const persist = useCallback(
    (nextItems: ReelPlanItem[], nextMeta: ReelMeta) => {
      if (!scope) return;
      const draft: ReelDraft = { items: nextItems, ...nextMeta };
      draftCache.set(scope.assignmentId, draft);
      void saveReelDraft(scope.assignmentId, draft);
    },
    [scope],
  );

  const setItems = useCallback(
    (update: ReelPlanItem[] | ((prev: ReelPlanItem[]) => ReelPlanItem[])) => {
      setItemsState((prev) => {
        const next = typeof update === 'function' ? update(prev) : update;
        if (hydrated.current) persist(next, meta);
        return next;
      });
    },
    [persist, meta],
  );

  const setMeta = useCallback(
    (patch: Partial<ReelMeta>) => {
      setMetaState((prev) => {
        const next = { ...prev, ...patch };
        if (hydrated.current) persist(items, next);
        return next;
      });
    },
    [persist, items],
  );

  // Server side draft: once a take has landed in the videos bucket, record
  // it in recording_drafts so the clip survives this phone.
  const savedSegments = useRef(new Set<string>());
  useEffect(() => {
    if (!scope || !document || document.format !== 'video') return;
    items.forEach((item, index) => {
      const blockId = item.blockIds[0];
      const block = document.blocks.find((b) => b.id === blockId);
      const asset = block ? document.assets.find((a) => a.id === block.cells[0]?.assetId) : null;
      if (!asset?.storagePath || savedSegments.current.has(asset.storagePath)) return;
      savedSegments.current.add(asset.storagePath);
      const kind: DraftSegmentKind = item.role === 'cover' ? 'hook' : item.role === 'cta' ? 'outro' : 'point';
      void saveDraftSegment({
        companyId: scope.companyId,
        assignmentId: scope.assignmentId,
        creatorId: scope.creatorId,
        segment: { slot_index: index, kind, storage_path: asset.storagePath, duration_ms: asset.durationMs ?? 0 },
      }).catch(() => undefined);
    });
  }, [scope, document, items]);

  const forgetDraft = useCallback(() => {
    if (scope) draftCache.delete(scope.assignmentId);
    storeLoadedFor = null;
  }, [scope]);

  return {
    scope,
    loading,
    error,
    assignment,
    brief,
    features,
    projectId,
    document: document && document.format === 'video' ? document : null,
    items,
    setItems,
    meta,
    setMeta,
    uploads,
    companyName: active?.name ?? 'Your team',
    forgetDraft,
  };
}

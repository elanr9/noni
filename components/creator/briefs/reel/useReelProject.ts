// Everything the record and edit screens share for one reel: the
// assignment and brief, the library features, the studio document (from
// creator_projects, kept in the studio store with autosave and background
// uploads), and the plan. The plan is saved inside the document (reelPlan)
// so it survives a reinstall or another phone; the AsyncStorage draft and a
// module cache only make the record to edit hop instant. The store knows
// which assignment loaded its document, so another screen's document is
// never mistaken for this one.
import { Directory, File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '../../../../lib/auth';
import { getCreatorBriefItem, type WeekBrief } from '../../../../lib/briefs-api';
import { useCompany } from '../../../../lib/company-context';
import { updateOverlay, type EditDocument, type MediaAsset, type VideoDocument } from '../../../../lib/edit-document';
import { listLibraryFeatures, pickFeature, type LibraryFeature } from '../../../../lib/library-api';
import { loadProject, saveProject, startingDocument } from '../../../../lib/projects-api';
import { onVideo, useProjectAutosave, useStudioStore } from '../../../../lib/studio-store';
import { useStudioUploads } from '../../../../lib/studio-uploads';
import { getAssignment, type AssignmentWithBrief } from '../../../../lib/tasks-api';
import { loadReelDraft, saveReelDraft, type ReelDraft } from '../drafts';
import {
  briefRev,
  clipPlan,
  EMPTY_META,
  parseStoredPlan,
  rebuildPlan,
  storedPlanJson,
  uniqueIds,
  type ReelMeta,
  type ReelPlanItem,
} from './plan';
import { ctaPlace } from '../model';
import {
  insetAssetId,
  lockPlug,
  overlayIdFor,
  pruneBlockIds,
  recoverPlan,
  syncPlanOverlays,
  trackPlanOverlayDeletes,
} from './sync';

/** next with the dead block ids `prev` still held for each item, so undoing a clip delete finds its owner. */
function keepDeadIds(prev: ReelPlanItem[], next: ReelPlanItem[], live: Set<string>): ReelPlanItem[] {
  return next.map((item) => {
    const before = prev.find((p) => p.id === item.id);
    const dead = before ? before.blockIds.filter((id) => !live.has(id) && !item.blockIds.includes(id)) : [];
    return dead.length > 0 ? { ...item, blockIds: [...item.blockIds, ...dead] } : item;
  });
}

export type ReelScope = { companyId: string; creatorId: string; assignmentId: string };

export type { ReelMeta };

/** The local draft also remembers which brief it was built from. */
type LocalDraft = ReelDraft & { briefRev?: string };

const draftCache = new Map<string, LocalDraft>();
const insetCache = new Map<string, Promise<MediaAsset | null>>();

const VIDEO_FILE = /\.(mp4|mov|m4v|webm)(\?|$)/i;

/**
 * The plug's feature screenshot as a studio asset. A storage path is used as
 * it is (the render signs it from brief-assets); a URL is downloaded once
 * into the documents directory and uploads like any other picture.
 */
function featureAsset(feature: LibraryFeature): Promise<MediaAsset | null> {
  const url = feature.screenshotUrl;
  if (!url || VIDEO_FILE.test(url)) return Promise.resolve(null);
  const id = insetAssetId(feature.id);
  const base: MediaAsset = { id, kind: 'image', localUri: null, storagePath: null, durationMs: null, width: null, height: null };
  if (!/^https?:/i.test(url)) return Promise.resolve({ ...base, storagePath: url });
  const cached = insetCache.get(url);
  if (cached) return cached;
  const pending = (async () => {
    try {
      const dir = new Directory(Paths.document, 'noni-features');
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      const file = new File(dir, `${id}.jpg`);
      const local = file.exists ? file : await File.downloadFileAsync(url, file);
      return { ...base, localUri: local.uri };
    } catch (e) {
      console.warn('feature screenshot download failed', e);
      insetCache.delete(url);
      return null;
    }
  })();
  insetCache.set(url, pending);
  return pending;
}

/** Overlay text follows plan text that changed with the brief. */
function refreshTexts(doc: VideoDocument, before: ReelPlanItem[], after: ReelPlanItem[]): VideoDocument {
  let next = doc;
  for (const item of after) {
    const prev = before.find((p) => p.id === item.id);
    const id = overlayIdFor(item);
    if (!prev || prev.text === item.text || !item.text.trim()) continue;
    if (next.overlays.some((o) => o.id === id && o.kind === 'text')) next = updateOverlay(next, id, { text: item.text });
  }
  return next;
}

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
  const [rawItems, setRawItems] = useState<ReelPlanItem[]>([]);
  const [meta, setMetaState] = useState<ReelMeta>(EMPTY_META);
  const [rev, setRev] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [insetAssets, setInsetAssets] = useState<Record<string, MediaAsset>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ownDocument = useStudioStore((s) =>
    scope && s.ownerId === scope.assignmentId && s.document?.format === 'video' ? s.document : null,
  );
  const gestureBase = useStudioStore((s) => s.gestureBase);
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
        const state = useStudioStore.getState();
        let doc: EditDocument | null =
          state.ownerId === scope.assignmentId && state.document?.format === 'video' ? state.document : null;
        const project = await loadProject(scope.companyId, scope.assignmentId);
        if (cancelled) return;
        if (!doc) {
          doc = project?.document.format === 'video' ? project.document : startingDocument('video', '9:16');
          load(doc, scope.assignmentId);
        }
        const pid = project?.id ?? (await saveProject({ ...scope, document: doc }));
        if (cancelled) return;
        const video = doc as VideoDocument;
        const currentRev = briefRev(item.brief);
        // The document's own plan first; the local draft only when the
        // document has none (saved before plans rode with it).
        const stored = parseStoredPlan(video.reelPlan);
        const draft = stored ? null : (draftCache.get(scope.assignmentId) ?? ((await loadReelDraft(scope.assignmentId)) as LocalDraft | null));
        if (cancelled) return;
        const base = stored
          ? { items: stored.items, rev: stored.rev, meta: stored.meta }
          : draft
            ? { items: draft.items, rev: draft.briefRev ?? '', meta: { caption: draft.caption, tags: draft.tags, search: draft.search, cuts: draft.cuts } }
            : null;
        let plan: ReelPlanItem[];
        if (!base) {
          plan = recoverPlan(item.brief, video, clipPlan(item.brief, scope.assignmentId));
        } else if (base.rev === currentRev) {
          plan = base.items;
        } else {
          plan = rebuildPlan(item.brief, base.items, scope.assignmentId);
          const before = base.items;
          useStudioStore.getState().amend(onVideo((d) => refreshTexts(d, before, plan)));
        }
        setAssignment(a);
        setBrief(item.brief);
        setFeatures(feats);
        setProjectId(pid);
        setRev(currentRev);
        setRawItems(uniqueIds(plan));
        setMetaState(base?.meta ?? EMPTY_META);
        setHydrated(true);
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

  // Feature screenshots for every plug in the plan.
  const insetKey = useMemo(
    () => [...new Set(rawItems.map((p) => p.insetFeatureId).filter((f): f is string => f !== null))].sort().join(','),
    [rawItems],
  );
  useEffect(() => {
    if (!insetKey) return;
    let cancelled = false;
    void Promise.all(
      insetKey.split(',').map(async (fid) => {
        const feature = pickFeature(features, fid);
        return [fid, feature ? await featureAsset(feature) : null] as const;
      }),
    ).then((pairs) => {
      if (cancelled) return;
      const next: Record<string, MediaAsset> = {};
      for (const [fid, asset] of pairs) if (asset) next[fid] = asset;
      setInsetAssets(next);
    });
    return () => {
      cancelled = true;
    };
  }, [insetKey, features]);

  // Keep the document in step with the plan after every change: text and
  // screenshot windows follow their clips (a reorder, a trim, an auto cut, a
  // new take), a locked plug snaps back to its place, and the plan itself
  // rides in the document. Folded into the current undo step so undo never
  // lands on a half synced document.
  const place = brief ? ctaPlace(brief) : 'any';
  const prevDoc = useRef<VideoDocument | null>(null);
  useEffect(() => {
    if (!hydrated || !ownDocument || gestureBase) return;
    // A plan overlay the creator deleted stays deleted; undo brings it back.
    const prev = prevDoc.current;
    prevDoc.current = ownDocument;
    const tracked = trackPlanOverlayDeletes(prev, ownDocument, rawItems);
    if (tracked !== rawItems) {
      setRawItems(tracked);
      return;
    }
    const json = storedPlanJson({ rev, items: rawItems, meta });
    const text = JSON.stringify(json);
    useStudioStore.getState().amend(
      onVideo((d) => {
        const synced = syncPlanOverlays(lockPlug(d, rawItems, place), rawItems, insetAssets);
        return JSON.stringify(synced.reelPlan ?? null) === text ? synced : { ...synced, reelPlan: json };
      }),
    );
  }, [hydrated, ownDocument, gestureBase, rawItems, meta, rev, insetAssets, place]);

  const persist = useCallback(
    (nextItems: ReelPlanItem[], nextMeta: ReelMeta) => {
      if (!scope) return;
      const draft: LocalDraft = { items: nextItems, ...nextMeta, briefRev: rev };
      draftCache.set(scope.assignmentId, draft);
      void saveReelDraft(scope.assignmentId, draft);
    },
    [scope, rev],
  );

  // Plan ids of deleted blocks stay in rawItems so undo brings the item's
  // clip back; everything outside sees only the blocks on the timeline.
  const items = useMemo(() => (ownDocument ? pruneBlockIds(ownDocument, rawItems) : rawItems), [ownDocument, rawItems]);

  const setItems = useCallback(
    (update: ReelPlanItem[] | ((prev: ReelPlanItem[]) => ReelPlanItem[])) => {
      setRawItems((prev) => {
        const doc = useStudioStore.getState().document;
        const video = doc && doc.format === 'video' ? doc : null;
        const view = video ? pruneBlockIds(video, prev) : prev;
        const updated = typeof update === 'function' ? update(view) : update;
        const next = video ? keepDeadIds(prev, updated, new Set(video.blocks.map((b) => b.id))) : updated;
        if (hydrated) persist(next, meta);
        return next;
      });
    },
    [persist, meta, hydrated],
  );

  const setMeta = useCallback(
    (patch: Partial<ReelMeta>) => {
      setMetaState((prev) => {
        const next = { ...prev, ...patch };
        if (hydrated) persist(rawItems, next);
        return next;
      });
    },
    [persist, rawItems, hydrated],
  );

  const forgetDraft = useCallback(() => {
    if (scope) draftCache.delete(scope.assignmentId);
    // Nothing may autosave or upload this document into another assignment.
    useStudioStore.setState({ ownerId: null, document: null, dirty: false, past: [], future: [] });
  }, [scope]);

  return {
    scope,
    loading,
    error,
    assignment,
    brief,
    features,
    projectId,
    document: ownDocument,
    items,
    setItems,
    meta,
    setMeta,
    uploads,
    companyName: active?.name ?? 'Your team',
    forgetDraft,
  };
}

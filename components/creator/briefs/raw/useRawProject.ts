// Everything the raw camera and Edit my video share for one reel: the
// assignment and brief, the library features, and the studio document
// (from creator_projects, kept in the studio store with autosave and
// background uploads). No plan: the creator records the post their way and
// the auto edit finds the structure. The store knows which assignment loaded
// its document, so another screen's document is never mistaken for this one.
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../../../lib/auth';
import { getCreatorBriefItem, type WeekBrief } from '../../../../lib/briefs-api';
import { useCompany } from '../../../../lib/company-context';
import type { EditDocument } from '../../../../lib/edit-document';
import { listLibraryFeatures, type LibraryFeature } from '../../../../lib/library-api';
import { loadProject, saveProject, startingDocument } from '../../../../lib/projects-api';
import { useProjectAutosave, useStudioStore } from '../../../../lib/studio-store';
import { useStudioUploads } from '../../../../lib/studio-uploads';
import { getAssignment, type AssignmentWithBrief } from '../../../../lib/tasks-api';

export type RawScope = { companyId: string; creatorId: string; assignmentId: string };

export function useRawProject(assignmentId: string | undefined) {
  const { profile } = useAuth();
  const { active } = useCompany();
  const companyId = profile?.active_company_id ?? null;
  const creatorId = profile?.id ?? null;
  const scope = useMemo<RawScope | null>(
    () => (companyId && creatorId && assignmentId ? { companyId, creatorId, assignmentId } : null),
    [companyId, creatorId, assignmentId],
  );

  const [assignment, setAssignment] = useState<AssignmentWithBrief | null>(null);
  const [brief, setBrief] = useState<WeekBrief | null>(null);
  const [features, setFeatures] = useState<LibraryFeature[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const document = useStudioStore((s) =>
    scope && s.ownerId === scope.assignmentId && s.document?.format === 'video' ? s.document : null,
  );
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
        setAssignment(a);
        setBrief(item.brief);
        setFeatures(feats);
        setProjectId(pid);
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

  const forgetDraft = useCallback(() => {
    // Nothing may autosave or upload this document into another assignment.
    useStudioStore.setState({ ownerId: null, document: null, dirty: false, past: [], future: [] });
  }, []);

  return {
    scope,
    loading,
    error,
    assignment,
    brief,
    features,
    projectId,
    document,
    uploads,
    companyName: active?.name ?? 'Your team',
    forgetDraft,
  };
}

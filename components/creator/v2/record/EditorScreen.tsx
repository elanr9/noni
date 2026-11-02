// The creator's editor after Record (and after a library upload): the reel
// editor over the studio document saved for this creator-started assignment,
// background uploads, autosave, and Next submits the project.
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '../../../../lib/auth';
import { loadProject, saveProject } from '../../../../lib/projects-api';
import { clearDraft } from '../../../../lib/recording-drafts';
import { useProjectAutosave, useStudioStore } from '../../../../lib/studio-store';
import { useStudioUploads } from '../../../../lib/studio-uploads';
import { submitProject } from '../../../../lib/submissions';
import { getAssignment } from '../../../../lib/tasks-api';
import { color } from '../../../../theme/v2';
import { ReelEditor } from '../../briefs/reel/ReelEditor';
import { SentOverlay } from '../SentOverlay';
import { clearRecordDraft, loadEditHandoff, type EditHandoff } from './model';

export function EditorScreen({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const { profile } = useAuth();
  const companyId = profile?.active_company_id ?? null;
  const creatorId = profile?.id ?? null;
  const scope = companyId && creatorId ? { companyId, creatorId, assignmentId } : null;
  const doc = useStudioStore((s) => (s.ownerId === assignmentId && s.document?.format === 'video' ? s.document : null));
  const load = useStudioStore((s) => s.load);
  const [handoff, setHandoff] = useState<EditHandoff | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  useProjectAutosave(scope);
  const uploads = useStudioUploads(scope);

  useEffect(() => {
    if (!scope) return;
    let live = true;
    void (async () => {
      const [h, project] = await Promise.all([loadEditHandoff(assignmentId), loadProject(scope.companyId, assignmentId)]);
      if (!live) return;
      setHandoff(h ?? { title: 'New post', scripts: {}, draftKey: null });
      if (project) setProjectId(project.id);
      const store = useStudioStore.getState();
      if (!(store.ownerId === assignmentId && store.document?.format === 'video')) {
        if (project?.document.format === 'video') load(project.document, assignmentId);
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, companyId, creatorId, load]);

  const submit = async () => {
    if (!scope || submitting) return;
    const current = useStudioStore.getState().document;
    if (!current || current.format !== 'video' || current.blocks.length === 0) {
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
      const pid = projectId ?? (await saveProject({ ...scope, document: current }));
      await saveProject({ ...scope, document: current });
      useStudioStore.getState().markSaved(current);
      const assignment = await getAssignment(scope.companyId, assignmentId);
      if (!assignment) throw new Error('Post not found');
      await submitProject({ assignment, companyId: scope.companyId, creatorId: scope.creatorId, projectId: pid, document: current });
      await clearDraft(scope.companyId, assignmentId).catch(() => undefined);
      if (handoff?.draftKey) clearRecordDraft(handoff.draftKey);
      useStudioStore.setState({ ownerId: null, document: null, dirty: false, past: [], future: [] });
      setSent(true);
      setTimeout(() => router.dismissTo('/(creator)/(tabs)'), 1500);
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSubmitting(false);
    }
  };

  if (!scope || !doc || !handoff) return <View style={[StyleSheet.absoluteFill, { backgroundColor: color.ink }]} />;
  const scripts = handoff.scripts;
  const hasScripts = Object.keys(scripts).length > 0;
  return (
    <View style={{ flex: 1, backgroundColor: color.ink }}>
      <ReelEditor
        doc={doc}
        items={[]}
        companyId={scope.companyId}
        cuts={0}
        place="any"
        status={handoff.title}
        onBack={() => router.back()}
        onNext={() => void submit()}
        onAddClip={() => router.back()}
        scripts={hasScripts ? scripts : undefined}
        onScript={hasScripts ? (blockId, text) => setHandoff((h) => (h ? { ...h, scripts: { ...h.scripts, [blockId]: text } } : h)) : undefined}
      />
      {sent ? <SentOverlay /> : null}
    </View>
  );
}

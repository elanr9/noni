// The creator's editor after Record (and after a library upload): the reel
// editor over the studio document saved for this creator-started assignment,
// background uploads, autosave. Next opens the send step: name the post,
// watch the clips finish uploading, then it goes to review.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import { useAuth } from '../../../../lib/auth';
import { renameCreatorPost } from '../../../../lib/creator-posts-api';
import { loadProject, saveProject } from '../../../../lib/projects-api';
import { clearDraft } from '../../../../lib/recording-drafts';
import { useProjectAutosave, useStudioStore } from '../../../../lib/studio-store';
import { useStudioUploads } from '../../../../lib/studio-uploads';
import { submitProject } from '../../../../lib/submissions';
import { getAssignment, type AssignmentWithBrief } from '../../../../lib/tasks-api';
import { useV2Data } from '../../../../lib/v2-posts';
import { color, text } from '../../../../theme/v2';
import { Button, Icon, Sheet } from '../../../v2';
import { toast } from '../../../v2/Toast';
import { TikTokSoundCard } from '../../../admin/v2/audio/TikTokSoundCard';
import type { PostAudio } from '../../../../lib/brief-library';
import { ReelEditor } from '../../briefs/reel/ReelEditor';
import { SentOverlay } from '../SentOverlay';
import { clearRecordDraft, loadEditHandoff, type EditHandoff } from './model';
import { SendSheet, type SendPhase } from './SendSheet';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

/** A first guess at a name: the first line of the script, trimmed to a few words. */
function suggestName(scripts: Record<string, string>): string {
  const first = Object.values(scripts).find((s) => s.trim())?.trim() ?? '';
  if (!first) return '';
  const line = first.split(/[\n.!?]/)[0].trim();
  const words = line.split(/\s+/).slice(0, 7).join(' ');
  return words.length < line.length ? words : line;
}

export function EditorScreen({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const { profile } = useAuth();
  const companyId = profile?.active_company_id ?? null;
  const creatorId = profile?.id ?? null;
  const scope = useMemo(() => (companyId && creatorId ? { companyId, creatorId, assignmentId } : null), [companyId, creatorId, assignmentId]);
  const doc = useStudioStore((s) => (s.ownerId === assignmentId && s.document?.format === 'video' ? s.document : null));
  const load = useStudioStore((s) => s.load);
  const [state, setState] = useState<LoadState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [assignment, setAssignment] = useState<AssignmentWithBrief | null>(null);
  const [handoff, setHandoff] = useState<EditHandoff | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [name, setName] = useState('');
  const [phase, setPhase] = useState<SendPhase>('idle');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [uploadTotal, setUploadTotal] = useState(0);
  /** The sound on the sent post; the TikTok copy and search sheet shows before leaving. */
  const [tiktok, setTiktok] = useState<PostAudio | null>(null);
  useProjectAutosave(scope);
  const uploads = useStudioUploads(scope);

  useEffect(() => {
    if (!scope) return;
    let live = true;
    void (async () => {
      try {
        const [h, project, a] = await Promise.all([loadEditHandoff(assignmentId), loadProject(scope.companyId, assignmentId), getAssignment(scope.companyId, assignmentId)]);
        if (!live) return;
        if (!a) {
          setState('missing');
          return;
        }
        setAssignment(a);
        const serverTitle = a.briefs?.title?.trim() ?? '';
        const creatorStarted = a.briefs?.created_by === scope.creatorId;
        const base: EditHandoff = h ?? { title: creatorStarted && serverTitle === 'New post' ? '' : serverTitle, scripts: {}, draftKey: null };
        setHandoff(base);
        setName(base.title || (creatorStarted && serverTitle !== 'New post' ? serverTitle : '') || suggestName(base.scripts));
        if (project) setProjectId(project.id);
        const store = useStudioStore.getState();
        const inStore = store.ownerId === assignmentId && store.document?.format === 'video';
        if (!inStore) {
          if (project?.document.format === 'video') load(project.document, assignmentId);
          else {
            setState('missing');
            return;
          }
        }
        setState('ready');
      } catch {
        if (live) setState('error');
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, companyId, creatorId, load, attempt]);

  const done = useCallback(() => {
    setSent(true);
    setTimeout(() => {
      // Cleared on the way out so the editor stays on screen under the Sent moment.
      useStudioStore.setState({ ownerId: null, document: null, dirty: false, past: [], future: [] });
      router.dismissTo('/(creator)/(tabs)');
    }, 1500);
  }, [router]);

  const finishSend = useCallback(async () => {
    if (!scope || !assignment) return;
    const current = useStudioStore.getState().document;
    if (!current || current.format !== 'video' || current.blocks.length === 0) {
      setPhase('idle');
      setSendError('Record or add a clip first.');
      return;
    }
    try {
      setPhase('saving');
      const creatorStarted = assignment.briefs?.created_by === scope.creatorId;
      const title = name.trim();
      if (creatorStarted && title && title !== assignment.briefs?.title) await renameCreatorPost(assignmentId, title);
      const pid = projectId ?? (await saveProject({ ...scope, document: current }));
      await saveProject({ ...scope, document: current });
      useStudioStore.getState().markSaved(current);
      setPhase('sending');
      const fresh = (await getAssignment(scope.companyId, assignmentId)) ?? assignment;
      await submitProject({ assignment: fresh, companyId: scope.companyId, creatorId: scope.creatorId, projectId: pid, document: current });
      await clearDraft(scope.companyId, assignmentId).catch(() => undefined);
      if (handoff?.draftKey) clearRecordDraft(handoff.draftKey);
      void useV2Data.getState().load(scope.companyId, true);
      setSendOpen(false);
      setPhase('idle');
      if (current.audio) {
        setTimeout(() => setTiktok(current.audio ?? null), 340);
        return;
      }
      done();
    } catch (e) {
      setPhase('idle');
      setSendError(e instanceof Error ? `Could not send. ${e.message}` : 'Could not send. Try again.');
    }
  }, [scope, assignment, name, assignmentId, projectId, handoff, done]);

  // Uploading: wait for every clip to land, then save and send.
  useEffect(() => {
    if (phase !== 'uploading') return;
    if (uploads.failed > 0) return;
    if (uploads.pending > 0 || uploads.missing.length > 0) return;
    const t = setTimeout(() => void finishSend(), 0);
    return () => clearTimeout(t);
  }, [phase, uploads.pending, uploads.failed, uploads.missing.length, finishSend]);

  const send = () => {
    setSendError(null);
    if (uploads.missing.length > 0) {
      setSendError('A clip is missing from this phone. Remove it or record it again.');
      return;
    }
    setUploadTotal(uploads.pending + uploads.failed);
    if (uploads.failed > 0) uploads.retry();
    setPhase('uploading');
  };

  if (state !== 'ready' || !scope || !doc || !handoff) {
    const missing = state === 'missing';
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center', padding: 32 }]}>
        {state === 'missing' || state === 'error' ? (
          <Animated.View entering={FadeIn.duration(200)} style={{ alignItems: 'center', gap: 12, width: '100%' }}>
            <Icon name={missing ? 'movie' : 'cloud_off'} size={40} color={color.grey3} />
            <Text style={[text.card, { color: color.white, textAlign: 'center' }]}>{missing ? 'Nothing to edit here' : 'Could not open the editor'}</Text>
            <Text style={[text.body, { color: color.grey3, textAlign: 'center' }]}>{missing ? 'This post has no clips yet, or it was already sent.' : 'Check your connection and try again.'}</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: 8 }}>
              <Button variant="quiet" label="Close" onPress={() => router.back()} />
              {missing ? (
                <Button icon="videocam" label="Record" onPress={() => router.replace({ pathname: '/(creator)/capture', params: { mode: 'free', post: assignmentId } })} />
              ) : (
                <Button
                  icon="refresh"
                  label="Try again"
                  onPress={() => {
                    setState('loading');
                    setAttempt((n) => n + 1);
                  }}
                />
              )}
            </View>
          </Animated.View>
        ) : null}
      </View>
    );
  }
  const scripts = handoff.scripts;
  const hasScripts = Object.keys(scripts).length > 0;
  const creatorStarted = assignment?.briefs?.created_by === scope.creatorId;
  return (
    <View style={{ flex: 1, backgroundColor: color.ink }}>
      <ReelEditor
        doc={doc}
        items={[]}
        companyId={scope.companyId}
        cuts={0}
        place="any"
        status={name.trim() || handoff.title || 'New post'}
        onBack={() => {
          if (doc.blocks.length > 0) toast.show('Saved to your drafts');
          router.back();
        }}
        onNext={() => {
          setSendError(null);
          setSendOpen(true);
        }}
        onAddClip={() => router.push({ pathname: '/(creator)/capture', params: { mode: 'free', post: assignmentId, add: '1' } })}
        scripts={hasScripts ? scripts : undefined}
        onScript={hasScripts ? (blockId, t) => setHandoff((h) => (h ? { ...h, scripts: { ...h.scripts, [blockId]: t } } : h)) : undefined}
        soundMode={handoff.soundMode ?? null}
        talkingHead={!!handoff.talkingHead}
      />
      <SendSheet
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        nameable={creatorStarted && !assignment?.library_brief_id}
        name={name}
        onName={setName}
        phase={phase}
        uploaded={Math.max(0, uploadTotal - uploads.pending - uploads.failed)}
        total={uploadTotal}
        failed={phase === 'uploading' ? uploads.failed : 0}
        error={sendError}
        onSend={send}
        onRetryUploads={() => uploads.retry()}
      />
      <Sheet open={tiktok !== null} onClose={() => undefined} title="Add the sound on TikTok">
        {tiktok ? (
          <TikTokSoundCard
            audio={tiktok}
            onDone={() => {
              setTiktok(null);
              done();
            }}
          />
        ) : null}
      </Sheet>
      {sent ? <SentOverlay /> : null}
    </View>
  );
}

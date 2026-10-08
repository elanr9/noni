// The studio: record or import clips, cut them on the timeline, lay text and
// pictures over them, or build a slideshow, then send the post for approval.
// This screen owns loading, autosave, uploads, mode switching and submit;
// the capture, timeline, overlay and slideshow components own their tools.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CaptureScreen } from '../../../components/creator/studio/capture/CaptureScreen';
import { AddOverlayBar, OverlayLane, OverlayLayer } from '../../../components/creator/studio/overlays';
import { SlideshowEditor } from '../../../components/creator/studio/slides/SlideshowEditor';
import type { StudioNotes } from '../../../components/creator/studio/slides/NotesSheet';
import { TimelineEditor, VideoStage } from '../../../components/creator/studio/timeline';
import { Icon } from '../../../components/ui/Icon';
import { useAuth } from '../../../lib/auth';
import { parseHookOptions, parseTalkingPoints, type Brief } from '../../../lib/briefs-api';
import {
  appendAssetBlock,
  deleteBlock,
  documentDurationMs,
  type EditDocument,
  type MediaAsset,
  type VideoDocument,
} from '../../../lib/edit-document';
import { loadProject, saveProject, startingDocument } from '../../../lib/projects-api';
import { latestChangesNote, listAssignmentReviewEvents } from '../../../lib/review-events';
import { onVideo, useProjectAutosave, useStudioStore } from '../../../lib/studio-store';
import { useStudioUploads } from '../../../lib/studio-uploads';
import { submitProject } from '../../../lib/submissions';
import { getAssignment, type AssignmentWithBrief } from '../../../lib/tasks-api';
import { color, radius, space, type } from '../../../theme/tokens';

type Mode = 'capture' | 'edit' | 'slides';

function briefNotes(brief: Brief, changesNote: string | null): StudioNotes {
  const lines: string[] = [];
  if (changesNote) lines.push(`Changes requested: ${changesNote}`);
  const hook = brief.hook?.trim() || parseHookOptions(brief.hook_options)[0]?.trim();
  if (hook) lines.push(`Hook: ${hook}`);
  for (const point of parseTalkingPoints(brief.talking_points)) {
    const text = point.text?.trim();
    if (text) lines.push(text);
  }
  if (brief.cta?.trim()) lines.push(`Close: ${brief.cta.trim()}`);
  if (brief.script?.trim()) lines.push(brief.script.trim());
  return { title: brief.title, lines };
}

function initialMode(doc: EditDocument): Mode {
  if (doc.format === 'slideshow') return 'slides';
  return doc.blocks.length > 0 ? 'edit' : 'capture';
}

export default function StudioScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [assignment, setAssignment] = useState<AssignmentWithBrief | null>(null);
  const [notes, setNotes] = useState<StudioNotes | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('capture');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const document = useStudioStore((s) => s.document);
  const load = useStudioStore((s) => s.load);
  const commit = useStudioStore((s) => s.commit);

  const companyId = profile?.active_company_id ?? null;
  const creatorId = profile?.id ?? null;
  const scope = useMemo(
    () => (companyId && creatorId && id ? { companyId, creatorId, assignmentId: id } : null),
    [companyId, creatorId, id],
  );

  useProjectAutosave(scope);
  const uploads = useStudioUploads(scope);

  useEffect(() => {
    if (!scope) return;
    let cancelled = false;
    (async () => {
      try {
        const a = await getAssignment(scope.companyId, scope.assignmentId);
        if (cancelled) return;
        if (!a) {
          setError('Post not found.');
          return;
        }
        const [project, events] = await Promise.all([
          loadProject(scope.companyId, scope.assignmentId),
          a.status === 'changes_requested' ? listAssignmentReviewEvents(a.id) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        const doc =
          project?.document ??
          startingDocument(a.briefs.format === 'photo_carousel' ? 'photo_carousel' : 'video', '9:16');
        const pid = project?.id ?? (await saveProject({ ...scope, document: doc }));
        if (cancelled) return;
        setAssignment(a);
        setNotes(briefNotes(a.briefs, latestChangesNote(events)));
        setProjectId(pid);
        load(doc);
        setMode(initialMode(doc));
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

  const onAsset = useCallback(
    (asset: MediaAsset) => commit(onVideo((doc) => appendAssetBlock(doc, asset))),
    [commit],
  );
  const onDeleteLast = useCallback(
    () =>
      commit(
        onVideo((doc) => {
          const last = doc.blocks[doc.blocks.length - 1];
          return last ? deleteBlock(doc, last.id) : doc;
        }),
      ),
    [commit],
  );

  const submit = useCallback(async () => {
    if (!assignment || !scope || !projectId) return;
    const doc = useStudioStore.getState().document;
    if (!doc) return;
    setSubmitting(true);
    try {
      await saveProject({ ...scope, document: doc });
      useStudioStore.getState().markSaved(doc);
      await submitProject({ assignment, companyId: scope.companyId, creatorId: scope.creatorId, projectId, document: doc });
      router.replace({ pathname: '/(creator)/assignment/[id]', params: { id: assignment.id } });
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSubmitting(false);
    }
  }, [assignment, scope, projectId, router]);

  if (loading || !document || !scope) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={color.blue500} />}
      </View>
    );
  }

  if (document.format === 'video' && mode === 'capture') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <CaptureScreen
          notes={notes}
          clipCount={document.blocks.length}
          totalMs={documentDurationMs(document)}
          onAsset={onAsset}
          onDeleteLast={onDeleteLast}
          onDone={() => setMode('edit')}
          onClose={() => router.back()}
        />
      </>
    );
  }

  const canSubmit = !submitting && uploads.pending === 0 && uploads.failed === 0;
  const uploadLabel =
    uploads.failed > 0
      ? 'Upload failed. Tap to retry'
      : uploads.pending > 0
        ? `Uploading ${uploads.pending}`
        : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.nav}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} hitSlop={12}>
          <Icon name="x" size={22} color={color.white} />
        </Pressable>
        {uploadLabel ? (
          <Pressable onPress={uploads.failed > 0 ? uploads.retry : undefined}>
            <Text style={styles.uploadLabel}>{uploadLabel}</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={() => void submit()}
          style={[styles.send, !canSubmit && styles.sendDisabled]}
        >
          {submitting ? (
            <ActivityIndicator color={color.white} />
          ) : (
            <Text style={styles.sendText}>Send for approval</Text>
          )}
        </Pressable>
      </View>

      {document.format === 'slideshow' ? (
        <SlideshowEditor doc={document} notes={notes} companyId={scope.companyId} />
      ) : (
        <VideoEditor doc={document} companyId={scope.companyId} onAddClip={() => setMode('capture')} />
      )}
    </View>
  );
}

function VideoEditor(props: { doc: VideoDocument; companyId: string; onAddClip(): void }): JSX.Element {
  const { doc, companyId, onAddClip } = props;
  const stageRef = useRef<React.ElementRef<typeof VideoStage>>(null);
  return (
    <View style={styles.editor}>
      <VideoStage ref={stageRef} doc={doc}>
        <MeasuredOverlayLayer doc={doc} />
      </VideoStage>
      <AddOverlayBar doc={doc} companyId={companyId} />
      <TimelineEditor doc={doc} overlayLane={<OverlayLane doc={doc} />} onAddClip={onAddClip} />
    </View>
  );
}

function MeasuredOverlayLayer({ doc }: { doc: VideoDocument }): JSX.Element {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {size ? <OverlayLayer doc={doc} stageWidth={size.w} stageHeight={size.h} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink900 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.ink900 },
  error: { fontSize: type.size.body, color: color.white, textAlign: 'center', paddingHorizontal: space[8] },
  nav: {
    height: 52,
    paddingHorizontal: space[5],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  uploadLabel: { fontSize: type.size.bodySm, color: color.slate300 },
  send: {
    height: 36,
    paddingHorizontal: space[5],
    borderRadius: radius.pill,
    backgroundColor: color.blue500,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  sendDisabled: { opacity: 0.4 },
  sendText: { fontSize: type.size.bodySm, fontWeight: type.weight.bold, color: color.white },
  editor: { flex: 1 },
});

// Reel editor route: edit, caption for Story and Freestyle, review, submit.
// The point text rides as text overlays synced from the plan the first time
// the editor opens; submit freezes the studio document through submitProject.
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { DetailsStep } from '../../../../components/creator/briefs/DetailsStep';
import { useAvatarUrl } from '../../../../components/creator/briefs/FypChrome';
import { ReviewStep, type ScriptRow } from '../../../../components/creator/briefs/ReviewStep';
import { clearReelDraft } from '../../../../components/creator/briefs/drafts';
import { splitCaption, type CreatorSlide } from '../../../../components/creator/briefs/model';
import { ReelEditor } from '../../../../components/creator/briefs/reel/ReelEditor';
import type { ReelPlanItem } from '../../../../components/creator/briefs/reel/plan';
import { cutDeadAir, overlayIdFor, pruneBlockIds, syncPlanOverlays } from '../../../../components/creator/briefs/reel/sync';
import { useReelProject } from '../../../../components/creator/briefs/reel/useReelProject';
import { AskAiSheet } from '../../../../components/creator/briefs/slides/AskAiSheet';
import { OverlayLayer } from '../../../../components/creator/studio/overlays';
import { VideoStage } from '../../../../components/creator/studio/timeline/VideoStage';
import { useAuth } from '../../../../lib/auth';
import { assetById, updateOverlay, type VideoDocument } from '../../../../lib/edit-document';
import { pickFeature } from '../../../../lib/library-api';
import { saveProject } from '../../../../lib/projects-api';
import { clearDraft } from '../../../../lib/recording-drafts';
import { onVideo, useStudioStore } from '../../../../lib/studio-store';
import { submitProject } from '../../../../lib/submissions';
import { color, space, type } from '../../../../theme/tokens';

type Phase = 'edit' | 'details' | 'review';

function ReviewStage({ doc }: { doc: VideoDocument }): JSX.Element {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoStage doc={doc}>
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          {size ? <OverlayLayer doc={doc} stageWidth={size.w} stageHeight={size.h} /> : null}
        </View>
      </VideoStage>
    </View>
  );
}

export default function EditRoute(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const reel = useReelProject(id);
  const { brief, document, items, setItems, meta, setMeta, features, scope, assignment, projectId } = reel;
  const avatarUri = useAvatarUrl(profile?.avatar_path);
  const handle = `@${(profile?.full_name?.split(' ')[0] ?? 'you').toLowerCase()}`;

  const [phase, setPhase] = useState<Phase>('edit');
  const [fromReview, setFromReview] = useState(false);
  const [ai, setAi] = useState(false);
  const [cutting, setCutting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const synced = useRef(false);
  const selection = useStudioStore((s) => s.selection);

  // Point text onto the timeline, once per visit, after the plan and document are in.
  useEffect(() => {
    if (synced.current || !document || items.length === 0) return;
    synced.current = true;
    useStudioStore.getState().commit(onVideo((d) => syncPlanOverlays(d, items)));
  }, [document, items]);

  // Blocks removed in the editor drop out of the plan.
  useEffect(() => {
    if (!document) return;
    const pruned = pruneBlockIds(document, items);
    if (pruned !== items) setItems(() => pruned);
  }, [document, items, setItems]);

  // First frame of each take for the review strip.
  useEffect(() => {
    if (!document) return;
    let cancelled = false;
    for (const item of items) {
      const block = document.blocks.find((b) => b.id === item.blockIds[0]);
      const asset = block ? assetById(document, block.cells[0].assetId) : null;
      if (!asset?.localUri || thumbs[item.id]) continue;
      const uri = asset.localUri;
      VideoThumbnails.getThumbnailAsync(uri, { time: 0, quality: 0.4 }).then(
        (t) => {
          if (!cancelled) setThumbs((m) => ({ ...m, [item.id]: t.uri }));
        },
        () => undefined,
      );
    }
    return () => {
      cancelled = true;
    };
  }, [document, items, thumbs]);

  const ownDetails = brief?.kind === 'story' || brief?.kind === 'open';
  const ownLines = useMemo(() => items.filter((p) => p.free || p.role === 'cover').map((p) => p.text), [items]);
  const reviewSlides = useMemo<CreatorSlide[]>(
    () =>
      items
        .filter((p) => p.blockIds.length > 0)
        .map((p) => ({
          id: p.id,
          role: p.role,
          text: p.text,
          own: p.free,
          shot: p.say,
          insetFeatureId: p.insetFeatureId,
          ...(p.box ? { box: p.box } : {}),
          ...(p.insetBox ? { insetBox: p.insetBox } : {}),
          ...(p.tstyle ? { tstyle: p.tstyle } : {}),
          photo: null,
        })),
    [items],
  );
  const scriptRows = useMemo<ScriptRow[]>(
    () =>
      items.map((p) => ({
        key: p.id,
        role: p.free ? 'creator' : p.role,
        text: p.free ? (p.text || 'Your clip') : p.text || p.say,
        note: p.free ? undefined : p.say,
        feature: p.role === 'cta' ? pickFeature(features, p.insetFeatureId) : null,
      })),
    [items, features],
  );

  const applyLine = (item: ReelPlanItem, text: string) => {
    setItems((arr) => arr.map((p) => (p.id === item.id ? { ...p, text } : p)));
    useStudioStore.getState().commit(
      onVideo((d) => {
        const withText = d.overlays.some((o) => o.id === overlayIdFor(item)) ? updateOverlay(d, overlayIdFor(item), { text }) : d;
        return syncPlanOverlays(withText, items.map((p) => (p.id === item.id ? { ...p, text } : p)));
      }),
    );
  };

  const cut = async () => {
    if (!document || cutting) return;
    setCutting(true);
    try {
      const { doc, cuts } = await cutDeadAir(document);
      if (cuts > 0) {
        useStudioStore.getState().commit(() => doc);
        setMeta({ cuts: meta.cuts + cuts });
      }
    } finally {
      setCutting(false);
    }
  };

  const submit = async () => {
    if (!assignment || !brief || !scope || !projectId || submitting) return;
    const doc = useStudioStore.getState().document;
    if (!doc || doc.format !== 'video' || doc.blocks.length === 0) {
      Alert.alert('Nothing recorded yet');
      return;
    }
    if (reel.uploads.failed > 0) {
      reel.uploads.retry();
      Alert.alert('Upload failed. Trying again.');
      return;
    }
    if (reel.uploads.pending > 0) {
      Alert.alert('Still uploading your clips');
      return;
    }
    setSubmitting(true);
    try {
      await saveProject({ ...scope, document: doc });
      useStudioStore.getState().markSaved(doc);
      await submitProject({ assignment, companyId: scope.companyId, creatorId: scope.creatorId, projectId, document: doc });
      await Promise.all([clearReelDraft(scope.assignmentId), clearDraft(scope.companyId, scope.assignmentId).catch(() => undefined)]);
      reel.forgetDraft();
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

  if (reel.loading || !brief || !document || !scope) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        {reel.error ? <Text style={styles.error}>{reel.error}</Text> : <ActivityIndicator color={color.blue500} />}
      </View>
    );
  }

  const toRecord = (item?: ReelPlanItem) =>
    router.replace({ pathname: '/(creator)/make/record/[id]', params: { id, from: 'edit', ...(item ? { item: item.id } : {}) } });

  const capText = ownDetails ? meta.caption : splitCaption(brief.caption).text;
  const tagText = ownDetails ? meta.tags : brief.hashtags.length ? brief.hashtags.map((t) => `#${t.replace(/^#/, '')}`).join(' ') : splitCaption(brief.caption).tags;

  let body: JSX.Element;
  if (phase === 'details') {
    body = (
      <DetailsStep
        brief={brief}
        lines={ownLines}
        caption={meta.caption}
        tags={meta.tags}
        search={meta.search}
        onChange={(v) => setMeta(v)}
        onBack={() => setPhase('edit')}
        onReview={() => setPhase('review')}
      />
    );
  } else if (phase === 'review') {
    body = (
      <ReviewStep
        format="reel"
        slides={reviewSlides}
        feature={pickFeature(features, brief.cta.featureId)}
        caption={capText}
        tags={tagText}
        handle={handle}
        avatarUri={avatarUri}
        stage={<ReviewStage doc={document} />}
        scriptRows={scriptRows}
        thumbs={reviewSlides.map((s) => thumbs[s.id] ?? null)}
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
    body = (
      <ReelEditor
        doc={document}
        items={items}
        companyId={scope.companyId}
        cuts={meta.cuts}
        onBack={fromReview ? () => { setFromReview(false); setPhase('review'); } : () => toRecord()}
        onNext={fromReview ? () => { setFromReview(false); setPhase('review'); } : () => setPhase(ownDetails ? 'details' : 'review')}
        onAddClip={() => toRecord()}
        onRedoClip={(item) => toRecord(item)}
        onDeleteBlock={(blockId) => setItems((arr) => arr.map((p) => ({ ...p, blockIds: p.blockIds.filter((b) => b !== blockId) })))}
        onAi={() => setAi(true)}
      />
    );
  }

  const selectedBlockId = selection?.kind === 'block' ? selection.blockId : null;
  const ownItems = items.filter((p) => p.free || p.role === 'cover');
  const lineIndex = selectedBlockId ? ownItems.findIndex((p) => p.blockIds.includes(selectedBlockId)) : -1;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      {body}
      <AskAiSheet
        visible={ai}
        brief={brief}
        lines={ownLines}
        lineIndex={lineIndex}
        reel
        onApplyHook={(t) => {
          const cover = items.find((p) => p.role === 'cover');
          if (cover) applyLine(cover, t);
        }}
        onApplyLine={(t) => {
          const target = lineIndex >= 0 ? ownItems[lineIndex] : ownItems[0];
          if (target) applyLine(target, t);
        }}
        onApplyAll={(lines) => {
          let j = 0;
          const next = items.map((p) => (p.free || p.role === 'cover' ? { ...p, text: lines[j++] ?? p.text } : p));
          setItems(() => next);
          useStudioStore.getState().commit(
            onVideo((d) => {
              let out = d;
              for (const p of next) {
                if (out.overlays.some((o) => o.id === overlayIdFor(p))) out = updateOverlay(out, overlayIdFor(p), { text: p.text });
              }
              return syncPlanOverlays(out, next);
            }),
          );
        }}
        onCut={() => {
          setAi(false);
          void cut();
        }}
        onClose={() => setAi(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink900 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.ink900 },
  error: { fontSize: type.size.body, color: color.white, textAlign: 'center', paddingHorizontal: space[8] },
});

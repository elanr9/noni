// TikTok style camera for a reel brief: the prompter card at the top with
// the hook or the point's say line, flip, flash, timer and grid on the rail,
// one take per point, playback right after each take with redo, extra or
// next, and the plug as the last clip. From RLCreator.jsx RecordScreen.
// Takes land in the studio document; the plan remembers which block is which.
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, type CameraType } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { WeekBrief } from '../../../../lib/briefs-api';
import { blockDurationMs, type MediaAsset, type VideoDocument } from '../../../../lib/edit-document';
import { pickFeature, type LibraryFeature } from '../../../../lib/library-api';
import { onVideo, useStudioStore } from '../../../../lib/studio-store';
import { color, type as typeToken } from '../../../../theme/tokens';
import { BeatPrompter } from '../../../Teleprompter';
import { Icon } from '../../../ui/Icon';
import { COUNTDOWN_OPTIONS, type CountdownSeconds } from '../../studio/capture/constants';
import { Countdown } from '../../studio/capture/Countdown';
import { PermissionGate } from '../../studio/capture/PermissionGate';
import { RecordButton } from '../../studio/capture/RecordButton';
import { SideRail } from '../../studio/capture/SideRail';
import { useCapturePermissions } from '../../studio/capture/useCapturePermissions';
import { useRecorder } from '../../studio/capture/useRecorder';
import { Viewfinder } from '../../studio/capture/Viewfinder';
import { FeatureShot } from '../FeatureShot';
import { layoutOf } from '../model';
import { freeClipItem, isGuided, planReady, plugItem, PLUG_SAY, prompterLabel, type ReelPlanItem } from './plan';
import { addTake, removeBlocks } from './sync';
import { TakePlayback } from './TakePlayback';

export type RecordScreenProps = {
  brief: WeekBrief;
  document: VideoDocument;
  items: ReelPlanItem[];
  setItems: (update: (prev: ReelPlanItem[]) => ReelPlanItem[]) => void;
  features: LibraryFeature[];
  companyName: string;
  /** Re-record this item (from the editor), else resume at the first open clip. */
  startItemId: string | null;
  onDone: () => void;
  onClose: () => void;
};

type Play = { item: ReelPlanItem; asset: MediaAsset };

function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function firstOpen(items: ReelPlanItem[], guided: boolean): number {
  if (guided) {
    const k = items.findIndex((p) => p.blockIds.length === 0);
    return k >= 0 ? k : items.length;
  }
  const cover = items.findIndex((p) => p.role === 'cover');
  if (cover >= 0 && items[cover].blockIds.length === 0) return cover;
  const plug = items.findIndex((p) => p.role === 'cta');
  const own = items.filter((p) => p.free && p.blockIds.length > 0).length;
  if (plug >= 0 && items[plug].blockIds.length === 0 && own > 0) return plug;
  return items.filter((p) => p.role !== 'cta').length;
}

export function RecordScreen(props: RecordScreenProps): JSX.Element {
  const { brief, document, items, setItems, features, companyName, startItemId, onDone, onClose } = props;
  const insets = useSafeAreaInsets();
  const guided = isGuided(brief);
  const open = brief.kind === 'open';
  const permissions = useCapturePermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const [idx, setIdx] = useState(() => {
    const at = startItemId ? items.findIndex((p) => p.id === startItemId) : -1;
    return at >= 0 ? at : firstOpen(items, guided);
  });
  const [facing, setFacing] = useState<CameraType>('front');
  const [torch, setTorch] = useState(false);
  const [countdown, setCountdown] = useState<CountdownSeconds>(0);
  const [grid, setGrid] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [cameraReadyAt, setCameraReadyAt] = useState<number | null>(null);
  const [countingDown, setCountingDown] = useState(false);
  const [tele, setTele] = useState(true);
  const [play, setPlay] = useState<Play | null>(null);
  const [plugCard, setPlugCard] = useState(false);
  const [closeAsk, setCloseAsk] = useState(false);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [liveMs, setLiveMs] = useState(0);

  const cur = items[idx] && !items[idx].free ? items[idx] : null;
  const curRef = useRef(cur);
  useEffect(() => {
    curRef.current = cur;
  }, [cur]);

  const handleAsset = useCallback(
    (asset: MediaAsset) => {
      const store = useStudioStore.getState();
      let blockId: string | null = null;
      store.commit(
        onVideo((d) => {
          const r = addTake(d, asset);
          blockId = r.blockId;
          return r.doc;
        }),
      );
      if (!blockId) return;
      const id = blockId;
      const target = curRef.current;
      if (target) {
        setItems((arr) => arr.map((p) => (p.id === target.id ? { ...p, blockIds: [...p.blockIds, id] } : p)));
        setPlay({ item: { ...target, blockIds: [...target.blockIds, id] }, asset });
        setTele(false);
        return;
      }
      const item: ReelPlanItem = { ...freeClipItem(), blockIds: [id] };
      setItems((arr) => {
        const cta = arr.find((p) => p.role === 'cta');
        const base = arr.filter((p) => p.role !== 'cta');
        return cta ? [...base, item, cta] : [...base, item];
      });
      setIdx(items.filter((p) => p.role !== 'cta').length + 1);
    },
    [setItems, items],
  );

  const recorder = useRecorder({ cameraRef, cameraReadyAt, frontFlash: torch && facing === 'front', onAsset: handleAsset });
  const recording = recorder.phase === 'recording' || recorder.phase === 'starting';
  const cameraReady = cameraReadyAt !== null;

  useEffect(() => {
    if (recorder.startedAt === null) return;
    const startedAt = recorder.startedAt;
    const t = setInterval(() => setLiveMs(Date.now() - startedAt), 200);
    return () => {
      clearInterval(t);
      setLiveMs(0);
    };
  }, [recorder.startedAt]);

  // Long text: stop at the target length.
  useEffect(() => {
    if (!recording || !cur?.targetMs || liveMs < cur.targetMs) return;
    recorder.stop();
  }, [recording, cur?.targetMs, liveMs, recorder]);

  const beginRecording = () => {
    if (!cameraReady) return;
    if (countdown > 0) setCountingDown(true);
    else recorder.start();
  };
  const onTapRecord = () => {
    if (countingDown) {
      setCountingDown(false);
      return;
    }
    if (recording) recorder.stop();
    else if (recorder.phase === 'idle') {
      setPlay(null);
      beginRecording();
    }
  };
  const flip = () => {
    if (recording) return;
    setFacing((f) => (f === 'front' ? 'back' : 'front'));
    setZoom(0);
    setCameraReadyAt(null);
  };

  const soFarMs = cur
    ? document.blocks.filter((b) => cur.blockIds.includes(b.id)).reduce((a, b) => a + blockDurationMs(b), 0)
    : document.blocks
        .filter((b) => items.some((p) => p.free && p.blockIds.includes(b.id)))
        .reduce((a, b) => a + blockDurationMs(b), 0);
  const own = items.filter((p) => p.free && p.blockIds.length > 0).length;
  const hasPlug = items.some((p) => p.role === 'cta');
  const ready = planReady(brief, items);
  const anyClip = items.some((p) => p.blockIds.length > 0);

  const dropBlocks = (blockIds: string[]) => {
    useStudioStore.getState().commit(onVideo((d) => removeBlocks(d, blockIds)));
  };
  const redoLast = () => {
    if (cur) {
      const last = cur.blockIds[cur.blockIds.length - 1];
      if (!last) return;
      dropBlocks([last]);
      setItems((arr) => arr.map((p) => (p.id === cur.id ? { ...p, blockIds: p.blockIds.slice(0, -1) } : p)));
      if (cur.blockIds.length <= 1) setTele(true);
    } else {
      const lastFree = [...items].reverse().find((p) => p.free && p.blockIds.length > 0);
      if (!lastFree) return;
      dropBlocks(lastFree.blockIds);
      setItems((arr) => arr.filter((p) => p.id !== lastFree.id));
      setIdx((k) => Math.max(0, k - 1));
    }
    setPlay(null);
  };
  const redoTake = () => {
    if (!play) return;
    const last = play.item.blockIds[play.item.blockIds.length - 1];
    if (last) {
      dropBlocks([last]);
      setItems((arr) => arr.map((p) => (p.id === play.item.id ? { ...p, blockIds: p.blockIds.filter((b) => b !== last) } : p)));
    }
    if (play.item.blockIds.length <= 1) setTele(true);
    setPlay(null);
  };
  const advance = () => {
    setPlay(null);
    setTele(true);
    if (guided) {
      const next = items.findIndex((p) => p.blockIds.length === 0);
      if (next >= 0) setIdx(next);
      else onDone();
      return;
    }
    if (cur?.role === 'cta') {
      onDone();
      return;
    }
    setIdx(items.filter((p) => p.role !== 'cta').length);
  };
  const finish = () => {
    if (ready) {
      onDone();
      return;
    }
    if (!guided && !open && !hasPlug) {
      setPlugCard(true);
      return;
    }
    const plug = items.findIndex((p) => p.role === 'cta');
    if (plug >= 0 && items[plug].blockIds.length === 0) setIdx(plug);
  };
  const addPlug = () => {
    const feat = pickFeature(features, brief.cta.featureId);
    const text = brief.cta.text || feat?.cta || `${companyName} makes it easier. Link in bio.`;
    const item = plugItem(text, feat?.id ?? brief.cta.featureId, PLUG_SAY);
    setItems((arr) => [...arr.filter((p) => p.role !== 'cta'), item]);
    setPlugCard(false);
    setIdx(items.filter((p) => p.role !== 'cta').length);
    setTele(true);
  };
  const goBack = () => {
    if (recording) return;
    if (idx === 0 || (!cur && own === 0)) {
      setCloseAsk(true);
      return;
    }
    setIdx(Math.max(0, cur ? idx - 1 : items.filter((p) => p.role !== 'cta').length - 1));
    setPlay(null);
    setTele(true);
  };

  const segments = guided ? items : [...items.filter((p) => p.blockIds.length > 0), ...(recording && !cur ? [null] : [])];
  const label = cur ? prompterLabel(cur, guided) : '';
  const feature = cur?.insetFeatureId ? pickFeature(features, cur.insetFeatureId) : null;
  const L = cur ? layoutOf({ box: cur.box, insetBox: cur.insetBox, insetFeatureId: cur.insetFeatureId }) : null;
  const nextLabel = cur
    ? (cur.role === 'cta' && !guided) || (guided && !items.some((p, k) => k > idx && p.blockIds.length === 0))
      ? 'Done'
      : 'Next clip'
    : ready
      ? 'Done'
      : 'Next';
  const showGate = permissions.state === 'ask' || permissions.state === 'blocked';
  const timeLabel = cur?.targetMs ? `${fmt(soFarMs + liveMs)} / ${fmt(cur.targetMs)}` : fmt(soFarMs + liveMs);

  return (
    <View style={styles.root} onLayout={(e) => setStage({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {permissions.state === 'granted' ? (
        <Viewfinder
          cameraRef={cameraRef}
          facing={facing}
          torch={torch}
          grid={grid}
          zoom={zoom}
          onZoom={setZoom}
          frontGlow={recording && torch && facing === 'front'}
          onReady={() => setCameraReadyAt(Date.now())}
          onMountError={(message) => {
            setCameraReadyAt(null);
            Alert.alert('Camera failed', message || 'Could not start the camera. Close and open it again.');
          }}
          onDoubleTap={flip}
        />
      ) : null}
      {showGate ? <PermissionGate permissions={permissions} /> : null}

      {play ? (
        <TakePlayback
          asset={play.asset}
          item={play.item.free ? null : play.item}
          stageWidth={stage.w}
          stageHeight={stage.h}
          nextLabel={nextLabel}
          onRedo={redoTake}
          onExtra={() => setPlay(null)}
          onNext={advance}
        />
      ) : null}

      {cur && feature && !play ? (
        <View pointerEvents="none" style={[styles.inset, { left: (L?.inset.x ?? 0.5) * stage.w - ((L?.inset.w ?? 0.42) * stage.w) / 2, top: `${(L?.inset.y ?? 0.3) * 100}%` }]}>
          <FeatureShot feature={feature} w={(L?.inset.w ?? 0.42) * stage.w} video />
        </View>
      ) : null}

      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        {segments.length > 0 ? (
          <View style={styles.segments}>
            {segments.map((p, k) => {
              const liveHere = recording && (p === null || (guided && k === idx));
              const done = p !== null && p.blockIds.length > 0;
              return <View key={p?.id ?? `live${k}`} style={[styles.segment, { backgroundColor: liveHere && !done ? color.danger : done ? color.white : color.whiteA28 }]} />;
            })}
          </View>
        ) : null}
        <View style={styles.topRow} pointerEvents="box-none">
          {cur && cur.say && tele && !play ? (
            <View style={styles.prompter}>
              <View style={styles.prompterHead}>
                {cur.role === 'cta' ? <Icon name="zap" size={12} color={color.blue300} /> : null}
                <Text style={[styles.prompterLabel, { color: cur.role === 'cta' ? color.blue300 : color.whiteA60 }]}>{label}</Text>
              </View>
              <BeatPrompter label="" text={cur.say} credential={null} />
              <Pressable accessibilityRole="button" accessibilityLabel="Hide prompter" hitSlop={10} onPress={() => setTele(false)} style={styles.prompterClose}>
                <Icon name="x" size={14} color={color.white} />
              </Pressable>
            </View>
          ) : !cur && !recording && !play ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setCloseAsk(true)} style={styles.closeBtn}>
              <Icon name="x" size={22} color={color.white} />
            </Pressable>
          ) : (
            <View style={styles.flex} />
          )}
        </View>
      </View>

      {permissions.state === 'granted' && !play ? (
        <SideRail
          style={{ top: insets.top + 64 }}
          facing={facing}
          onFlip={flip}
          torch={torch}
          onToggleTorch={() => setTorch((t) => !t)}
          countdown={countdown}
          onCycleCountdown={() => setCountdown((c) => COUNTDOWN_OPTIONS[(COUNTDOWN_OPTIONS.indexOf(c) + 1) % COUNTDOWN_OPTIONS.length])}
          grid={grid}
          onToggleGrid={() => setGrid((g) => !g)}
          hasNotes={Boolean(cur?.say) && !tele}
          notesOpen={false}
          onToggleNotes={() => setTele(true)}
          recording={recording}
        />
      ) : null}

      {!play ? (
        <View style={[styles.bottom, { paddingBottom: insets.bottom + 18 }]} pointerEvents="box-none">
          <Text style={styles.time}>{timeLabel}</Text>
          <View style={styles.controls}>
            {!recording && (guided || cur) ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={goBack} style={[styles.side, styles.sideLeft]}>
                <Icon name="chevron-left" size={24} color={color.white} />
              </Pressable>
            ) : null}
            {!recording && ((cur && cur.blockIds.length > 0) || (!cur && own > 0)) ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Redo last clip" onPress={redoLast} style={[styles.side, styles.sideRedo]}>
                <Icon name="rotate-ccw" size={20} color={color.white} />
              </Pressable>
            ) : null}
            <RecordButton
              recording={recording}
              disabled={permissions.state !== 'granted' || !cameraReady || recorder.phase === 'saving'}
              onTap={onTapRecord}
              onHoldStart={() => {
                if (recorder.phase === 'idle' && !countingDown && cameraReady) recorder.start();
              }}
              onHoldEnd={() => recorder.stop()}
            />
            {!cur && (own > 0 || recording) ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next"
                onPress={() => {
                  if (recording) recorder.stop();
                  else finish();
                }}
                style={[styles.side, styles.sideRight, { backgroundColor: ready ? color.blue500 : color.white }]}
              >
                <Icon name="check" size={24} color={ready ? color.white : color.ink} />
              </Pressable>
            ) : null}
            {!recording && cur && cur.blockIds.length > 0 ? (
              <Pressable accessibilityRole="button" onPress={advance} style={[styles.nextBtn, styles.sideRight]}>
                <Text style={styles.nextText}>{nextLabel}</Text>
                <Icon name="arrow-right" size={15} color={color.white} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {countingDown && countdown !== 0 ? (
        <Countdown
          seconds={countdown}
          onDone={() => {
            setCountingDown(false);
            recorder.start();
          }}
          onCancel={() => setCountingDown(false)}
        />
      ) : null}

      {closeAsk ? (
        <View style={styles.scrim}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Close this post?</Text>
            <Text style={styles.dialogText}>{anyClip ? 'Your clips stay saved as a draft.' : 'Nothing recorded yet.'}</Text>
            <Pressable accessibilityRole="button" onPress={() => setCloseAsk(false)} style={styles.dialogPrimary}>
              <Text style={styles.dialogPrimaryText}>Keep recording</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setCloseAsk(false);
                onClose();
              }}
              style={styles.dialogGhost}
            >
              <Text style={styles.dialogClose}>Close</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {plugCard ? (
        <View style={styles.scrim}>
          <View style={styles.dialog}>
            <View style={styles.zap}>
              <Icon name="zap" size={22} color={color.white} />
            </View>
            <Text style={styles.dialogTitle}>One more clip: your plug</Text>
            <Text style={styles.dialogText}>The line and the screen recording pop up on screen. Say it like one more tip.</Text>
            <Pressable accessibilityRole="button" onPress={addPlug} style={styles.dialogPrimary}>
              <Text style={styles.dialogPrimaryText}>Record the plug</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setPlugCard(false)} style={styles.dialogGhost}>
              <Text style={styles.dialogGhostText}>Not yet</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink900 },
  flex: { flex: 1 },
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 12, gap: 10 },
  segments: { flexDirection: 'row', gap: 3, height: 3 },
  segment: { flex: 1, height: 3, borderRadius: 99 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingRight: 56 },
  prompter: { flex: 1, minWidth: 0, borderRadius: 14, backgroundColor: color.inkA55, paddingTop: 10, paddingBottom: 4, paddingRight: 30 },
  prompterHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20 },
  prompterLabel: { fontFamily: typeToken.font.ui, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  prompterClose: { position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 999, backgroundColor: color.whiteA16, alignItems: 'center', justifyContent: 'center' },
  closeBtn: { width: 44, height: 44, borderRadius: 999, backgroundColor: color.scrim, alignItems: 'center', justifyContent: 'center' },
  inset: { position: 'absolute' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, alignItems: 'center', gap: 12 },
  time: { fontFamily: typeToken.font.ui, fontSize: 17, fontWeight: '700', color: color.white, fontVariant: ['tabular-nums'], minHeight: 22 },
  controls: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  side: { position: 'absolute', width: 44, height: 44, borderRadius: 999, backgroundColor: color.scrim, alignItems: 'center', justifyContent: 'center' },
  sideLeft: { left: 0 },
  sideRedo: { left: 54, borderWidth: 2, borderColor: color.white },
  sideRight: { right: 0, width: 48, height: 48 },
  nextBtn: { position: 'absolute', height: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: color.blue500, flexDirection: 'row', alignItems: 'center', gap: 6 },
  nextText: { color: color.white, fontFamily: typeToken.font.ui, fontSize: 14, fontWeight: '700' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: color.scrimStrong, alignItems: 'center', justifyContent: 'center', padding: 28 },
  dialog: { width: '100%', gap: 10, padding: 20, borderRadius: 24, backgroundColor: color.ink900, borderWidth: 1, borderColor: color.whiteA16 },
  zap: { width: 44, height: 44, borderRadius: 999, backgroundColor: color.blue500, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  dialogTitle: { textAlign: 'center', fontFamily: typeToken.font.display, fontSize: 20, fontWeight: '700', letterSpacing: -0.3, color: color.white },
  dialogText: { textAlign: 'center', fontFamily: typeToken.font.ui, fontSize: 14, lineHeight: 20, fontWeight: '500', color: color.whiteA75 },
  dialogPrimary: { height: 50, borderRadius: 999, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center' },
  dialogPrimaryText: { fontFamily: typeToken.font.ui, fontSize: 15, fontWeight: '700', color: color.ink },
  dialogGhost: { height: 44, alignItems: 'center', justifyContent: 'center' },
  dialogGhostText: { fontFamily: typeToken.font.ui, fontSize: 14, fontWeight: '700', color: color.whiteA75 },
  dialogClose: { fontFamily: typeToken.font.ui, fontSize: 14, fontWeight: '700', color: color.danger },
});

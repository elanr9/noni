// TikTok style camera for a reel brief: the prompter card at the top with
// the hook or the point's say line, flip, flash, timer and grid on the rail,
// one take per point, playback right after each take with redo, extra or
// next, and the plug as the last clip (right after the hook when the manager
// locked the CTA there). From RLCreator.jsx RecordScreen.
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
import { freeClipItem, isGuided, planReady, plugFirst, plugItem, PLUG_SAY, prompterLabel, withFreeClip, withPlug, type ReelPlanItem } from './plan';
import { addTake, deleteItemBlocks } from './sync';
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
  /** Items to record again (changes requested); their first new take replaces the old one. */
  redoItemIds?: string[];
  onDone: () => void;
  onClose: () => void;
};

type Play = { item: ReelPlanItem; asset: MediaAsset };

function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Index meaning "record a free clip": past the end of any plan, so the
 * current item is null however many clips get added.
 */
const FREE = Number.MAX_SAFE_INTEGER;

/** first: the plug comes right after the hook, before any free clip. */
function firstOpen(items: ReelPlanItem[], guided: boolean, first = false): number {
  if (guided) {
    const k = items.findIndex((p) => p.blockIds.length === 0);
    return k >= 0 ? k : items.length;
  }
  const cover = items.findIndex((p) => p.role === 'cover');
  if (cover >= 0 && items[cover].blockIds.length === 0) return cover;
  const plug = items.findIndex((p) => p.role === 'cta');
  const own = items.filter((p) => p.free && p.blockIds.length > 0).length;
  if (plug >= 0 && items[plug].blockIds.length === 0 && (own > 0 || first)) return plug;
  return FREE;
}

export function RecordScreen(props: RecordScreenProps): JSX.Element {
  const { brief, document, items, setItems, features, companyName, startItemId, redoItemIds = [], onDone, onClose } = props;
  const insets = useSafeAreaInsets();
  const guided = isGuided(brief);
  const open = brief.kind === 'open';
  // CTA locked right after the hook: hook, plug, then the rest.
  const plugOpens = plugFirst(brief);
  const permissions = useCapturePermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const [idx, setIdx] = useState(() => {
    const first = startItemId ?? redoItemIds[0] ?? null;
    const at = first ? items.findIndex((p) => p.id === first) : -1;
    return at >= 0 ? at : firstOpen(items, guided, plugOpens);
  });
  // Items whose next take replaces what they have (Redo clip, flagged clips).
  const initialRedo = [...(startItemId ? [startItemId] : []), ...redoItemIds];
  const replaceRef = useRef(new Set<string>(initialRedo));
  // The same set for rendering: a free clip waiting to be replaced is recorded as itself.
  const [pending, setPending] = useState<string[]>(initialRedo);
  const redoing = startItemId !== null || redoItemIds.length > 0;
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
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
  // Redo clip or a flagged clip on a free item: the next take replaces that item.
  const redoFree = !cur && items[idx]?.free && pending.includes(items[idx].id) ? items[idx] : null;
  const takeTarget = cur ?? redoFree;
  const curRef = useRef(takeTarget);
  useEffect(() => {
    curRef.current = takeTarget;
  }, [takeTarget]);

  const handleAsset = useCallback(
    (asset: MediaAsset) => {
      const store = useStudioStore.getState();
      const plan = itemsRef.current;
      const target = curRef.current ? (plan.find((p) => p.id === curRef.current?.id) ?? curRef.current) : null;
      const free = target ? null : freeClipItem();
      const placed = free ? withFreeClip(plan, free, plugOpens) : plan;
      const itemId = target?.id ?? free?.id ?? '';
      const replace = target !== null && replaceRef.current.has(target.id);
      let blockId: string | null = null;
      store.commit(
        onVideo((d) => {
          const r = addTake(d, asset, placed, itemId, replace);
          blockId = r.blockId;
          return r.doc;
        }),
      );
      if (!blockId) return;
      const id = blockId;
      if (target) {
        replaceRef.current.delete(target.id);
        setPending([...replaceRef.current]);
        const blockIds = replace ? [id] : [...target.blockIds, id];
        setItems((arr) => arr.map((p) => (p.id === target.id ? { ...p, blockIds: replace ? [id] : [...p.blockIds, id] } : p)));
        setPlay({ item: { ...target, blockIds }, asset });
        setTele(false);
        return;
      }
      if (free) setItems((arr) => withFreeClip(arr, { ...free, blockIds: [id] }, plugOpens));
    },
    [setItems, plugOpens],
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

  // Long text: stop at the target length, on a timer rather than the display tick.
  const stopRecording = recorder.stop;
  const targetMs = cur?.targetMs ?? 0;
  useEffect(() => {
    if (recorder.startedAt === null || targetMs <= 0) return;
    const t = setTimeout(stopRecording, Math.max(0, targetMs - (Date.now() - recorder.startedAt)));
    return () => clearTimeout(t);
  }, [recorder.startedAt, targetMs, stopRecording]);

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
    useStudioStore.getState().commit(onVideo((d) => deleteItemBlocks(d, items, blockIds)));
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
    if (redoing) {
      const nextRedo = items.findIndex((p) => replaceRef.current.has(p.id) && p.id !== cur?.id);
      if (nextRedo >= 0) setIdx(nextRedo);
      else onDone();
      return;
    }
    if (guided) {
      const next = items.findIndex((p) => p.blockIds.length === 0);
      if (next >= 0) setIdx(next);
      else onDone();
      return;
    }
    if (cur?.role === 'cta' && (!plugOpens || own > 0)) {
      onDone();
      return;
    }
    setIdx(FREE);
  };
  const finish = () => {
    if (redoing) {
      const nextRedo = items.findIndex((p) => replaceRef.current.has(p.id));
      if (nextRedo >= 0) {
        setIdx(nextRedo);
        return;
      }
    }
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
    const placed = withPlug(items, item, plugOpens);
    setItems((arr) => withPlug(arr, item, plugOpens));
    setPlugCard(false);
    setIdx(placed.indexOf(item));
    setTele(true);
  };
  const goBack = () => {
    if (recording) return;
    // Back from the free clips goes to the plug when it came right after the hook.
    const plugAt = items.findIndex((p) => p.role === 'cta');
    if (!cur && own === 0 && plugOpens && plugAt > 0) {
      setIdx(plugAt);
      setPlay(null);
      setTele(true);
      return;
    }
    if (idx === 0 || (!cur && own === 0)) {
      setCloseAsk(true);
      return;
    }
    setIdx(cur ? Math.max(0, idx - 1) : FREE);
    setPlay(null);
    setTele(true);
  };

  const segments = guided ? items : [...items.filter((p) => p.blockIds.length > 0), ...(recording && !cur ? [null] : [])];
  const label = cur ? prompterLabel(cur, guided, plugOpens && !guided) : '';
  const feature = cur?.insetFeatureId ? pickFeature(features, cur.insetFeatureId) : null;
  const L = cur ? layoutOf({ box: cur.box, insetBox: cur.insetBox, insetFeatureId: cur.insetFeatureId }) : null;
  const nextLabel = cur
    ? (cur.role === 'cta' && !guided && (!plugOpens || own > 0)) || (guided && !items.some((p, k) => k > idx && p.blockIds.length === 0))
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
              <BeatPrompter label={label} text={cur.say} credential={null} />
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
  prompter: { flex: 1, minWidth: 0, borderRadius: 14, backgroundColor: color.inkA55, paddingRight: 24 },
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

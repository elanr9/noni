import { useRef, useState, type JSX } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { CameraView, type CameraType } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEFAULT_IMAGE_CLIP_MS, type MediaAsset } from '../../../../lib/edit-document';
import { color, radius, space, type } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { PressableScale } from '../../../ui/PressableScale';
import { RecClock } from '../../record/CaptureChrome';
import { COUNTDOWN_OPTIONS, WHITE, type CountdownSeconds } from './constants';
import { Countdown } from './Countdown';
import { ImportButton } from './ImportButton';
import { NotesDrawer, type CaptureNotes } from './NotesDrawer';
import { PermissionGate } from './PermissionGate';
import { ProgressSegments } from './ProgressSegments';
import { RecordButton } from './RecordButton';
import { SideRail } from './SideRail';
import { useCapturePermissions } from './useCapturePermissions';
import { useRecorder } from './useRecorder';
import { Viewfinder } from './Viewfinder';

export type CaptureScreenProps = {
  notes: CaptureNotes | null;
  clipCount: number;
  totalMs: number;
  onAsset(asset: MediaAsset): void;
  onDeleteLast(): void;
  onDone(): void;
  onClose(): void;
};

export function CaptureScreen({
  notes,
  clipCount,
  totalMs,
  onAsset,
  onDeleteLast,
  onDone,
  onClose,
}: CaptureScreenProps): JSX.Element {
  const insets = useSafeAreaInsets();
  const permissions = useCapturePermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const [facing, setFacing] = useState<CameraType>('front');
  const [torch, setTorch] = useState(false);
  const [countdown, setCountdown] = useState<CountdownSeconds>(0);
  const [grid, setGrid] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [cameraReadyAt, setCameraReadyAt] = useState<number | null>(null);
  const [countingDown, setCountingDown] = useState(false);
  const [knownDurations, setKnownDurations] = useState<number[]>([]);
  const [stageHeight, setStageHeight] = useState(0);

  function handleAsset(asset: MediaAsset) {
    const ms = asset.kind === 'video' ? (asset.durationMs ?? 0) : DEFAULT_IMAGE_CLIP_MS;
    setKnownDurations((k) => [...k, ms]);
    onAsset(asset);
  }

  const recorder = useRecorder({
    cameraRef,
    cameraReadyAt,
    frontFlash: torch && facing === 'front',
    onAsset: handleAsset,
  });

  const recording = recorder.phase === 'recording' || recorder.phase === 'starting';
  const busy = recording || recorder.phase === 'saving' || countingDown;
  const cameraReady = cameraReadyAt !== null;

  function beginRecording() {
    if (!cameraReady) return;
    if (countdown > 0) setCountingDown(true);
    else recorder.start();
  }

  function onTapRecord() {
    if (countingDown) {
      setCountingDown(false);
      return;
    }
    if (recording) recorder.stop();
    else if (recorder.phase === 'idle') beginRecording();
  }

  function onHoldStart() {
    if (recorder.phase === 'idle' && !countingDown && cameraReady) recorder.start();
  }

  function flip() {
    if (recording) return;
    setFacing((f) => (f === 'front' ? 'back' : 'front'));
    setZoom(0);
    setCameraReadyAt(null);
  }

  function confirmDeleteLast() {
    Alert.alert('Delete last clip?', 'This removes the most recent clip from your post.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setKnownDurations((k) => k.slice(0, -1));
          onDeleteLast();
        },
      },
    ]);
  }

  const showGate = permissions.state === 'ask' || permissions.state === 'blocked';
  const railTop = insets.top + 64;
  const drawerHeight = Math.max(240, Math.round(stageHeight * 0.45));

  return (
    <View style={styles.root} onLayout={(e) => setStageHeight(e.nativeEvent.layout.height)}>
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
            Alert.alert('Camera failed', message || 'Could not start the camera. Close and open the studio again.');
          }}
          onDoubleTap={flip}
        />
      ) : null}

      {showGate ? <PermissionGate permissions={permissions} /> : null}

      <View style={[styles.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <ProgressSegments
          clipCount={clipCount}
          totalMs={totalMs}
          knownDurations={knownDurations}
          recordingStartedAt={recorder.startedAt}
        />
        <View style={styles.topRow} pointerEvents="box-none">
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Close camera"
            disabled={busy}
            onPress={onClose}
            style={[styles.iconButton, busy && styles.hidden]}
          >
            <Icon name="x" size={22} color={WHITE} />
          </PressableScale>
          {recorder.startedAt !== null ? <RecClock startedAt={recorder.startedAt} /> : <View />}
          <View style={styles.iconButton} />
        </View>
      </View>

      {permissions.state === 'granted' ? (
        <SideRail
          style={{ top: railTop }}
          facing={facing}
          onFlip={flip}
          torch={torch}
          onToggleTorch={() => setTorch((t) => !t)}
          countdown={countdown}
          onCycleCountdown={() =>
            setCountdown((c) => COUNTDOWN_OPTIONS[(COUNTDOWN_OPTIONS.indexOf(c) + 1) % COUNTDOWN_OPTIONS.length])
          }
          grid={grid}
          onToggleGrid={() => setGrid((g) => !g)}
          hasNotes={notes !== null && notes.lines.length > 0}
          notesOpen={notesOpen}
          onToggleNotes={() => setNotesOpen((o) => !o)}
          recording={recording}
        />
      ) : null}

      <View style={[styles.bottom, { paddingBottom: insets.bottom + space[3] }]} pointerEvents="box-none">
        <View style={styles.bottomSide}>
          {busy ? null : <ImportButton onAsset={handleAsset} disabled={permissions.state !== 'granted'} />}
        </View>
        <RecordButton
          recording={recording}
          disabled={permissions.state !== 'granted' || !cameraReady || recorder.phase === 'saving'}
          onTap={onTapRecord}
          onHoldStart={onHoldStart}
          onHoldEnd={() => recorder.stop()}
        />
        <View style={[styles.bottomSide, styles.bottomRight]}>
          {clipCount > 0 && !busy ? (
            <>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Delete last clip"
                onPress={confirmDeleteLast}
                style={styles.iconButton}
              >
                <Icon name="trash-2" size={20} color={WHITE} />
              </PressableScale>
              <PressableScale accessibilityRole="button" accessibilityLabel="Done, go to edit" onPress={onDone} style={styles.done}>
                <Icon name="check" size={20} color={color.ink} strokeWidth={2.5} />
                <Text style={styles.doneText}>Done</Text>
              </PressableScale>
            </>
          ) : null}
        </View>
      </View>

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

      {notes !== null && notes.lines.length > 0 ? (
        <NotesDrawer
          notes={notes}
          open={notesOpen}
          onClose={() => setNotesOpen(false)}
          recording={recording}
          height={drawerHeight}
          bottomInset={insets.bottom}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.ink900,
  },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space[3],
    gap: space[2],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  hidden: {
    opacity: 0,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[8],
  },
  bottomSide: {
    width: 110,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  bottomRight: {
    justifyContent: 'flex-end',
  },
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: WHITE,
  },
  doneText: {
    color: color.ink,
    fontSize: type.size.meta,
    fontWeight: type.weight.bold,
  },
});

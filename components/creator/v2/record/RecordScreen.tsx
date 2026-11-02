// Record (V2Library.jsx RecordScreen). Guided: one clip per line with the
// teleprompter card lighting words as they are said; Long Text and green
// screen video clips are timed. Outline and free: as many clips as you like,
// the script in a sheet. Retake drops the current clip; guided clips auto
// advance. Clips persist locally and to recording_drafts between launches.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { CameraView, type CameraType } from 'expo-camera';
import * as VideoThumbnails from 'expo-video-thumbnails';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { wordsSpokenBy } from '../../../Teleprompter';
import type { Brief, GsMedia } from '../../../../lib/brief-library';
import type { MediaAsset } from '../../../../lib/edit-document';
import { color, motion } from '../../../../theme/v2';
import { MediaFill } from '../../../admin/v2/newbrief/ClipFrame';
import { MediaPickerSheet } from '../../../admin/v2/newbrief/MediaPickerSheet';
import { PermissionGate } from '../../../creator/studio/capture/PermissionGate';
import { VIDEO_BITRATE } from '../../../creator/studio/capture/constants';
import { useCapturePermissions } from '../../../creator/studio/capture/useCapturePermissions';
import { useRecorder } from '../../../creator/studio/capture/useRecorder';
import { Button, Icon, Press, tap } from '../../../v2';
import { StTextView } from '../../../v2/StTextView';
import { SentOverlay } from '../SentOverlay';
import { clipScreenTexts, clock, loadRecordDraft, saveRecordDraft, type RecordClip, type RecordDraft, type RecordMode } from './model';

/** The Say this card lights 2.6 words a second. */
const SAY_SPEED = 0.65;
const RED = '#FE2C55';
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface RecordScreenProps {
  mode: RecordMode;
  brief: Brief | null;
  /** The creator's copy of a Long Text post. */
  initialText?: string;
  /** Local draft key: the brief id, or a free key. */
  draftKey: string;
  /** A video picked from the library arrives as the first clip. */
  initialClip?: MediaAsset | null;
  onClose: () => void;
  /** Hand the kept clips to the editor. */
  onNext: (clips: RecordClip[], draft: RecordDraft) => Promise<void> | void;
  /** Long Text: submit straight away. Resolves once the server has it. */
  onSubmit: (clips: RecordClip[], text: string) => Promise<void>;
  /** After the Sent moment. */
  onSent: () => void;
  /** Each kept clip, for the server side draft. */
  onClip?: (clip: RecordClip, assignmentId: string | null) => Promise<string | null>;
}

export function RecordScreen({ mode, brief, initialText = '', draftKey, initialClip = null, onClose, onNext, onSubmit, onSent, onClip }: RecordScreenProps) {
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const permissions = useCapturePermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const guided = mode === 'guided' && !!brief?.clips?.length;
  const lines = useMemo(() => (guided ? (brief?.clips ?? []) : []), [guided, brief]);
  const n = lines.length;
  const seven = guided && brief?.type === 'Long Text';

  const [draft, setDraft] = useState<RecordDraft | null>(null);
  const [facing, setFacing] = useState<CameraType>('front');
  const [cameraReadyAt, setCameraReadyAt] = useState<number | null>(null);
  const [liveMs, setLiveMs] = useState(0);
  const [script, setScript] = useState(false);
  const [gsPick, setGsPick] = useState(false);
  const [editText, setEditText] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const draftRef = useRef<RecordDraft | null>(null);

  // Restore the local draft, seed the Long Text words and a library pick.
  useEffect(() => {
    let live = true;
    void loadRecordDraft(draftKey).then((d) => {
      if (!live) return;
      const base: RecordDraft = d ?? { clips: [], gsMap: {}, myText: '', ci: 0, assignmentId: null };
      if (!base.myText && initialText) base.myText = initialText;
      if (initialClip && !base.clips.some((c) => c?.asset.localUri === initialClip.localUri)) base.clips = [...base.clips, { slot: base.clips.length, asset: initialClip, gs: null }];
      setDraft(base);
    });
    return () => {
      live = false;
    };
  }, [draftKey, initialText, initialClip]);

  useEffect(() => {
    draftRef.current = draft;
    if (draft) saveRecordDraft(draftKey, draft);
  }, [draft, draftKey]);

  const update = useCallback((fn: (d: RecordDraft) => RecordDraft) => setDraft((d) => (d ? fn(d) : d)), []);

  const ci = draft?.ci ?? 0;
  const done = useMemo(() => draft?.clips ?? [], [draft]);
  const gsMap = useMemo(() => draft?.gsMap ?? {}, [draft]);
  const myText = draft?.myText ?? initialText;
  const gIdx = guided ? ci : done.length;
  const curLine = guided ? (lines[ci] ?? null) : null;
  const ownGs = !guided || (brief?.type === 'Greenscreen' && !curLine?.green);
  const gsCur: GsMedia | null = curLine?.green ? (curLine.gs ?? null) : (gsMap[gIdx] ?? null);
  const greenOn = !!curLine?.green || !!gsMap[gIdx];
  const timed = seven || gsCur?.kind === 'video';
  const limitS = seven ? 7 : gsCur?.kind === 'video' ? gsCur.dur : 0;

  const handleAsset = (asset: MediaAsset) => {
      const d = draftRef.current;
      if (!d) return;
      const slot = guided ? d.ci : d.clips.length;
      const clip: RecordClip = { slot, asset, gs: guided && lines[slot]?.green ? (lines[slot].gs ?? null) : (d.gsMap[slot] ?? null) };
      const clips = d.clips.slice();
      clips[slot] = clip;
      const next = { ...d, clips };
      setDraft(next);
      if (onClip) {
        void onClip(clip, d.assignmentId).then((assignmentId) => {
          if (assignmentId && assignmentId !== draftRef.current?.assignmentId) update((x) => ({ ...x, assignmentId }));
        });
      }
      if (guided && slot < n - 1) setTimeout(() => update((x) => ({ ...x, ci: slot + 1 })), 350);
  };

  const recorder = useRecorder({ cameraRef, cameraReadyAt, frontFlash: false, onAsset: handleAsset });
  const rec = recorder.phase === 'recording' || recorder.phase === 'starting';
  const saving = recorder.phase === 'saving';

  useEffect(() => {
    if (recorder.startedAt === null) return;
    const startedAt = recorder.startedAt;
    const t = setInterval(() => setLiveMs(Date.now() - startedAt), 100);
    return () => {
      clearInterval(t);
      setLiveMs(0);
    };
  }, [recorder.startedAt]);

  // Timed clips stop themselves at the limit.
  const stop = recorder.stop;
  useEffect(() => {
    if (recorder.startedAt === null || !timed || limitS <= 0) return;
    const t = setTimeout(stop, Math.max(0, limitS * 1000 - (Date.now() - recorder.startedAt)));
    return () => clearTimeout(t);
  }, [recorder.startedAt, timed, limitS, stop]);

  // First frames for the strip.
  useEffect(() => {
    let live = true;
    for (const c of done) {
      const uri = c?.asset.localUri;
      if (!c || !uri || thumbs[c.asset.id]) continue;
      VideoThumbnails.getThumbnailAsync(uri, { time: 0, quality: 0.4 }).then(
        (t) => live && setThumbs((m) => ({ ...m, [c.asset.id]: t.uri })),
        () => undefined,
      );
    }
    return () => {
      live = false;
    };
  }, [done, thumbs]);

  const t = liveMs / 1000;
  const total = done.reduce((a, c) => a + (c?.asset.durationMs ?? 0), 0) / 1000;
  const kept = done.filter((c): c is RecordClip => !!c);
  const allDone = guided ? lines.every((_, i) => !!done[i]) : kept.length > 0;
  const words = curLine?.text ? curLine.text.split(/\s+/).filter(Boolean) : [];
  const lit = rec ? wordsSpokenBy(liveMs, SAY_SPEED) : -1;
  const screenTexts = clipScreenTexts(curLine, seven ? { text: myText, seven: true } : undefined);

  const start = () => {
    if (cameraReadyAt === null || recorder.phase !== 'idle') return;
    tap();
    recorder.start();
  };
  const retake = () => {
    tap();
    update((d) => {
      const clips = d.clips.slice();
      if (guided) clips[d.ci] = null;
      else clips.pop();
      return { ...d, clips };
    });
  };
  const finish = async () => {
    if (!draft || busy) return;
    setBusy(true);
    try {
      if (seven) {
        await onSubmit(kept, myText);
        setSent(true);
        setTimeout(onSent, 1500);
      } else {
        await onNext(kept, draft);
      }
    } catch (e) {
      Alert.alert('Could not continue', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };
  const flip = () => {
    if (rec) return;
    tap();
    setFacing((f) => (f === 'front' ? 'back' : 'front'));
    setCameraReadyAt(null);
  };

  // Record button: inner disc shrinks to a square while recording; a red ring fills on timed clips.
  const inner = useSharedValue(64);
  useEffect(() => {
    inner.set(withTiming(rec ? 30 : 64, { duration: 200, easing: motion.sheetEase }));
  }, [rec, inner]);
  const innerStyle = useAnimatedStyle(() => ({ width: inner.get(), height: inner.get(), borderRadius: rec ? 8 : 999 }));
  const blink = useSharedValue(1);
  useEffect(() => {
    blink.set(rec ? withRepeat(withTiming(0.2, { duration: 500, easing: Easing.steps(2) }), -1, true) : 1);
  }, [rec, blink]);
  const blinkStyle = useAnimatedStyle(() => ({ opacity: blink.get() }));
  const ringLen = 2 * Math.PI * 39.5;
  const progress = timed && rec && limitS > 0 ? Math.min(1, t / limitS) : 0;

  const scriptY = useSharedValue(1);
  useEffect(() => {
    scriptY.set(withTiming(script ? 0 : 1, { duration: 320, easing: motion.sheetEase }));
  }, [script, scriptY]);
  const scriptStyle = useAnimatedStyle(() => ({ transform: [{ translateY: scriptY.get() * 520 }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: 1 - scriptY.get() }));

  const title = guided
    ? seven
      ? '7 second clip'
      : `Clip ${ci + 1} of ${n}${greenOn ? (gsCur?.kind === 'video' ? ` · ${gsCur.dur}s green screen` : ' · green screen') : ''}`
    : (brief?.title ?? 'New post');
  const H = W * (16 / 9);

  const sideBtn = (name: 'replay', onPress: () => void, hidden: boolean) => (
    <Press disabled={hidden} onPress={onPress} accessibilityLabel="Retake" style={{ width: 52, height: 52, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', opacity: hidden ? 0 : 1 }}>
      <Icon name={name} size={26} color="#fff" />
    </Press>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {permissions.state === 'granted' ? (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} mode="video" mute={false} mirror={facing === 'front'} videoQuality="1080p" videoBitrate={VIDEO_BITRATE} onCameraReady={() => setCameraReadyAt(Date.now())} onMountError={(e) => Alert.alert('Camera', e.message)} />
      ) : permissions.state === 'loading' ? (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : (
        <PermissionGate permissions={permissions} />
      )}

      {/* Green screen reference: the picked picture or video sits in the overlay slot. */}
      {greenOn && gsCur ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%', width: W * 0.4, height: W * 0.4 * 1.25, marginLeft: -W * 0.2, marginTop: -W * 0.25, borderRadius: 4, overflow: 'hidden', boxShadow: '0 6px 18px rgba(0,0,0,0.35)', opacity: 0.95 }}>
          <MediaFill src={gsCur.src} />
        </View>
      ) : null}
      {greenOn && gsCur?.kind === 'video' ? (
        <View style={{ position: 'absolute', left: 16, right: 16, top: insets.top + 50, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
          <View style={{ height: '100%', width: `${progress * 100}%`, backgroundColor: '#fff' }} />
        </View>
      ) : null}

      {/* On-screen words for the clip. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {screenTexts.map((x) => (
          <StTextView key={x.id} x={x} width={W} height={H} />
        ))}
      </View>

      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 140, backgroundColor: 'rgba(0,0,0,0.2)' }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 260, backgroundColor: 'rgba(0,0,0,0.3)' }} />

      {/* Header */}
      <View style={{ position: 'absolute', left: 8, right: 8, top: insets.top + 6, height: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Press accessibilityLabel="Close" onPress={onClose} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" size={26} color="#fff" />
        </Press>
        <Text numberOfLines={1} style={{ flex: 1, textAlign: 'center', fontSize: 15, lineHeight: 20, fontWeight: '700', color: '#fff', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}>{title}</Text>
        <Press accessibilityLabel="Flip camera" onPress={flip} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="cameraswitch" size={26} color="#fff" />
        </Press>
      </View>

      {rec ? (
        <View style={{ position: 'absolute', alignSelf: 'center', top: insets.top + 60, height: 26, paddingLeft: 8, paddingRight: 10, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.5)', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Animated.View style={[{ width: 8, height: 8, borderRadius: 999, backgroundColor: RED }, blinkStyle]} />
          <Text style={{ fontSize: 13, lineHeight: 26, fontWeight: '700', color: '#fff' }}>{clock(t)}{timed ? <Text style={{ color: 'rgba(255,255,255,0.6)' }}>{` / ${clock(limitS)}`}</Text> : null}</Text>
        </View>
      ) : null}

      {/* Green screen picker */}
      {ownGs && !rec && permissions.state === 'granted' ? (
        <View style={{ position: 'absolute', right: 10, top: insets.top + 66, alignItems: 'center', gap: 10 }}>
          <Press onPress={() => setGsPick(true)} style={{ alignItems: 'center', gap: 4, width: 56 }}>
            <View style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: gsMap[gIdx] ? '#fff' : 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="wallpaper" size={22} color={gsMap[gIdx] ? '#000' : '#fff'} />
            </View>
            <Text style={{ fontSize: 11, lineHeight: 13, fontWeight: '600', color: '#fff', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>{gsMap[gIdx] ? 'Replace' : 'Green screen'}</Text>
          </Press>
          {gsMap[gIdx] ? (
            <Press accessibilityLabel="Remove green screen" onPress={() => update((d) => { const m = { ...d.gsMap }; delete m[gIdx]; return { ...d, gsMap: m }; })} style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={16} color="#fff" />
            </Press>
          ) : null}
        </View>
      ) : null}

      {/* Say this */}
      {guided && !seven && curLine ? (
        <View style={{ position: 'absolute', left: 16, right: 16, top: insets.top + 96, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Say this</Text>
          <Text style={{ fontSize: 22, lineHeight: 30, fontWeight: '700', color: '#fff' }}>
            {words.map((w, i) => (
              <Text key={i} style={{ opacity: lit < 0 || i <= lit ? 1 : 0.45 }}>{w} </Text>
            ))}
          </Text>
        </View>
      ) : null}
      {seven && brief ? (
        <View pointerEvents={rec ? 'none' : 'auto'} style={{ position: 'absolute', left: 16, right: 16, top: insets.top + 60, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)', opacity: rec ? 0 : 1 }}>
          <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: '#fff' }}>{brief.title}</Text>
          {brief.notes ? <Text style={{ fontSize: 13, lineHeight: 18, color: 'rgba(255,255,255,0.75)', marginTop: 4 }}>{brief.notes}</Text> : null}
        </View>
      ) : null}
      {seven && allDone && !rec ? (
        <Press onPress={() => setEditText(true)} style={{ position: 'absolute', alignSelf: 'center', top: H * 0.42 + 90, height: 32, paddingHorizontal: 14, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.92)', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="edit" size={16} color={color.ink} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: color.ink }}>Edit text</Text>
        </Press>
      ) : null}
      {!guided && brief ? (
        <Press onPress={() => setScript(true)} style={{ position: 'absolute', alignSelf: 'center', top: insets.top + (rec ? 96 : 60), height: 30, paddingLeft: 12, paddingRight: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.92)', flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: color.blueDeep }}>View script</Text>
          <Icon name="keyboard_arrow_down" size={18} color={color.blueDeep} />
        </Press>
      ) : null}

      {/* Bottom: strip and controls */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 24) + 16 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, minHeight: 76 }} contentContainerStyle={{ gap: 8, paddingBottom: 18, alignItems: 'center' }}>
          {guided
            ? lines.map((_, i) => {
                const got = done[i];
                const on = i === ci;
                return (
                  <Press key={i} disabled={rec} onPress={() => update((d) => ({ ...d, ci: i }))} style={{ width: 44, height: 58, borderRadius: 10, overflow: 'hidden', backgroundColor: got ? '#000' : 'rgba(255,255,255,0.08)', borderWidth: got ? 0 : 1.5, borderColor: 'rgba(255,255,255,0.45)', borderStyle: 'dashed', boxShadow: on ? '0 0 0 2.5px #fff' : 'none', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 }}>
                    {got && thumbs[got.asset.id] ? <Image source={{ uri: thumbs[got.asset.id] }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                    <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', color: '#fff', textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>{got ? clock((got.asset.durationMs ?? 0) / 1000) : i + 1}</Text>
                  </Press>
                );
              })
            : kept.map((c) => (
                <View key={c.asset.id} style={{ width: 44, height: 58, borderRadius: 10, overflow: 'hidden', backgroundColor: '#222', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 }}>
                  {thumbs[c.asset.id] ? <Image source={{ uri: thumbs[c.asset.id] }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                  <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', color: '#fff', textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>{clock((c.asset.durationMs ?? 0) / 1000)}</Text>
                </View>
              ))}
          {!guided && kept.length ? <Text style={{ fontSize: 13, lineHeight: 16, fontWeight: '600', color: 'rgba(255,255,255,0.75)', paddingLeft: 6 }}>{`${kept.length} ${kept.length === 1 ? 'clip' : 'clips'} · ${clock(total)}`}</Text> : null}
        </ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, alignItems: 'center' }}>{sideBtn('replay', retake, rec || !(guided ? !!done[ci] : kept.length > 0))}</View>
          <Press accessibilityLabel={rec ? 'Stop' : 'Record'} disabled={saving || permissions.state !== 'granted'} onPress={rec ? recorder.stop : start} haptic={false} scaleTo={0.94} style={{ width: 84, height: 84, borderRadius: 999, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            {timed && rec ? (
              <Svg width={84} height={84} viewBox="0 0 84 84" style={{ position: 'absolute', left: -5, top: -5 }}>
                <AnimatedCircle cx={42} cy={42} r={39.5} stroke={RED} strokeWidth={5} fill="none" strokeDasharray={ringLen} strokeDashoffset={ringLen * (1 - progress)} strokeLinecap="round" rotation={-90} origin="42, 42" />
              </Svg>
            ) : null}
            <Animated.View style={[{ backgroundColor: RED }, innerStyle]} />
          </Press>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Press disabled={rec || !allDone || busy} onPress={() => void finish()} style={{ height: 52, paddingLeft: 20, paddingRight: 18, borderRadius: 999, backgroundColor: seven ? color.blue : '#fff', flexDirection: 'row', alignItems: 'center', gap: 4, opacity: rec || !allDone ? 0 : busy ? 0.6 : 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: seven ? '#fff' : color.ink }}>{seven ? 'Submit' : 'Next'}</Text>
              <Icon name={seven ? 'arrow_upward' : 'arrow_forward'} size={20} weight={700} color={seven ? '#fff' : color.ink} />
            </Press>
          </View>
        </View>
      </View>

      {/* Script sheet */}
      {!guided && brief ? (
        <>
          <Animated.View pointerEvents={script ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }, scrimStyle]}>
            <Press scaleTo={1} haptic={false} onPress={() => setScript(false)} style={{ flex: 1 }} />
          </Animated.View>
          <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '60%', backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 24) + 10 }, scriptStyle]}>
            <View style={{ width: 40, height: 5, borderRadius: 999, backgroundColor: color.grey2, alignSelf: 'center', marginBottom: 10 }} />
            <Text style={{ fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.2, color: color.ink, marginBottom: 10 }}>{brief.title}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: 15, lineHeight: 20, color: color.ink }}>{brief.notes}</Text>
            </ScrollView>
          </Animated.View>
        </>
      ) : null}

      <Modal visible={editText} transparent animationType="fade" onRequestClose={() => setEditText(false)}>
        <Press scaleTo={1} haptic={false} onPress={() => setEditText(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 24) + 16 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 12, gap: 10 }} onStartShouldSetResponder={() => true}>
            <TextInput autoFocus multiline value={myText} onChangeText={(v) => update((d) => ({ ...d, myText: v }))} style={{ minHeight: 88, backgroundColor: color.grey1, borderRadius: 14, fontSize: 16, lineHeight: 22, fontWeight: '600', color: color.ink, paddingHorizontal: 14, paddingVertical: 12, textAlign: 'center', textAlignVertical: 'top' }} />
            <Button label="Done" onPress={() => setEditText(false)} />
          </View>
        </Press>
      </Modal>

      <MediaPickerSheet open={gsPick} onClose={() => setGsPick(false)} onPick={(m) => { update((d) => ({ ...d, gsMap: { ...d.gsMap, [gIdx]: m } })); setGsPick(false); tap(); }} />
      {sent ? <SentOverlay /> : null}
    </View>
  );
}

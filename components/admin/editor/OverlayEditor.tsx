// Story-style overlay composer with multiple text boxes. Text mode: each box
// drags and pinches anywhere on the stage, an Instagram-style slider on the
// left resizes the active box (which re-wraps the line breaks), a still tap
// opens the keyboard, "Add text" starts another box, and Done saves it all.
// Media mode: the screenshot drags and pinches from anywhere on the screen,
// with three snap chips.
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import {
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Crypto from 'expo-crypto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  DEFAULT_BOX_SIZE,
  DEFAULT_OVERLAY_FILL,
  DEFAULT_TEXT_Y,
  MAX_BOX_SIZE,
  MIN_BOX_SIZE,
  overlayBoxFill,
  overlayTextContrast,
  serializeOverlayBoxes,
  type OverlayBox,
} from '../../../lib/overlay-boxes';
import type { Json } from '../../../lib/types';
import { color, radiusAdmin } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

const SCREEN_BG = '#10161D';
const RAIL_BG = 'rgba(16,22,29,0.45)';
const TOOL_HIT = { top: 1, bottom: 1, left: 1, right: 1 } as const;
const OVERLAY_FONT = 'TikTokSans_700Bold';
/** Extra grab area around a box so small text is still easy to catch. */
const HIT_SLOP = 26;

export type OverlayEditorMode = 'text' | 'media';

export type OverlaySavePatch = {
  overlay_text?: string;
  show_on_screen?: boolean;
  overlay_style?: { [key: string]: Json | undefined };
  text_y?: number;
  screenshot_x?: number;
  screenshot_y?: number;
  screenshot_width?: number;
};

/** Snap targets for the screenshot; free drag and pinch stay authoritative. */
const MEDIA_PRESETS = [
  { id: 'top_left', x: 0.23, y: 0.19, width: 0.46, label: 'Top left' },
  { id: 'top_right', x: 0.77, y: 0.19, width: 0.46, label: 'Top right' },
  { id: 'center', x: 0.5, y: 0.46, width: 0.66, label: 'Center' },
] as const;

const DEFAULT_SHOT = { x: 0.23, y: 0.19, w: 0.46 };

const SWATCHES = [
  '#FFFFFF',
  '#000000',
  '#EA403F',
  '#FF933D',
  '#F2CD46',
  '#78C25E',
  '#3496F0',
  '#5756D4',
  '#F7D7E9',
  '#EB4C89',
] as const;

function hexEq(a: string, b: string): boolean {
  return a.replace('#', '').toLowerCase() === b.replace('#', '').toLowerCase();
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function newBox(fill: string): OverlayBox {
  return {
    id: Crypto.randomUUID(),
    text: '',
    color: fill,
    bg: true,
    size: DEFAULT_BOX_SIZE,
    x: 0.5,
    y: DEFAULT_TEXT_Y,
  };
}

type ShotPos = { x: number; y: number; w: number };

export function OverlayEditor(props: {
  visible: boolean;
  mode: OverlayEditorMode;
  /** Changes when a different point opens so local draft state resets. */
  resetKey: string;
  screenshotUrl?: string;
  /** Parsed boxes for this segment (parseOverlayBoxes on the caller). */
  boxes: OverlayBox[];
  screenshotX: number | null;
  screenshotY: number | null;
  screenshotWidth: number | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (patch: OverlaySavePatch) => void | Promise<void>;
}): JSX.Element {
  const {
    visible,
    mode,
    resetKey,
    screenshotUrl,
    boxes: initialBoxes,
    screenshotX,
    screenshotY,
    screenshotWidth,
    saving = false,
    onClose,
    onSave,
  } = props;

  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const window = Dimensions.get('window');
  const [stage, setStage] = useState({ w: window.width, h: window.height });
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const [boxes, setBoxes] = useState<OverlayBox[]>(initialBoxes);
  const boxesRef = useRef(boxes);
  boxesRef.current = boxes;
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  /** Measured pill sizes per box id, for drag hit tests. */
  const boxLayouts = useRef<Record<string, { w: number; h: number }>>({});

  const [shot, setShot] = useState<ShotPos>(DEFAULT_SHOT);
  const shotRef = useRef(shot);
  const [aspect, setAspect] = useState(9 / 16);

  function updateShot(next: ShotPos) {
    shotRef.current = next;
    setShot(next);
  }

  function patchBox(id: string, patch: Partial<OverlayBox>) {
    const next = boxesRef.current.map((b) =>
      b.id === id ? { ...b, ...patch } : b,
    );
    boxesRef.current = next;
    setBoxes(next);
  }

  function startNewBox() {
    const last = boxesRef.current[boxesRef.current.length - 1];
    const box = newBox(last?.color ?? DEFAULT_OVERLAY_FILL);
    const next = [...boxesRef.current, box];
    boxesRef.current = next;
    setBoxes(next);
    setActiveId(box.id);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 60);
  }

  useEffect(() => {
    if (!visible) return;
    boxesRef.current = initialBoxes;
    setBoxes(initialBoxes);
    boxLayouts.current = {};
    setActiveId(initialBoxes[0]?.id ?? null);
    setEditing(false);
    const nextShot = {
      x: screenshotX ?? DEFAULT_SHOT.x,
      y: screenshotY ?? DEFAULT_SHOT.y,
      w: screenshotWidth ?? DEFAULT_SHOT.w,
    };
    shotRef.current = nextShot;
    setShot(nextShot);
    if (mode === 'text' && initialBoxes.length === 0) {
      const box = newBox(DEFAULT_OVERLAY_FILL);
      boxesRef.current = [box];
      setBoxes([box]);
      setActiveId(box.id);
      setEditing(true);
    }
    // Snapshot when the composer opens or the point changes, not on each parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, resetKey]);

  useEffect(() => {
    if (!visible || !editing) return;
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [visible, editing, resetKey]);

  useEffect(() => {
    if (!screenshotUrl) return;
    Image.getSize(
      screenshotUrl,
      (w, h) => {
        if (w > 0 && h > 0) setAspect(w / h);
      },
      () => undefined,
    );
  }, [screenshotUrl]);

  const gesture = useRef({ x0: 0, y0: 0, scale0: 0, dist0: 0, boxId: '' });

  // Media mode: the WHOLE stage drags and pinches the screenshot, so two
  // fingers land anywhere and still resize it.
  const mediaPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          gesture.current = {
            x0: shotRef.current.x,
            y0: shotRef.current.y,
            scale0: shotRef.current.w,
            dist0: 0,
            boxId: '',
          };
        },
        onPanResponderMove: (evt, gs) => {
          const touches = evt.nativeEvent.touches;
          const a = touches[0];
          const b = touches[1];
          if (touches.length >= 2 && a && b) {
            const d = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
            if (gesture.current.dist0 === 0) {
              gesture.current.dist0 = d;
              gesture.current.scale0 = shotRef.current.w;
            }
            const w = clamp(
              gesture.current.scale0 * (d / gesture.current.dist0),
              0.15,
              1,
            );
            updateShot({ ...shotRef.current, w });
          } else {
            gesture.current.dist0 = 0;
            updateShot({
              x: clamp(gesture.current.x0 + gs.dx / stageRef.current.w, 0, 1),
              y: clamp(gesture.current.y0 + gs.dy / stageRef.current.h, 0, 1),
              w: shotRef.current.w,
            });
          }
        },
      }),
    [],
  );

  function boxAtPoint(px: number, py: number): OverlayBox | null {
    const { w, h } = stageRef.current;
    // Topmost box wins, so walk the list backwards.
    for (let i = boxesRef.current.length - 1; i >= 0; i--) {
      const box = boxesRef.current[i];
      if (!box) continue;
      const layout = boxLayouts.current[box.id] ?? { w: 120, h: 56 };
      const halfW = layout.w / 2 + HIT_SLOP;
      const halfH = layout.h / 2 + HIT_SLOP;
      if (Math.abs(px - box.x * w) <= halfW && Math.abs(py - box.y * h) <= halfH) {
        return box;
      }
    }
    return null;
  }

  // Text mode drag stage: the gesture must START on a box, then one finger
  // drags it and a second finger pinches it from anywhere on the screen.
  const textPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) =>
          boxAtPoint(evt.nativeEvent.pageX, evt.nativeEvent.pageY) !== null,
        onMoveShouldSetPanResponder: (evt) =>
          boxAtPoint(evt.nativeEvent.pageX, evt.nativeEvent.pageY) !== null,
        onPanResponderGrant: (evt) => {
          const hit = boxAtPoint(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
          if (!hit) return;
          setActiveId(hit.id);
          gesture.current = {
            x0: hit.x,
            y0: hit.y,
            scale0: hit.size,
            dist0: 0,
            boxId: hit.id,
          };
        },
        onPanResponderMove: (evt, gs) => {
          const id = gesture.current.boxId;
          if (!id) return;
          const touches = evt.nativeEvent.touches;
          const a = touches[0];
          const b = touches[1];
          if (touches.length >= 2 && a && b) {
            const d = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
            if (gesture.current.dist0 === 0) {
              gesture.current.dist0 = d;
              const current = boxesRef.current.find((x) => x.id === id);
              gesture.current.scale0 = current?.size ?? DEFAULT_BOX_SIZE;
            }
            patchBox(id, {
              size: clamp(
                gesture.current.scale0 * (d / gesture.current.dist0),
                MIN_BOX_SIZE,
                MAX_BOX_SIZE,
              ),
            });
          } else {
            gesture.current.dist0 = 0;
            patchBox(id, {
              x: clamp(gesture.current.x0 + gs.dx / stageRef.current.w, 0.04, 0.96),
              y: clamp(gesture.current.y0 + gs.dy / stageRef.current.h, 0.04, 0.96),
            });
          }
        },
        onPanResponderRelease: (_evt, gs) => {
          // A still tap on a box reopens the keyboard, Instagram-style.
          if (
            gesture.current.boxId &&
            Math.abs(gs.dx) < 4 &&
            Math.abs(gs.dy) < 4
          ) {
            setEditing(true);
          }
        },
      }),
    [],
  );

  // Instagram's left-edge size slider: vertical drag maps top=big, bottom=small.
  const sliderH = Math.max(200, stage.h * 0.3);
  const sliderPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => applySlider(evt.nativeEvent.locationY),
        onPanResponderMove: (evt) => applySlider(evt.nativeEvent.locationY),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sliderH],
  );

  function applySlider(localY: number) {
    const id = activeIdRef.current;
    if (!id) return;
    const t = clamp(1 - localY / sliderH, 0, 1);
    patchBox(id, { size: MIN_BOX_SIZE + t * (MAX_BOX_SIZE - MIN_BOX_SIZE) });
  }

  const textMode = mode === 'text';
  const active = boxes.find((b) => b.id === activeId) ?? null;
  const blocked = busy || saving;

  async function commit(patch: OverlaySavePatch) {
    if (blocked) return;
    setBusy(true);
    try {
      await onSave(patch);
      onClose();
    } catch {
      // Parent already surfaced the error; stay open.
    } finally {
      setBusy(false);
    }
  }

  function handleMediaDone() {
    void commit({
      screenshot_x: shot.x,
      screenshot_y: shot.y,
      screenshot_width: shot.w,
    });
  }

  /** Editing Done: keep or drop the draft box, close only the keyboard. */
  function handleEditingDone() {
    const id = activeIdRef.current;
    const current = boxesRef.current.find((b) => b.id === id);
    if (current && current.text.trim().length === 0) {
      const next = boxesRef.current.filter((b) => b.id !== id);
      boxesRef.current = next;
      setBoxes(next);
      setActiveId(next[next.length - 1]?.id ?? null);
    }
    Keyboard.dismiss();
    setEditing(false);
  }

  /** Top-right Done outside the keyboard: save every box and close. */
  function handleSaveAll() {
    void commit(serializeOverlayBoxes(boxesRef.current));
  }

  function handleDeleteActive() {
    const id = activeIdRef.current;
    if (!id) return;
    const next = boxesRef.current.filter((b) => b.id !== id);
    boxesRef.current = next;
    setBoxes(next);
    setActiveId(next[next.length - 1]?.id ?? null);
    Keyboard.dismiss();
    setEditing(false);
  }

  const shotW = shot.w * stage.w;
  const shotH = shotW / aspect;

  function pillFor(box: OverlayBox, forInput: boolean): JSX.Element {
    const fontSize = clamp(box.size * stage.w, 10, 96);
    const contrast = overlayTextContrast(box.color);
    const textStyle = {
      color: box.bg ? contrast : box.color,
      fontSize,
      lineHeight: fontSize * 1.22,
      textShadowColor: box.bg ? 'transparent' : 'rgba(0,0,0,0.6)',
      textShadowOffset: box.bg
        ? { width: 0, height: 0 }
        : { width: 0, height: 1 },
      textShadowRadius: box.bg ? 0 : 10,
    };
    return (
      <View
        style={[
          styles.pill,
          box.bg
            ? { backgroundColor: overlayBoxFill(box.color) }
            : styles.pillClear,
        ]}
      >
        {forInput ? (
          <TextInput
            ref={inputRef}
            multiline
            scrollEnabled={false}
            value={box.text}
            onChangeText={(t) => patchBox(box.id, { text: t })}
            placeholder=""
            placeholderTextColor={color.whiteA45}
            selectionColor={color.blue300}
            underlineColorAndroid="transparent"
            style={[styles.inputText, textStyle]}
          />
        ) : (
          <Text style={[styles.inputText, textStyle]}>{box.text}</Text>
        )}
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <StatusBar style="light" />
        <View
          style={StyleSheet.absoluteFill}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            if (width > 0 && height > 0) setStage({ w: width, h: height });
          }}
          pointerEvents="none"
        />
        {textMode && screenshotUrl ? (
          <View pointerEvents="none" style={[styles.mediaFull, styles.mediaDim]}>
            <Image
              source={{ uri: screenshotUrl }}
              style={styles.mediaImg}
              resizeMode="cover"
            />
          </View>
        ) : null}
        <View
          pointerEvents="none"
          style={[styles.silhouette, { opacity: textMode ? 0.25 : 0.55 }]}
        >
          <Icon name="circle-user-round" size={130} color={color.white} />
        </View>

        {!textMode ? (
          <>
            <View pointerEvents="none">
              <View
                style={[
                  styles.shot,
                  {
                    left: shot.x * stage.w - shotW / 2,
                    top: shot.y * stage.h - shotH / 2,
                    width: shotW,
                    height: shotH,
                  },
                ]}
              >
                {screenshotUrl ? (
                  <Image
                    source={{ uri: screenshotUrl }}
                    style={styles.mediaImg}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.thumb} />
                )}
              </View>
            </View>
            <View
              {...mediaPan.panHandlers}
              style={[StyleSheet.absoluteFill, styles.gestureLayer]}
            />
          </>
        ) : null}

        {textMode && !editing ? (
          <>
            {boxes.map((box) => (
              <View
                key={box.id}
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, styles.boxLayer]}
              >
                <View
                  onLayout={(e) => {
                    boxLayouts.current[box.id] = {
                      w: e.nativeEvent.layout.width,
                      h: e.nativeEvent.layout.height,
                    };
                  }}
                  style={[
                    styles.boxWrap,
                    {
                      transform: [
                        { translateX: (box.x - 0.5) * stage.w },
                        { translateY: (box.y - 0.5) * stage.h },
                      ],
                    },
                  ]}
                >
                  {pillFor(box, false)}
                </View>
              </View>
            ))}
            <View
              {...textPan.panHandlers}
              style={[StyleSheet.absoluteFill, styles.gestureLayer]}
            />
          </>
        ) : null}

        <View
          style={[styles.chrome, { paddingTop: Math.max(insets.top, 12) + 8 }]}
        >
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={TOOL_HIT}
            disabled={blocked}
            onPress={onClose}
            style={styles.tool}
          >
            <Icon name="x" size={18} color={color.white} />
          </PressableScale>
          <View style={styles.flex} />
          {!textMode ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Done"
              disabled={blocked}
              onPress={handleMediaDone}
              style={styles.done}
            >
              <Text style={styles.doneText}>
                {blocked ? 'Saving…' : 'Done'}
              </Text>
            </PressableScale>
          ) : editing ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Done"
              onPress={handleEditingDone}
              style={styles.done}
            >
              <Text style={styles.doneText}>Done</Text>
            </PressableScale>
          ) : (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Done"
              disabled={blocked}
              onPress={handleSaveAll}
              style={styles.done}
            >
              <Text style={styles.doneText}>
                {blocked ? 'Saving…' : 'Done'}
              </Text>
            </PressableScale>
          )}
        </View>

        {textMode && active ? (
          <View style={[styles.rail, { top: Math.max(insets.top, 12) + 64 }]}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Background behind text"
              accessibilityState={{ selected: active.bg }}
              hitSlop={TOOL_HIT}
              onPress={() => patchBox(active.id, { bg: !active.bg })}
              style={[styles.tool, active.bg && styles.toolOn]}
            >
              <View style={[styles.aChip, active.bg && styles.aChipOn]}>
                <Text style={styles.aChipText}>A</Text>
              </View>
            </PressableScale>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Delete this text box"
              hitSlop={TOOL_HIT}
              disabled={blocked}
              onPress={handleDeleteActive}
              style={styles.tool}
            >
              <Icon name="trash-2" size={17} color={color.white} />
            </PressableScale>
          </View>
        ) : null}

        {textMode && active ? (
          <View
            style={[
              styles.sliderWrap,
              { top: stage.h * 0.18, height: sliderH },
            ]}
            {...sliderPan.panHandlers}
          >
            <View style={styles.sliderTrack} pointerEvents="none">
              <View style={styles.sliderTaperTop} />
              <View style={styles.sliderTaperBottom} />
            </View>
            <View
              pointerEvents="none"
              style={[
                styles.sliderThumb,
                {
                  top:
                    (1 -
                      (active.size - MIN_BOX_SIZE) /
                        (MAX_BOX_SIZE - MIN_BOX_SIZE)) *
                    (sliderH - 28),
                },
              ]}
            />
          </View>
        ) : null}

        {textMode ? (
          editing && active ? (
            <View style={styles.textStage}>{pillFor(active, true)}</View>
          ) : (
            <View style={styles.flex} pointerEvents="none" />
          )
        ) : (
          <View style={styles.flex} pointerEvents="none" />
        )}

        <View
          style={[
            styles.bottomWrap,
            { paddingBottom: Math.max(insets.bottom, 12) + 22 },
          ]}
        >
          {textMode && !editing ? (
            <View style={styles.addTextRow}>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Add another text box"
                disabled={blocked}
                onPress={startNewBox}
                style={styles.addTextBtn}
              >
                <Icon name="plus" size={15} color={color.white} />
                <Text style={styles.addTextLabel}>Add text</Text>
              </PressableScale>
            </View>
          ) : null}
          <View style={styles.bottomRow}>
            {textMode
              ? SWATCHES.map((c) => {
                  const isOn = active !== null && hexEq(c, active.color);
                  return (
                    <PressableScale
                      key={c}
                      accessibilityRole="button"
                      accessibilityLabel={c}
                      accessibilityState={{ selected: isOn }}
                      hitSlop={7}
                      onPress={() =>
                        active ? patchBox(active.id, { color: c }) : undefined
                      }
                      style={[styles.swatchRing, isOn && styles.swatchRingOn]}
                    >
                      <View
                        style={[
                          styles.swatch,
                          { backgroundColor: c },
                          !isOn && styles.swatchIdle,
                        ]}
                      />
                    </PressableScale>
                  );
                })
              : MEDIA_PRESETS.map((preset) => {
                  const isOn =
                    Math.abs(shot.x - preset.x) < 0.02 &&
                    Math.abs(shot.y - preset.y) < 0.02 &&
                    Math.abs(shot.w - preset.width) < 0.02;
                  return (
                    <PressableScale
                      key={preset.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isOn }}
                      onPress={() =>
                        updateShot({ x: preset.x, y: preset.y, w: preset.width })
                      }
                      style={[styles.posChip, isOn && styles.posChipOn]}
                    >
                      <Text
                        style={[
                          styles.posChipText,
                          isOn && styles.posChipTextOn,
                        ]}
                      >
                        {preset.label}
                      </Text>
                    </PressableScale>
                  );
                })}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SCREEN_BG,
    overflow: 'hidden',
  },
  flex: { flex: 1 },
  mediaFull: {
    ...StyleSheet.absoluteFillObject,
  },
  mediaDim: {
    opacity: 0.4,
  },
  mediaImg: {
    width: '100%',
    height: '100%',
  },
  shot: {
    position: 'absolute',
    borderRadius: radiusAdmin.md,
    overflow: 'hidden',
    backgroundColor: color.ink800,
  },
  thumb: {
    flex: 1,
    backgroundColor: color.ink800,
  },
  silhouette: {
    position: 'absolute',
    bottom: -34,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  gestureLayer: {
    zIndex: 1,
  },
  boxLayer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxWrap: {
    maxWidth: '86%',
  },
  chrome: {
    position: 'relative',
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  rail: {
    position: 'absolute',
    right: 14,
    zIndex: 3,
    gap: 12,
    alignItems: 'center',
  },
  tool: {
    width: 42,
    height: 42,
    borderRadius: radiusAdmin.pill,
    backgroundColor: RAIL_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolOn: {
    backgroundColor: color.white,
  },
  aChip: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  aChipOn: {
    borderWidth: 0,
    backgroundColor: color.ink,
  },
  aChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: color.white,
  },
  done: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radiusAdmin.pill,
    backgroundColor: RAIL_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    fontSize: 15,
    fontWeight: '800',
    color: color.white,
  },
  sliderWrap: {
    position: 'absolute',
    left: 4,
    width: 44,
    zIndex: 3,
    alignItems: 'center',
  },
  sliderTrack: {
    flex: 1,
    width: 20,
    alignItems: 'center',
  },
  sliderTaperTop: {
    flex: 1,
    width: 5,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  sliderTaperBottom: {
    flex: 1,
    width: 2.5,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  sliderThumb: {
    position: 'absolute',
    left: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: color.white,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  textStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 56,
    zIndex: 1,
  },
  pill: {
    minWidth: 48,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 16,
    maxWidth: '100%',
    justifyContent: 'center',
  },
  pillClear: {
    backgroundColor: 'transparent',
  },
  inputText: {
    fontFamily: OVERLAY_FONT,
    fontWeight: '700',
    letterSpacing: -0.3,
    padding: 0,
    margin: 0,
    minWidth: 24,
    maxWidth: '100%',
    textAlign: 'center',
    includeFontPadding: false,
  },
  bottomWrap: {
    position: 'relative',
    zIndex: 2,
    gap: 12,
    paddingHorizontal: 16,
  },
  addTextRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  addTextBtn: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 22,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.accent,
    justifyContent: 'center',
  },
  addTextLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: color.white,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  swatchRing: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchRingOn: {
    borderColor: color.white,
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  swatchIdle: {
    borderWidth: 1.5,
    borderColor: color.whiteA45,
  },
  posChip: {
    minHeight: 44,
    paddingHorizontal: 13,
    borderRadius: radiusAdmin.pill,
    backgroundColor: RAIL_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posChipOn: {
    backgroundColor: color.white,
  },
  posChipText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: color.white,
  },
  posChipTextOn: {
    color: color.ink,
  },
});

// Story-style overlay composer. The screenshot and every text box live on
// one stage and edit together: a gesture that starts on a text box drags or
// pinches that box, anywhere else drags or pinches the screenshot. The
// Instagram-style slider on the left resizes the active text box, a still
// tap on a box opens the keyboard, "Add text" starts another box, and Done
// saves the whole arrangement at once. Each box has exactly two looks:
// Classic (TikTok white with a black outline) or Theme (the company color).
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
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isVideoPath } from '../../../lib/media-library-api';
import {
  MAX_BOX_SIZE,
  MIN_BOX_SIZE,
  newOverlayBox,
  overlayBoxFill,
  overlayBoxStyle,
  overlayTextContrast,
  serializeOverlayBoxes,
  styleColors,
  type OverlayBox,
  type OverlayTextStyle,
} from '../../../lib/overlay-boxes';
import type { Json } from '../../../lib/types';
import { color, radiusAdmin } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { posterForVideo } from '../../ui/MediaThumb';
import { OutlinedText } from '../../ui/OutlinedText';
import { PressableScale } from '../../ui/PressableScale';

const SCREEN_BG = '#10161D';
const RAIL_BG = 'rgba(16,22,29,0.45)';
const TOOL_HIT = { top: 1, bottom: 1, left: 1, right: 1 } as const;
const OVERLAY_FONT = 'TikTokSans_700Bold';
/** Extra grab area around a box so small text is still easy to catch. */
const HIT_SLOP = 26;

export type OverlayEditorMode = 'text' | 'media';

/** A recording plays muted on loop in its slot, the way the render will show it. */
function RecordingPreview({ uri }: { uri: string }): JSX.Element {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={styles.mediaImg}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

/** How a clip's media shows: an inset card the admin places, or the media as
 * the full background with the creator cut out in front (TikTok green screen). */
export type SegmentLayout = 'standard' | 'green_screen';

const LAYOUTS: Array<{ value: SegmentLayout; label: string }> = [
  { value: 'standard', label: 'Inset' },
  { value: 'green_screen', label: 'Green screen' },
];

export type OverlaySavePatch = {
  layout?: SegmentLayout;
  overlay_text?: string;
  show_on_screen?: boolean;
  overlay_style?: { [key: string]: Json | undefined };
  text_y?: number;
  screenshot_x?: number;
  screenshot_y?: number;
  screenshot_width?: number;
};

const DEFAULT_SHOT = { x: 0.23, y: 0.19, w: 0.46 };

/** Drag-to-delete: how close the fingers must get to the trash to drop. */
const TRASH_RADIUS = 64;

/** Snap-to-align: how close (in px) a center must get to a guide to stick. */
const SNAP_PX = 8;

type Guides = { v: number | null; h: number | null };

/** Picks the nearest candidate within the threshold, or passes through. */
function snapAxis(
  value: number,
  candidates: number[],
  threshold: number,
): { value: number; guide: number | null } {
  let best: number | null = null;
  let bestDist = threshold;
  for (const c of candidates) {
    const d = Math.abs(value - c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best === null ? { value, guide: null } : { value: best, guide: best };
}

const STYLES: Array<{ value: OverlayTextStyle; label: string }> = [
  { value: 'classic', label: 'Classic' },
  { value: 'theme', label: 'Theme' },
];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

type ShotPos = { x: number; y: number; w: number };

/** Incremental gesture tracking: deltas apply between frames, so a finger
 * landing or lifting mid-gesture re-baselines instead of jumping. */
type GestureTrack = {
  target: 'box' | 'shot' | null;
  boxId: string;
  prevX: number;
  prevY: number;
  prevDist: number;
  prevCount: number;
  /** Unsnapped position so the target can pull away from a guide. */
  rawX: number;
  rawY: number;
};

const IDLE_GESTURE: GestureTrack = {
  target: null,
  boxId: '',
  prevX: 0,
  prevY: 0,
  prevDist: 0,
  prevCount: 0,
  rawX: 0,
  rawY: 0,
};

export function OverlayEditor(props: {
  visible: boolean;
  /** Entry intent only: 'text' starts a fresh box when none exist yet. */
  mode: OverlayEditorMode;
  /** Changes when a different point opens so local draft state resets. */
  resetKey: string;
  screenshotUrl?: string;
  /** Saved layout for this segment; the toggle starts here. */
  layout: SegmentLayout;
  /** Slides have no creator clip to cut out, so they hide the layout toggle. */
  layoutSelectable?: boolean;
  /** Parsed boxes for this segment (parseOverlayBoxes on the caller). */
  boxes: OverlayBox[];
  /** Company theme color from settings; null falls back to TikTok pink. */
  themeColor: string | null;
  screenshotX: number | null;
  screenshotY: number | null;
  screenshotWidth: number | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (patch: OverlaySavePatch) => void | Promise<void>;
  /** Fires when the screenshot is dragged onto the trash. */
  onRemoveShot?: () => void;
}): JSX.Element {
  const {
    visible,
    mode,
    resetKey,
    screenshotUrl,
    layout: initialLayout,
    layoutSelectable = true,
    boxes: initialBoxes,
    themeColor,
    screenshotX,
    screenshotY,
    screenshotWidth,
    saving = false,
    onClose,
    onSave,
    onRemoveShot,
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
  const [shotRemoved, setShotRemoved] = useState(false);
  const hasShot = Boolean(screenshotUrl) && !shotRemoved;
  const hasShotRef = useRef(hasShot);
  hasShotRef.current = hasShot;
  const [layout, setLayout] = useState<SegmentLayout>(initialLayout);
  const greenScreen = hasShot && layout === 'green_screen';
  /** Green screen media fills the frame, so there is nothing to drag or trash. */
  const shotDraggableRef = useRef(false);
  shotDraggableRef.current = hasShot && !greenScreen;

  /** Instagram-style drag-to-delete: trash shows while something drags. */
  const [draggingTarget, setDraggingTarget] = useState<'box' | 'shot' | null>(
    null,
  );
  const [overTrash, setOverTrash] = useState(false);
  const overTrashRef = useRef(false);
  const onRemoveShotRef = useRef(onRemoveShot);
  onRemoveShotRef.current = onRemoveShot;
  const dragShownRef = useRef(false);
  const trashOffsetRef = useRef(0);
  trashOffsetRef.current = Math.max(insets.bottom, 12) + 58;

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

  function freshBox(): OverlayBox {
    const last = boxesRef.current[boxesRef.current.length - 1];
    return newOverlayBox({
      id: Crypto.randomUUID(),
      text: '',
      style: last ? overlayBoxStyle(last) : 'classic',
      themeColor,
      index: boxesRef.current.length,
    });
  }

  function setBoxStyle(id: string, style: OverlayTextStyle) {
    patchBox(id, styleColors(style, themeColor));
  }

  function startNewBox() {
    const box = freshBox();
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
    setShotRemoved(false);
    setLayout(initialLayout);
    setDraggingTarget(null);
    setOverTrash(false);
    const nextShot = {
      x: screenshotX ?? DEFAULT_SHOT.x,
      y: screenshotY ?? DEFAULT_SHOT.y,
      w: screenshotWidth ?? DEFAULT_SHOT.w,
    };
    shotRef.current = nextShot;
    setShot(nextShot);
    if (mode === 'text' && initialBoxes.length === 0) {
      const box = freshBox();
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

  const shotIsVideo = screenshotUrl !== undefined && isVideoPath(screenshotUrl);

  useEffect(() => {
    if (!screenshotUrl) return;
    let live = true;
    const measure = (uri: string) =>
      Image.getSize(
        uri,
        (w, h) => {
          if (live && w > 0 && h > 0) setAspect(w / h);
        },
        () => undefined,
      );
    if (isVideoPath(screenshotUrl)) {
      // A recording's frame size comes off its poster; the player reports none until it loads.
      void posterForVideo(screenshotUrl).then((poster) => {
        if (poster) measure(poster);
      });
    } else {
      measure(screenshotUrl);
    }
    return () => {
      live = false;
    };
  }, [screenshotUrl]);

  const gesture = useRef<GestureTrack>({ ...IDLE_GESTURE });

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

  function isOverTrash(px: number, py: number): boolean {
    const { w, h } = stageRef.current;
    const cx = w / 2;
    const cy = h - trashOffsetRef.current;
    return Math.hypot(px - cx, py - cy) < TRASH_RADIUS;
  }

  function deleteBox(id: string) {
    const next = boxesRef.current.filter((b) => b.id !== id);
    boxesRef.current = next;
    setBoxes(next);
    setActiveId(next[next.length - 1]?.id ?? null);
  }

  /** Active alignment guides, in normalized stage coordinates. */
  const [guides, setGuides] = useState<Guides>({ v: null, h: null });
  const guidesRef = useRef<Guides>({ v: null, h: null });

  function updateGuides(next: Guides) {
    if (guidesRef.current.v === next.v && guidesRef.current.h === next.h) {
      return;
    }
    guidesRef.current = next;
    setGuides(next);
  }

  /** Center lines of everything except the dragged target, plus the screen
   * center, like Instagram's snap guides. */
  function snapCandidates(target: 'box' | 'shot', boxId: string) {
    const xs = [0.5];
    const ys = [0.5];
    for (const b of boxesRef.current) {
      if (target === 'box' && b.id === boxId) continue;
      xs.push(b.x);
      ys.push(b.y);
    }
    if (target === 'box' && shotDraggableRef.current) {
      xs.push(shotRef.current.x);
      ys.push(shotRef.current.y);
    }
    return { xs, ys };
  }

  function resetDrag() {
    dragShownRef.current = false;
    overTrashRef.current = false;
    setDraggingTarget(null);
    setOverTrash(false);
    updateGuides({ v: null, h: null });
  }

  // One gesture layer for the whole stage. A gesture starting on a text box
  // moves and pinches that box; anywhere else it moves and pinches the
  // screenshot. Deltas apply frame to frame so pinch and drag blend smoothly.
  const stagePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) =>
          boxAtPoint(evt.nativeEvent.pageX, evt.nativeEvent.pageY) !== null ||
          shotDraggableRef.current,
        onMoveShouldSetPanResponder: (evt) =>
          boxAtPoint(evt.nativeEvent.pageX, evt.nativeEvent.pageY) !== null ||
          shotDraggableRef.current,
        onPanResponderGrant: (evt) => {
          const { pageX, pageY } = evt.nativeEvent;
          const hit = boxAtPoint(pageX, pageY);
          if (hit) setActiveId(hit.id);
          gesture.current = {
            target: hit ? 'box' : shotDraggableRef.current ? 'shot' : null,
            boxId: hit?.id ?? '',
            prevX: pageX,
            prevY: pageY,
            prevDist: 0,
            prevCount: 1,
            rawX: hit ? hit.x : shotRef.current.x,
            rawY: hit ? hit.y : shotRef.current.y,
          };
        },
        onPanResponderMove: (evt, gs) => {
          const g = gesture.current;
          if (!g.target) return;
          const touches = evt.nativeEvent.touches;
          if (touches.length === 0) return;
          let cx = 0;
          let cy = 0;
          for (const t of touches) {
            cx += t.pageX;
            cy += t.pageY;
          }
          cx /= touches.length;
          cy /= touches.length;
          if (!dragShownRef.current && Math.hypot(gs.dx, gs.dy) > 8) {
            dragShownRef.current = true;
            setDraggingTarget(g.target);
          }
          if (dragShownRef.current) {
            const over = isOverTrash(cx, cy);
            if (over !== overTrashRef.current) {
              overTrashRef.current = over;
              setOverTrash(over);
            }
          }
          const a = touches[0];
          const b = touches[1];
          const dist =
            touches.length >= 2 && a && b
              ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY)
              : 0;
          // A finger landed or lifted: re-baseline, never jump.
          if (touches.length !== g.prevCount) {
            g.prevX = cx;
            g.prevY = cy;
            g.prevDist = dist;
            g.prevCount = touches.length;
            return;
          }
          const dx = (cx - g.prevX) / stageRef.current.w;
          const dy = (cy - g.prevY) / stageRef.current.h;
          const scale = g.prevDist > 0 && dist > 0 ? dist / g.prevDist : 1;
          const loX = g.target === 'box' ? 0.04 : 0;
          const hiX = g.target === 'box' ? 0.96 : 1;
          g.rawX = clamp(g.rawX + dx, loX, hiX);
          g.rawY = clamp(g.rawY + dy, loX, hiX);
          let nextX = g.rawX;
          let nextY = g.rawY;
          // Snap only single-finger drags; pinches move too much to stick.
          if (touches.length === 1 && !overTrashRef.current) {
            const cands = snapCandidates(g.target, g.boxId);
            const sx = snapAxis(g.rawX, cands.xs, SNAP_PX / stageRef.current.w);
            const sy = snapAxis(g.rawY, cands.ys, SNAP_PX / stageRef.current.h);
            nextX = sx.value;
            nextY = sy.value;
            updateGuides({ v: sx.guide, h: sy.guide });
          } else {
            updateGuides({ v: null, h: null });
          }
          if (g.target === 'box') {
            const current = boxesRef.current.find((x) => x.id === g.boxId);
            if (current) {
              patchBox(g.boxId, {
                x: nextX,
                y: nextY,
                size: clamp(current.size * scale, MIN_BOX_SIZE, MAX_BOX_SIZE),
              });
            }
          } else {
            updateShot({
              x: nextX,
              y: nextY,
              w: clamp(shotRef.current.w * scale, 0.15, 1),
            });
          }
          g.prevX = cx;
          g.prevY = cy;
          g.prevDist = dist;
        },
        onPanResponderRelease: (_evt, gs) => {
          const g = gesture.current;
          if (dragShownRef.current && overTrashRef.current) {
            // Dropped on the trash: the box or the screenshot goes.
            if (g.target === 'box' && g.boxId) {
              deleteBox(g.boxId);
            } else if (g.target === 'shot') {
              setShotRemoved(true);
              onRemoveShotRef.current?.();
            }
          } else if (
            g.target === 'box' &&
            Math.abs(gs.dx) < 4 &&
            Math.abs(gs.dy) < 4
          ) {
            // A still tap on a box reopens the keyboard, Instagram-style.
            setEditing(true);
          }
          gesture.current = { ...IDLE_GESTURE };
          resetDrag();
        },
        onPanResponderTerminate: () => {
          gesture.current = { ...IDLE_GESTURE };
          resetDrag();
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

  /** Top-right Done: save every box and the screenshot placement together. */
  function handleSaveAll() {
    const patch: OverlaySavePatch = serializeOverlayBoxes(boxesRef.current);
    if (hasShotRef.current) patch.layout = layout;
    if (shotDraggableRef.current) {
      patch.screenshot_x = shotRef.current.x;
      patch.screenshot_y = shotRef.current.y;
      patch.screenshot_width = shotRef.current.w;
    }
    void commit(patch);
  }

  const shotW = shot.w * stage.w;
  const shotH = shotW / aspect;

  function pillFor(box: OverlayBox, forInput: boolean): JSX.Element {
    const fontSize = clamp(box.size * stage.w, 10, 96);
    const textColor = box.bg ? overlayTextContrast(box.color) : box.color;
    const textStyle = { color: textColor, fontSize, lineHeight: fontSize * 1.22 };
    const input = forInput ? (
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
    ) : null;
    if (!box.bg) {
      return (
        <View style={[styles.pill, styles.pillClear]}>
          <OutlinedText
            text={box.text}
            fontSize={fontSize}
            color={textColor}
            style={[styles.inputText, { lineHeight: fontSize * 1.22 }]}
          >
            {input}
          </OutlinedText>
        </View>
      );
    }
    return (
      <View style={[styles.pill, { backgroundColor: overlayBoxFill(box.color) }]}>
        {input ?? <Text style={[styles.inputText, textStyle]}>{box.text}</Text>}
      </View>
    );
  }

  function styleToggle(box: OverlayBox): JSX.Element {
    const current = overlayBoxStyle(box);
    return (
      <View style={styles.styleRow}>
        {STYLES.map((s) => {
          const isOn = s.value === current;
          return (
            <PressableScale
              key={s.value}
              accessibilityRole="button"
              accessibilityLabel={`${s.label} text style`}
              accessibilityState={{ selected: isOn }}
              onPress={() => setBoxStyle(box.id, s.value)}
              style={[styles.styleBtn, isOn && styles.styleBtnOn]}
            >
              <View
                style={[
                  styles.styleDot,
                  s.value === 'theme'
                    ? { backgroundColor: overlayBoxFill(styleColors('theme', themeColor).color) }
                    : styles.styleDotClassic,
                ]}
              />
              <Text style={[styles.styleLabel, isOn && styles.styleLabelOn]}>
                {s.label}
              </Text>
            </PressableScale>
          );
        })}
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
        {greenScreen ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, editing && styles.dimmed]}>
            {shotIsVideo && screenshotUrl ? (
              <RecordingPreview uri={screenshotUrl} />
            ) : (
              <Image
                source={{ uri: screenshotUrl }}
                style={styles.mediaImg}
                resizeMode="cover"
              />
            )}
            <View style={styles.creatorHint}>
              <View style={styles.creatorHead} />
              <View style={styles.creatorBody} />
              <Text style={styles.creatorHintText}>Creator is cut out in front</Text>
            </View>
          </View>
        ) : hasShot ? (
          <View pointerEvents="none" style={editing && styles.dimmed}>
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
              {shotIsVideo && screenshotUrl ? (
                <RecordingPreview uri={screenshotUrl} />
              ) : (
                <Image
                  source={{ uri: screenshotUrl }}
                  style={styles.mediaImg}
                  resizeMode="cover"
                />
              )}
            </View>
          </View>
        ) : null}

        {!editing ? (
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
              {...stagePan.panHandlers}
              style={[StyleSheet.absoluteFill, styles.gestureLayer]}
            />
            {guides.v !== null ? (
              <View
                pointerEvents="none"
                style={[styles.guideV, { left: guides.v * stage.w - 1 }]}
              />
            ) : null}
            {guides.h !== null ? (
              <View
                pointerEvents="none"
                style={[styles.guideH, { top: guides.h * stage.h - 1 }]}
              />
            ) : null}
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
          {editing ? (
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

        {active && !editing ? (
          <View
            style={[
              styles.sliderWrap,
              { top: stage.h * 0.18, height: sliderH },
            ]}
            {...sliderPan.panHandlers}
          >
            <View style={styles.sliderTrack} pointerEvents="none" />
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

        {editing && active ? (
          <View style={styles.textStage}>{pillFor(active, true)}</View>
        ) : (
          <View style={styles.flex} pointerEvents="none" />
        )}

        {draggingTarget !== null ? (
          <View
            pointerEvents="none"
            style={[
              styles.trashWrap,
              { bottom: Math.max(insets.bottom, 12) + 28 },
            ]}
          >
            <View style={[styles.trash, overTrash && styles.trashOn]}>
              <Icon
                name="trash-2"
                size={overTrash ? 23 : 18}
                color={overTrash ? color.ink : color.white}
              />
            </View>
          </View>
        ) : null}

        {draggingTarget === null ? (
          <View
            style={[
              styles.bottomWrap,
              { paddingBottom: Math.max(insets.bottom, 12) + 22 },
            ]}
          >
            {hasShot && layoutSelectable && !editing ? (
              <View style={styles.layoutRow}>
                {LAYOUTS.map((l) => {
                  const isOn = l.value === layout;
                  return (
                    <PressableScale
                      key={l.value}
                      accessibilityRole="button"
                      accessibilityLabel={`${l.label} layout`}
                      accessibilityState={{ selected: isOn }}
                      disabled={blocked}
                      onPress={() => setLayout(l.value)}
                      style={[styles.styleBtn, isOn && styles.styleBtnOn]}
                    >
                      <Text style={[styles.styleLabel, isOn && styles.styleLabelOn]}>
                        {l.label}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>
            ) : null}
            {editing && active !== null ? (
              <View style={styles.bottomRow}>{styleToggle(active)}</View>
            ) : (
              <View style={styles.addTextRow}>
                {active !== null ? styleToggle(active) : <View style={styles.flex} />}
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
            )}
          </View>
        ) : null}
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
  dimmed: {
    opacity: 0.35,
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
  gestureLayer: {
    zIndex: 1,
  },
  guideV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: color.blue300,
    zIndex: 1,
  },
  guideH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: color.blue300,
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
  tool: {
    width: 42,
    height: 42,
    borderRadius: radiusAdmin.pill,
    backgroundColor: RAIL_BG,
    alignItems: 'center',
    justifyContent: 'center',
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
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
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
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  styleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 4,
    borderRadius: radiusAdmin.pill,
    backgroundColor: RAIL_BG,
  },
  layoutRow: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 4,
    borderRadius: radiusAdmin.pill,
    backgroundColor: RAIL_BG,
  },
  creatorHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '14%',
    alignItems: 'center',
  },
  creatorHead: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: color.whiteA45,
  },
  creatorBody: {
    marginTop: 6,
    width: 150,
    height: 110,
    borderTopLeftRadius: 75,
    borderTopRightRadius: 75,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderStyle: 'dashed',
    borderColor: color.whiteA45,
  },
  creatorHintText: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '800',
    color: color.white,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
  },
  styleBtn: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: radiusAdmin.pill,
  },
  styleBtnOn: {
    backgroundColor: color.white,
  },
  styleDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  styleDotClassic: {
    backgroundColor: color.white,
    borderWidth: 2,
    borderColor: color.ink,
  },
  styleLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: color.white,
  },
  styleLabelOn: {
    color: color.ink,
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
  },
  trashWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 4,
  },
  trash: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: color.white,
    backgroundColor: RAIL_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trashOn: {
    backgroundColor: color.white,
    borderColor: color.white,
  },
});

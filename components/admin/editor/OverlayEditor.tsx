// Story-style overlay composer. Text mode: live input already focused;
// Done closes the keyboard, then the text drags and pinches freely and
// "Add text" commits. Media mode: just the screenshot, dragged and pinched
// into place, with three snap chips.
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, radiusAdmin } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

const SCREEN_BG = '#10161D';
const RAIL_BG = 'rgba(16,22,29,0.45)';
const TOOL_HIT = { top: 1, bottom: 1, left: 1, right: 1 } as const;
const FONT_SIZES = [20, 26, 32] as const;
const MIN_FONT = 14;
const MAX_FONT = 64;
const OVERLAY_FONT = 'TikTokSans_700Bold';
/** TikTok Classic default: hot pink, washed into a pastel box. */
export const DEFAULT_OVERLAY_FILL = '#EB4C89';

export type OverlayEditorMode = 'text' | 'media';

export type OverlayStyleValue = {
  color?: string;
  bg?: boolean;
  /** Editor font size; the render pass still sets its own scale. */
  size?: number;
  /** Horizontal text center as a stage fraction (render centers regardless). */
  x?: number;
};

export type OverlaySavePatch = {
  overlay_text?: string;
  show_on_screen?: boolean;
  overlay_style?: { color: string; bg: boolean; size: number; x: number };
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
const DEFAULT_TEXT_Y = 0.45;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseOverlayStyle(value: unknown): OverlayStyleValue {
  if (!isRecord(value)) return {};
  const parsed: OverlayStyleValue = {};
  if (typeof value.color === 'string') parsed.color = value.color;
  if (typeof value.bg === 'boolean') parsed.bg = value.bg;
  if (typeof value.size === 'number') parsed.size = value.size;
  if (typeof value.x === 'number') parsed.x = value.x;
  return parsed;
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.replace('#', '').trim();
  const n =
    raw.length === 3 && raw[0] && raw[1] && raw[2]
      ? `${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(n)) return null;
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

function toHex(r: number, g: number, b: number): string {
  const byte = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

function mixHex(a: string, b: string, t: number): string | null {
  const from = parseHex(a);
  const to = parseHex(b);
  if (!from || !to) return null;
  return toHex(
    from.r + (to.r - from.r) * t,
    from.g + (to.g - from.g) * t,
    from.b + (to.b - from.b) * t,
  );
}

function luminance(hex: string): number | null {
  const p = parseHex(hex);
  if (!p) return null;
  return (0.299 * p.r + 0.587 * p.g + 0.114 * p.b) / 255;
}

/** Pastel wash of the picked color — TikTok/Reels Classic box fill. */
export function overlayBoxFill(fill: string): string {
  const lum = luminance(fill);
  if (lum == null || lum > 0.82 || lum < 0.18) return fill;
  return mixHex(fill, '#FFFFFF', 0.7) ?? fill;
}

/** Darker same-hue letters on the pastel box (white/black stay high-contrast). */
export function overlayTextContrast(fill: string): string {
  const lum = luminance(fill);
  if (lum == null || lum > 0.82) return color.ink;
  if (lum < 0.18) return color.white;
  return mixHex(fill, '#000000', 0.22) ?? fill;
}

function resolveSwatch(raw: string | undefined): string {
  if (!raw) return DEFAULT_OVERLAY_FILL;
  const hit = SWATCHES.find((s) => hexEq(s, raw));
  return hit ?? raw;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

type ShotPos = { x: number; y: number; w: number };

export function OverlayEditor(props: {
  visible: boolean;
  mode: OverlayEditorMode;
  /** Changes when a different point opens so local draft state resets. */
  resetKey: string;
  screenshotUrl?: string;
  overlayText: string;
  overlayStyle: OverlayStyleValue;
  textY: number | null;
  screenshotX: number | null;
  screenshotY: number | null;
  screenshotWidth: number | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (patch: OverlaySavePatch) => void | Promise<void>;
  onDeleteText: () => void | Promise<void>;
}): JSX.Element {
  const {
    visible,
    mode,
    resetKey,
    screenshotUrl,
    overlayText,
    overlayStyle,
    textY,
    screenshotX,
    screenshotY,
    screenshotWidth,
    saving = false,
    onClose,
    onSave,
    onDeleteText,
  } = props;

  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const window = Dimensions.get('window');
  const [stage, setStage] = useState({ w: window.width, h: window.height });
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const [text, setText] = useState(overlayText);
  const [fill, setFill] = useState(resolveSwatch(overlayStyle.color));
  const [bg, setBg] = useState(overlayStyle.bg ?? true);
  const [fontSize, setFontSize] = useState(overlayStyle.size ?? 26);
  const [editing, setEditing] = useState(mode === 'text');
  const [busy, setBusy] = useState(false);

  // Fractional centers; refs mirror state so the PanResponders never go stale.
  const [shot, setShot] = useState<ShotPos>(DEFAULT_SHOT);
  const shotRef = useRef(shot);
  const [textPos, setTextPos] = useState({ x: 0.5, y: DEFAULT_TEXT_Y });
  const textPosRef = useRef(textPos);
  const fontRef = useRef(fontSize);
  fontRef.current = fontSize;

  const [aspect, setAspect] = useState(9 / 16);

  function updateShot(next: ShotPos) {
    shotRef.current = next;
    setShot(next);
  }

  function updateTextPos(next: { x: number; y: number }) {
    textPosRef.current = next;
    setTextPos(next);
  }

  useEffect(() => {
    if (!visible) return;
    setText(overlayText);
    setFill(resolveSwatch(overlayStyle.color));
    setBg(overlayStyle.bg ?? true);
    setFontSize(overlayStyle.size ?? 26);
    setEditing(mode === 'text');
    const nextShot = {
      x: screenshotX ?? DEFAULT_SHOT.x,
      y: screenshotY ?? DEFAULT_SHOT.y,
      w: screenshotWidth ?? DEFAULT_SHOT.w,
    };
    shotRef.current = nextShot;
    setShot(nextShot);
    const nextText = { x: overlayStyle.x ?? 0.5, y: textY ?? DEFAULT_TEXT_Y };
    textPosRef.current = nextText;
    setTextPos(nextText);
    // Snapshot when the composer opens or the point changes, not on each parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, resetKey]);

  useEffect(() => {
    if (!visible || mode !== 'text') return;
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [visible, mode, resetKey]);

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

  const gesture = useRef({ x0: 0, y0: 0, scale0: 0, dist0: 0 });

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

  const textPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          gesture.current = {
            x0: textPosRef.current.x,
            y0: textPosRef.current.y,
            scale0: fontRef.current,
            dist0: 0,
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
              gesture.current.scale0 = fontRef.current;
            }
            setFontSize(
              clamp(
                gesture.current.scale0 * (d / gesture.current.dist0),
                MIN_FONT,
                MAX_FONT,
              ),
            );
          } else {
            gesture.current.dist0 = 0;
            updateTextPos({
              x: clamp(gesture.current.x0 + gs.dx / stageRef.current.w, 0.05, 0.95),
              y: clamp(gesture.current.y0 + gs.dy / stageRef.current.h, 0.05, 0.95),
            });
          }
        },
        onPanResponderRelease: (_evt, gs) => {
          // A still tap reopens the keyboard, Instagram-style.
          if (Math.abs(gs.dx) < 4 && Math.abs(gs.dy) < 4) {
            inputRef.current?.focus();
          }
        },
      }),
    [],
  );

  const textMode = mode === 'text';
  const contrast = overlayTextContrast(fill);
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

  function handleAddText() {
    const trimmed = text.trim();
    void commit({
      overlay_text: trimmed,
      show_on_screen: trimmed.length > 0,
      overlay_style: {
        color: fill,
        bg,
        size: Math.round(fontSize),
        x: textPos.x,
      },
      text_y: textPos.y,
    });
  }

  async function handleDeleteText() {
    if (blocked) return;
    setBusy(true);
    try {
      await onDeleteText();
      onClose();
    } catch {
      // Stay open.
    } finally {
      setBusy(false);
    }
  }

  function cycleFont() {
    const next = FONT_SIZES.find((s) => s > fontSize) ?? FONT_SIZES[0];
    setFontSize(next);
  }

  const shotW = shot.w * stage.w;
  const shotH = shotW / aspect;

  const pill = (
    <View
      style={[
        styles.pill,
        bg ? { backgroundColor: overlayBoxFill(fill) } : styles.pillClear,
      ]}
    >
      <TextInput
        ref={inputRef}
        multiline
        scrollEnabled={false}
        editable={editing}
        pointerEvents={editing ? 'auto' : 'none'}
        value={text}
        onChangeText={setText}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        placeholder=""
        placeholderTextColor={color.whiteA45}
        selectionColor={color.blue300}
        underlineColorAndroid="transparent"
        style={[
          styles.input,
          {
            color: bg ? contrast : fill,
            fontSize,
            lineHeight: fontSize * 1.22,
            textShadowColor: bg ? 'transparent' : 'rgba(0,0,0,0.6)',
            textShadowOffset: bg
              ? { width: 0, height: 0 }
              : { width: 0, height: 1 },
            textShadowRadius: bg ? 0 : 10,
          },
        ]}
      />
    </View>
  );

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
          <View
            {...mediaPan.panHandlers}
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
              onPress={() => Keyboard.dismiss()}
              style={styles.done}
            >
              <Text style={styles.doneText}>Done</Text>
            </PressableScale>
          ) : null}
        </View>

        {textMode ? (
          <View style={[styles.rail, { top: Math.max(insets.top, 12) + 64 }]}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Text size"
              hitSlop={TOOL_HIT}
              onPress={cycleFont}
              style={styles.tool}
            >
              <Text style={styles.aa}>Aa</Text>
            </PressableScale>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Background behind text"
              accessibilityState={{ selected: bg }}
              hitSlop={TOOL_HIT}
              onPress={() => setBg((v) => !v)}
              style={[styles.tool, bg && styles.toolOn]}
            >
              <View style={[styles.aChip, bg && styles.aChipOn]}>
                <Text style={styles.aChipText}>A</Text>
              </View>
            </PressableScale>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Delete text"
              hitSlop={TOOL_HIT}
              disabled={blocked}
              onPress={() => void handleDeleteText()}
              style={styles.tool}
            >
              <Icon name="trash-2" size={17} color={color.white} />
            </PressableScale>
          </View>
        ) : null}

        {textMode ? (
          editing ? (
            <View style={styles.textStage}>{pill}</View>
          ) : (
            <View style={styles.dragStage} pointerEvents="box-none">
              <View
                {...textPan.panHandlers}
                style={{
                  transform: [
                    { translateX: (textPos.x - 0.5) * stage.w },
                    { translateY: (textPos.y - 0.5) * stage.h },
                  ],
                }}
              >
                {pill}
              </View>
            </View>
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
                accessibilityLabel="Add text"
                disabled={blocked}
                onPress={handleAddText}
                style={styles.addTextBtn}
              >
                <Text style={styles.addTextLabel}>
                  {blocked ? 'Saving…' : 'Add text'}
                </Text>
              </PressableScale>
            </View>
          ) : null}
          <View style={styles.bottomRow}>
            {textMode
              ? SWATCHES.map((c) => {
                  const active = hexEq(c, fill);
                  return (
                    <PressableScale
                      key={c}
                      accessibilityRole="button"
                      accessibilityLabel={c}
                      accessibilityState={{ selected: active }}
                      hitSlop={7}
                      onPress={() => setFill(c)}
                      style={[styles.swatchRing, active && styles.swatchRingOn]}
                    >
                      <View
                        style={[
                          styles.swatch,
                          { backgroundColor: c },
                          !active && styles.swatchIdle,
                        ]}
                      />
                    </PressableScale>
                  );
                })
              : MEDIA_PRESETS.map((preset) => {
                  const active =
                    Math.abs(shot.x - preset.x) < 0.02 &&
                    Math.abs(shot.y - preset.y) < 0.02 &&
                    Math.abs(shot.w - preset.width) < 0.02;
                  return (
                    <PressableScale
                      key={preset.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() =>
                        updateShot({ x: preset.x, y: preset.y, w: preset.width })
                      }
                      style={[styles.posChip, active && styles.posChipOn]}
                    >
                      <Text
                        style={[
                          styles.posChipText,
                          active && styles.posChipTextOn,
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
  aa: {
    fontSize: 15,
    fontWeight: '800',
    color: color.white,
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
  textStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 56,
    zIndex: 1,
  },
  dragStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  input: {
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
    paddingHorizontal: 22,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.accent,
    alignItems: 'center',
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

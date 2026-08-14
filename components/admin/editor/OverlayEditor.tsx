// Story-style overlay composer. Text mode: live input already focused.
// Media mode: screenshot at a named placement over the creator silhouette.
import { useEffect, useRef, useState, type JSX } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
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
type FontSize = (typeof FONT_SIZES)[number];
const OVERLAY_FONT = 'TikTokSans_700Bold';
/** TikTok Classic default: hot pink, washed into a pastel box. */
export const DEFAULT_OVERLAY_FILL = '#EB4C89';

export type OverlayEditorMode = 'text' | 'media';

export type OverlayPlacementId = 'full' | 'top_left' | 'top_right' | 'center';

export type OverlayStyleValue = {
  color?: string;
  bg?: boolean;
};

export type OverlaySavePatch = {
  overlay_text: string;
  show_on_screen: boolean;
  overlay_style: { color: string; bg: boolean };
  screenshot_x: number;
  screenshot_y: number;
  screenshot_width: number;
};

export const OVERLAY_PLACEMENT_COORDS: Record<
  OverlayPlacementId,
  { x: number; y: number; width: number; label: string }
> = {
  full: { x: 0.5, y: 0.5, width: 1, label: 'Full' },
  top_left: { x: 0.23, y: 0.19, width: 0.46, label: 'Top left' },
  top_right: { x: 0.77, y: 0.19, width: 0.46, label: 'Top right' },
  center: { x: 0.5, y: 0.46, width: 0.66, label: 'Center' },
};

const PLACEMENT_ORDER: OverlayPlacementId[] = [
  'full',
  'top_left',
  'top_right',
  'center',
];

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

export function overlayPlacementFromCoords(
  x: number | null | undefined,
  y: number | null | undefined,
  width: number | null | undefined,
): OverlayPlacementId {
  if (x == null || y == null || width == null) return 'top_left';
  let best: OverlayPlacementId = 'top_left';
  let bestDist = Infinity;
  for (const id of PLACEMENT_ORDER) {
    const c = OVERLAY_PLACEMENT_COORDS[id];
    const d =
      (c.x - x) * (c.x - x) +
      (c.y - y) * (c.y - y) +
      (c.width - width) * (c.width - width);
    if (d < bestDist) {
      bestDist = d;
      best = id;
    }
  }
  return best;
}

export function overlayPlacementLabel(
  x: number | null | undefined,
  y: number | null | undefined,
  width: number | null | undefined,
): string {
  return OVERLAY_PLACEMENT_COORDS[overlayPlacementFromCoords(x, y, width)]
    .label;
}

function resolveSwatch(raw: string | undefined): string {
  if (!raw) return DEFAULT_OVERLAY_FILL;
  const hit = SWATCHES.find((s) => hexEq(s, raw));
  return hit ?? raw;
}

function mediaFrame(pick: OverlayPlacementId) {
  if (pick === 'full') return styles.mediaFull;
  if (pick === 'top_left') return styles.mediaTopLeft;
  if (pick === 'top_right') return styles.mediaTopRight;
  return styles.mediaCenter;
}

export function OverlayEditor(props: {
  visible: boolean;
  mode: OverlayEditorMode;
  /** Changes when a different point opens so local draft state resets. */
  resetKey: string;
  screenshotUrl?: string;
  overlayText: string;
  overlayStyle: OverlayStyleValue;
  screenshotX: number | null;
  screenshotY: number | null;
  screenshotWidth: number | null;
  greenScreen: boolean;
  saving?: boolean;
  onClose: () => void;
  onSave: (patch: OverlaySavePatch) => void | Promise<void>;
  onSwapMedia: () => void;
  onToggleGreenScreen: () => void;
  onRemoveMedia: () => void;
  onDeleteText: () => void | Promise<void>;
}): JSX.Element {
  const {
    visible,
    mode: initialMode,
    resetKey,
    screenshotUrl,
    overlayText,
    overlayStyle,
    screenshotX,
    screenshotY,
    screenshotWidth,
    greenScreen,
    saving = false,
    onClose,
    onSave,
    onSwapMedia,
    onToggleGreenScreen,
    onRemoveMedia,
    onDeleteText,
  } = props;

  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [mode, setMode] = useState<OverlayEditorMode>(initialMode);
  const [text, setText] = useState(overlayText);
  const [fill, setFill] = useState(resolveSwatch(overlayStyle.color));
  const [bg, setBg] = useState(overlayStyle.bg ?? true);
  const [pick, setPick] = useState<OverlayPlacementId>(
    overlayPlacementFromCoords(screenshotX, screenshotY, screenshotWidth),
  );
  const [fontSize, setFontSize] = useState<FontSize>(26);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setMode(initialMode);
    setText(overlayText);
    setFill(resolveSwatch(overlayStyle.color));
    setBg(overlayStyle.bg ?? true);
    setPick(
      overlayPlacementFromCoords(screenshotX, screenshotY, screenshotWidth),
    );
    setFontSize(26);
    // Snapshot when the composer opens or the point changes, not on each parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, resetKey]);

  useEffect(() => {
    if (!visible || mode !== 'text') return;
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [visible, mode, resetKey]);

  const textMode = mode === 'text';
  const contrast = overlayTextContrast(fill);
  const blocked = busy || saving;

  async function handleDone() {
    if (blocked) return;
    const trimmed = text.trim();
    const coords = OVERLAY_PLACEMENT_COORDS[pick];
    setBusy(true);
    try {
      await onSave({
        overlay_text: trimmed,
        show_on_screen: trimmed.length > 0,
        overlay_style: { color: fill, bg },
        screenshot_x: coords.x,
        screenshot_y: coords.y,
        screenshot_width: coords.width,
      });
      onClose();
    } catch {
      // Parent already surfaced the error; stay open.
    } finally {
      setBusy(false);
    }
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

  function handleRemoveMedia() {
    if (blocked) return;
    onRemoveMedia();
    onClose();
  }

  function cycleFont() {
    const next = FONT_SIZES[(FONT_SIZES.indexOf(fontSize) + 1) % FONT_SIZES.length];
    setFontSize(next ?? 26);
  }

  const media = screenshotUrl ? (
    <Image
      source={{ uri: screenshotUrl }}
      style={styles.mediaImg}
      resizeMode="cover"
    />
  ) : (
    <View style={styles.thumb} />
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
          pointerEvents="none"
          style={[
            textMode ? styles.mediaFull : mediaFrame(pick),
            textMode && styles.mediaDim,
          ]}
        >
          {media}
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.silhouette,
            { opacity: textMode ? 0.25 : 0.55 },
          ]}
        >
          <Icon name="circle-user-round" size={130} color={color.white} />
        </View>

        <View
          style={[
            styles.chrome,
            { paddingTop: Math.max(insets.top, 12) + 8 },
          ]}
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
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Done"
            disabled={blocked}
            onPress={() => void handleDone()}
            style={styles.done}
          >
            <Text style={styles.doneText}>{blocked ? 'Saving…' : 'Done'}</Text>
          </PressableScale>
        </View>

        <View
          style={[styles.rail, { top: Math.max(insets.top, 12) + 64 }]}
        >
          {textMode ? (
            <>
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
            </>
          ) : (
            <>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Swap media"
                hitSlop={TOOL_HIT}
                onPress={onSwapMedia}
                style={styles.tool}
              >
                <Icon name="images" size={17} color={color.white} />
              </PressableScale>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Green screen"
                accessibilityState={{ selected: greenScreen }}
                hitSlop={TOOL_HIT}
                onPress={onToggleGreenScreen}
                style={[styles.tool, greenScreen && styles.toolGreen]}
              >
                <Icon name="switch-camera" size={17} color={color.white} />
              </PressableScale>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Add text"
                hitSlop={TOOL_HIT}
                onPress={() => setMode('text')}
                style={styles.tool}
              >
                <Text style={styles.aa}>Aa</Text>
              </PressableScale>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Remove media"
                hitSlop={TOOL_HIT}
                disabled={blocked}
                onPress={handleRemoveMedia}
                style={styles.tool}
              >
                <Icon name="trash-2" size={17} color={color.white} />
              </PressableScale>
            </>
          )}
        </View>

        {textMode ? (
          <View style={styles.textStage}>
            <View
              style={[
                styles.pill,
                bg
                  ? { backgroundColor: overlayBoxFill(fill) }
                  : styles.pillClear,
              ]}
            >
              <TextInput
                ref={inputRef}
                autoFocus
                multiline
                scrollEnabled={false}
                value={text}
                onChangeText={setText}
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
          </View>
        ) : (
          <View style={styles.flex} />
        )}

        <View
          style={[
            styles.bottom,
            { paddingBottom: Math.max(insets.bottom, 12) + 22 },
          ]}
        >
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
            : PLACEMENT_ORDER.map((id) => {
                const active = pick === id;
                return (
                  <PressableScale
                    key={id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setPick(id)}
                    style={[styles.posChip, active && styles.posChipOn]}
                  >
                    <Text
                      style={[
                        styles.posChipText,
                        active && styles.posChipTextOn,
                      ]}
                    >
                      {OVERLAY_PLACEMENT_COORDS[id].label}
                    </Text>
                  </PressableScale>
                );
              })}
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
  mediaTopLeft: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: '46%',
    height: '38%',
    borderRadius: radiusAdmin.md,
    overflow: 'hidden',
  },
  mediaTopRight: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: '46%',
    height: '38%',
    borderRadius: radiusAdmin.md,
    overflow: 'hidden',
  },
  mediaCenter: {
    position: 'absolute',
    top: '26%',
    left: '17%',
    width: '66%',
    height: '40%',
    borderRadius: radiusAdmin.md,
    overflow: 'hidden',
  },
  mediaImg: {
    width: '100%',
    height: '100%',
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
  toolGreen: {
    backgroundColor: color.green,
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
  bottom: {
    position: 'relative',
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
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

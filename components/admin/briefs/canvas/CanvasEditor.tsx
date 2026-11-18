// Full screen slide canvas (SSCanvas.jsx CanvasEditor). The slide is drawn
// at the size TikTok and Instagram show it with each app's chrome ghosted on
// top, so a text box or screenshot behind a button is visible before any
// creator posts it. Tap to type, drag to move, pinch to resize, swipe for the
// next slide.

import { GradientFill as LinearGradient } from '../../../shared/briefs/GradientFill';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View,
  type TextInputInstance,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInUp, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SlideBox } from '../../../../lib/briefs-api';
import { applySpanColor, shiftSpans } from '../../../../lib/overlay-boxes';
import { useKeyboardHeight } from '../../../../lib/keyboard';
import { pickFeature, type LibraryFeature } from '../../../../lib/library-api';
import { briefTone, color, type as typeToken } from '../../../../theme/tokens';
import { Icon, type IconName } from '../../../ui/Icon';
import type { EditorSlide } from '../editor/types';
import { EMPTY_ASPECT, insetFrame } from '../media/geometry';
import { hasFeatureMedia, useFeatureVisual } from '../media/FeatureMedia';
import { Shot } from '../Shot';
import { CenteredAt } from '../SlideCard';
import { SlideText, slideInputInk, slideTextStyle } from '../SlideText';
import { blockedFor, clamp, fontSizeFor, insetRect, layoutOf, overlaps, resolveTextStyle, serializeTextStyle, SLIDE_RATIO, textRect, zoneName, type Ghost, type Platform, type ResolvedTextStyle } from './layout';
import { PlatformGhost } from './PlatformGhost';
import { PicSticker } from '../media/PicSticker';
import { Sticker, type Guides } from './Sticker';
import { TextToolbar, WidthSlider, type ToolPanel } from './TextToolbar';
import { BusyOverlay } from './BusyOverlay';

/** Footer content height (count row, step strip and Next); the home indicator inset is added on top. */
const FOOTER_H = 96;
/** Gutter between the frame edge and anything drawn on it. */
const PAD = 12;
// Bottom stack metrics: Generate button, Different feature pill, warning chip.
const GEN_H = 44;
const SEC_H = 36;
const WARN_H = 30;
const STACK_GAP = 10;
const STACK_BOTTOM = PAD;
/** Ghost opacity at rest; it comes up to GHOST_DRAG while a box is dragged. */
const GHOST_REST = 0.35;
const GHOST_DRAG = 0.9;
const FADE = { duration: 180 };

export interface CanvasEditorProps {
  slides: EditorSlide[];
  sel: number;
  setSel: (i: number) => void;
  patchAt: (at: number, patch: Partial<EditorSlide>) => void;
  onBack: () => void;
  features: LibraryFeature[];
  reel: boolean;
  busy: string | null;
  kindLabel: string;
  footer: ReactNode;
  /** True when the CTA slide is empty and a feature can be picked for it. */
  ctaPick: boolean;
  /** Bumped to open the keyboard on the current slide, e.g. Write it myself. */
  editNonce?: number;
  onGenerate: (() => void) | null;
  generateLabel: string;
  onSecondary: (() => void) | null;
  secondaryLabel: string;
  /** Reel hook: AI writes the spoken hook. */
  onWriteNote: (() => void) | null;
  onRevise: (() => void) | null;
  /** Show the note tool and the shot pill. */
  notes: boolean;
  onOpenMedia: () => void;
}

export function CanvasEditor(props: CanvasEditorProps) {
  const { slides, sel, setSel, patchAt, onBack, features, reel, busy, kindLabel, footer, ctaPick, editNonce = 0, onGenerate, generateLabel, onSecondary, secondaryLabel, onWriteNote, onRevise, notes, onOpenMedia } = props;
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const available = winH - insets.top - insets.bottom - FOOTER_H;
  const W = Math.min(winW, Math.floor(available / SLIDE_RATIO));
  const H = Math.round(W * SLIDE_RATIO);
  const keyboard = useKeyboardHeight();
  // How far the keyboard reaches into the frame, so the tools float above it.
  const keyboardInset = Math.max(0, insets.top + H - (winH - keyboard));

  const cur = slides[sel] ?? slides[0];
  const [ghost, setGhost] = useState<Ghost>('tiktok');
  const guideX = useSharedValue(-1);
  const guideY = useSharedValue(-1);
  // 1 while a box is dragged or pinched: the platform chrome comes up to show the safe zones.
  const dragOn = useSharedValue(0);
  const guides: Guides = { x: guideX, y: guideY, active: dragOn };
  const guideXStyle = useAnimatedStyle(() => ({ opacity: guideX.get() < 0 ? 0 : 1, left: guideX.get() * W - 0.75 }));
  const guideYStyle = useAnimatedStyle(() => ({ opacity: guideY.get() < 0 ? 0 : 1, top: guideY.get() * H - 0.75 }));
  const [editing, setEditing] = useState(() => !cur.text && !ctaPick);
  const [panel, setPanel] = useState<ToolPanel>(null);
  const [shotOpen, setShotOpen] = useState(false);
  // The chars selected in the text input; a swatch colors only these.
  const [selRange, setSelRange] = useState<{ start: number; end: number } | null>(null);
  const firstRun = useRef(true);
  const prevSel = useRef(sel);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (prevSel.current === sel) return;
    prevSel.current = sel;
    const s = slides[sel];
    const empty = Boolean(s && !s.text && !(s.role === 'cta' && onSecondary));
    // Selecting another slide resets the tools; an empty slide opens the keyboard.
    setEditing(empty);
    setPanel(null);
    setShotOpen(false);
    setSelRange(null);
  }, [sel, slides, onSecondary]);

  const seenNonce = useRef(editNonce);
  useEffect(() => {
    if (seenNonce.current === editNonce) return;
    seenNonce.current = editNonce;
    setEditing(true);
  }, [editNonce]);

  const plat: Platform = ghost === 'instagram' ? 'instagram' : 'tiktok';
  const bk = plat === 'instagram' ? 'box_ig' : 'box';
  const ik = plat === 'instagram' ? 'inset_box_ig' : 'inset_box';
  const L = layoutOf(cur, plat);
  const lib = cur.inset_feature_id ? pickFeature(features, cur.inset_feature_id) : null;
  // The inset's drawn size: the media's own aspect inside the box width.
  const insetVisual = useFeatureVisual(lib, reel);
  const insetAspect = hasFeatureMedia(lib, reel) ? insetVisual.aspect : EMPTY_ASPECT;
  const insetW = insetFrame(W * L.inset.w, insetAspect).width;
  const ts = resolveTextStyle(cur.tstyle);
  const fs = fontSizeFor(W, ts.size);
  const patch = (p: Partial<EditorSlide>) => patchAt(sel, p);
  const setTs = (p: Partial<ResolvedTextStyle>) => patch({ tstyle: serializeTextStyle({ ...ts, ...p }) });
  // Letter color: with words selected only they change (Instagram stories
  // style); with none the whole box changes as before.
  const pickTextColor = (c: string) => {
    const r = selRange;
    if (editing && r && r.end > r.start && r.end <= cur.text.length) {
      patch({ spans: applySpanColor(cur.spans, cur.text.length, r.start, r.end, c) });
      return;
    }
    setTs({ color: c });
  };
  const setText = (t: string) => {
    const spans = shiftSpans(cur.spans, cur.text, t);
    patch({ text: t, spans: spans.length ? spans : undefined });
  };
  const setBox = (box: SlideBox) => patch({ [bk]: box });
  const setInsetBox = (box: SlideBox) => patch({ [ik]: box });

  const blocked = blockedFor(ghost, reel);
  const textHit = cur.text ? blocked.find((z) => overlaps(textRect(cur.text, L.text, ts, W, H), z)) : undefined;
  const insetHit = lib ? blocked.find((z) => overlaps(insetRect(L.inset, W, H, insetAspect), z)) : undefined;
  const warn = zoneName(textHit, ghost) ?? zoneName(insetHit, ghost);
  const hitIds = new Set([textHit, insetHit].filter((z): z is NonNullable<typeof z> => Boolean(z)).map((z) => z.id));
  const isCover = cur.role === 'cover';
  const picking = !editing && !busy && ctaPick;
  const [popDone, setPopDone] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!cur.genAt) return;
    const t = setTimeout(() => setPopDone(cur.genAt), 1500);
    return () => clearTimeout(t);
  }, [cur.genAt]);
  const pop = Boolean(cur.genAt && popDone !== cur.genAt);

  const finish = () => {
    setEditing(false);
    setPanel(null);
    setSelRange(null);
  };

  // autoFocus is unreliable inside animated mounts, so focus by ref as well.
  const textRef = useRef<TextInputInstance>(null);
  const shotRef = useRef<TextInputInstance>(null);
  const focusLater = useCallback((ref: React.RefObject<TextInputInstance | null>) => {
    const t = setTimeout(() => ref.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (editing) return focusLater(textRef);
  }, [editing, focusLater]);
  useEffect(() => {
    if (shotOpen) return focusLater(shotRef);
  }, [shotOpen, focusLater]);

  const tapCanvas = () => {
    if (editing) {
      finish();
      return;
    }
    if (!cur.text) {
      if (ctaPick) return;
      setEditing(true);
    }
  };

  const step = (d: number) => {
    const n = clamp(sel + d, 0, slides.length - 1);
    if (n !== sel) setSel(n);
  };
  const swipe = Gesture.Pan()
    .enabled(!editing && !shotOpen && !picking && !busy)
    .activeOffsetX([-24, 24])
    .failOffsetY([-16, 16])
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 50) runOnJS(step)(e.translationX < 0 ? 1 : -1);
    });
  // Taps are handled by a backdrop Pressable under the content, so the tool
  // buttons, stickers and the text input keep their own touches.
  const canvasGesture = swipe;

  const genBtn =
    onGenerate && !cur.text.trim() && !busy ? (
      <Animated.View entering={FadeInUp.duration(320).delay(120)}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            finish();
            onGenerate();
          }}
          style={styles.genBtn}
        >
          <Icon name="sparkles" size={17} color={color.blue500} />
          <Text style={styles.genText}>{generateLabel}</Text>
        </Pressable>
      </Animated.View>
    ) : null;
  const secBtn =
    onSecondary && !busy ? (
      <Animated.View entering={FadeInUp.duration(320).delay(200)}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            finish();
            onSecondary();
          }}
          style={styles.secBtn}
        >
          <Icon name="sparkles" size={14} color={color.white} />
          <Text style={styles.secText}>{secondaryLabel}</Text>
        </Pressable>
      </Animated.View>
    ) : null;
  // The warning chip and the Generate / Different feature buttons share one
  // bottom stack (buttons above, chip below) so they never overlap; the
  // shot pill sits above whatever that stack holds.
  const stackButtons = !ctaPick && Boolean(genBtn || secBtn);
  const stackH = (stackButtons ? (genBtn ? GEN_H : 0) + (secBtn ? SEC_H : 0) + (genBtn && secBtn ? STACK_GAP : 0) : 0) + (warn ? WARN_H : 0) + (stackButtons && warn ? STACK_GAP : 0);
  const bottomOffset = stackH > 0 ? STACK_BOTTOM + stackH + STACK_GAP : STACK_BOTTOM;

  const showShot = !editing && !shotOpen && !ctaPick && (reel ? notes : notes && Boolean(cur.shot));
  // The note card sits in the caption zone, clear of the right rail.
  const noteRight = Math.round(W * 0.16) + 4;
  const noteLabel = reel ? (isCover ? 'Hook \u00b7 said word for word' : 'Creator says') : 'Photo';
  // Header controls share one size and shrink together on narrow frames.
  const ctl = W < 340 ? 34 : 38;
  const compactToggle = W < 360;
  // Anything drawn over the caption zone hides the ghost caption, so nothing
  // shows through around it; dragging brings it back to show the safe zone.
  const captionCovered = editing || showShot || stackButtons;
  const ghostStyle = useAnimatedStyle(() => ({ opacity: withTiming(dragOn.get() ? GHOST_DRAG : GHOST_REST, FADE) }));
  const captionGhostStyle = useAnimatedStyle(() => ({ opacity: withTiming(dragOn.get() || !captionCovered ? 1 : 0, FADE) }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: withTiming(dragOn.get() ? 0 : 1, FADE) }));

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <View style={{ height: insets.top }} />
      <GestureDetector gesture={canvasGesture}>
        <View style={[styles.frame, { width: W, height: H }]}>
          <Animated.View key={sel} entering={FadeIn.duration(160)} style={StyleSheet.absoluteFill}>
            <LinearGradient colors={[briefTone.canvas.chrome, briefTone.canvas.bg]} style={StyleSheet.absoluteFill} />
            <Pressable accessibilityLabel={editing ? 'Done' : 'Edit text'} onPress={tapCanvas} style={StyleSheet.absoluteFill} />
            {!lib && !cur.text && !ctaPick ? (
              <View pointerEvents="none" style={styles.emptyHint}>
                <Icon name={reel ? 'video' : 'camera'} size={36} color={color.whiteA28} />
                <Text style={styles.emptyHintText}>{reel ? "Creator's clip" : "Creator's photo"}</Text>
              </View>
            ) : null}
            {ghost !== 'off' ? (
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, ghostStyle]}>
                <PlatformGhost platform={plat} w={W} h={H} reel={reel} captionStyle={captionGhostStyle} />
              </Animated.View>
            ) : null}
            {!editing
              ? blocked
                  .filter((z) => hitIds.has(z.id))
                  .map((z) => (
                    <View
                      key={z.id}
                      pointerEvents="none"
                      style={[styles.zone, { left: z.x * W, top: z.y * H, width: z.w * W, height: z.h * H }]}
                    />
                  ))
              : null}
            {editing ? <Animated.View entering={FadeIn.duration(220)} pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color.scrim }]} /> : null}
            {lib && !editing ? (
              <Sticker
                x={L.inset.x}
                y={L.inset.y}
                width={insetW}
                W={W}
                H={H}
                hit={Boolean(insetHit)}
                snapX={cur.text ? [0.5, L.text.x] : undefined}
                snapY={cur.text ? [0.5, L.text.y] : undefined}
                guides={guides}
                onMove={(dx, dy) => setInsetBox({ ...L.inset, x: clamp(L.inset.x + dx, 0.1, 0.9), y: clamp(L.inset.y + dy, 0.08, 0.95) })}
                onScale={(r) => setInsetBox({ ...L.inset, w: clamp(L.inset.w * r, 0.25, 0.9) })}
              >
                <Animated.View entering={pop ? FadeInUp.duration(520).delay(260) : undefined}>
                  <Shot feature={lib} w={W * L.inset.w} video={reel} live={reel} />
                </Animated.View>
              </Sticker>
            ) : null}
            {!editing
              ? (cur.pics ?? []).map((pic) => (
                  <PicSticker
                    key={pic.id}
                    pic={pic}
                    W={W}
                    H={H}
                    onChange={(next) => patch({ pics: (cur.pics ?? []).map((p) => (p.id === next.id ? next : p)) })}
                    onRemove={() => patch({ pics: (cur.pics ?? []).filter((p) => p.id !== pic.id) })}
                  />
                ))
              : null}
            {cur.text && !editing ? (
              <Sticker
                x={L.text.x}
                y={L.text.y}
                width={W * L.text.w}
                W={W}
                H={H}
                align={ts.align}
                hit={Boolean(textHit)}
                onTap={() => setEditing(true)}
                snapX={lib ? [0.5, L.inset.x] : undefined}
                snapY={lib ? [0.5, L.inset.y] : undefined}
                guides={guides}
                onMove={(dx, dy) => setBox({ ...L.text, x: clamp(L.text.x + dx, 0.1, 0.9), y: clamp(L.text.y + dy, 0.06, 0.94) })}
                onScale={(r) => setTs({ size: clamp(ts.size * r, 0.5, 2.4) })}
              >
                <Animated.View entering={pop ? FadeInUp.duration(520).delay(260) : undefined}>
                  <SlideText text={cur.text} ts={ts} fs={fs} maxWidth={W * L.text.w} spans={cur.spans} />
                </Animated.View>
              </Sticker>
            ) : null}
            <Animated.View pointerEvents="none" style={[styles.guideX, guideXStyle]} />
            <Animated.View pointerEvents="none" style={[styles.guideY, guideYStyle]} />
            {editing ? (
              <>
                <CenteredAt x={L.text.x * W} y={L.text.y * H} width={W * L.text.w} align={ts.align}>
                  <Pressable accessibilityLabel="Slide text" onPress={() => textRef.current?.focus()}>
                  <SlideText text={cur.text} ts={ts} fs={fs} maxWidth={W * L.text.w} spans={cur.spans}>
                    <TextInput
                      ref={textRef}
                      autoFocus
                      multiline
                      value={cur.text}
                      onChangeText={setText}
                      onSelectionChange={(e) => {
                        const { start, end } = e.nativeEvent.selection;
                        setSelRange(end > start ? { start, end } : null);
                      }}
                      selectionColor={color.blue500}
                      cursorColor={color.blue500}
                      style={[slideTextStyle(ts, fs), styles.input, { color: slideInputInk(ts, cur.spans), minWidth: W * L.text.w * 0.5, maxWidth: W * L.text.w }]}
                    />
                  </SlideText>
                  </Pressable>
                </CenteredAt>
                <WidthSlider value={L.text.w} H={H} onChange={(w) => setBox({ ...L.text, w })} />
                <TextToolbar
                  ts={ts}
                  panel={panel}
                  setPanel={setPanel}
                  onChange={setTs}
                  onTextColor={pickTextColor}
                  selection={Boolean(selRange && selRange.end > selRange.start)}
                  bottomInset={keyboardInset}
                  onDelete={cur.text ? () => { patch({ text: '', spans: undefined }); finish(); } : undefined}
                >
                  {genBtn || secBtn ? (
                    <>
                      {genBtn}
                      {secBtn}
                    </>
                  ) : null}
                </TextToolbar>
              </>
            ) : null}
            {showShot ? (
              <Animated.View style={[styles.note, { left: PAD, right: noteRight, bottom: bottomOffset }, overlayStyle]}>
                {cur.shot ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`${noteLabel}, tap to edit`} onPress={() => setShotOpen(true)} style={({ pressed }) => [styles.noteRow, pressed ? styles.pressed : null]}>
                    <View style={styles.noteBody}>
                      <Text style={styles.noteLabel} numberOfLines={1}>
                        {noteLabel}
                      </Text>
                      <Text style={styles.noteText} numberOfLines={3} ellipsizeMode="tail">
                        {cur.shot}
                      </Text>
                    </View>
                    <View style={styles.noteEdit}>
                      <Icon name="pencil" size={13} color={color.whiteA45} />
                    </View>
                  </Pressable>
                ) : (
                  <View style={styles.noteEmpty}>
                    <Text style={styles.noteLabel} numberOfLines={1}>
                      {noteLabel}
                    </Text>
                    <View style={styles.noteActions}>
                      <Pressable accessibilityRole="button" onPress={() => setShotOpen(true)} style={({ pressed }) => [styles.noteBtn, styles.writeBtn, pressed ? styles.pressed : null]}>
                        <Icon name="pencil" size={14} color={color.ink} />
                        <Text style={[styles.noteBtnText, { color: color.ink }]} numberOfLines={1}>
                          {isCover ? 'Write the hook' : 'Write the line'}
                        </Text>
                      </Pressable>
                      {onWriteNote && !busy ? (
                        <Pressable accessibilityRole="button" onPress={onWriteNote} style={({ pressed }) => [styles.noteBtn, styles.draftBtn, pressed ? styles.pressed : null]}>
                          <Icon name="sparkles" size={14} color={color.white} />
                          <Text style={[styles.noteBtnText, { color: color.white }]} numberOfLines={1}>
                            AI writes it
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                )}
              </Animated.View>
            ) : null}
            {!editing && (warn || stackButtons) ? (
              <View style={styles.bottomStack} pointerEvents="box-none">
                {stackButtons ? (
                  <Animated.View style={[styles.genStack, overlayStyle]} pointerEvents="box-none">
                    {genBtn}
                    {secBtn}
                  </Animated.View>
                ) : null}
                {warn ? (
                  <View style={styles.warnWrap} pointerEvents="none">
                    <View style={styles.warn}>
                      <Icon name="circle-alert" size={14} color={color.white} />
                      <Text style={styles.warnText} numberOfLines={1}>{warn}</Text>
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
          </Animated.View>
          <View style={[styles.topRow, { height: ctl }]} pointerEvents="box-none">
            {editing ? <View style={styles.grow} /> : <Round icon="chevron-left" label="Back" onPress={onBack} size={ctl} />}
            {!editing && !picking ? (
              <View style={[styles.ghostToggle, { height: ctl }]}>
                {(
                  [
                    ['tiktok', 'music-2', 'TikTok'],
                    ['instagram', 'instagram', 'Instagram'],
                  ] as [Platform, IconName, string][]
                ).map(([k, ic, l]) => {
                  const on = ghost === k;
                  const showLabel = on && !compactToggle;
                  return (
                    <Pressable
                      key={k}
                      accessibilityRole="button"
                      accessibilityLabel={l}
                      accessibilityState={{ selected: on }}
                      onPress={() => setGhost(on ? 'off' : k)}
                      hitSlop={4}
                      style={[
                        styles.ghostPill,
                        { height: ctl - 6, minWidth: ctl - 6, paddingHorizontal: showLabel ? 11 : 0, backgroundColor: on ? color.white : 'transparent' },
                      ]}
                    >
                      <Icon name={ic} size={14} color={on ? color.ink : color.whiteA75} />
                      {showLabel ? <Text style={styles.ghostText}>{l}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            <View style={styles.grow} />
            {!editing && !picking ? (
              <Animated.View entering={FadeIn.duration(200)} style={styles.tools}>
                <Round label="Text" onPress={() => setEditing(true)} size={ctl}>
                  <Text style={styles.aa}>Aa</Text>
                </Round>
                <Round icon="image-plus" label="Add media" onPress={onOpenMedia} on={Boolean(lib)} size={ctl} />
                {notes && !reel ? <Round icon="message-circle" label="Note for the creator" onPress={() => setShotOpen(!shotOpen)} on={Boolean(cur.shot) || shotOpen} size={ctl} /> : null}
                {onRevise && cur.text.trim() ? <Round icon="sparkles" label="Revise with AI" onPress={onRevise} size={ctl} /> : null}
              </Animated.View>
            ) : null}
            {editing ? (
              <Pressable accessibilityRole="button" onPress={finish} style={styles.done}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            ) : null}
          </View>
          {!editing && !picking && kindLabel ? (
            <Text pointerEvents="none" numberOfLines={1} style={[styles.kindLabel, { top: PAD + ctl + 8 }]}>
              {kindLabel}
            </Text>
          ) : null}
          {picking ? (
            <Animated.View entering={FadeIn.duration(220)} style={styles.pickScrim}>
              <Animated.View entering={FadeInUp.duration(300).delay(80)} style={styles.pickCard}>
                <View style={styles.pickZap}>
                  <Icon name="zap" size={22} color={color.white} />
                </View>
                <Text style={styles.pickTitle}>Your call to action</Text>
                <Pressable accessibilityRole="button" onPress={() => onGenerate?.()} style={[styles.pickBtn, { backgroundColor: color.white }]}>
                  <Icon name="sparkles" size={17} color={color.blue500} />
                  <Text style={[styles.pickBtnText, { color: color.ink }]}>Generate with AI</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => onSecondary?.()} style={[styles.pickBtn, { backgroundColor: color.whiteA16 }]}>
                  <Icon name="layout-grid" size={16} color={color.white} />
                  <Text style={[styles.pickBtnText, { color: color.white }]}>Pick a feature</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setEditing(true)} style={[styles.pickBtn, { backgroundColor: color.whiteA16 }]}>
                  <Icon name="pencil" size={16} color={color.white} />
                  <Text style={[styles.pickBtnText, { color: color.white }]}>Write it yourself</Text>
                </Pressable>
              </Animated.View>
            </Animated.View>
          ) : null}
          {shotOpen ? (
            <Animated.View entering={FadeIn.duration(180)} style={[styles.shotScrim, { paddingBottom: PAD + keyboardInset }]}>
              <Animated.View entering={FadeInUp.duration(240)} style={styles.shotCard}>
                <Text style={styles.noteLabel}>{noteLabel}</Text>
                <TextInput
                  ref={shotRef}
                  autoFocus
                  multiline
                  value={cur.shot}
                  onChangeText={(t) => patch({ shot: t })}
                  placeholder={reel ? (isCover ? 'The hook, exactly as they should say it' : 'What the creator says on this clip') : 'Note for the creator on this slide'}
                  placeholderTextColor={color.whiteA45}
                  blurOnSubmit
                  onSubmitEditing={() => setShotOpen(false)}
                  style={styles.shotInput}
                />
              </Animated.View>
            </Animated.View>
          ) : null}
          {busy ? <BusyOverlay label={busy} /> : null}
        </View>
      </GestureDetector>
      {shotOpen ? (
        <View style={styles.shotFooter}>
          <Text style={styles.shotFooterText}>{reel ? (isCover ? 'Hook script' : 'Teleprompter line') : 'Note for the creator'}</Text>
          <Pressable accessibilityRole="button" onPress={() => setShotOpen(false)} style={styles.shotDone}>
            <Text style={styles.shotDoneText}>Done</Text>
          </Pressable>
        </View>
      ) : (
        footer
      )}
    </View>
  );
}

export function Round({ icon, label, onPress, on = false, children, size = 38 }: { icon?: IconName; label: string; onPress: () => void; on?: boolean; children?: ReactNode; size?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={Math.max(3, Math.ceil((44 - size) / 2))}
      style={({ pressed }) => [styles.round, { width: size, height: size, backgroundColor: on ? color.white : color.inkA55 }, pressed ? styles.pressed : null]}
    >
      {children ?? (icon ? <Icon name={icon} size={Math.round(size * 0.47)} color={on ? color.ink : color.white} /> : null)}
    </Pressable>
  );
}

// One type scale for the canvas: 15 for actions and the note line, 13 for
// secondary actions, 12 for labels. Surfaces are the canvas chrome, opaque.
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink900, alignItems: 'center' },
  frame: { borderRadius: 22, overflow: 'hidden', backgroundColor: briefTone.canvas.bg },
  grow: { flex: 1 },
  pressed: { opacity: 0.8 },
  emptyHint: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyHintText: { fontFamily: typeToken.font.ui, fontWeight: typeToken.weight.semibold, fontSize: typeToken.size.chip, color: color.whiteA28 },
  zone: { position: 'absolute', backgroundColor: color.dangerSoft, opacity: 0.35, borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.danger },
  input: { padding: 0, margin: 0, textAlignVertical: 'top' },
  guideX: { position: 'absolute', top: 0, bottom: 0, width: 1.5, backgroundColor: color.blue500, shadowColor: color.white, shadowOpacity: 0.6, shadowRadius: 0.5, shadowOffset: { width: 0, height: 0 } },
  guideY: { position: 'absolute', left: 0, right: 0, height: 1.5, backgroundColor: color.blue500, shadowColor: color.white, shadowOpacity: 0.6, shadowRadius: 0.5, shadowOffset: { width: 0, height: 0 } },
  // Header: back, platform toggle, tools, all one height in one row.
  topRow: { position: 'absolute', top: PAD, left: PAD, right: PAD, flexDirection: 'row', alignItems: 'center', gap: 8 },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  round: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  aa: { fontFamily: typeToken.font.display, fontWeight: typeToken.weight.heavy, fontSize: typeToken.size.bodySm, color: color.white },
  done: { height: 44, paddingHorizontal: 14, justifyContent: 'center' },
  doneText: { fontFamily: typeToken.font.ui, fontWeight: typeToken.weight.bold, fontSize: typeToken.size.body, color: color.white, textShadowColor: color.scrimStrong, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  ghostToggle: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 3, borderRadius: 999, backgroundColor: color.inkA55 },
  ghostPill: { borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  ghostText: { fontFamily: typeToken.font.ui, fontWeight: typeToken.weight.bold, fontSize: typeToken.size.label, color: color.ink },
  kindLabel: { position: 'absolute', left: PAD + 2, right: PAD, fontFamily: typeToken.font.ui, fontWeight: typeToken.weight.semibold, fontSize: typeToken.size.label, color: color.whiteA60, textShadowColor: color.scrimStrong, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  genBtn: { height: GEN_H, paddingLeft: 16, paddingRight: 20, borderRadius: 999, backgroundColor: color.white, flexDirection: 'row', alignItems: 'center', gap: 8, ...{ shadowColor: color.ink900, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12, shadowOpacity: 0.35 } },
  genText: { fontFamily: typeToken.font.ui, fontWeight: typeToken.weight.bold, fontSize: typeToken.size.bodySm, color: color.ink },
  secBtn: { height: SEC_H, paddingHorizontal: 14, borderRadius: 999, backgroundColor: briefTone.canvas.chrome, flexDirection: 'row', alignItems: 'center', gap: 6 },
  secText: { fontFamily: typeToken.font.ui, fontWeight: typeToken.weight.bold, fontSize: typeToken.size.chip, color: color.white },
  bottomStack: { position: 'absolute', left: PAD, right: PAD, bottom: STACK_BOTTOM, gap: STACK_GAP },
  genStack: { alignItems: 'center', gap: STACK_GAP },
  // Note card (hook script, creator says, photo): opaque, in the caption zone, clear of the rail.
  note: { position: 'absolute', borderRadius: 16, backgroundColor: briefTone.canvas.chrome, borderWidth: 1, borderColor: color.whiteA16, overflow: 'hidden' },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: PAD, paddingLeft: 14, paddingRight: PAD },
  noteBody: { flex: 1, minWidth: 0, gap: 4 },
  noteLabel: { fontFamily: typeToken.font.ui, fontWeight: typeToken.weight.medium, fontSize: typeToken.size.label, color: color.whiteA60 },
  noteText: { fontFamily: typeToken.font.ui, fontWeight: typeToken.weight.semibold, fontSize: typeToken.size.bodySm, lineHeight: 20, color: color.white },
  noteEdit: { width: 22, height: 22, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  noteEmpty: { gap: 10, paddingVertical: PAD, paddingHorizontal: 14 },
  noteActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  noteBtn: { flexGrow: 1, flexBasis: 112, height: 40, paddingHorizontal: 12, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  noteBtnText: { flexShrink: 1, fontFamily: typeToken.font.ui, fontWeight: typeToken.weight.bold, fontSize: typeToken.size.chip },
  writeBtn: { backgroundColor: color.white },
  draftBtn: { backgroundColor: color.whiteA16 },
  warnWrap: { flexDirection: 'row', marginRight: 52 },
  warn: { height: WARN_H, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, borderRadius: 999, backgroundColor: color.danger },
  warnText: { flexShrink: 1, fontFamily: typeToken.font.ui, fontWeight: typeToken.weight.bold, fontSize: typeToken.size.label, color: color.white },
  pickScrim: { ...StyleSheet.absoluteFill, backgroundColor: color.scrimStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  pickCard: { width: '100%', gap: 10, paddingTop: 22, paddingHorizontal: 18, paddingBottom: 18, borderRadius: 24, backgroundColor: briefTone.canvas.bg, borderWidth: 1, borderColor: color.whiteA16 },
  pickZap: { width: 44, height: 44, borderRadius: 999, alignSelf: 'center', backgroundColor: color.blue500, alignItems: 'center', justifyContent: 'center' },
  pickTitle: { textAlign: 'center', fontFamily: typeToken.font.display, fontWeight: typeToken.weight.bold, fontSize: 19, letterSpacing: -0.3, color: color.white, marginBottom: 8 },
  pickBtn: { height: 48, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  pickBtnText: { fontFamily: typeToken.font.ui, fontWeight: typeToken.weight.bold, fontSize: typeToken.size.bodySm },
  shotScrim: { ...StyleSheet.absoluteFill, backgroundColor: color.scrimStrong, justifyContent: 'flex-end', padding: PAD },
  shotCard: { gap: 8, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, backgroundColor: briefTone.canvas.chrome, borderWidth: 1, borderColor: color.whiteA16 },
  shotInput: { minHeight: 48, maxHeight: 260, fontFamily: typeToken.font.ui, fontWeight: typeToken.weight.semibold, fontSize: typeToken.size.action, lineHeight: 24, color: color.white, padding: 0 },
  shotFooter: { flex: 1, minHeight: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 4 },
  shotFooterText: { flex: 1, fontFamily: typeToken.font.ui, fontWeight: typeToken.weight.semibold, fontSize: typeToken.size.chip, color: color.whiteA60 },
  shotDone: { height: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: color.white, justifyContent: 'center' },
  shotDoneText: { fontFamily: typeToken.font.ui, fontWeight: typeToken.weight.bold, fontSize: typeToken.size.bodySm, color: color.ink },
});

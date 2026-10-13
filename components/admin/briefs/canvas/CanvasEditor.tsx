// Full screen slide canvas (SSCanvas.jsx CanvasEditor). The slide is drawn
// at the size TikTok and Instagram show it with each app's chrome ghosted on
// top, so a text box or screenshot behind a button is visible before any
// creator posts it. Tap to type, drag to move, pinch to resize, swipe for the
// next slide.

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInUp, runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SlideBox } from '../../../../lib/briefs-api';
import { useKeyboardHeight } from '../../../../lib/keyboard';
import { pickFeature, type LibraryFeature } from '../../../../lib/library-api';
import { briefTone, color, type as typeToken } from '../../../../theme/tokens';
import { Icon, type IconName } from '../../../ui/Icon';
import type { EditorSlide } from '../editor/types';
import { Shot } from '../Shot';
import { CenteredAt } from '../SlideCard';
import { SlideText, slideTextStyle, textInkFor } from '../SlideText';
import { blockedFor, clamp, fontSizeFor, insetRect, layoutOf, overlaps, resolveTextStyle, SLIDE_RATIO, textRect, zoneName, type Ghost, type Platform, type ResolvedTextStyle } from './layout';
import { PlatformGhost } from './PlatformGhost';
import { Sticker } from './Sticker';
import { TextToolbar, WidthSlider, type ToolPanel } from './TextToolbar';
import { BusyOverlay } from './BusyOverlay';

const FOOTER_H = 112;

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
  onGenerate: (() => void) | null;
  generateLabel: string;
  onSecondary: (() => void) | null;
  secondaryLabel: string;
  /** Reel hook: Draft with AI. */
  onWriteNote: (() => void) | null;
  onRevise: (() => void) | null;
  /** Show the note tool and the shot pill. */
  notes: boolean;
  onOpenMedia: () => void;
}

export function CanvasEditor(props: CanvasEditorProps) {
  const { slides, sel, setSel, patchAt, onBack, features, reel, busy, kindLabel, footer, ctaPick, onGenerate, generateLabel, onSecondary, secondaryLabel, onWriteNote, onRevise, notes, onOpenMedia } = props;
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const available = winH - insets.top - FOOTER_H;
  const W = Math.min(winW, Math.floor(available / SLIDE_RATIO));
  const H = Math.round(W * SLIDE_RATIO);
  const keyboard = useKeyboardHeight();
  // How far the keyboard reaches into the frame, so the tools float above it.
  const keyboardInset = Math.max(0, insets.top + H - (winH - keyboard));

  const cur = slides[sel] ?? slides[0];
  const [ghost, setGhost] = useState<Ghost>('tiktok');
  const [editing, setEditing] = useState(() => !cur.text && !ctaPick);
  const [panel, setPanel] = useState<ToolPanel>(null);
  const [shotOpen, setShotOpen] = useState(false);
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
  }, [sel, slides, onSecondary]);

  const plat: Platform = ghost === 'instagram' ? 'instagram' : 'tiktok';
  const bk = plat === 'instagram' ? 'box_ig' : 'box';
  const ik = plat === 'instagram' ? 'inset_box_ig' : 'inset_box';
  const L = layoutOf(cur, plat);
  const lib = cur.inset_feature_id ? pickFeature(features, cur.inset_feature_id) : null;
  const ts = resolveTextStyle(cur.tstyle);
  const fs = fontSizeFor(W, ts.size);
  const patch = (p: Partial<EditorSlide>) => patchAt(sel, p);
  const setTs = (p: Partial<ResolvedTextStyle>) => patch({ tstyle: { ...ts, ...p } });
  const setBox = (box: SlideBox) => patch({ [bk]: box });
  const setInsetBox = (box: SlideBox) => patch({ [ik]: box });

  const blocked = blockedFor(ghost, reel);
  const textHit = cur.text ? blocked.find((z) => overlaps(textRect(cur.text, L.text, ts, W, H), z)) : undefined;
  const insetHit = lib ? blocked.find((z) => overlaps(insetRect(L.inset, W, H), z)) : undefined;
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
  };

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
  const tap = Gesture.Tap().onEnd(() => {
    runOnJS(tapCanvas)();
  });
  const canvasGesture = Gesture.Race(swipe, tap);

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
  const bottomOffset = genBtn && secBtn ? 124 : genBtn || secBtn ? 84 : warn ? 52 : 12;

  const showShot = !editing && !shotOpen && !ctaPick && (reel ? notes : notes && Boolean(cur.shot));

  return (
    <View style={styles.root}>
      <View style={{ height: insets.top }} />
      <GestureDetector gesture={canvasGesture}>
        <View style={[styles.frame, { width: W, height: H }]}>
          <Animated.View key={sel} entering={FadeIn.duration(160)} style={StyleSheet.absoluteFill}>
            <LinearGradient colors={[briefTone.canvas.chrome, briefTone.canvas.bg]} style={StyleSheet.absoluteFill} />
            {!lib && !cur.text && !ctaPick ? (
              <View pointerEvents="none" style={styles.emptyHint}>
                <Icon name={reel ? 'video' : 'camera'} size={36} color={color.whiteA28} />
                <Text style={styles.emptyHintText}>{reel ? "Creator's clip" : "Creator's photo"}</Text>
              </View>
            ) : null}
            {ghost !== 'off' ? (
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: 0.55 }]}>
                <PlatformGhost platform={plat} w={W} h={H} reel={reel} />
              </View>
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
                width={W * L.inset.w}
                W={W}
                H={H}
                hit={Boolean(insetHit)}
                onMove={(dx, dy) => setInsetBox({ ...L.inset, x: clamp(L.inset.x + dx, 0.1, 0.9), y: clamp(L.inset.y + dy, 0.08, 0.95) })}
                onScale={(r) => setInsetBox({ ...L.inset, w: clamp(L.inset.w * r, 0.25, 0.9) })}
              >
                <Animated.View entering={pop ? FadeInUp.duration(520).delay(260) : undefined}>
                  <Shot feature={lib} w={W * L.inset.w} video={reel} />
                </Animated.View>
              </Sticker>
            ) : null}
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
                onMove={(dx, dy) => setBox({ ...L.text, x: clamp(L.text.x + dx, 0.1, 0.9), y: clamp(L.text.y + dy, 0.06, 0.94) })}
                onScale={(r) => setTs({ size: clamp(ts.size * r, 0.5, 2.4) })}
              >
                <Animated.View entering={pop ? FadeInUp.duration(520).delay(260) : undefined}>
                  <SlideText text={cur.text} ts={ts} fs={fs} />
                </Animated.View>
              </Sticker>
            ) : null}
            {editing ? (
              <>
                <CenteredAt x={L.text.x * W} y={L.text.y * H} width={W * L.text.w} align={ts.align}>
                  <SlideText text={cur.text} ts={ts} fs={fs}>
                    <TextInput
                      autoFocus
                      multiline
                      value={cur.text}
                      onChangeText={(t) => patch({ text: t })}
                      selectionColor={color.blue500}
                      style={[slideTextStyle(ts, fs), styles.input, { color: textInkFor(ts), minWidth: W * L.text.w * 0.5, maxWidth: W * L.text.w }]}
                    />
                  </SlideText>
                </CenteredAt>
                <WidthSlider value={L.text.w} H={H} onChange={(w) => setBox({ ...L.text, w })} />
                <TextToolbar ts={ts} panel={panel} setPanel={setPanel} onChange={setTs} bottomInset={keyboardInset} onDelete={cur.text ? () => { patch({ text: '' }); finish(); } : undefined}>
                  {genBtn || secBtn ? (
                    <>
                      {genBtn}
                      {secBtn}
                    </>
                  ) : null}
                </TextToolbar>
              </>
            ) : null}
            {!editing && !picking ? (
              <Animated.View entering={FadeIn.duration(200)} style={styles.tools}>
                <Round label="Text" onPress={() => setEditing(true)}>
                  <Text style={styles.aa}>Aa</Text>
                </Round>
                <Round icon="image-plus" label="Add media" onPress={onOpenMedia} on={Boolean(lib)} />
                {notes && !reel ? <Round icon="message-circle" label="Note for the creator" onPress={() => setShotOpen(!shotOpen)} on={Boolean(cur.shot) || shotOpen} /> : null}
                {onRevise && cur.text.trim() ? <Round icon="sparkles" label="Revise with AI" onPress={onRevise} /> : null}
              </Animated.View>
            ) : null}
            {showShot ? (
              cur.shot ? (
                <Pressable accessibilityRole="button" onPress={() => setShotOpen(true)} style={[styles.shotPill, { bottom: bottomOffset }]}>
                  <Icon name={reel ? 'mic' : 'message-circle'} size={15} color={color.whiteA60} />
                  <View style={styles.shotBody}>
                    {reel ? <Text style={styles.shotLabel}>{isCover ? 'Hook script \u00b7 word for word' : 'Creator says'}</Text> : null}
                    <Text style={styles.shotText}>{cur.shot}</Text>
                  </View>
                  <Icon name="pencil" size={14} color={color.whiteA60} />
                </Pressable>
              ) : (
                <View style={[styles.shotEmpty, { bottom: bottomOffset }]}>
                  <View style={styles.shotEmptyLabelRow}>
                    <Icon name="mic" size={13} color={color.whiteA75} />
                    <Text style={styles.shotEmptyLabel}>{isCover ? 'Hook script, word for word' : 'What the creator says'}</Text>
                  </View>
                  <View style={styles.shotEmptyRow}>
                    <Pressable accessibilityRole="button" onPress={() => setShotOpen(true)} style={styles.writeBtn}>
                      <Icon name="pencil" size={15} color={color.ink} />
                      <Text style={styles.writeText}>{isCover ? 'Write the hook' : 'Write the line'}</Text>
                    </Pressable>
                    {onWriteNote && !busy ? (
                      <Pressable accessibilityRole="button" onPress={onWriteNote} style={styles.draftBtn}>
                        <Icon name="sparkles" size={15} color={color.white} />
                        <Text style={styles.draftText}>Draft with AI</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              )
            ) : null}
            {!editing && warn ? (
              <View style={styles.warnWrap}>
                <View style={styles.warn}>
                  <Icon name="circle-alert" size={14} color={color.white} />
                  <Text style={styles.warnText}>{warn}</Text>
                </View>
              </View>
            ) : null}
            {!editing && !ctaPick && (genBtn || secBtn) ? (
              <View style={styles.genStack}>
                {genBtn}
                {secBtn}
              </View>
            ) : null}
          </Animated.View>
          <View style={styles.topRow}>
            {editing ? <View style={styles.grow} /> : <Round icon="chevron-left" label="Back" onPress={onBack} />}
            <View style={styles.grow} />
            {editing ? (
              <Pressable accessibilityRole="button" onPress={finish} style={styles.done}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            ) : null}
          </View>
          {!editing && !picking ? (
            <View style={styles.ghostToggle}>
              {(
                [
                  ['tiktok', 'music-2', 'TikTok'],
                  ['instagram', 'instagram', 'Instagram'],
                ] as [Platform, IconName, string][]
              ).map(([k, ic, l]) => {
                const on = ghost === k;
                return (
                  <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setGhost(on ? 'off' : k)} style={[styles.ghostPill, { backgroundColor: on ? color.white : 'transparent' }]}>
                    <Icon name={ic} size={13} color={on ? color.ink : color.whiteA90} />
                    <Text style={[styles.ghostText, { color: on ? color.ink : color.whiteA90 }]}>{l}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {!editing && !picking && kindLabel ? (
            <View style={styles.kindLabel}>
              <Text style={styles.kindLabelText}>{kindLabel}</Text>
            </View>
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
            <Animated.View entering={FadeIn.duration(180)} style={[styles.shotScrim, { paddingBottom: 14 + keyboardInset }]}>
              <Animated.View entering={FadeInUp.duration(240)} style={styles.shotCard}>
                <View style={styles.shotCardLabelRow}>
                  <Icon name={reel ? 'mic' : 'message-circle'} size={14} color={color.whiteA75} />
                  <Text style={styles.shotCardLabel}>
                    {reel ? (isCover ? 'Hook script \u00b7 word for word' : 'What the creator says') : 'Note for the creator'}
                  </Text>
                </View>
                <TextInput
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

export function Round({ icon, label, onPress, on = false, children, size = 42 }: { icon?: IconName; label: string; onPress: () => void; on?: boolean; children?: ReactNode; size?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={2}
      style={[styles.round, { width: size, height: size, backgroundColor: on ? color.white : color.inkA55 }]}
    >
      {children ?? (icon ? <Icon name={icon} size={Math.round(size * 0.48)} color={on ? color.ink : color.white} /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink900, alignItems: 'center' },
  frame: { borderRadius: 22, overflow: 'hidden', backgroundColor: briefTone.canvas.bg },
  grow: { flex: 1 },
  emptyHint: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyHintText: { fontFamily: typeToken.font.ui, fontWeight: '600', fontSize: 13, color: color.whiteA28 },
  zone: { position: 'absolute', backgroundColor: color.dangerSoft, opacity: 0.35, borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.danger },
  input: { padding: 0, margin: 0, textAlignVertical: 'top' },
  tools: { position: 'absolute', right: 12, top: 56, flexDirection: 'row', gap: 8 },
  round: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  aa: { fontFamily: typeToken.font.display, fontWeight: '800', fontSize: 16, color: color.white },
  topRow: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  done: { height: 44, paddingHorizontal: 14, justifyContent: 'center' },
  doneText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 16, color: color.white, textShadowColor: color.scrimStrong, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  ghostToggle: { position: 'absolute', top: 12, alignSelf: 'center', flexDirection: 'row', gap: 2, padding: 3, borderRadius: 999, backgroundColor: color.scrimStrong },
  ghostPill: { height: 30, paddingHorizontal: 12, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6 },
  ghostText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 12.5 },
  kindLabel: { position: 'absolute', left: 12, top: 63, height: 42, paddingHorizontal: 12, borderRadius: 999, backgroundColor: color.inkA55, justifyContent: 'center' },
  kindLabelText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 12.5, color: color.white },
  genBtn: { height: 46, paddingLeft: 16, paddingRight: 20, borderRadius: 999, backgroundColor: color.white, flexDirection: 'row', alignItems: 'center', gap: 8, ...{ shadowColor: color.ink900, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12, shadowOpacity: 0.35 } },
  genText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 15, color: color.ink },
  secBtn: { height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: color.whiteA45, backgroundColor: color.inkA55, flexDirection: 'row', alignItems: 'center', gap: 6 },
  secText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 13, color: color.white },
  genStack: { position: 'absolute', left: 0, right: 0, bottom: 20, alignItems: 'center', gap: 10 },
  shotPill: { position: 'absolute', left: 12, right: 64, flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 11, paddingHorizontal: 13, borderRadius: 16, backgroundColor: color.inkA55 },
  shotBody: { flex: 1, minWidth: 0, gap: 3 },
  shotLabel: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 10.5, letterSpacing: 0.4, textTransform: 'uppercase', color: color.whiteA60 },
  shotText: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 13.5, lineHeight: 13.5 * 1.4, color: color.white },
  shotEmpty: { position: 'absolute', left: 12, right: 12, gap: 8 },
  shotEmptyLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shotEmptyLabel: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: color.whiteA75 },
  shotEmptyRow: { flexDirection: 'row', gap: 8 },
  writeBtn: { flex: 1, height: 46, borderRadius: 999, backgroundColor: color.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  writeText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 14, color: color.ink },
  draftBtn: { flex: 1, height: 46, borderRadius: 999, borderWidth: 1, borderColor: color.whiteA45, backgroundColor: color.inkA55, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  draftText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 14, color: color.white },
  warnWrap: { position: 'absolute', left: 12, bottom: 12, right: 64, flexDirection: 'row' },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, backgroundColor: color.danger },
  warnText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 12.5, color: color.white },
  pickScrim: { ...StyleSheet.absoluteFill, backgroundColor: color.scrimStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  pickCard: { width: '100%', gap: 10, paddingTop: 22, paddingHorizontal: 18, paddingBottom: 18, borderRadius: 24, backgroundColor: briefTone.canvas.bg, borderWidth: 1, borderColor: color.whiteA16 },
  pickZap: { width: 44, height: 44, borderRadius: 999, alignSelf: 'center', backgroundColor: color.blue500, alignItems: 'center', justifyContent: 'center' },
  pickTitle: { textAlign: 'center', fontFamily: typeToken.font.display, fontWeight: '700', fontSize: 19, letterSpacing: -0.3, color: color.white, marginBottom: 8 },
  pickBtn: { height: 50, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  pickBtnText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 15 },
  shotScrim: { ...StyleSheet.absoluteFill, backgroundColor: color.scrimStrong, justifyContent: 'flex-end', padding: 14 },
  shotCard: { gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18, backgroundColor: briefTone.canvas.bg },
  shotCardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shotCardLabel: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: color.whiteA60 },
  shotInput: { minHeight: 48, maxHeight: 260, fontFamily: typeToken.font.ui, fontWeight: '600', fontSize: 17, lineHeight: 17 * 1.4, color: color.white, padding: 0 },
  shotFooter: { flex: 1, minHeight: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 6 },
  shotFooterText: { flex: 1, fontFamily: typeToken.font.ui, fontWeight: '600', fontSize: 13, color: color.whiteA60 },
  shotDone: { height: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: color.white, justifyContent: 'center' },
  shotDoneText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 15, color: color.ink },
});

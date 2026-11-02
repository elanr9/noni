/* eslint-disable react-hooks/refs -- gesture and input closures read refs when they fire, never during render */
// Story editor (V2Story.jsx): a 9:16 canvas you type on. Tap to add text,
// tap text to select (outline, pencil, close), tap it again to edit, drag to
// move with centre snapping, drop on the bin to delete, pinch to resize.
// Highlight words while editing to colour just those words. The Script pill
// opens the teleprompter text when the caller passes one.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { stText, uid, type ClipDoc, type GsMedia, type StOverlay, type StText, type StTextStyle } from '../../../../lib/brief-library';
import { useKeyboardHeight } from '../../../../lib/keyboard';
import { ST_FONTS, stRender } from '../../../../lib/st-text';
import { color, motion } from '../../../../theme/v2';
import { GradientFill, MediaFill } from '../../../admin/v2/newbrief/ClipFrame';
import { MediaPickerSheet } from '../../../admin/v2/newbrief/MediaPickerSheet';
import { Icon, Press, tap, type IconName } from '../../../v2';
import { StTextView } from '../../../v2/StTextView';
import { TikTokChrome } from './TikTokChrome';

const ST_SWATCH = ['#FFFFFF', '#0B0B0C', '#1BA6EE', '#2BBF7A', '#FFD60A', '#FF8A00', '#FE2C55', '#FF2D78', '#7E3BFF'];
const ST_STYLES: StTextStyle[] = ['none', 'inv-bg', 'bg', 'outline'];
const STYLE_ICON: Record<string, IconName> = { none: 'title', 'inv-bg': 'format_color_fill', bg: 'invert_colors', outline: 'border_color', 'inv-outline': 'border_color' };
const FONT_NAMES = ['Classic', 'Serif', 'Bold', 'Typewriter', 'Round'];
/** Where text may sit, percent of the frame: clear of the side rail and the caption. */
const SAFE = { l: 15, r: 78, t: 4, b: 92 };
const ST_BG: [string, string] = ['#2B2B31', '#1A1A1F'];

type Tab = 'font' | 'color' | 'style' | 'align';
type Range = { start: number; end: number };

export interface StoryEditorProps {
  doc: ClipDoc;
  onChange: (doc: ClipDoc) => void;
  /** Photo behind the canvas; the dark gradient otherwise. */
  photo?: string | null;
  green?: boolean;
  title: string;
  /** Teleprompter text; present means the Script pill and sheet show. */
  script?: string;
  onScript?: (s: string) => void;
  chips?: ReactNode;
  footer?: ReactNode;
  onDone: () => void;
  onBack: () => void;
  /** Slide arrows; null disables, undefined hides. */
  onPrev?: (() => void) | null;
  onNext?: (() => void) | null;
  handle?: string;
}

function addSpan(x: StText, r: Range, patch: { color?: string; style?: StTextStyle }): StText {
  const keep = (x.spans || []).flatMap((s) => {
    if (s.end <= r.start || s.start >= r.end) return [s];
    const parts: StText['spans'] = [];
    if (s.start < r.start) parts.push({ ...s, end: r.start });
    if (s.end > r.end) parts.push({ ...s, start: r.end });
    return parts;
  });
  return { ...x, spans: keep.concat([{ start: r.start, end: r.end, color: patch.color ?? x.color, style: patch.style ?? 'none' }]) };
}

export function StoryEditor({ doc, onChange, photo, green, title, script, onScript, chips, footer, onDone, onBack, onPrev, onNext, handle }: StoryEditorProps) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const [size, setSize] = useState({ w: 300, h: 533 });
  const [sel, setSel] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>('color');
  const [drag, setDrag] = useState(false);
  const [guides, setGuides] = useState({ v: false, h: false });
  const [range, setRange] = useState<Range | null>(null);
  const [pick, setPick] = useState(false);
  const [scr, setScr] = useState(false);
  const [scrDraft, setScrDraft] = useState(script ?? '');
  // Handlers read the latest doc and the measured text heights when they fire, not during render.
  const docRef = useRef(doc);
  const heights = useRef(new Map<string, number>());
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const selT = doc.texts.find((x) => x.id === sel);
  const selO = doc.overlays.find((o) => o.id === sel);
  const set = (patch: Partial<ClipDoc>) => onChange({ ...docRef.current, ...patch });
  const upd = (id: string, patch: Partial<StText> & Partial<StOverlay>) =>
    set({ texts: docRef.current.texts.map((x) => (x.id === id ? { ...x, ...patch } : x)), overlays: docRef.current.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  const hasRange = !!(range && range.end > range.start);
  const style = (patch: { color?: string; style?: StTextStyle }) => {
    if (!selT) return;
    if (hasRange && range) set({ texts: docRef.current.texts.map((x) => (x.id === sel ? addSpan(x, range, patch) : x)) });
    else upd(selT.id, patch);
  };
  const addText = () => {
    const t = stText('');
    set({ texts: docRef.current.texts.concat([t]) });
    setSel(t.id);
    setEditing(true);
    setTab('color');
    setRange(null);
  };
  const finishEdit = () => {
    const cur = docRef.current.texts.find((x) => x.id === sel);
    if (cur && !cur.text.trim()) set({ texts: docRef.current.texts.filter((x) => x.id !== sel) });
    setEditing(false);
    setRange(null);
  };
  const remove = (id: string) => {
    onChange({ ...docRef.current, texts: docRef.current.texts.filter((x) => x.id !== id), overlays: docRef.current.overlays.filter((o) => o.id !== id) });
    setSel(null);
    setEditing(false);
    tap();
  };
  const tapCanvas = () => {
    if (editing) return finishEdit();
    if (sel) return setSel(null);
    addText();
  };
  const fitsAt = (it: StText, px: number) => {
    const h = heights.current.get(it.id);
    if (!h) return true;
    const hp = ((h * (px / (it.size || 24))) / size.h) * 100;
    return it.y - hp / 2 >= SAFE.t && it.y + hp / 2 <= SAFE.b;
  };
  const setTextSize = (it: StText, next: number) => {
    let r = Math.round(Math.max(12, Math.min(56, next)));
    if (r > it.size) while (r > it.size && !fitsAt(it, r)) r--;
    if (r !== it.size) upd(it.id, { size: r });
  };
  const addOverlay = (m: GsMedia) => {
    const o: StOverlay = { id: uid(), src: m.src, label: m.label ?? '', x: 46, y: 50, w: 40 };
    set({ overlays: docRef.current.overlays.concat([o]) });
    setPick(false);
    setSel(o.id);
  };

  const scale = size.w / 300;
  const editT = editing && selT ? selT : null;
  const sliderVal = selO ? (selO.w - 20) / 80 : selT ? (Math.min(selT.w || 60, SAFE.r - SAFE.l) - 24) / (SAFE.r - SAFE.l - 24) : 0;

  const slider = Gesture.Pan()
    .runOnJS(true)
    .onBegin((e) => sliderAt(e.y))
    .onUpdate((e) => sliderAt(e.y));
  const sliderAt = (y: number) => {
    const p = 1 - Math.max(0, Math.min(1, y / 232));
    const lo = selO ? 20 : 24;
    const hi = selO ? 100 : SAFE.r - SAFE.l;
    const w = Math.round(lo + p * (hi - lo));
    if (selO) upd(selO.id, { w });
    else if (selT) {
      const half = w / 2;
      upd(selT.id, { w, x: Math.max(SAFE.l + half, Math.min(SAFE.r - half, selT.x)) });
    }
  };

  const panelH = editing ? 136 : 104;
  const scrY = useSharedValue(1);
  useEffect(() => {
    scrY.set(withTiming(scr ? 0 : 1, { duration: motion.sheet, easing: motion.sheetEase }));
  }, [scr, scrY]);
  const scrStyle = useAnimatedStyle(() => ({ transform: [{ translateY: scrY.get() * 420 }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: 1 - scrY.get() }));

  const optBtn = (on: boolean, fn: () => void, child: ReactNode, w = 44) => (
    <Press onPress={fn} style={{ minWidth: w, height: 38, paddingHorizontal: 10, borderRadius: 10, backgroundColor: on ? '#fff' : 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
      {child}
    </Press>
  );
  const tabBtn = (name: IconName, k: Tab) => (
    <Press key={k} onPress={() => setTab(k)} style={{ width: 48, height: 44, borderRadius: 12, backgroundColor: tab === k ? 'rgba(255,255,255,0.22)' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={24} color="#fff" />
    </Press>
  );
  const rail = (name: IconName, fn: () => void, label: string) => (
    <Press key={label} accessibilityLabel={label} onPress={fn} style={{ alignItems: 'center', gap: 4, width: 52 }}>
      <View style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={name} size={22} color="#fff" />
      </View>
      <Text style={{ fontSize: 11, lineHeight: 13, fontWeight: '600', color: '#fff', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>{label}</Text>
    </Press>
  );

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onBack}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: keyboard > 0 ? keyboard : 0 }}>
          {/* Header */}
          <View style={{ height: 44, marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, zIndex: 2 }}>
            {editing ? <View style={{ width: 44 }} /> : (
              <Press accessibilityLabel="Back" onPress={onBack} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="chevron_left" size={30} color="#fff" />
              </Press>
            )}
            <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: '#fff' }}>{editing ? '' : title}</Text>
            <Press onPress={editing ? finishEdit : onDone} style={{ height: 44, paddingHorizontal: 12, justifyContent: 'center' }}>
              <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', color: '#fff' }}>Done</Text>
            </Press>
          </View>

          {/* Canvas */}
          <View style={{ flex: 1, marginBottom: 0 }} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
            <Pressable onPress={tapCanvas} style={{ flex: 1, borderRadius: 24, overflow: 'hidden', backgroundColor: '#1A1A1F' }}>
              {photo ? <Image source={{ uri: photo }} resizeMode="cover" style={StyleSheet.absoluteFill} /> : green ? <GradientFill colors={['#1BA6EE', '#0A4DA3']} deg={160} /> : <GradientFill colors={ST_BG} deg={180} />}
              {!photo ? <View style={{ position: 'absolute', left: '50%', bottom: 0, width: 220 * scale, height: 300 * scale, marginLeft: -110 * scale, borderTopLeftRadius: 999, borderTopRightRadius: 999, backgroundColor: green ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)' }} /> : null}
              <TikTokChrome handle={handle} width={size.w} />
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)', opacity: editing ? 1 : 0 }]} />
              <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.7)', opacity: guides.v ? 1 : 0 }} />
              <View pointerEvents="none" style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.7)', opacity: guides.h ? 1 : 0 }} />

              {doc.overlays.map((o) => (
                <CanvasItem
                  key={o.id}
                  id={o.id}
                  x={o.x}
                  y={o.y}
                  size={size}
                  isText={false}
                  w={o.w}
                  selected={sel === o.id}
                  editing={editing}
                  onSelect={() => setSel(o.id)}
                  onEdit={() => undefined}
                  onMove={(p) => upd(o.id, p)}
                  onDrag={setDrag}
                  onGuides={setGuides}
                  onDrop={() => remove(o.id)}
                >
                  <View style={{ width: (o.w / 100) * size.w, aspectRatio: 4 / 5, overflow: 'hidden', boxShadow: '0 6px 18px rgba(0,0,0,0.35)', borderWidth: 1.5, borderColor: sel === o.id ? '#fff' : 'transparent' }}>
                    <MediaFill src={o.src} />
                  </View>
                  {sel === o.id && !drag ? <CornerButton side="right" icon="close" label="Delete" onPress={() => remove(o.id)} /> : null}
                </CanvasItem>
              ))}

              {doc.texts.filter((x) => !(editing && x.id === sel)).map((x) => {
                const on = sel === x.id;
                const maxW = (Math.min(x.w || 60, SAFE.r - SAFE.l) / 100) * size.w;
                return (
                  <CanvasItem
                    key={x.id}
                    id={x.id}
                    x={x.x}
                    y={x.y}
                    size={size}
                    isText
                    w={Math.min(x.w || 60, SAFE.r - SAFE.l)}
                    selected={on}
                    editing={editing}
                    onSelect={() => setSel(x.id)}
                    onEdit={() => {
                      setEditing(true);
                      setTab('color');
                    }}
                    onMove={(p) => upd(x.id, p)}
                    onDrag={setDrag}
                    onGuides={setGuides}
                    onDrop={() => remove(x.id)}
                    onPinch={(k, base) => setTextSize(x, base * k)}
                    pinchBase={x.size || 24}
                    opacity={editing ? 0.35 : script !== undefined && onScript && !on && !drag ? 0.45 : 1}
                  >
                    <View onLayout={(e) => heights.current.set(x.id, e.nativeEvent.layout.height)} style={{ maxWidth: maxW, padding: 8, borderRadius: 6, borderWidth: 1.5, borderColor: on ? 'rgba(255,255,255,0.95)' : 'transparent' }}>
                      <InlineText x={x} scale={scale} maxWidth={maxW - 16} />
                    </View>
                    {on && !drag ? (
                      <>
                        <CornerButton side="right" icon="edit" label="Edit text" onPress={() => { setEditing(true); setTab('color'); }} />
                        <CornerButton side="left" icon="close" label="Delete" onPress={() => remove(x.id)} />
                      </>
                    ) : null}
                  </CanvasItem>
                );
              })}

              {editT ? (
                <View pointerEvents="box-none" style={{ position: 'absolute', left: (editT.x / 100) * size.w, top: (editT.y / 100) * size.h, width: (Math.min(editT.w || 60, SAFE.r - SAFE.l) / 100) * size.w, transform: [{ translateX: -((Math.min(editT.w || 60, SAFE.r - SAFE.l) / 100) * size.w) / 2 }, { translateY: -20 }], alignItems: editT.align === 'left' ? 'flex-start' : editT.align === 'right' ? 'flex-end' : 'center' }}>
                  <EditingInput x={editT} scale={scale} onText={(t) => upd(editT.id, { text: t })} onRange={setRange} />
                </View>
              ) : null}

              {!doc.texts.length && !doc.overlays.length && !editing ? (
                <Text pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: '44%', textAlign: 'center', fontSize: 16, lineHeight: 22, fontWeight: '600', color: 'rgba(255,255,255,0.6)' }}>Tap to add text</Text>
              ) : null}

              <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 130, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 18, gap: 8, opacity: drag ? 1 : 0 }}>
                <GradientFill colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.75)']} deg={180} />
                <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: '#fff' }}>Drag here to delete</Text>
                <View style={{ width: 52, height: 52, borderRadius: 999, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="delete" size={24} color="#fff" />
                </View>
              </View>

              {(selT || selO) && !drag ? (
                <View style={{ position: 'absolute', left: 10, top: '50%', marginTop: -116, width: 40, height: 232, alignItems: 'center' }}>
                  <Icon name={selO ? 'photo_size_select_large' : 'format_line_spacing'} size={18} color="#fff" style={{ marginBottom: 8, transform: selO ? undefined : [{ rotate: '90deg' }] }} />
                  <GestureDetector gesture={slider}>
                    <View style={{ flex: 1, width: 40, alignItems: 'center' }}>
                      <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, width: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.28)' }} />
                      <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, width: 6, borderRadius: 3, backgroundColor: '#fff', height: `${sliderVal * 100}%` }} />
                      <View pointerEvents="none" style={{ position: 'absolute', width: 26, height: 26, borderRadius: 999, backgroundColor: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.45)', top: `${(1 - sliderVal) * 100}%`, marginTop: -13 }} />
                    </View>
                  </GestureDetector>
                </View>
              ) : null}
            </Pressable>

            {!editing ? (
              <View style={{ position: 'absolute', right: 10, top: 132, gap: 14, zIndex: 2 }}>
                {rail('text_fields', addText, 'Text')}
                {rail('add_photo_alternate', () => setPick(true), 'Overlay')}
              </View>
            ) : null}
            {onScript && !editing ? (
              <Press onPress={() => { setScrDraft(script ?? ''); setScr(true); }} style={{ position: 'absolute', left: '50%', top: 52, width: Math.min(280, size.w * 0.78), marginLeft: -Math.min(280, size.w * 0.78) / 2, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: 'rgba(20,20,24,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', zIndex: 3, alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <Icon name="subtitles" size={11} color="rgba(255,255,255,0.6)" />
                  <Text style={{ fontSize: 9, lineHeight: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Script</Text>
                  <Icon name="edit" size={10} color="rgba(255,255,255,0.6)" />
                </View>
                <Text numberOfLines={2} style={{ textAlign: 'center', fontSize: 11, lineHeight: 14, fontWeight: script ? '500' : '400', color: script ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)' }}>{script || 'Tap to write what the creator says'}</Text>
              </Press>
            ) : null}
          </View>

          {/* Bottom panel */}
          <View style={{ height: panelH, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: keyboard > 0 ? 8 : Math.max(insets.bottom, 24) }}>
            {editT ? (
              <Animated.View key={tab} entering={FadeIn.duration(160)} style={{ alignItems: 'center', gap: 12, width: '100%' }}>
                {hasRange ? <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginBottom: -6 }}>Styling selected words</Text> : null}
                {tab === 'font' ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                    {FONT_NAMES.map((l, i) => (
                      <View key={l}>{optBtn(editT.font === i, () => upd(editT.id, { font: i }), <Text style={{ fontSize: 14, fontWeight: '600', color: editT.font === i ? '#000' : '#fff', fontFamily: i === 1 ? 'Georgia' : i === 3 ? 'Courier New' : undefined }}>{l}</Text>, 72)}</View>
                    ))}
                  </ScrollView>
                ) : tab === 'align' ? (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    {(['left', 'center', 'right'] as const).map((v) => (
                      <View key={v}>{optBtn(editT.align === v, () => upd(editT.id, { align: v }), <Icon name={`format_align_${v}` as IconName} size={20} color={editT.align === v ? '#000' : '#fff'} />)}</View>
                    ))}
                    <View style={{ width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: 4 }} />
                    {([['align_horizontal_left', { x: 24 }], ['align_horizontal_center', { x: 50 }], ['align_horizontal_right', { x: 76 }], ['align_vertical_center', { y: 50 }]] as const).map(([n, p]) => (
                      <View key={n}>{optBtn(false, () => upd(editT.id, p), <Icon name={n} size={20} color="#fff" />)}</View>
                    ))}
                  </View>
                ) : tab === 'style' ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {ST_STYLES.map((k) => {
                      const on = hasRange ? false : editT.style === k;
                      const r = stRender({ ...editT, style: k, size: 13, color: k === 'none' && editT.color === '#FFFFFF' && !on ? '#fff' : editT.color }, 1);
                      return <View key={k}>{optBtn(on, () => style({ style: k }), <View style={[r.box, { paddingHorizontal: 6, paddingVertical: 2 }]}><Text style={[r.text, { fontSize: 13, lineHeight: 16 }]}>Aa</Text></View>, 52)}</View>;
                    })}
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {ST_SWATCH.map((c) => (
                      <Press key={c} onPress={() => style({ color: c })} style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: c, borderWidth: 2.5, borderColor: '#fff', boxShadow: !hasRange && editT.color === c ? '0 0 0 2px #000, 0 0 0 4px #fff' : '0 1px 3px rgba(0,0,0,0.4)' }} />
                    ))}
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 2, padding: 4, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)' }}>
                  {tabBtn('text_fields', 'font')}
                  {tabBtn('palette', 'color')}
                  {tabBtn(STYLE_ICON[editT.style] ?? 'title', 'style')}
                  {tabBtn(editT.align === 'left' ? 'format_align_left' : editT.align === 'right' ? 'format_align_right' : 'format_align_center', 'align')}
                </View>
              </Animated.View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', justifyContent: 'center' }}>
                {onPrev !== undefined ? <Arrow dir="left" on={!!onPrev} onPress={onPrev ?? undefined} style={{ marginRight: 'auto' }} /> : null}
                {chips}
                {footer}
                {onNext !== undefined ? <Arrow dir="right" on={!!onNext} onPress={onNext ?? undefined} style={{ marginLeft: 'auto' }} /> : null}
              </View>
            )}
          </View>

          {onScript ? (
            <>
              <Animated.View pointerEvents={scr ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 8 }, scrimStyle]}>
                <Pressable style={{ flex: 1 }} onPress={() => setScr(false)} />
              </Animated.View>
              <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#17171C', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 24) + (keyboard > 0 ? keyboard - insets.bottom : 0), gap: 12, zIndex: 9 }, scrStyle]}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', alignSelf: 'center' }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', color: '#fff' }}>Script</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon name="subtitles" size={14} color="rgba(255,255,255,0.55)" />
                    <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: 'rgba(255,255,255,0.55)' }}>Teleprompter</Text>
                  </View>
                </View>
                <TextInput value={scrDraft} onChangeText={setScrDraft} multiline placeholder="What the creator reads, word for word" placeholderTextColor="rgba(255,255,255,0.4)" style={{ minHeight: 150, backgroundColor: '#26262D', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 19, lineHeight: 27, fontWeight: '600', color: '#fff', textAlignVertical: 'top' }} />
                <Press onPress={() => { onScript(scrDraft.trim()); setScr(false); }} style={{ height: 52, borderRadius: 999, backgroundColor: color.blue, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: '#fff' }}>Save script</Text>
                </Press>
              </Animated.View>
            </>
          ) : null}
          <MediaPickerSheet open={pick} onClose={() => setPick(false)} onPick={addOverlay} />
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function Arrow({ dir, on, onPress, style }: { dir: 'left' | 'right'; on: boolean; onPress?: () => void; style?: object }) {
  return (
    <Press disabled={!on} onPress={onPress} style={[{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', opacity: on ? 1 : 0.3 }, style]}>
      <Icon name={dir === 'left' ? 'chevron_left' : 'chevron_right'} size={22} color="#fff" />
    </Press>
  );
}

function CornerButton({ side, icon, label, onPress }: { side: 'left' | 'right'; icon: IconName; label: string; onPress: () => void }) {
  return (
    <Press accessibilityLabel={label} onPress={onPress} style={{ position: 'absolute', [side]: -14, top: -14, width: 28, height: 28, borderRadius: 999, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
      <Icon name={icon} size={icon === 'edit' ? 15 : 16} weight={700} color="#000" />
    </Press>
  );
}

/** Text drawn in place at its own size; width follows the content up to maxWidth. */
function InlineText({ x, scale, maxWidth }: { x: StText; scale: number; maxWidth: number }) {
  const r = stRender(x, scale);
  return (
    <View style={{ maxWidth }}>
      <StTextView x={{ ...x, x: 50, y: 50, w: 100 }} width={maxWidth} height={(r.text.lineHeight ?? 24) * Math.max(1, x.text.split('\n').length)} style={{ position: 'relative', left: 0, top: 0, transform: [] }} />
    </View>
  );
}

function EditingInput({ x, scale, onText, onRange }: { x: StText; scale: number; onText: (t: string) => void; onRange: (r: Range) => void }) {
  const r = stRender({ ...x, style: x.style === 'bg' || x.style === 'inv-bg' ? x.style : 'none' }, scale);
  return (
    <View style={[r.box, { minWidth: 40 }]}>
      <TextInput
        autoFocus
        multiline
        value={x.text}
        onChangeText={onText}
        onSelectionChange={(e) => onRange(e.nativeEvent.selection)}
        selectionColor="#fff"
        style={[r.text, { padding: 0, margin: 0, textShadowColor: 'transparent', minWidth: 40 }]}
      />
    </View>
  );
}

type CanvasItemProps = {
  id: string;
  x: number;
  y: number;
  size: { w: number; h: number };
  isText: boolean;
  /** Width in percent, for the clamp. */
  w: number;
  selected: boolean;
  editing: boolean;
  opacity?: number;
  pinchBase?: number;
  onSelect: () => void;
  onEdit: () => void;
  onMove: (p: { x: number; y: number }) => void;
  onDrag: (on: boolean) => void;
  onGuides: (g: { v: boolean; h: boolean }) => void;
  onDrop: () => void;
  onPinch?: (k: number, base: number) => void;
  children: ReactNode;
};

/** A draggable, pinchable, tappable item on the canvas. Positions are percent of the frame. */
function CanvasItem({ x, y, size, isText, w, selected, editing, opacity = 1, pinchBase = 24, onSelect, onEdit, onMove, onDrag, onGuides, onDrop, onPinch, children }: CanvasItemProps) {
  const g = useRef({ origin: { x, y }, cur: { x, y }, base: pinchBase }).current;
  const tapped = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .onEnd(() => {
          if (editing) return;
          if (selected && isText) onEdit();
          else onSelect();
        }),
    [editing, selected, isText, onEdit, onSelect],
  );
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(5)
        .onStart(() => {
          if (editing) return;
          g.origin = { x, y };
          g.cur = { x, y };
          onDrag(true);
          onSelect();
        })
        .onUpdate((e) => {
          if (editing) return;
          let nx = g.origin.x + (e.translationX / size.w) * 100;
          let ny = g.origin.y + (e.translationY / size.h) * 100;
          const gv = Math.abs(nx - 50) < 2.5;
          const gh = Math.abs(ny - 50) < 2.5;
          if (gv) nx = 50;
          if (gh) ny = 50;
          onGuides({ v: gv, h: gh });
          const half = w / 2;
          const lo = isText ? SAFE.l + half : half;
          const hi = isText ? SAFE.r - half : 84 - half;
          g.cur = { x: Math.max(lo, Math.min(hi, nx)), y: Math.max(SAFE.t, Math.min(99, ny)) };
          onMove(g.cur);
        })
        .onEnd(() => {
          onDrag(false);
          onGuides({ v: false, h: false });
          if (g.cur.y > 91) onDrop();
        })
        .onFinalize(() => {
          onDrag(false);
          onGuides({ v: false, h: false });
        }),
    [editing, x, y, size.w, size.h, w, isText, onDrag, onSelect, onGuides, onMove, onDrop, g],
  );
  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .enabled(!!onPinch && !editing)
        .onStart(() => {
          g.base = pinchBase;
          onSelect();
        })
        .onUpdate((e) => onPinch?.(e.scale, g.base)),
    [onPinch, editing, pinchBase, onSelect, g],
  );
  const gesture = Gesture.Simultaneous(pinch, Gesture.Race(pan, tapped));
  return (
    <GestureDetector gesture={gesture}>
      <View style={{ position: 'absolute', left: (x / 100) * size.w, top: (y / 100) * size.h, opacity, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: '-50%' as never }, { translateY: '-50%' as never }] }}>
        {children}
      </View>
    </GestureDetector>
  );
}

export { ST_FONTS as STORY_FONTS };

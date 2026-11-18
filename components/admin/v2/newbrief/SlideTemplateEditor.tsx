// The slideshow template editor (BRIEFS.md 4a "Open template" for Slideshow,
// V2Slides SlideEditorScreen), mounted over the brief screen like the reel
// TemplateEditor. One slide per template clip: the 9:16 preview of the
// current slide (tap to edit its words and pictures in the creator's Story
// editor), slide arrows, the thumbnail strip with Add slide, and Text /
// Move / Delete actions. Save folds the slides back onto the clips;
// Close discards.
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ClipDoc } from '../../../../lib/brief-library';
import { moveSlide, newTemplateSlide, slideshowToSlides, slidesToTemplate, type TemplateSlide } from '../../../../lib/brief-template-slides';
import { color, motion, radius } from '../../../../theme/v2';
import { Icon, Press, type IconName } from '../../../v2';
import { StoryEditor } from '../../../creator/v2/story/StoryEditor';
import { ClipFrame } from './ClipFrame';
import type { TemplateEditorProps } from './TemplateEditor';

/** A theme colour at an opacity, so the dark chrome reads only tokens. */
function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const DIM = alpha(color.white, 0.6);
const CHIP = alpha(color.white, 0.14);
const SHADE = alpha(color.ink, 0.55);
const THUMB_W = 60;
const THUMB_H = 90;

export function SlideTemplateEditor({ g, startClipId, onChange, onClose }: TemplateEditorProps) {
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const [slides, setSlides] = useState<TemplateSlide[]>(() => slideshowToSlides(g));
  const [idx, setIdxRaw] = useState(() => Math.max(0, slides.findIndex((s) => s.id === startClipId)));
  const [editing, setEditing] = useState<string | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  const n = slides.length;
  const i = Math.min(idx, n - 1);
  const cur = slides[i];
  const setIdx = (j: number) => setIdxRaw(Math.max(0, Math.min(n - 1, j)));

  const setDoc = (id: string, doc: ClipDoc) => setSlides((ss) => ss.map((s) => (s.id === id ? { ...s, doc } : s)));
  const add = () => {
    const s = newTemplateSlide();
    setSlides((ss) => {
      const a = ss.slice();
      a.splice(i + 1, 0, s);
      return a;
    });
    setIdxRaw(i + 1);
    setEditing(s.id);
  };
  const del = () => {
    if (n < 2) return;
    setSlides((ss) => ss.filter((s) => s.id !== cur.id));
    setIdxRaw(Math.min(i, n - 2));
  };
  const move = (d: number) => {
    const j = i + d;
    if (j < 0 || j >= n) return;
    setSlides((ss) => moveSlide(ss, i, j));
    setIdxRaw(j);
  };
  const save = () => {
    onChange((c) => ({ ...c, clips: slidesToTemplate(slides, c) }));
    onClose();
  };

  // Preview: as tall as the stage allows, 9:16.
  const fh = Math.max(100, stage.h - 12);
  const fw = Math.min(W - 48, (fh * 9) / 16);
  const fH = (fw * 16) / 9;

  const action = (icon: IconName, label: string, onPress: () => void, disabled = false) => (
    <Press key={label} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.action, { opacity: disabled ? 0.35 : 1 }]}>
      <Icon name={icon} size={24} color={color.white} />
      <Text style={styles.actionLabel}>{label}</Text>
    </Press>
  );
  const arrow = (dir: 'left' | 'right') => {
    const off = dir === 'left' ? i === 0 : i >= n - 1;
    return (
      <Press accessibilityRole="button" accessibilityLabel={dir === 'left' ? 'Previous slide' : 'Next slide'} disabled={off} onPress={() => setIdx(i + (dir === 'left' ? -1 : 1))} style={[styles.arrow, { opacity: off ? 0.35 : 1 }]}>
        <Icon name={dir === 'left' ? 'chevron_left' : 'chevron_right'} size={28} color={color.white} />
      </Press>
    );
  };

  const ei = editing ? slides.findIndex((s) => s.id === editing) : -1;
  const es = ei >= 0 ? slides[ei] : null;

  return (
    <Animated.View entering={FadeIn.duration(motion.tabInShort)} style={[StyleSheet.absoluteFill, styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Press accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
          <Icon name="close" size={24} color={color.white} />
        </Press>
        <Text numberOfLines={2} style={styles.title}>
          {g.title.trim() || 'Template'}
        </Text>
        <Press accessibilityRole="button" onPress={save} style={styles.save}>
          <Text style={styles.saveLabel}>Save</Text>
        </Press>
      </View>

      <View style={styles.stage} onLayout={(e) => setStage({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {stage.h > 0 && cur ? (
          <Press accessibilityRole="button" accessibilityLabel={`Edit slide ${i + 1}`} onPress={() => setEditing(cur.id)} scaleTo={0.99} style={{ width: fw, height: fH, borderRadius: 12, overflow: 'hidden' }}>
            <Animated.View key={cur.id} entering={FadeIn.duration(motion.tabInShort)}>
              <ClipFrame width={fw} height={fH} texts={cur.doc.texts} overlays={cur.doc.overlays} cta={!!g.clips.find((c) => c.id === cur.id)?.cta} />
            </Animated.View>
            <View pointerEvents="none" style={styles.counter}>
              <Text style={styles.counterText}>{`${i + 1}/${n}`}</Text>
            </View>
            <View pointerEvents="none" style={styles.hint}>
              <View style={styles.hintPill}>
                <Icon name="edit" size={14} color={color.white} />
                <Text style={styles.hintText}>{cur.doc.texts.length || cur.doc.overlays.length ? 'Tap to edit' : 'Tap to add text'}</Text>
              </View>
            </View>
            <View pointerEvents="none" style={styles.dots}>
              {slides.map((s, k) => (
                <View key={s.id} style={{ width: k === i ? 14 : 5, height: 5, borderRadius: 3, backgroundColor: k === i ? color.white : alpha(color.white, 0.45) }} />
              ))}
            </View>
          </Press>
        ) : null}
      </View>

      <View style={styles.nav}>
        {arrow('left')}
        <Text style={styles.navText}>
          Slide {i + 1}
          <Text style={{ color: DIM }}> / {n}</Text>
        </Text>
        {arrow('right')}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, height: 110 }} contentContainerStyle={styles.strip}>
        {slides.map((s, k) => {
          const on = k === i;
          return (
            <Press key={s.id} accessibilityRole="button" accessibilityLabel={`Slide ${k + 1}`} accessibilityState={{ selected: on }} onPress={() => setIdx(k)} style={[styles.thumb, { boxShadow: on ? `0 0 0 2.5px ${color.white}` : `inset 0 0 0 1px ${alpha(color.white, 0.08)}` }]}>
              <ClipFrame width={THUMB_W} height={THUMB_H} texts={s.doc.texts} overlays={s.doc.overlays} />
              <View style={[styles.badge, { backgroundColor: on ? color.white : SHADE }]}>
                <Text style={[styles.badgeText, { color: on ? color.ink : color.white }]}>{k + 1}</Text>
              </View>
            </Press>
          );
        })}
        <Press accessibilityRole="button" accessibilityLabel="Add slide" onPress={add} style={[styles.thumb, styles.addTile]}>
          <Icon name="add" size={24} color={color.white} />
        </Press>
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {action('text_fields', 'Text', () => cur && setEditing(cur.id), !cur)}
        {action('swap_horiz', i >= n - 1 ? 'Move earlier' : 'Move later', () => move(i >= n - 1 ? -1 : 1), n < 2)}
        {action('delete', 'Delete', del, n < 2)}
      </View>

      {es ? (
        <StoryEditor
          doc={es.doc}
          onChange={(d) => setDoc(es.id, d)}
          title={`Slide ${ei + 1}`}
          onDone={() => setEditing(null)}
          onBack={() => setEditing(null)}
          onPrev={
            ei > 0
              ? () => {
                  setEditing(slides[ei - 1].id);
                  setIdxRaw(ei - 1);
                }
              : null
          }
          onNext={
            ei < n - 1
              ? () => {
                  setEditing(slides[ei + 1].id);
                  setIdxRaw(ei + 1);
                }
              : null
          }
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 50, backgroundColor: color.ink },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 18, fontWeight: '600', color: color.white },
  save: { height: 36, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: color.blue, justifyContent: 'center' },
  saveLabel: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: color.white },
  stage: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  counter: { position: 'absolute', top: 12, right: 14, height: 24, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: SHADE, justifyContent: 'center' },
  counterText: { fontSize: 12, lineHeight: 24, fontWeight: '600', color: color.white },
  hint: { position: 'absolute', left: 0, right: 0, bottom: 28, alignItems: 'center' },
  hintPill: { height: 30, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: SHADE, flexDirection: 'row', alignItems: 'center', gap: 6 },
  hintText: { fontSize: 12, lineHeight: 30, fontWeight: '600', color: color.white },
  dots: { position: 'absolute', left: 0, right: 0, bottom: 10, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navText: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: color.white, fontVariant: ['tabular-nums'] },
  strip: { gap: 8, alignItems: 'center', paddingHorizontal: 14 },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: 10, overflow: 'hidden' },
  addTile: { backgroundColor: CHIP, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', left: 5, top: 5, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, lineHeight: 18, fontWeight: '700' },
  bar: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 12, borderTopWidth: 1, borderTopColor: alpha(color.white, 0.08) },
  action: { minWidth: 60, alignItems: 'center', gap: 5 },
  actionLabel: { fontSize: 11, lineHeight: 13, fontWeight: '500', color: color.white },
});

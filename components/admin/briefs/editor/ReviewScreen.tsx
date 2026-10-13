// Review (SSFlow.jsx ReviewScreen): the finished post as it scrolls on the
// FYP. Swipe between slides, Watch or Script for reels, then Add to week.

import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pickFeature, type LibraryFeature } from '../../../../lib/library-api';
import { briefTone, color, type as typeToken } from '../../../../theme/tokens';
import { StepStrip, type BriefStep } from '../../../shared/briefs';
import { Icon } from '../../../ui/Icon';
import { clamp, SLIDE_RATIO } from '../canvas/layout';
import { NextButton } from '../canvas/CanvasFooter';
import { GradientFill } from '../GradientFill';
import { Shot } from '../Shot';
import { SlideCard } from '../SlideCard';
import { FypChrome } from './FypChrome';
import type { EditorSlide } from './types';
import type { Gap } from './useBriefEditor';

const FOOTER_H = 112;

type ReviewItem = EditorSlide & { who?: 'creator'; label?: string };

export function ReviewScreen({
  slides,
  caption,
  tags,
  features,
  reel,
  story,
  gap,
  openCount,
  steps,
  current,
  onJump,
  onBack,
  onSave,
  saving = false,
  popup = false,
}: {
  slides: EditorSlide[];
  caption: string;
  tags: string[];
  features: LibraryFeature[];
  reel: boolean;
  story: boolean;
  gap: Gap;
  openCount: boolean;
  steps: BriefStep[];
  current: number;
  onJump: (id: string) => void;
  onBack: () => void;
  onSave?: () => void;
  saving?: boolean;
  /** Preview from Details: a close button and a "Preview" footer. */
  popup?: boolean;
}) {
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const W = Math.min(winW, Math.floor((winH - insets.top - FOOTER_H) / SLIDE_RATIO));
  const H = Math.round(W * SLIDE_RATIO);
  const items = useMemo<ReviewItem[]>(() => {
    if (!story) return slides;
    const mid: ReviewItem[] = Array.from({ length: gap.min }).map((_, i) => ({
      id: 1000 + i,
      role: 'point',
      text: '',
      shot: '',
      inset_feature_id: null,
      who: 'creator',
      label: openCount ? "Creator's clip" : `Creator's clip ${i + 1}`,
    }));
    return [slides[0], ...mid, slides[slides.length - 1]];
  }, [slides, story, gap.min, openCount]);

  const [tab, setTab] = useState<'watch' | 'script'>('watch');
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const offset = useSharedValue(0);
  const drag = useSharedValue(0);

  useEffect(() => {
    offset.value = withTiming(-i * W, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, [i, W, offset]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setI((k) => {
        if (k >= items.length - 1) {
          setPlaying(false);
          return k;
        }
        return k + 1;
      });
    }, 2000);
    return () => clearInterval(id);
  }, [playing, items.length]);

  const step = (d: number) => setI((k) => clamp(k + d, 0, items.length - 1));
  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-16, 16])
    .onChange((e) => {
      drag.value = e.translationX;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 50) runOnJS(step)(e.translationX < 0 ? 1 : -1);
      drag.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
    });
  const trackStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value + drag.value }] }));

  const curItem = items[i];
  const lib = (id: string | null) => (id ? pickFeature(features, id) : null);
  const chipTop = reel ? 56 : 54;
  const chipLeft = reel ? 14 : 60;

  const tabs =
    reel ? (
      <View style={styles.tabs}>
        {(
          [
            ['watch', 'Watch'],
            ['script', 'Script'],
          ] as const
        ).map(([k, l]) => (
          <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)} style={[styles.tabPill, { backgroundColor: tab === k ? color.white : 'transparent' }]}>
            <Text style={[styles.tabText, { color: tab === k ? color.ink : color.whiteA90 }]}>{l}</Text>
          </Pressable>
        ))}
      </View>
    ) : null;

  const backBtn = (
    <Pressable accessibilityRole="button" accessibilityLabel={popup ? 'Close' : 'Back'} onPress={onBack} style={styles.back}>
      <Icon name={popup ? 'x' : 'chevron-left'} size={20} color={color.white} />
    </Pressable>
  );

  return (
    <Animated.View entering={FadeIn.duration(240)} style={[StyleSheet.absoluteFill, styles.root]}>
      <View style={{ height: insets.top }} />
      {reel && tab === 'script' ? (
        <View style={[styles.frame, { width: W, height: H, backgroundColor: briefTone.canvas.bg }]}>
          <ScrollView contentContainerStyle={styles.script} showsVerticalScrollIndicator={false}>
            {items.map((s, k) => {
              const c = s.role === 'cta';
              const cov = s.role === 'cover';
              const cr = s.who === 'creator';
              const it = c ? lib(s.inset_feature_id) : null;
              return (
                <View key={s.id} style={[styles.scriptRow, c ? styles.scriptRowCta : cr ? styles.scriptRowCreator : null]}>
                  <View style={[styles.scriptDot, { backgroundColor: c ? color.blue500 : cov ? color.white : color.whiteA16 }]}>
                    {c ? <Icon name="zap" size={13} color={color.white} /> : cov ? <Icon name="mic" size={13} color={color.ink} /> : cr ? <Icon name="video" size={13} color={color.white} /> : <Text style={styles.scriptDotText}>{k}</Text>}
                  </View>
                  <View style={styles.scriptBody}>
                    <Text style={[styles.scriptLabel, { color: c ? color.blue300 : color.whiteA60 }]}>
                      {c ? 'CTA \u00b7 lands anywhere per creator' : cov ? 'Hook \u00b7 script below, word for word' : cr ? 'Creator records' : story ? `Beat ${k}` : 'Point \u00b7 order shuffled per creator'}
                    </Text>
                    <Text style={[styles.scriptText, { fontWeight: cov ? '700' : '600', color: cr ? color.whiteA60 : color.white }]}>{s.text || s.label || ''}</Text>
                    {s.shot ? <Text style={styles.scriptNote}>{s.shot}</Text> : null}
                  </View>
                  {it ? <Shot feature={it} w={44} video /> : null}
                </View>
              );
            })}
            {caption ? (
              <View style={[styles.scriptRow, styles.scriptCaption]}>
                <View style={styles.scriptBody}>
                  <Text style={[styles.scriptLabel, { color: color.whiteA60 }]}>Caption</Text>
                  <Text style={styles.scriptCaptionText}>
                    {caption} <Text style={styles.bold}>{tags.map((t) => `#${t}`).join(' ')}</Text>
                  </Text>
                </View>
              </View>
            ) : null}
          </ScrollView>
          {backBtn}
          {tabs}
        </View>
      ) : (
        <View style={[styles.frame, { width: W, height: H }]}>
          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.track, { width: W * items.length, height: H }, trackStyle]}>
              {items.map((s) => (
                <View key={s.id} style={{ width: W, height: H, backgroundColor: briefTone.canvas.bg }}>
                  {s.who !== 'creator' ? <GradientFill stops={[color.slate500, briefTone.canvas.chrome]} bands={12} /> : null}
                  <SlideCard
                    w={W}
                    bare
                    text={s.text || undefined}
                    inset={lib(s.inset_feature_id)}
                    box={s.box}
                    insetBox={s.inset_box}
                    tstyle={s.tstyle}
                    who={s.who ?? 'mixed'}
                    label={s.label}
                    video={reel}
                    background={[color.slate500, briefTone.canvas.chrome]}
                    style={s.who === 'creator' ? styles.creatorFrame : styles.clear}
                  />
                </View>
              ))}
            </Animated.View>
          </GestureDetector>
          <FypChrome caption={caption} tags={tags} w={W} h={H} index={i} count={items.length} reel={reel} />
          {reel ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={playing ? 'Pause' : 'Play'}
              onPress={() => {
                if (!playing && i >= items.length - 1) setI(0);
                setPlaying(!playing);
              }}
              style={[styles.play, { backgroundColor: playing ? color.white : color.inkA55 }]}
            >
              <Icon name={playing ? 'pause' : 'play'} size={18} color={playing ? color.ink : color.white} />
            </Pressable>
          ) : null}
          {reel ? (
            <View style={styles.progress}>
              <View style={[styles.progressFill, { width: `${((i + 1) / items.length) * 100}%` }]} />
            </View>
          ) : null}
          {tabs}
          <View style={[styles.counter, { top: chipTop }]}>
            <Text style={styles.chipText}>{reel ? `Clip ${i + 1} of ${items.length}` : `${i + 1} / ${items.length}`}</Text>
          </View>
          {curItem?.role === 'cta' || (!story && curItem?.inset_feature_id) ? (
            <View style={[styles.chip, { top: chipTop, left: chipLeft, backgroundColor: color.blue500 }]}>
              <Icon name="zap" size={12} color={color.white} />
              <Text style={styles.chipText}>CTA · lands anywhere, number refilled per creator</Text>
            </View>
          ) : null}
          {!story && curItem?.role === 'point' ? (
            <View style={[styles.chip, { top: chipTop, left: chipLeft }]}>
              <Icon name="arrow-left-right" size={12} color={color.white} />
              <Text style={styles.chipText}>Order shuffled per creator</Text>
            </View>
          ) : null}
          {story && curItem?.who === 'creator' ? (
            <View style={[styles.chip, { top: chipTop, left: chipLeft }]}>
              <Icon name={reel ? 'video' : 'camera'} size={12} color={color.white} />
              <Text style={styles.chipText}>{openCount ? 'Creator picks the count' : `Creator records ${gap.min}`}</Text>
            </View>
          ) : null}
          {backBtn}
        </View>
      )}
      {popup ? (
        <View style={styles.previewFooter}>
          <Text style={styles.previewText}>Preview</Text>
        </View>
      ) : (
        <View style={styles.footer}>
          <View style={styles.strip}>
            <StepStrip steps={steps} current={current} dark onJump={onJump} />
          </View>
          <NextButton label="Add to week" ok={!saving} onPress={() => onSave?.()} icon="check" />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: color.ink900, alignItems: 'center', zIndex: 70 },
  frame: { borderRadius: 22, overflow: 'hidden' },
  track: { flexDirection: 'row' },
  clear: { backgroundColor: 'transparent' },
  creatorFrame: { backgroundColor: briefTone.canvas.bg },
  script: { paddingTop: 62, paddingHorizontal: 16, paddingBottom: 20, gap: 8 },
  scriptRow: { flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: color.whiteA16, borderWidth: 1, borderColor: 'transparent' },
  scriptRowCta: { backgroundColor: color.blue700, borderColor: color.blue500 },
  scriptRowCreator: { borderStyle: 'dashed', borderColor: color.whiteA28 },
  scriptDot: { width: 26, height: 26, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  scriptDotText: { fontFamily: typeToken.font.ui, fontWeight: '800', fontSize: 12, color: color.white },
  scriptBody: { flex: 1, minWidth: 0, gap: 4 },
  scriptLabel: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' },
  scriptText: { fontFamily: typeToken.font.ui, fontSize: 15, lineHeight: 15 * 1.35 },
  scriptNote: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 12.5, color: color.whiteA60 },
  scriptCaption: { marginTop: 6, borderColor: 'transparent' },
  scriptCaptionText: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 14, lineHeight: 14 * 1.4, color: color.white },
  bold: { fontWeight: '700' },
  tabs: { position: 'absolute', top: 12, alignSelf: 'center', flexDirection: 'row', gap: 2, padding: 3, borderRadius: 999, backgroundColor: color.scrimStrong },
  tabPill: { height: 30, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center' },
  tabText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 12.5 },
  back: { position: 'absolute', top: 10, left: 12, width: 40, height: 40, borderRadius: 999, backgroundColor: color.inkA55, alignItems: 'center', justifyContent: 'center' },
  play: { position: 'absolute', left: 58, top: 10, width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  progress: { position: 'absolute', left: 12, right: 12, bottom: 6, height: 3, borderRadius: 99, backgroundColor: color.whiteA28, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 99, backgroundColor: color.white },
  counter: { position: 'absolute', right: 14, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, backgroundColor: color.scrim },
  chip: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, backgroundColor: color.scrim },
  chipText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 12, color: color.white },
  previewFooter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  previewText: { fontFamily: typeToken.font.ui, fontWeight: '600', fontSize: 13, color: color.whiteA60 },
  footer: { flex: 1, minHeight: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 6 },
  strip: { flex: 1, minWidth: 0 },
});

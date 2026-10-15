// Review: the finished post as it scrolls on the For You page, swipe between
// slides, Edit, thumbnails and Submit for approval. Reels pass their own
// stage and get Watch and Script tabs. From SSFlow.jsx ReviewScreen (creator).
import { useRef, useState, type JSX, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pickFeature, type LibraryFeature } from '../../../lib/library-api';
import { briefTone, color, type as typeToken } from '../../../theme/tokens';
import { Icon, type IconName } from '../../ui/Icon';
import { FeatureShot } from './FeatureShot';
import { FypChrome } from './FypChrome';
import { MiniSlide, SLIDE_RATIO } from './MiniSlide';
import type { CreatorSlide } from './model';

export type ScriptRow = { key: string; role: 'cover' | 'point' | 'cta' | 'creator'; text: string; note?: string; feature?: LibraryFeature | null };

export type ReviewStepProps = {
  format: 'slideshow' | 'reel';
  slides: CreatorSlide[];
  feature: LibraryFeature | null;
  /** Slideshows: every library feature, so each inset slide shows its own feature. */
  features?: LibraryFeature[];
  caption: string;
  tags: string;
  handle: string;
  avatarUri: string | null;
  initial?: number;
  /** Reels: the player, drawn in the frame instead of the slide pager. */
  stage?: ReactNode;
  scriptRows?: ScriptRow[];
  /** Reel thumbnails per clip, in order (first frame of each). */
  thumbs?: (string | null)[];
  submitting: boolean;
  /** Shown next to the spinner while sending, e.g. "Uploading 3 of 8". */
  submitLabel?: string;
  onBack: () => void;
  onEdit: (index: number) => void;
  onSubmit: () => void;
};

export function ReviewStep(props: ReviewStepProps): JSX.Element {
  const { format, slides, feature, features, caption, tags, handle, avatarUri, initial = 0, stage, scriptRows, thumbs, submitting, submitLabel, onBack, onEdit, onSubmit } = props;
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const [areaH, setAreaH] = useState(0);
  const [tab, setTab] = useState<'watch' | 'script'>('watch');
  const [i, setI] = useState(Math.min(initial, Math.max(0, slides.length - 1)));
  const list = useRef<FlatList<CreatorSlide>>(null);
  const reel = format === 'reel';
  const W = Math.max(200, Math.min(screenW, Math.floor((areaH || 600) / SLIDE_RATIO)));
  const H = Math.round(W * SLIDE_RATIO);
  const count = slides.length;

  const go = (k: number) => {
    setI(k);
    list.current?.scrollToIndex({ index: k, animated: true });
  };

  const tabs = (
    <View style={styles.tabs}>
      {(['watch', 'script'] as const).map((k) => (
        <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)} style={[styles.tab, tab === k ? styles.tabOn : null]}>
          <Text style={[styles.tabText, { color: tab === k ? color.ink : color.whiteA90 }]}>{k === 'watch' ? 'Watch' : 'Script'}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.area} onLayout={(e) => setAreaH(e.nativeEvent.layout.height)}>
        <View style={[styles.frame, { width: W, height: H }]}>
          {reel && tab === 'script' ? (
            <ScrollView contentContainerStyle={styles.script}>
              {(scriptRows ?? []).map((r, k) => {
                const c = r.role === 'cta';
                const cov = r.role === 'cover';
                const cr = r.role === 'creator';
                const label = c
                  ? 'CTA \u00b7 your plug'
                  : cov
                    ? 'Hook \u00b7 script below, word for word'
                    : cr
                      ? 'Your clip'
                      : `Point ${k}`;
                return (
                  <View key={r.key} style={[styles.scriptRow, c ? styles.scriptRowCta : cr ? styles.scriptRowCreator : null]}>
                    <View style={[styles.scriptN, { backgroundColor: c ? color.blue500 : cov ? color.white : color.whiteA16 }]}>
                      {c ? <Icon name="zap" size={13} color={color.white} /> : cov ? <Icon name="mic" size={13} color={color.ink} /> : cr ? <Icon name="video" size={13} color={color.white} /> : <Text style={styles.scriptNText}>{k}</Text>}
                    </View>
                    <View style={styles.scriptBody}>
                      <Text style={[styles.scriptLabel, { color: c ? color.blue300 : color.whiteA60 }]}>{label}</Text>
                      <Text style={[styles.scriptText, { fontWeight: cov ? '700' : '600', color: cr ? color.whiteA60 : color.white }]}>{r.text}</Text>
                      {r.note ? <Text style={styles.scriptNote}>{r.note}</Text> : null}
                    </View>
                    {c && r.feature ? <FeatureShot feature={r.feature} w={44} video /> : null}
                  </View>
                );
              })}
              {caption ? (
                <View style={[styles.scriptRow, styles.scriptCaption]}>
                  <View style={styles.scriptBody}>
                    <Text style={[styles.scriptLabel, { color: color.whiteA60 }]}>Caption</Text>
                    <Text style={styles.scriptText}>
                      {caption} <Text style={styles.bold}>{tags}</Text>
                    </Text>
                  </View>
                </View>
              ) : null}
            </ScrollView>
          ) : stage ? (
            <View style={StyleSheet.absoluteFill}>{stage}</View>
          ) : (
            <FlatList
              ref={list}
              data={slides}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={i}
              getItemLayout={(_d, k) => ({ length: W, offset: W * k, index: k })}
              keyExtractor={(s) => s.id}
              onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / W))}
              renderItem={({ item }) => (
                <View style={{ width: W, height: H, backgroundColor: briefTone.canvas.bg }}>
                  <MiniSlide
                    w={W}
                    bare
                    text={item.text}
                    photoUri={item.photo?.uri}
                    photoCrop={item.photo?.crop}
                    feature={item.insetFeatureId ? (features ? pickFeature(features, item.insetFeatureId) : feature) : null}
                    layout={item}
                    textScale={item.tstyle?.size ?? 1}
                    who={item.photo ? 'manager' : 'creator'}
                    label={item.photo ? undefined : 'Your photo'}
                  />
                </View>
              )}
            />
          )}
          {!(reel && tab === 'script') ? (
            <FypChrome caption={caption} tags={tags} handle={handle} avatarUri={avatarUri} format={format} index={i} count={count} />
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.back}>
            <Icon name="chevron-left" size={20} color={color.white} />
          </Pressable>
          {reel ? tabs : null}
          {!(reel && tab === 'script') ? (
            <>
              <View style={styles.countPill}>
                <Text style={styles.pillText}>{reel ? `Clip ${i + 1} of ${count}` : `${i + 1} / ${count}`}</Text>
              </View>
              {slides[i]?.role === 'cta' ? (
                <View style={[styles.ctaPill, { left: reel ? 14 : 60 }]}>
                  <Icon name="zap" size={12} color={color.white} />
                  <Text style={styles.pillText}>Your plug slide</Text>
                </View>
              ) : null}
              <Pressable accessibilityRole="button" onPress={() => onEdit(i)} style={styles.edit}>
                <Icon name="pencil" size={15} color={color.ink} />
                <Text style={styles.editText}>Edit</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
      <View style={[styles.footer, { paddingBottom: Math.max(6, insets.bottom) }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbsScroll} contentContainerStyle={styles.thumbs}>
          {slides.map((s, k) => {
            const uri = reel ? thumbs?.[k] : s.photo?.uri;
            return (
              <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={`Slide ${k + 1}`} onPress={() => go(k)} style={[styles.thumb, k === i ? styles.thumbOn : null]}>
                {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                {s.role === 'cta' ? <View style={styles.thumbDot} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: submitting }} disabled={submitting} onPress={onSubmit} style={styles.submit}>
          {submitting ? (
            <>
              <ActivityIndicator color={color.white} />
              {submitLabel ? <Text style={styles.submitText}>{submitLabel}</Text> : null}
            </>
          ) : (
            <>
              <Text style={styles.submitText}>Submit for approval</Text>
              <Icon name={'send' as IconName} size={16} color={color.white} />
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink900 },
  area: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: { borderRadius: 22, overflow: 'hidden', backgroundColor: briefTone.canvas.bg },
  back: { position: 'absolute', top: 10, left: 12, width: 44, height: 44, borderRadius: 999, backgroundColor: color.inkA55, alignItems: 'center', justifyContent: 'center' },
  tabs: { position: 'absolute', top: 12, alignSelf: 'center', flexDirection: 'row', gap: 2, padding: 3, borderRadius: 999, backgroundColor: color.scrimStrong },
  tab: { height: 30, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center' },
  tabOn: { backgroundColor: color.white },
  tabText: { fontFamily: typeToken.font.ui, fontSize: 12.5, fontWeight: '700' },
  countPill: { position: 'absolute', top: 56, right: 14, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, backgroundColor: color.scrim },
  ctaPill: { position: 'absolute', top: 56, flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, backgroundColor: color.blue500 },
  pillText: { color: color.white, fontFamily: typeToken.font.ui, fontSize: 12, fontWeight: '700' },
  edit: { position: 'absolute', top: 10, right: 12, height: 44, paddingLeft: 12, paddingRight: 14, borderRadius: 999, backgroundColor: color.white, flexDirection: 'row', alignItems: 'center', gap: 6 },
  editText: { color: color.ink, fontFamily: typeToken.font.ui, fontSize: 14, fontWeight: '700' },
  footer: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 4 },
  thumbsScroll: { flex: 1 },
  thumbs: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3, paddingHorizontal: 2 },
  thumb: { width: 26, height: 46, borderRadius: 6, overflow: 'hidden', backgroundColor: briefTone.canvas.chrome, opacity: 0.7 },
  thumbOn: { opacity: 1, borderWidth: 2, borderColor: color.white },
  thumbDot: { position: 'absolute', right: 2, top: 2, width: 10, height: 10, borderRadius: 999, backgroundColor: color.blue500 },
  submit: { height: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: color.blue500, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 120, justifyContent: 'center' },
  submitText: { color: color.white, fontFamily: typeToken.font.ui, fontSize: 15, fontWeight: '700' },
  script: { paddingTop: 62, paddingHorizontal: 16, paddingBottom: 20, gap: 8 },
  scriptRow: { flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: color.whiteA16, borderWidth: 1, borderColor: 'transparent', alignItems: 'center' },
  scriptRowCta: { borderColor: color.blue500 },
  scriptRowCreator: { borderStyle: 'dashed', borderColor: color.whiteA28 },
  scriptCaption: { marginTop: 6 },
  scriptN: { width: 26, height: 26, borderRadius: 999, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  scriptNText: { color: color.white, fontFamily: typeToken.font.ui, fontSize: 12, fontWeight: '800' },
  scriptBody: { flex: 1, gap: 4 },
  scriptLabel: { fontFamily: typeToken.font.ui, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  scriptText: { fontFamily: typeToken.font.ui, fontSize: 15, lineHeight: 20, color: color.white },
  scriptNote: { fontFamily: typeToken.font.ui, fontSize: 12.5, color: color.whiteA60 },
  bold: { fontWeight: '700' },
});

// Full screen slide canvas, creator mode: the photo fills the frame and is
// framed per platform (TikTok 9:16, Instagram 4:5), the manager's text and
// the feature inset sit on top and can be moved, own slides can be typed on.
// From SSCanvas.jsx CanvasEditor (creator) and SSCreator.jsx edit footers.
// Mount with key={index}: platform, crop and typing state start fresh per slide.
import { useState, type JSX, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LibraryFeature } from '../../../../lib/library-api';
import { briefTone, color, type as typeToken } from '../../../../theme/tokens';
import { SlideStage } from '../../../SlideStage';
import { centeredCrop } from '../../slides/photo-crop';
import { Icon, type IconName } from '../../../ui/Icon';
import { FeatureShot } from '../FeatureShot';
import { SLIDE_RATIO } from '../MiniSlide';
import { layoutOf, patchSlideBox, patchSlideInset, roleLabel, slideBoxes, type CreatorSlide, type SlidePlatform } from '../model';
import { SlideDots } from './SlideDots';
import { INSTAGRAM_ASPECT, TIKTOK_ASPECT } from './photo-picker';

const IG_RATIO = 5 / 4;

export type EditStepProps = {
  slides: CreatorSlide[];
  index: number;
  feature: LibraryFeature | null;
  /** Story and Freestyle own slides: Add slide and Remove slide are allowed. */
  flexible: boolean;
  open: boolean;
  /** Story and Freestyle write their own caption, so the last step is Caption. */
  ownDetails: boolean;
  fromReview: boolean;
  /** Fresh pick: start in crop mode, TikTok then Instagram. */
  autoCrop: boolean;
  minOwn: number;
  onBack: () => void;
  onNext: () => void;
  onDone: () => void;
  onChangePhoto: () => void;
  onAddSlide: () => void;
  onRemoveSlide: () => void;
  onPatch: (slide: CreatorSlide) => void;
  onSelect: (index: number) => void;
  onAskAi: () => void;
  onAddPhotos: () => void;
};

function RoundButton({ icon, label, onPress, on = false, children }: { icon?: IconName; label: string; onPress: () => void; on?: boolean; children?: ReactNode }): JSX.Element {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={2} style={[styles.round, on ? styles.roundOn : null]}>
      {icon ? <Icon name={icon} size={20} color={on ? color.ink : color.white} /> : children}
    </Pressable>
  );
}

export function EditStep(props: EditStepProps): JSX.Element {
  const {
    slides, index, feature, flexible, open, ownDetails, fromReview, autoCrop, minOwn,
    onBack, onNext, onDone, onChangePhoto, onAddSlide, onRemoveSlide, onPatch, onSelect, onAskAi, onAddPhotos,
  } = props;
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const [areaH, setAreaH] = useState(0);
  const [platform, setPlatform] = useState<SlidePlatform>('tiktok');
  const [cropping, setCropping] = useState(autoCrop);
  const [guided, setGuided] = useState(autoCrop);
  const [typing, setTyping] = useState(false);

  const cur = slides[index];
  const n = slides.length;
  const cta = cur.role === 'cta';
  const ownCount = slides.filter((s) => s.own).length;
  const photo = cur.photo;

  const W = Math.max(200, Math.min(screenW, Math.floor((areaH || 600) / SLIDE_RATIO)));
  const H = Math.round(W * SLIDE_RATIO);
  const stageH = platform === 'instagram' ? Math.round(W * IG_RATIO) : H;
  const frameAspect = platform === 'instagram' ? INSTAGRAM_ASPECT : TIKTOK_ASPECT;
  const crop = platform === 'instagram' ? photo?.cropInstagram : photo?.crop;
  const L = layoutOf(cur, platform);
  const insetUri = cur.insetFeatureId && feature?.screenshotUrl ? feature.screenshotUrl : undefined;

  const setCrop = (next: typeof crop) => {
    if (!photo || !next) return;
    onPatch({ ...cur, photo: platform === 'instagram' ? { ...photo, cropInstagram: next } : { ...photo, crop: next } });
  };
  const resetCrop = () => {
    if (!photo?.source) return;
    setCrop(centeredCrop(photo.source, frameAspect));
  };

  const finishCrop = () => {
    setCropping(false);
    const g = guided;
    setGuided(false);
    if (g) {
      setPlatform('tiktok');
      if (cur.own && !cur.text.trim() && cur.role !== 'cta') setTyping(true);
    }
  };

  const kindLabel = cta ? 'Your plug slide' : open ? `Slide ${index + 1}` : roleLabel(cur, index);
  const lastOwn = open && !slides.some((s) => s.role === 'cta') && index === n - 1;
  const nextLabel = fromReview
    ? 'Done'
    : index === n - 1
      ? ownDetails
        ? 'Caption'
        : 'Review all'
      : flexible && cur.own
        ? 'Next'
        : `Next: ${roleLabel(slides[index + 1], index + 1)}`;
  const nextIcon: IconName = fromReview ? 'check' : index === n - 1 && (!open || slides.some((s) => s.role === 'cta')) ? 'eye' : 'arrow-right';
  const goNext = fromReview ? onDone : onNext;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.area} onLayout={(e) => setAreaH(e.nativeEvent.layout.height)}>
        <View style={[styles.canvas, { width: W, height: H }]}>
          <View style={[styles.stageWrap, { width: W, height: stageH }]}>
            <SlideStage
              style={{ width: W, height: stageH }}
              boxes={slideBoxes(cur, platform)}
              photoUri={photo?.uri}
              photoCrop={crop}
              inset={insetUri ? { uri: insetUri, x: L.inset.x, y: L.inset.y, width: L.inset.w } : undefined}
              chrome={platform === 'tiktok' && !cropping}
              onMoveBox={cropping ? undefined : (_id, x, y) => onPatch(patchSlideBox(cur, platform, x, y))}
              onMoveInset={cropping ? undefined : (x, y) => onPatch(patchSlideInset(cur, platform, x, y))}
              cropping={photo?.source && crop ? { source: photo.source, frameAspect, onChange: setCrop } : undefined}
              tint={briefTone.canvas.bg}
            />
            {cur.insetFeatureId && feature && !insetUri ? (
              <View pointerEvents="none" style={[styles.insetGhost, { left: L.inset.x * W - (L.inset.w * W) / 2, top: `${L.inset.y * 100}%` }]}>
                <FeatureShot feature={feature} w={L.inset.w * W} />
              </View>
            ) : null}
          </View>

          {cropping ? (
            <>
              <View style={styles.cropLabelWrap} pointerEvents="none">
                <Text style={styles.cropLabel}>{platform === 'instagram' ? 'Crop for Instagram \u00b7 4:5' : 'Crop for TikTok'}</Text>
              </View>
              <View style={styles.cropBar}>
                <Pressable accessibilityRole="button" onPress={resetCrop} style={styles.cropBtnDark}>
                  <Icon name="rotate-ccw" size={15} color={color.white} />
                  <Text style={styles.cropBtnDarkText}>Reset</Text>
                </Pressable>
                <View style={styles.flex} />
                {guided && platform === 'tiktok' ? (
                  <Pressable accessibilityRole="button" onPress={() => setPlatform('instagram')} style={styles.cropBtnLight}>
                    <Icon name="instagram" size={15} color={color.ink} />
                    <Text style={styles.cropBtnLightText}>Crop for Instagram</Text>
                    <Icon name="arrow-right" size={15} color={color.ink} />
                  </Pressable>
                ) : (
                  <Pressable accessibilityRole="button" onPress={finishCrop} style={styles.cropBtnLight}>
                    <Text style={styles.cropBtnLightText}>Done</Text>
                    <Icon name="check" size={16} color={color.ink} />
                  </Pressable>
                )}
              </View>
            </>
          ) : (
            <>
              <View style={styles.topRow}>
                <RoundButton icon="chevron-left" label="Back" onPress={onBack} />
                <View style={styles.flex} />
              </View>
              <View style={styles.platformPill}>
                {(['tiktok', 'instagram'] as const).map((k) => (
                  <Pressable
                    key={k}
                    accessibilityRole="button"
                    accessibilityState={{ selected: platform === k }}
                    onPress={() => setPlatform(k)}
                    style={[styles.platformBtn, platform === k ? styles.platformBtnOn : null]}
                  >
                    <Icon name={k === 'tiktok' ? 'music-2' : 'instagram'} size={13} color={platform === k ? color.ink : color.whiteA90} />
                    <Text style={[styles.platformText, { color: platform === k ? color.ink : color.whiteA90 }]}>{k === 'tiktok' ? 'TikTok' : 'Instagram'}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.kindLabel} pointerEvents="none">
                <Text style={styles.kindLabelText}>{kindLabel}</Text>
              </View>
              <View style={styles.tools}>
                {cur.own ? (
                  <RoundButton label="Text" onPress={() => setTyping(true)} on={typing}>
                    <Text style={styles.aa}>Aa</Text>
                  </RoundButton>
                ) : null}
                {photo?.source ? <RoundButton icon="crop" label="Crop" onPress={() => setCropping(true)} /> : null}
                {flexible && cur.own && ownCount > minOwn ? <RoundButton icon="trash-2" label="Delete slide" onPress={onRemoveSlide} /> : null}
              </View>
            </>
          )}

          {typing ? (
            <View style={styles.typeScrim}>
              <View style={styles.typeBox}>
                <TextInput
                  autoFocus
                  multiline
                  value={cur.text}
                  onChangeText={(text) => onPatch({ ...cur, text })}
                  placeholder={cur.role === 'cover' ? 'Your title' : 'Your words'}
                  placeholderTextColor={color.whiteA60}
                  style={styles.typeInput}
                />
                <Pressable accessibilityRole="button" onPress={() => setTyping(false)} style={styles.typeDone}>
                  <Text style={styles.typeDoneText}>Done</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(6, insets.bottom) }]}>
        {cropping ? (
          <View style={styles.cropFooter}>
            {guided ? (
              <>
                <View style={styles.cropStep}>
                  <View style={[styles.cropDot, { backgroundColor: platform === 'tiktok' ? color.white : briefTone.done }]} />
                  <Text style={styles.cropStepText}>TikTok</Text>
                </View>
                <View style={styles.cropLine} />
                <View style={[styles.cropStep, { opacity: platform === 'instagram' ? 1 : 0.5 }]}>
                  <View style={[styles.cropDot, { backgroundColor: platform === 'instagram' ? color.white : color.whiteA28 }]} />
                  <Text style={styles.cropStepText}>Instagram</Text>
                </View>
              </>
            ) : (
              <Text style={styles.cropStepText}>Each app keeps its own crop</Text>
            )}
          </View>
        ) : open ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs} style={styles.thumbsScroll}>
              {slides.map((s, k) => (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Slide ${k + 1}`}
                  onPress={() => onSelect(k)}
                  style={[styles.thumb, k === index ? styles.thumbOn : null]}
                >
                  {s.photo ? <Image source={{ uri: s.photo.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                  {s.role === 'cta' ? (
                    <View style={styles.thumbCta}>
                      <View style={styles.thumbCtaTint} />
                      <Icon name="zap" size={14} color={color.white} />
                    </View>
                  ) : s.text ? (
                    <View style={styles.thumbLine} />
                  ) : null}
                </Pressable>
              ))}
              <Pressable accessibilityRole="button" accessibilityLabel="Add photos" onPress={onAddPhotos} style={styles.thumbAdd}>
                <Icon name="plus" size={16} color={color.white} />
              </Pressable>
            </ScrollView>
            <View style={styles.row}>
              <Pressable accessibilityRole="button" onPress={onAskAi} style={styles.aiBtn}>
                <Icon name="sparkles" size={16} color={color.blue500} />
                <Text style={styles.aiText}>Ask AI</Text>
              </Pressable>
              {cur.own && ownCount > 2 ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Remove slide" onPress={onRemoveSlide} style={styles.ghostBtn}>
                  <Icon name="trash-2" size={17} color={color.white} />
                </Pressable>
              ) : null}
              <View style={styles.flex} />
              <Pressable accessibilityRole="button" onPress={goNext} style={styles.nextBtn}>
                <Text style={styles.nextText}>{fromReview ? 'Done' : lastOwn ? 'Caption' : 'Next'}</Text>
                <Icon name={fromReview ? 'check' : 'arrow-right'} size={16} color={color.white} />
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <SlideDots slides={slides} index={index} dark />
            <View style={styles.row}>
              <Pressable accessibilityRole="button" accessibilityLabel="Change photo" onPress={onChangePhoto} style={styles.ghostBtn}>
                <Icon name="switch-camera" size={16} color={color.white} />
                {flexible && cur.own ? null : <Text style={styles.ghostText}>Change photo</Text>}
              </Pressable>
              {flexible && cur.own && !fromReview ? (
                <>
                  <Pressable accessibilityRole="button" onPress={onAddSlide} style={styles.addBtn}>
                    <Icon name="plus" size={16} color={color.white} />
                    <Text style={styles.ghostText}>Add slide</Text>
                  </Pressable>
                  <View style={styles.flex} />
                </>
              ) : (
                <Text style={styles.count}>
                  {index + 1} of {n}
                </Text>
              )}
              <Pressable accessibilityRole="button" onPress={goNext} style={[styles.nextBtn, styles.nextGrow]}>
                <Text numberOfLines={1} style={styles.nextText}>
                  {nextLabel}
                </Text>
                <Icon name={nextIcon} size={16} color={color.white} />
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink900 },
  area: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  canvas: { borderRadius: 22, overflow: 'hidden', backgroundColor: briefTone.canvas.bg, alignItems: 'center', justifyContent: 'center' },
  stageWrap: { overflow: 'hidden' },
  insetGhost: { position: 'absolute' },
  flex: { flex: 1 },
  topRow: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  round: { width: 44, height: 44, borderRadius: 999, backgroundColor: color.inkA55, alignItems: 'center', justifyContent: 'center' },
  roundOn: { backgroundColor: color.white },
  aa: { fontFamily: typeToken.font.display, fontSize: 16, fontWeight: '800', color: color.white },
  platformPill: { position: 'absolute', top: 12, alignSelf: 'center', flexDirection: 'row', gap: 2, padding: 3, borderRadius: 999, backgroundColor: color.scrimStrong },
  platformBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 12, borderRadius: 999 },
  platformBtnOn: { backgroundColor: color.white },
  platformText: { fontFamily: typeToken.font.ui, fontSize: 12.5, fontWeight: '700' },
  kindLabel: { position: 'absolute', left: 12, top: 63, height: 42, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, backgroundColor: color.inkA55 },
  kindLabelText: { fontFamily: typeToken.font.ui, fontSize: 12.5, fontWeight: '700', color: color.white },
  tools: { position: 'absolute', right: 12, top: 62, flexDirection: 'row', gap: 8 },
  cropLabelWrap: { position: 'absolute', top: 60, left: 0, right: 0, alignItems: 'center' },
  cropLabel: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: color.inkA55, color: color.white, fontFamily: typeToken.font.ui, fontSize: 12.5, fontWeight: '700', overflow: 'hidden' },
  cropBar: { position: 'absolute', left: 12, right: 12, bottom: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  cropBtnDark: { height: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: color.inkA55, flexDirection: 'row', alignItems: 'center', gap: 6 },
  cropBtnDarkText: { color: color.white, fontFamily: typeToken.font.ui, fontSize: 14, fontWeight: '700' },
  cropBtnLight: { height: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: color.white, flexDirection: 'row', alignItems: 'center', gap: 7 },
  cropBtnLightText: { color: color.ink, fontFamily: typeToken.font.ui, fontSize: 15, fontWeight: '700' },
  typeScrim: { ...StyleSheet.absoluteFill, backgroundColor: color.scrim, justifyContent: 'flex-end', padding: 14 },
  typeBox: { gap: 10, padding: 14, borderRadius: 18, backgroundColor: color.ink900 },
  typeInput: { minHeight: 48, maxHeight: 200, color: color.white, fontFamily: typeToken.font.ui, fontSize: 17, lineHeight: 24, fontWeight: '600' },
  typeDone: { alignSelf: 'flex-end', height: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: color.white, justifyContent: 'center' },
  typeDoneText: { color: color.ink, fontFamily: typeToken.font.ui, fontSize: 15, fontWeight: '700' },
  footer: { minHeight: 97, justifyContent: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ghostBtn: { height: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: color.whiteA16, flexDirection: 'row', alignItems: 'center', gap: 6 },
  ghostText: { color: color.white, fontFamily: typeToken.font.ui, fontSize: 14, fontWeight: '700' },
  addBtn: { height: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: color.whiteA45, flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { flex: 1, textAlign: 'center', color: color.whiteA60, fontFamily: typeToken.font.ui, fontSize: 13, fontWeight: '700' },
  nextBtn: { height: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: color.blue500, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  nextGrow: { flex: 1, minWidth: 0 },
  nextText: { color: color.white, fontFamily: typeToken.font.ui, fontSize: 15, fontWeight: '700' },
  cropFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44 },
  cropStep: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cropDot: { width: 8, height: 8, borderRadius: 99 },
  cropLine: { width: 14, height: 1, backgroundColor: color.whiteA28 },
  cropStepText: { color: color.whiteA60, fontFamily: typeToken.font.ui, fontSize: 13, fontWeight: '600' },
  thumbsScroll: { flexGrow: 0 },
  thumbs: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 2, height: 46 },
  thumb: { width: 26, height: 40, borderRadius: 6, overflow: 'hidden', backgroundColor: briefTone.canvas.chrome, opacity: 0.75 },
  thumbOn: { opacity: 1, borderWidth: 2, borderColor: color.white },
  thumbCta: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  thumbCtaTint: { ...StyleSheet.absoluteFill, backgroundColor: color.blue500, opacity: 0.35 },
  thumbLine: { position: 'absolute', left: 5, right: 5, top: '45%', height: 2.5, borderRadius: 2, backgroundColor: color.white },
  thumbAdd: { width: 26, height: 40, borderRadius: 6, borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.whiteA45, alignItems: 'center', justifyContent: 'center' },
  aiBtn: { height: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: color.white, flexDirection: 'row', alignItems: 'center', gap: 7 },
  aiText: { color: color.ink, fontFamily: typeToken.font.ui, fontSize: 14, fontWeight: '700' },
});

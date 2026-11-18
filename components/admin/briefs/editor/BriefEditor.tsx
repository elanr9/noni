// The stepped brief editor (SSManager.jsx HandheldEditor) for Handheld and
// Story, slideshow and reel: canvas steps, Details, Review, and the sheets.

import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import type { BriefKind, BriefMediaFormat, WeekBrief } from '../../../../lib/briefs-api';
import { ctaPlaceOptions, ctaPosLabel, kindsFor, type PostTypeCopy } from '../../../../lib/brief-copy';
import type { LibraryFeature } from '../../../../lib/library-api';
import { uploadBriefPicture } from '../../../../lib/media-library-api';
import { briefTone, color, type as typeToken } from '../../../../theme/tokens';
import { SoftToast } from '../../../states/SoftToast';
import { Icon } from '../../../ui/Icon';
import { CanvasEditor } from '../canvas/CanvasEditor';
import { CanvasFooter } from '../canvas/CanvasFooter';
import { CheckSheet } from '../sheets/CheckSheet';
import { CountSheet } from '../sheets/CountSheet';
import { CtaIntro } from '../sheets/CtaIntro';
import { CtaPlaceSheet } from '../sheets/CtaPlaceSheet';
import { FeatureSheet } from '../sheets/FeatureSheet';
import { GapSheet } from '../sheets/GapSheet';
import { IdeasSheet } from '../sheets/IdeasSheet';
import { MediaMenuSheet } from '../sheets/MediaMenuSheet';
import { MediaSheet } from '../sheets/MediaSheet';
import { ReviseSheet } from '../sheets/ReviseSheet';
import { DetailsStep } from './DetailsStep';
import { ReviewScreen } from './ReviewScreen';
import type { DeckIdea } from '../../../../lib/deck-ai';
import { slideFilled, useBriefEditor } from './useBriefEditor';

export interface BriefEditorProps {
  briefId: string;
  companyId: string;
  companyName: string;
  brief: WeekBrief | null;
  format: BriefMediaFormat;
  kind: Exclude<BriefKind, 'open'>;
  postType: PostTypeCopy | null;
  features: LibraryFeature[];
  onBack: () => void;
  onSaved: () => void;
  /** An idea from the idea chat to write the whole post from on open. */
  initialIdea?: DeckIdea | null;
  /** The Review step's save button; defaults to Add to week. */
  saveLabel?: string;
}

export function BriefEditor(props: BriefEditorProps) {
  const { format, kind, postType, features, companyName, onBack } = props;
  const E = useBriefEditor(props);
  const [media, setMedia] = useState(false);
  const [mediaMenu, setMediaMenu] = useState(false);
  const kindName = kindsFor(format)[kind].name;
  const kindLabel = postType ? `${postType.name} \u00b7 ${kindName}` : kindName;

  useEffect(() => {
    if (E.onCta && !E.ctaOk) E.showIntro();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [E.onCta]);

  const busyLabel =
    E.busy === 'cta'
      ? 'Writing your CTA'
      : E.busy === 'hook'
        ? 'Writing the hook script'
        : E.busy === 'post'
          ? 'Writing the whole post'
          : E.busy === 'points'
          ? E.reel
            ? 'Writing your points and lines'
            : 'Writing your points'
          : E.busy === 'revise'
            ? 'Revising'
            : null;

  const toast = <SoftToast visible={E.error !== null} message={E.error ?? ''} tone="error" onHide={E.clearError} />;

  /** A picture from the camera roll lands on the current slide as a movable sticker. */
  const pickFromRoll = async () => {
    const at = E.sel;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsMultipleSelection: false });
    if (res.canceled || !res.assets[0]) return;
    try {
      const src = await uploadBriefPicture({ companyId: props.companyId, briefId: props.briefId, uri: res.assets[0].uri });
      const slide = E.slides[at];
      const pics = slide?.pics ?? [];
      E.patchAt(at, { pics: [...pics, { id: `p${Date.now().toString(36)}`, src, box: { x: 0.5, y: 0.62 - pics.length * 0.04, w: 0.5 } }] });
    } catch (e) {
      Alert.alert('Could not add the picture', e instanceof Error ? e.message : 'Try again.');
    }
  };


  if (E.step === 'review') {
    return (
      <View style={styles.fill}>
        <ReviewScreen
          slides={E.slides}
          caption={E.caption}
          tags={E.tags}
          features={features}
          reel={E.reel}
          story={E.story}
          gap={E.reviewGap}
          openCount={E.story && !E.tipsStory}
          ctaPlace={E.ctaAt}
          steps={E.STEPS}
          current={E.stepIdx}
          onJump={E.go}
          onBack={() => E.go('details')}
          onSave={() => void E.save()}
          saving={E.saving}
          saveLabel={props.saveLabel}
        />
        {toast}
      </View>
    );
  }

  if (E.step === 'details') {
    return (
      <View style={styles.fill}>
        <DetailsStep
          steps={E.STEPS}
          current={E.stepIdx}
          onJump={E.go}
          onBack={() => E.go(E.story ? 'cta' : 'points')}
          caption={E.caption}
          setCaption={E.setCaption}
          tags={E.tags}
          setTags={E.setTags}
          search={E.search}
          setSearch={E.setSearch}
          busy={E.busy === 'details'}
          locked={E.busy !== null}
          onFill={() => void E.fillDetails()}
          checking={E.busy === 'check'}
          onCheck={() => void E.checkPost()}
          onPreview={() => E.setSheet('fyp')}
          onReview={() => E.go('review')}
        />
        {E.sheet === 'fyp' ? (
          <ReviewScreen
            slides={E.slides}
            caption={E.caption}
            tags={E.tags}
            features={features}
            reel={E.reel}
            story={E.story}
            gap={E.reviewGap}
            openCount={E.story && !E.tipsStory}
            ctaPlace={E.ctaAt}
            steps={E.STEPS}
            current={E.stepIdx}
            onJump={E.go}
            onBack={() => E.setSheet(null)}
            popup
          />
        ) : null}
        <CheckSheet
          visible={E.sheet === 'check'}
          review={E.check}
          reel={E.reel}
          roles={E.slides.map((s) => s.role)}
          applied={E.checkApplied}
          loading={E.busy === 'check' && !E.check}
          busy={E.busy === 'check'}
          onApply={E.applyFix}
          onRecheck={() => void E.checkPost()}
          onClose={() => E.setSheet(null)}
        />
        {toast}
      </View>
    );
  }

  const nextOk =
    E.step === 'cover'
      ? Boolean(E.title.trim()) && (!E.reel || Boolean(E.slides[0]?.shot.trim()))
      : E.step === 'points'
        ? E.points.length === 0
          ? false
          : E.onLastPoint
            ? E.pointsOk
            : Boolean(E.cur && slideFilled(E.cur))
        : E.step === 'cta'
          ? E.ctaOk && (!E.tipsStory || E.count != null)
          : true;
  const nextLabel =
    E.step === 'cover'
      ? E.story
        ? 'CTA'
        : E.lt
          ? 'CTA line'
          : E.reel
            ? 'Points'
            : 'Slides'
      : E.step === 'points'
        ? E.onLastPoint
          ? 'Details'
          : E.reel
            ? 'Next point'
            : 'Next slide'
        : 'Details';

  const ctaStep = E.step === 'cta' || E.onCta;
  const onGenerate = ctaStep
    ? E.generateCta
    : E.step === 'points'
      ? () => void E.writePoints()
      : E.step === 'cover'
        ? E.openIdeas
        : null;
  // Long text has no inset, so there is no feature to pick.
  const onSecondary = ctaStep && !E.lt ? () => E.setSheet('feature') : null;
  // While AI writes, the footer cannot change the deck under it.
  const locked = E.busy !== null;
  const ctaPick = Boolean(E.cur && E.cur.role === 'cta' && !E.cur.text.trim() && onSecondary);
  // Where the CTA goes: Story on its CTA step, Handheld on the CTA slide.
  const ctaPlace = E.lt ? null : (E.step === 'cta' && E.story) || E.onCta ? E.ctaAt : null;
  const ctaPill =
    ctaPlace !== null ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="CTA position"
        disabled={locked}
        onPress={() => E.setSheet('ctaPlace')}
        style={[styles.countPill, styles.countPillQuiet, styles.ctaPill]}
      >
        <Icon name="megaphone" size={13} color={color.whiteA75} />
        <Text style={[styles.countPillText, { color: color.whiteA75 }]}>{ctaPosLabel(ctaPlace)}</Text>
        <Icon name="chevron-down" size={13} color={color.whiteA75} />
      </Pressable>
    ) : null;

  const footer = (
    <CanvasFooter steps={E.STEPS} current={E.stepIdx} onJump={E.go} onNext={E.next} nextLabel={nextLabel} nextOk={nextOk} disabled={locked}>
      {E.step === 'points' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dots} style={styles.grow}>
          {E.slides.map((s, i) => {
            if (i === 0) return null;
            const done = slideFilled(s);
            const on = E.sel === i;
            const c = s.role === 'cta';
            return (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                accessibilityLabel={c ? 'CTA slide' : `Slide ${i}`}
                onPress={() => E.setSel(i)}
                onLongPress={
                  c
                    ? undefined
                    : () =>
                        Alert.alert(`Delete clip ${i}?`, s.text.trim() ? `"${s.text.trim()}"` : undefined, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => E.removePoint(i) },
                        ])
                }
                disabled={locked}
                hitSlop={5}
                style={[
                  styles.dot,
                  {
                    backgroundColor: on ? color.white : done ? (c ? color.blue500 : briefTone.done) : 'transparent',
                    borderWidth: c ? 2 : !on && !done ? 1.5 : 0,
                    borderColor: c ? color.blue500 : color.whiteA28,
                  },
                ]}
              >
                {done && !on ? (
                  <Icon name="check" size={15} color={color.white} />
                ) : c ? (
                  <Icon name="zap" size={14} color={color.blue500} />
                ) : (
                  <Text style={[styles.dotText, { color: on ? color.ink : color.white }]}>{i}</Text>
                )}
              </Pressable>
            );
          })}
          <Pressable accessibilityRole="button" accessibilityLabel="Add a clip" disabled={locked} onPress={E.addPoint} hitSlop={5} style={[styles.dot, styles.dotAdd]}>
            <Icon name="plus" size={15} color={color.white} />
          </Pressable>
        </ScrollView>
      ) : null}
      {E.step === 'points' ? ctaPill : (
        <>
          <View style={styles.grow} />
          {E.step === 'cta' && E.tipsStory ? (
            <Pressable accessibilityRole="button" disabled={locked} onPress={() => E.setSheet('count')} style={styles.countPill}>
              <Icon name="camera" size={13} color={color.white} />
              <Text numberOfLines={1} style={[styles.countPillText, styles.shrink]}>{`${E.count ?? 0} points \u00b7 creator records ${Math.max(0, (E.count ?? 0) - 1)}`}</Text>
            </Pressable>
          ) : null}
          {E.step === 'cta' && E.story && !E.tipsStory ? (
            <Pressable accessibilityRole="button" disabled={locked} onPress={() => E.setSheet('gap')} style={[styles.countPill, styles.countPillQuiet]}>
              <Icon name="camera" size={13} color={color.whiteA75} />
              <Text numberOfLines={1} style={[styles.countPillText, styles.shrink, { color: color.whiteA75 }]}>Creator picks the count</Text>
            </Pressable>
          ) : null}
          {ctaPill}
        </>
      )}
    </CanvasFooter>
  );

  return (
    <View style={styles.fill}>
      <CanvasEditor
        key={E.step}
        slides={E.slides}
        sel={E.sel}
        setSel={E.setSel}
        patchAt={E.patchAt}
        onBack={E.stepIdx ? E.back : onBack}
        features={features}
        reel={E.reel}
        busy={busyLabel}
        kindLabel={kindLabel}
        footer={footer}
        ctaPick={ctaPick}
        editNonce={E.editNonce}
        onGenerate={onGenerate}
        generateLabel={E.step === 'cover' ? 'Ideas with AI' : E.step === 'points' && !E.onCta ? 'Fill with AI' : 'Write the CTA'}
        onSecondary={onSecondary}
        secondaryLabel={E.ctaOk ? 'Different feature' : 'Pick a feature'}
        onWriteNote={E.reel && E.step === 'cover' ? () => void E.writeHook() : null}
        onRevise={() => E.setSheet('revise')}
        notes
        onOpenMedia={() => setMediaMenu(true)}
      />
      {E.sheet === 'intro' ? (
        <CtaIntro
          companyName={companyName}
          onGo={() => E.setSheet(null)}
          onBack={() => {
            E.setSheet(null);
            if (E.onCta) E.setSel(Math.max(1, E.sel - 1));
            else E.back();
          }}
        />
      ) : null}
      <CtaPlaceSheet visible={E.sheet === 'ctaPlace'} options={ctaPlaceOptions(E.reel, E.story)} current={E.ctaAt} onPick={E.setCtaAt} onClose={() => E.setSheet(null)} />
      <GapSheet visible={E.sheet === 'gap'} gap={E.gap} setGap={E.setGap} onClose={() => E.setSheet(null)} reel={E.reel} />
      <FeatureSheet
        visible={E.sheet === 'feature'}
        features={features}
        current={E.slides[E.ctaIdx]?.inset_feature_id ?? null}
        video={E.reel}
        onPick={E.pickFeature}
        onSelf={() => E.selfCta(null)}
        onClose={() => E.setSheet(null)}
      />
      <CountSheet
        visible={E.sheet === 'count'}
        value={E.tipsStory ? (E.count ?? 5) : E.slides.length - 1 > 1 ? E.slides.length - 1 : 5}
        onDone={(n) => {
          if (E.tipsStory) {
            E.setCountN(n);
            if (!E.ctaOk) E.showIntro();
          } else E.setCount(n);
        }}
        onClose={() => E.setSheet(null)}
      />
      <MediaMenuSheet
        visible={mediaMenu}
        reel={E.reel}
        hasInset={Boolean(E.cur?.inset_feature_id)}
        onLibrary={() => setMedia(true)}
        onRoll={() => void pickFromRoll()}
        onRemove={() => E.patchAt(E.sel, { inset_feature_id: null })}
        onClose={() => setMediaMenu(false)}
      />
      <MediaSheet
        visible={media}
        features={features}
        current={E.cur?.inset_feature_id ?? null}
        video={E.reel}
        onPick={(f) => {
          setMedia(false);
          E.patchAt(E.sel, { inset_feature_id: f.id });
        }}
        onClose={() => setMedia(false)}
      />
      <IdeasSheet
        visible={E.sheet === 'ideas'}
        ideas={E.ideas}
        busy={E.ideasBusy}
        typeName={postType?.name ?? null}
        reel={E.reel}
        onPick={E.pickIdea}
        onMore={E.moreIdeas}
        onClose={() => E.setSheet(null)}
      />
      <ReviseSheet
        visible={E.sheet === 'revise'}
        format={format}
        companyName={companyName}
        history={E.reviseChat}
        working={E.busy === 'revise'}
        onPick={(f) => void E.revise(f)}
        onClose={() => E.setSheet(null)}
      />
      {toast}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: color.ink900 },
  grow: { flex: 1, minWidth: 0 },
  dots: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 1, paddingHorizontal: 4 },
  dot: { width: 34, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  dotAdd: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.whiteA28 },
  dotText: { fontFamily: typeToken.font.ui, fontWeight: typeToken.weight.bold, fontSize: typeToken.size.chip },
  countPill: { flexShrink: 1, minWidth: 0, height: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: color.whiteA45, flexDirection: 'row', alignItems: 'center', gap: 6 },
  countPillQuiet: { borderWidth: 0, backgroundColor: color.whiteA16 },
  ctaPill: { flexShrink: 0, gap: 5 },
  shrink: { flexShrink: 1 },
  countPillText: { fontFamily: typeToken.font.ui, fontWeight: typeToken.weight.semibold, fontSize: typeToken.size.label, color: color.white },
});

// The stepped brief editor (SSManager.jsx HandheldEditor) for Handheld and
// Story, slideshow and reel: canvas steps, Details, Review, and the sheets.

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { BriefKind, BriefMediaFormat, WeekBrief } from '../../../../lib/briefs-api';
import { kindsFor, type PostTypeCopy } from '../../../../lib/brief-copy';
import type { LibraryFeature } from '../../../../lib/library-api';
import { briefTone, color, type as typeToken } from '../../../../theme/tokens';
import { SoftToast } from '../../../states/SoftToast';
import { Icon } from '../../../ui/Icon';
import { CanvasEditor } from '../canvas/CanvasEditor';
import { CanvasFooter } from '../canvas/CanvasFooter';
import { CountSheet } from '../sheets/CountSheet';
import { CtaIntro } from '../sheets/CtaIntro';
import { FeatureSheet } from '../sheets/FeatureSheet';
import { GapSheet } from '../sheets/GapSheet';
import { MediaSheet } from '../sheets/MediaSheet';
import { ReviseSheet } from '../sheets/ReviseSheet';
import { DetailsStep } from './DetailsStep';
import { ReviewScreen } from './ReviewScreen';
import { useBriefEditor } from './useBriefEditor';

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
}

export function BriefEditor(props: BriefEditorProps) {
  const { format, kind, postType, features, companyName, onBack } = props;
  const E = useBriefEditor(props);
  const [media, setMedia] = useState(false);
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
        : E.busy === 'points'
          ? E.reel
            ? 'Writing your points and lines'
            : 'Writing your points'
          : E.busy === 'revise'
            ? 'Revising'
            : null;

  const toast = <SoftToast visible={E.error !== null} message={E.error ?? ''} tone="error" onHide={E.clearError} />;

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
          steps={E.STEPS}
          current={E.stepIdx}
          onJump={E.go}
          onBack={() => E.go('details')}
          onSave={() => void E.save()}
          saving={E.saving}
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
          onFill={() => void E.fillDetails()}
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
            steps={E.STEPS}
            current={E.stepIdx}
            onJump={E.go}
            onBack={() => E.setSheet(null)}
            popup
          />
        ) : null}
        {toast}
      </View>
    );
  }

  const nextOk =
    E.step === 'cover'
      ? Boolean(E.title.trim()) && (!E.reel || Boolean(E.slides[0]?.shot.trim()))
      : E.step === 'points'
        ? E.onLastPoint
          ? E.pointsOk
          : Boolean(E.cur?.text.trim())
        : E.step === 'cta'
          ? E.ctaOk
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
  const onGenerate = ctaStep ? E.generateCta : E.step === 'points' ? () => void E.writePoints() : null;
  const onSecondary = ctaStep ? () => E.setSheet('feature') : null;
  const ctaPick = Boolean(E.cur && E.cur.role === 'cta' && !E.cur.text.trim() && onSecondary);

  const footer = (
    <CanvasFooter steps={E.STEPS} current={E.stepIdx} onJump={E.go} onNext={E.next} nextLabel={nextLabel} nextOk={nextOk}>
      {E.step === 'points' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dots} style={styles.grow}>
          {E.slides.map((s, i) => {
            if (i === 0) return null;
            const done = Boolean(s.text.trim());
            const on = E.sel === i;
            const c = s.role === 'cta';
            return (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                accessibilityLabel={c ? 'CTA slide' : `Slide ${i}`}
                onPress={() => E.setSel(i)}
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
          <Pressable accessibilityRole="button" accessibilityLabel="Change count" onPress={() => E.setSheet('count')} hitSlop={5} style={[styles.dot, styles.dotAdd]}>
            <Icon name="plus" size={15} color={color.white} />
          </Pressable>
        </ScrollView>
      ) : (
        <>
          <View style={styles.grow} />
          {E.step === 'cta' && E.tipsStory ? (
            <Pressable accessibilityRole="button" onPress={() => E.setSheet('count')} style={styles.countPill}>
              <Icon name="camera" size={13} color={color.white} />
              <Text style={styles.countPillText}>{`${E.count ?? 0} points \u00b7 creator records ${Math.max(0, (E.count ?? 0) - 1)}`}</Text>
            </Pressable>
          ) : null}
          {E.step === 'cta' && E.story && !E.tipsStory ? (
            <Pressable accessibilityRole="button" onPress={() => E.setSheet('gap')} style={[styles.countPill, styles.countPillQuiet]}>
              <Icon name="camera" size={13} color={color.whiteA75} />
              <Text style={[styles.countPillText, { color: color.whiteA75 }]}>Creator picks the count</Text>
            </Pressable>
          ) : null}
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
        onGenerate={onGenerate}
        generateLabel={E.step === 'points' && !E.onCta ? 'Fill with AI' : 'Generate with AI'}
        onSecondary={onSecondary}
        secondaryLabel={E.ctaOk ? 'Different feature' : 'Pick a feature'}
        onWriteNote={E.reel && E.step === 'cover' ? () => void E.writeHook() : null}
        onRevise={() => E.setSheet('revise')}
        notes
        onOpenMedia={() => setMedia(true)}
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
      <ReviseSheet visible={E.sheet === 'revise'} format={format} companyName={companyName} onPick={(f) => void E.revise(f)} onClose={() => E.setSheet(null)} />
      {toast}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: color.ink900 },
  grow: { flex: 1, minWidth: 0 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5 },
  dot: { width: 34, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  dotAdd: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.whiteA28 },
  dotText: { fontFamily: typeToken.font.ui, fontWeight: '800', fontSize: 13 },
  countPill: { height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: color.whiteA45, flexDirection: 'row', alignItems: 'center', gap: 6 },
  countPillQuiet: { borderWidth: 0, backgroundColor: color.whiteA16 },
  countPillText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 12.5, color: color.white },
});

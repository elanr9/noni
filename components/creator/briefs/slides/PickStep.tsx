// Pick the photo for one slide: dots, the manager's text on a ghost TikTok
// frame, Choose a photo and Take a photo. From SSCreator.jsx CreatorHandheld
// phase pick.
import { useState, type JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LibraryFeature } from '../../../../lib/library-api';
import type { PickedPhoto } from '../../../../lib/submissions';
import { briefTone, color, shadow, type as typeToken } from '../../../../theme/tokens';
import { BriefChip, BriefHeader } from '../../../shared/briefs';
import { Button } from '../../../ui/Button';
import { TikTokChrome } from '../../slides/TikTokChrome';
import { MiniSlide, SLIDE_RATIO } from '../MiniSlide';
import { roleLabel, type CreatorSlide } from '../model';
import { SlideDots } from './SlideDots';
import { pickFromLibrary, takePhoto } from './photo-picker';

export type PickStepProps = {
  slides: CreatorSlide[];
  index: number;
  title: string;
  feature: LibraryFeature | null;
  /** Story and Freestyle: the creator may add slides, so the count is open. */
  flexible: boolean;
  onBack: () => void;
  onPhoto: (photo: PickedPhoto) => void;
};

export function PickStep({ slides, index, title, feature, flexible, onBack, onPhoto }: PickStepProps): JSX.Element {
  const insets = useSafeAreaInsets();
  const [frameH, setFrameH] = useState(0);
  const [busy, setBusy] = useState(false);
  const cur = slides[index];
  const n = slides.length;
  const cta = cur.role === 'cta';
  const fw = Math.max(180, Math.min(300, Math.floor(((frameH || 400) - 8) / SLIDE_RATIO)));
  const sub = flexible && cur.own && !slides.some((s) => s.role === 'cta') ? `Slide ${index + 1}` : `Slide ${index + 1} of ${n}`;

  const choose = async () => {
    setBusy(true);
    try {
      const [photo] = await pickFromLibrary(1);
      if (photo) onPhoto(photo);
    } finally {
      setBusy(false);
    }
  };
  const camera = async () => {
    setBusy(true);
    try {
      const photo = await takePhoto();
      if (photo) onPhoto(photo);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <BriefHeader
        onBack={onBack}
        title={roleLabel(cur, index)}
        sub={sub}
        right={cta ? <BriefChip tone="brand" icon="zap">Plug</BriefChip> : null}
      />
      <View style={[styles.body, { paddingBottom: Math.max(30, insets.bottom + 12) }]}>
        <SlideDots slides={slides} index={index} />
        {cur.role === 'cover' && cur.text ? <Text style={styles.coverTitle}>{title}</Text> : null}
        {cur.own ? (
          <Text style={styles.hint}>{cur.role === 'cover' ? 'Your cover. Add a photo, then a title if you want one.' : 'Your photo. Text is optional.'}</Text>
        ) : null}
        <View style={styles.frameArea} onLayout={(e) => setFrameH(e.nativeEvent.layout.height)}>
          <View style={[styles.frame, { width: fw, height: Math.round(fw * SLIDE_RATIO) }, shadow.shadowRaised, cta ? styles.frameCta : null]}>
            <MiniSlide
              w={fw}
              bare
              text={cur.text}
              feature={cur.insetFeatureId ? feature : null}
              layout={cur}
              textScale={cur.tstyle?.size ?? 1}
              who="manager"
            />
            <View style={styles.ghost} pointerEvents="none">
              <TikTokChrome stageWidth={fw} stageHeight={Math.round(fw * SLIDE_RATIO)} />
            </View>
          </View>
        </View>
        <View style={styles.actions}>
          <Button size="lg" block icon="images" disabled={busy} onPress={() => void choose()} style={styles.btn}>
            Choose a photo
          </Button>
          <Button size="lg" block variant="outline" icon="camera" disabled={busy} onPress={() => void camera()} style={[styles.btn, styles.secondary]}>
            Take a photo
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.offWhite },
  body: { flex: 1, paddingHorizontal: 24, gap: 12 },
  coverTitle: {
    textAlign: 'center',
    fontFamily: typeToken.font.display,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: color.ink,
    paddingHorizontal: 8,
  },
  hint: { textAlign: 'center', fontFamily: typeToken.font.ui, fontSize: 15, fontWeight: '600', color: color.slate500 },
  frameArea: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  frame: { borderRadius: 24, overflow: 'hidden', backgroundColor: briefTone.canvas.bg },
  frameCta: { borderWidth: 2.5, borderColor: color.blue500 },
  ghost: { ...StyleSheet.absoluteFill, opacity: 0.92 },
  actions: { gap: 10 },
  btn: { height: 56 },
  secondary: { backgroundColor: color.white, borderColor: color.border },
});

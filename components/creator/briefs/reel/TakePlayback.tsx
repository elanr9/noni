// The take just recorded plays back right away over the camera, with the
// point's text on it, a scrub bar, and Redo this clip, Add extra clip, Next.
// From RLCreator.jsx RecordScreen (play state).
import { useVideoPlayer } from 'expo-video';
import type { JSX } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MediaAsset } from '../../../../lib/edit-document';
import { color, type as typeToken } from '../../../../theme/tokens';
import { OverlayTextBox, overlayWrapWidth } from '../../../ui/OverlayTextBox';
import { Icon } from '../../../ui/Icon';
import { ClipVideo, ScrubBar, useClipPlayback } from '../../record/ClipPlayback';
import { layoutOf, SLIDE_TEXT_SIZE } from '../model';
import type { ReelPlanItem } from './plan';

export function TakePlayback({
  asset,
  item,
  stageWidth,
  stageHeight,
  nextLabel,
  onRedo,
  onExtra,
  onNext,
}: {
  asset: MediaAsset;
  item: ReelPlanItem | null;
  stageWidth: number;
  stageHeight: number;
  nextLabel: string;
  onRedo: () => void;
  onExtra: () => void;
  onNext: () => void;
}): JSX.Element {
  const player = useVideoPlayer(asset.localUri ?? '', (p) => {
    p.loop = true;
    p.play();
  });
  const playback = useClipPlayback(player, asset.durationMs ?? 0);
  const L = item ? layoutOf({ box: item.box, insetBox: item.insetBox, insetFeatureId: item.insetFeatureId }) : null;
  const fontSize = stageWidth * SLIDE_TEXT_SIZE * (item?.tstyle?.size ?? 1);

  return (
    <View style={StyleSheet.absoluteFill}>
      <ClipVideo playback={playback} />
      {item && item.text.trim() && L && stageWidth > 0 ? (
        <View
          pointerEvents="none"
          style={[
            styles.textWrap,
            { left: L.text.x * stageWidth - (L.text.w * stageWidth) / 2, top: L.text.y * stageHeight, width: L.text.w * stageWidth },
          ]}
        >
          <OverlayTextBox text={item.text} color={color.white} bg fontSize={fontSize} maxWidth={overlayWrapWidth(L.text.w, stageWidth)} />
        </View>
      ) : null}
      <View style={styles.scrub}>
        <ScrubBar playback={playback} />
      </View>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Redo this clip" onPress={onRedo} style={styles.redo}>
          <Icon name="rotate-ccw" size={20} color={color.white} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onExtra} style={styles.extra}>
          <Icon name="plus" size={16} color={color.ink} />
          <Text style={styles.extraText}>Add extra clip</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onNext} style={styles.next}>
          <Text style={styles.nextText}>{nextLabel}</Text>
          <Icon name="arrow-right" size={15} color={color.white} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  textWrap: { position: 'absolute', alignItems: 'center' },
  scrub: { position: 'absolute', left: 12, right: 12, top: 18, height: 24, justifyContent: 'center' },
  actions: { position: 'absolute', left: 24, right: 24, bottom: 34, flexDirection: 'row', alignItems: 'center', gap: 10 },
  redo: { width: 48, height: 48, borderRadius: 999, borderWidth: 2, borderColor: color.white, backgroundColor: color.scrim, alignItems: 'center', justifyContent: 'center' },
  extra: { flex: 1, height: 48, borderRadius: 999, backgroundColor: color.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  extraText: { color: color.ink, fontFamily: typeToken.font.ui, fontSize: 14, fontWeight: '700' },
  next: { flex: 1, height: 48, borderRadius: 999, backgroundColor: color.blue500, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  nextText: { color: color.white, fontFamily: typeToken.font.ui, fontSize: 14, fontWeight: '700' },
});

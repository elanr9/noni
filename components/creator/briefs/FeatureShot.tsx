// A library feature screenshot at width w: the real screenshot when the
// feature has one, else the toned placeholder from SSShared.jsx Shot (header
// bar plus text lines). Reels get a play badge and the clip length.
import type { JSX } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import type { LibraryFeature } from '../../../lib/library-api';
import { briefTone, color, shadow, type as typeToken } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { featureToneKey } from './model';

export function FeatureShot({
  feature,
  w,
  video = false,
}: {
  feature: LibraryFeature;
  w: number;
  video?: boolean;
}): JSX.Element {
  const tone = briefTone.featureTones[featureToneKey(feature.title, feature.isGeneral)];
  const radius = w * 0.09;
  return (
    <View style={[styles.card, { width: w, borderRadius: radius }, shadow.shadowCard]}>
      {feature.screenshotUrl ? (
        <Image source={{ uri: feature.screenshotUrl }} style={{ width: w, height: w * 0.86 }} resizeMode="cover" />
      ) : (
        <>
          <View style={{ height: w * 0.16, backgroundColor: tone.bar }} />
          <View style={{ padding: w * 0.08, gap: w * 0.06, backgroundColor: tone.tone }}>
            <View style={[styles.line, styles.lineStrong, { height: w * 0.06, width: '70%' }]} />
            <View style={[styles.line, { height: w * 0.05, width: '92%' }]} />
            <View style={[styles.line, { height: w * 0.05, width: '80%' }]} />
            <View style={[styles.line, { height: w * 0.05, width: '55%' }]} />
          </View>
        </>
      )}
      {video && w >= 40 ? (
        <View style={styles.playWrap} pointerEvents="none">
          <View style={[styles.play, { width: w * 0.26, height: w * 0.26 }]}>
            <Icon name="play" size={Math.max(8, w * 0.12)} color={color.white} />
          </View>
        </View>
      ) : null}
      {video && w >= 80 ? (
        <View style={[styles.clip, { right: w * 0.05, bottom: w * 0.05, paddingHorizontal: w * 0.04 }]}>
          <Text style={[styles.clipText, { fontSize: Math.max(8, w * 0.07) }]}>0:07</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', backgroundColor: color.white, borderWidth: 1, borderColor: color.whiteA75 },
  line: { borderRadius: 99, backgroundColor: color.ink, opacity: 0.18 },
  lineStrong: { opacity: 0.45 },
  playWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  play: { borderRadius: 999, backgroundColor: color.scrimStrong, alignItems: 'center', justifyContent: 'center' },
  clip: { position: 'absolute', borderRadius: 99, backgroundColor: color.inkA55, paddingVertical: 1 },
  clipText: { color: color.white, fontFamily: typeToken.font.ui, fontWeight: '700' },
});

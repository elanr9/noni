// A Library feature screenshot (SSShared.jsx Shot). The real screenshot when
// the feature has one; otherwise a tinted card with a header bar and text
// lines, toned by the feature's title. Reels add a play glyph and clip length.

import { Image, StyleSheet, Text, View, type DimensionValue } from 'react-native';

import type { LibraryFeature } from '../../../lib/library-api';
import { briefTone, color, type as typeToken } from '../../../theme/tokens';

export type FeatureTone = { tone: string; bar: string };

const TONE_ORDER = ['bestfit', 'hl', 'reply', 'inbox', 'sent', 'search', 'school', 'general'] as const;

/** Slug of the title matched against the seeded tone keys; General is the fallback. */
export function featureToneFor(title: string | null | undefined): FeatureTone {
  const slug = (title ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = TONE_ORDER.find((k) => slug.includes(k)) ?? 'general';
  return briefTone.featureTones[key];
}

export function ShotPlaceholder({ tone, w, video = false, clip }: { tone: FeatureTone; w: number; video?: boolean; clip?: string | null }) {
  const line = (width: DimensionValue, strong: boolean) => (
    <View
      style={{
        height: w * (strong ? 0.06 : 0.05),
        width,
        borderRadius: 99,
        backgroundColor: strong ? color.inkA55 : color.scrim,
        opacity: strong ? 0.9 : 0.35,
      }}
    />
  );
  return (
    <View style={[styles.card, { width: w, borderRadius: w * 0.09 }]}>
      <View style={{ height: w * 0.16, backgroundColor: tone.bar }} />
      <View style={{ padding: w * 0.08, gap: w * 0.06, backgroundColor: tone.tone }}>
        {line('70%', true)}
        {line('92%', false)}
        {line('80%', false)}
        {line('55%', false)}
      </View>
      {video && w >= 40 ? (
        <View pointerEvents="none" style={styles.playWrap}>
          <View style={[styles.play, { width: w * 0.26, height: w * 0.26 }]}>
            <View
              style={{
                marginLeft: w * 0.025,
                borderTopWidth: w * 0.065,
                borderBottomWidth: w * 0.065,
                borderLeftWidth: w * 0.1,
                borderTopColor: 'transparent',
                borderBottomColor: 'transparent',
                borderLeftColor: color.white,
              }}
            />
          </View>
        </View>
      ) : null}
      {video && w >= 80 ? (
        <View style={[styles.clip, { right: w * 0.05, bottom: w * 0.05, paddingVertical: w * 0.01, paddingHorizontal: w * 0.04 }]}>
          <Text style={[styles.clipText, { fontSize: Math.max(8, w * 0.07) }]}>{clip ?? '0:07'}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function Shot({ feature, w, video = false }: { feature: LibraryFeature | null; w: number; video?: boolean }) {
  if (!feature) return null;
  if (feature.screenshotUrl) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri: feature.screenshotUrl }}
        style={[styles.card, { width: w, height: w * 1.1, borderRadius: w * 0.09 }]}
        resizeMode="cover"
      />
    );
  }
  return <ShotPlaceholder tone={featureToneFor(feature.title)} w={w} video={video} />;
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.whiteA75,
    shadowColor: color.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    shadowOpacity: 0.18,
    elevation: 3,
  },
  playWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  play: { borderRadius: 999, backgroundColor: color.scrimStrong, alignItems: 'center', justifyContent: 'center' },
  clip: { position: 'absolute', borderRadius: 99, backgroundColor: color.scrimStrong },
  clipText: { color: color.white, fontFamily: typeToken.font.ui, fontWeight: '700' },
});

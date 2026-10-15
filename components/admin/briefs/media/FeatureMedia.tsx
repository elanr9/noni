// The real picture behind a library feature: the screenshot, or the screen
// recording (its poster in lists, the clip itself muted and looping where the
// canvas asks for it live). Keeps the media's own aspect, so a tall phone
// recording reads as a phone. The no media card is only for features that
// truly have nothing in the Library yet.

import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { LibraryFeature } from '../../../../lib/library-api';
import { color, type as typeToken } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { posterForVideo } from '../../../ui/MediaThumb';
import { durationLabel, EMPTY_ASPECT, featureVisual, fitIn, insetFrame, knownAspect, type FeatureVisual, type Size } from './geometry';

export type MediaTone = { tone: string; bar: string };

const measured = new Map<string, number>();

function measure(uri: string): Promise<number | null> {
  const hit = measured.get(uri);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (w, h) => {
        if (w > 0 && h > 0) {
          measured.set(uri, w / h);
          resolve(w / h);
        } else resolve(null);
      },
      () => resolve(null),
    );
  });
}

/** What to draw for a feature, the still to show, and its aspect (stored, measured, or a phone screen). */
export function useFeatureVisual(feature: LibraryFeature | null | undefined, video: boolean): { visual: FeatureVisual; imageUri: string | null; aspect: number } {
  const visual = featureVisual(feature, video);
  const url = visual.kind === 'none' ? null : visual.url;
  const clipPoster = visual.kind === 'clip' ? visual.posterUrl : null;
  const stored = visual.kind === 'none' ? null : visual.aspect;
  const needsPoster = visual.kind === 'clip' && !clipPoster ? url : null;
  const [poster, setPoster] = useState<{ for: string; uri: string | null } | null>(null);
  const [aspect, setAspect] = useState<{ for: string; value: number } | null>(null);

  useEffect(() => {
    if (!needsPoster) return;
    let live = true;
    void posterForVideo(needsPoster).then((uri) => {
      if (live) setPoster({ for: needsPoster, uri });
    });
    return () => {
      live = false;
    };
  }, [needsPoster]);

  const imageUri = visual.kind === 'still' ? visual.url : (clipPoster ?? (poster && poster.for === url ? poster.uri : null));

  useEffect(() => {
    if (stored || !imageUri) return;
    let live = true;
    void measure(imageUri).then((value) => {
      if (live && value) setAspect({ for: imageUri, value });
    });
    return () => {
      live = false;
    };
  }, [stored, imageUri]);

  const value = stored ?? (aspect && aspect.for === imageUri ? aspect.value : imageUri ? measured.get(imageUri) : undefined) ?? knownAspect(visual);
  return { visual, imageUri, aspect: value };
}

/** True when the feature has a real screenshot or recording to show. */
export function hasFeatureMedia(feature: LibraryFeature | null | undefined, video: boolean): boolean {
  return featureVisual(feature, video).kind !== 'none';
}

/** The drawn inset size for a feature in a box w wide: same numbers the card uses. */
export function useInsetFrame(feature: LibraryFeature | null | undefined, w: number, video: boolean): Size {
  const { aspect } = useFeatureVisual(feature, video);
  return insetFrame(w, aspect);
}

function PlayBadge({ size }: { size: number }) {
  return (
    <View pointerEvents="none" style={styles.center}>
      <View style={[styles.play, { width: size, height: size }]}>
        <Icon name="play" size={Math.max(8, size * 0.46)} color={color.white} />
      </View>
    </View>
  );
}

function DurationChip({ label, w }: { label: string; w: number }) {
  return (
    <View pointerEvents="none" style={[styles.chip, { right: w * 0.05, bottom: w * 0.05, paddingHorizontal: Math.max(4, w * 0.04) }]}>
      <Text style={[styles.chipText, { fontSize: Math.max(8, Math.min(12, w * 0.08)) }]}>{label}</Text>
    </View>
  );
}

/** The clip itself, muted on loop. The poster sits under it until the first frame. */
function LiveClip({ url, poster, onLoad }: { url: string; poster: string | null; onLoad: (durationMs: number, aspect: number | null) => void }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  useEffect(() => {
    const sub = player.addListener('sourceLoad', ({ duration, availableVideoTracks }) => {
      const size = availableVideoTracks?.[0]?.size;
      onLoad(Math.round((duration || 0) * 1000), size && size.width > 0 && size.height > 0 ? size.width / size.height : null);
    });
    return () => sub.remove();
  }, [player, onLoad]);
  return (
    <>
      {poster ? <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} pointerEvents="none" />
    </>
  );
}

/**
 * A feature's media as a card in an inset box w wide (never taller than
 * maxH). Live plays the recording; otherwise a recording shows its first
 * frame with a play badge and its real length.
 */
export function FeatureMediaCard({
  feature,
  w,
  video = false,
  live = false,
  maxH,
  tone,
}: {
  feature: LibraryFeature;
  w: number;
  video?: boolean;
  live?: boolean;
  maxH?: number;
  tone: MediaTone;
}) {
  const { visual, imageUri, aspect } = useFeatureVisual(feature, video);
  const [loaded, setLoaded] = useState<{ ms: number; aspect: number | null } | null>(null);
  const onLoad = useCallback((ms: number, va: number | null) => setLoaded({ ms, aspect: va }), []);
  const a = loaded?.aspect ?? aspect;
  const frame = insetFrame(w, a, maxH);
  const clip = visual.kind === 'clip' ? visual : null;
  const label = durationLabel(clip?.durationMs ?? loaded?.ms ?? null);
  return (
    <View style={[styles.card, { width: frame.width, height: frame.height, borderRadius: frame.width * 0.09, backgroundColor: tone.tone }]}>
      {clip && live ? (
        <LiveClip url={clip.url} poster={imageUri} onLoad={onLoad} />
      ) : imageUri ? (
        <Image accessibilityIgnoresInvertColors source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}
      {clip && !live && frame.width >= 36 ? <PlayBadge size={Math.min(44, frame.width * 0.3)} /> : null}
      {clip && label && frame.width >= 70 ? <DurationChip label={label} w={frame.width} /> : null}
    </View>
  );
}

/**
 * The card for a feature with nothing in the Library: its tone, an icon for
 * what is missing, and at larger sizes a line on where to add it.
 */
export function NoMediaCard({
  tone,
  w,
  video = false,
  maxH,
  label,
  hint = true,
}: {
  tone: MediaTone;
  w: number;
  video?: boolean;
  maxH?: number;
  /** Replaces the "No screenshot yet" line, e.g. the feature name on the creator side. */
  label?: string | null;
  /** The "Add one in Library" line, for managers only. */
  hint?: boolean;
}) {
  const frame = insetFrame(w, EMPTY_ASPECT, maxH);
  const icon = Math.max(10, frame.width * 0.2);
  return (
    <View style={[styles.card, styles.empty, { width: frame.width, height: frame.height, borderRadius: frame.width * 0.09, backgroundColor: tone.tone, gap: frame.width * 0.05, padding: frame.width * 0.08 }]}>
      <View style={[styles.emptyIcon, { width: icon * 2, height: icon * 2, backgroundColor: tone.bar }]}>
        <Icon name={video ? 'video' : 'image'} size={icon} color={color.white} />
      </View>
      {frame.width >= 110 ? (
        <Text numberOfLines={2} style={[styles.emptyTitle, { color: tone.bar, fontSize: Math.min(15, frame.width * 0.08) }]}>
          {label ?? (video ? 'No screen recording yet' : 'No screenshot yet')}
        </Text>
      ) : null}
      {hint && frame.width >= 150 ? <Text style={[styles.emptyHint, { fontSize: Math.min(12, frame.width * 0.065) }]}>Add one in Library</Text> : null}
    </View>
  );
}

/**
 * A list thumbnail: the media fitted inside its box at its real aspect, on
 * the feature's tone. Never mounts a player.
 */
export function FeatureThumb({ feature, video, tone, style }: { feature: LibraryFeature; video: boolean; tone: MediaTone; style?: StyleProp<ViewStyle> }) {
  const { visual, imageUri, aspect } = useFeatureVisual(feature, video);
  const [box, setBox] = useState<Size | null>(null);
  const fit = box ? fitIn(box.width * 0.86, box.height * 0.9, aspect) : null;
  const clip = visual.kind === 'clip' ? visual : null;
  const label = durationLabel(clip?.durationMs ?? null);
  return (
    <View onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })} style={[styles.thumbBox, { backgroundColor: tone.tone }, style]}>
      {visual.kind === 'none' ? (
        <Icon name={video ? 'video' : 'image'} size={18} color={tone.bar} />
      ) : fit ? (
        <View style={[styles.thumbMedia, { width: fit.width, height: fit.height, borderRadius: Math.max(4, fit.width * 0.1) }]}>
          {imageUri ? <Image accessibilityIgnoresInvertColors source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          {clip ? <PlayBadge size={Math.min(28, Math.max(16, fit.width * 0.36))} /> : null}
          {label && fit.width >= 48 ? <DurationChip label={label} w={fit.width} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: color.whiteA75,
    shadowColor: color.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    shadowOpacity: 0.18,
    elevation: 3,
  },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  play: { borderRadius: 999, backgroundColor: color.scrimStrong, alignItems: 'center', justifyContent: 'center', paddingLeft: 2 },
  chip: { position: 'absolute', borderRadius: 99, backgroundColor: color.scrimStrong, paddingVertical: 1 },
  chipText: { color: color.white, fontFamily: typeToken.font.ui, fontWeight: '700' },
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { borderRadius: 999, alignItems: 'center', justifyContent: 'center', opacity: 0.9 },
  emptyTitle: { fontFamily: typeToken.font.ui, fontWeight: '800', textAlign: 'center', letterSpacing: -0.2 },
  emptyHint: { fontFamily: typeToken.font.ui, fontWeight: '600', textAlign: 'center', color: color.slate500 },
  thumbBox: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbMedia: { overflow: 'hidden', backgroundColor: color.ink900 },
});

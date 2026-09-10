import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { color, radiusAdmin, shadow } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { posterForVideo } from '../../ui/MediaThumb';

export type MediaBlockProps = {
  kind: 'image' | 'video';
  cacheKey: string;
  resolveUrl: () => Promise<string>;
  lenLabel?: string;
  onPress?: () => void;
};

const WIDTH = 168;
const HEIGHT = 118;
const DISC = 34;

const urlCache = new Map<string, string>();

async function resolveDisplayUrl(
  kind: 'image' | 'video',
  resolveUrl: () => Promise<string>,
): Promise<string> {
  const url = await resolveUrl();
  if (kind === 'image') return url;
  return (await posterForVideo(url)) ?? url;
}

/** Handoff 2.4 media message: tinted block until the signed url lands, then cover. */
export function MediaBlock({ kind, cacheKey, resolveUrl, lenLabel, onPress }: MediaBlockProps) {
  const [uri, setUri] = useState<string | null>(urlCache.get(cacheKey) ?? null);

  useEffect(() => {
    let live = true;
    const cached = urlCache.get(cacheKey);
    const pending =
      cached !== undefined
        ? Promise.resolve(cached)
        : resolveDisplayUrl(kind, resolveUrl).then((url) => {
            urlCache.set(cacheKey, url);
            return url;
          });
    pending
      .then((url) => {
        if (live) setUri(url);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [cacheKey, kind, resolveUrl]);

  return (
    <Pressable
      accessibilityRole={onPress !== undefined ? 'imagebutton' : 'image'}
      onPress={onPress}
      disabled={onPress === undefined}
      style={styles.block}
    >
      {uri !== null ? (
        <Image source={{ uri }} resizeMode="cover" style={StyleSheet.absoluteFill} />
      ) : (
        <>
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="noniMediaBlock" x1="33%" y1="3%" x2="67%" y2="97%">
                <Stop offset="0" stopColor={color.blue50} />
                <Stop offset="1" stopColor={color.blue100} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#noniMediaBlock)" />
          </Svg>
          <View style={styles.center}>
            <Icon name="images" size={22} color={color.blue300} />
          </View>
        </>
      )}
      {kind === 'video' && (
        <View style={styles.center}>
          <View style={[styles.disc, shadow.shadowCard]}>
            <Icon name="play" size={14} color={color.ink} />
          </View>
        </View>
      )}
      {kind === 'video' && lenLabel !== undefined && (
        <Text numberOfLines={1} style={styles.len}>
          {lenLabel}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: {
    marginTop: 6,
    width: WIDTH,
    height: HEIGHT,
    borderRadius: radiusAdmin.md,
    overflow: 'hidden',
    backgroundColor: color.blue100,
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    backgroundColor: color.whiteA90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  len: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.inkA55,
    fontSize: 10,
    fontWeight: '700',
    color: color.white,
    overflow: 'hidden',
  },
});

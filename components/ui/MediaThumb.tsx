// One thumbnail for either attach type. Screenshots render directly; a
// recording gets a first-frame poster pulled once per URL and a play badge,
// so lists never mount a video player per row.
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type ImageResizeMode, type StyleProp, type ViewStyle } from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';

import { isVideoPath } from '../../lib/media-library-api';
import { color } from '../../theme/tokens';
import { Icon } from './Icon';

const posterCache = new Map<string, string>();

export async function posterForVideo(url: string): Promise<string | null> {
  const cached = posterCache.get(url);
  if (cached) return cached;
  try {
    const thumb = await VideoThumbnails.getThumbnailAsync(url, { time: 300, quality: 0.7 });
    posterCache.set(url, thumb.uri);
    return thumb.uri;
  } catch {
    return null;
  }
}

export function MediaThumb(props: {
  uri: string;
  /** Poster to show for recordings when one is already known. */
  posterUri?: string;
  style: StyleProp<ViewStyle>;
  resizeMode?: ImageResizeMode;
  badgeSize?: number;
}) {
  const { uri, posterUri, style, resizeMode = 'cover', badgeSize = 18 } = props;
  const video = isVideoPath(uri);
  const [poster, setPoster] = useState<string | null>(posterUri ?? null);

  useEffect(() => {
    if (!video || posterUri) return;
    let live = true;
    void posterForVideo(uri).then((p) => {
      if (live) setPoster(p);
    });
    return () => {
      live = false;
    };
  }, [uri, video, posterUri]);

  const source = video ? poster : uri;

  return (
    <View style={[styles.wrap, style]}>
      {source ? (
        <Image source={{ uri: source }} style={StyleSheet.absoluteFill} resizeMode={resizeMode} />
      ) : null}
      {video ? (
        <View style={styles.badgeWrap} pointerEvents="none">
          <View style={[styles.badge, { width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2 }]}>
            <Icon name="play" size={badgeSize * 0.5} color={color.white} strokeWidth={3} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: color.ink,
  },
  badgeWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 1,
  },
});

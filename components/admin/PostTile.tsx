import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';

import { signedVideoUrl } from '../../lib/admin-api';
import { statusColor, statusLabel, type TaskStatus } from '../../lib/tasks';
import { color, radius, type } from '../../theme/tokens';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';

/** Thumbnails are expensive to extract; keep them for the session. */
const thumbCache = new Map<string, string>();

export function PostTile(props: {
  title: string;
  format: string;
  status: TaskStatus;
  videoPath: string | null;
  size: number;
  onPress: () => void;
}) {
  const { title, format, status, videoPath, size, onPress } = props;
  const [thumb, setThumb] = useState<string | null>(
    videoPath !== null ? thumbCache.get(videoPath) ?? null : null,
  );

  useEffect(() => {
    if (videoPath === null || thumbCache.has(videoPath)) return;
    let cancelled = false;
    void (async () => {
      try {
        const url = await signedVideoUrl(videoPath);
        const result = await VideoThumbnails.getThumbnailAsync(url, { time: 0 });
        thumbCache.set(videoPath, result.uri);
        if (!cancelled) setThumb(result.uri);
      } catch {
        // Fallback tile renders instead.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoPath]);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={[styles.tile, { width: size, height: size * 1.4 }]}
    >
      {thumb !== null ? (
        <Image source={{ uri: thumb }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={styles.fallback}>
          <Icon
            name={format === 'video' ? 'video' : 'images'}
            size={20}
            color={color.slate400}
          />
          <Text numberOfLines={3} style={styles.fallbackTitle}>
            {title}
          </Text>
        </View>
      )}
      <View style={[styles.statusPill, { backgroundColor: statusColor(status) }]}>
        <Text style={styles.statusText}>{statusLabel(status)}</Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.cell,
    backgroundColor: color.fillQuiet,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    padding: 8,
    gap: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackTitle: {
    fontSize: type.size.micro,
    fontWeight: '700',
    color: color.slate500,
    textAlign: 'center',
  },
  statusPill: {
    alignSelf: 'flex-start',
    margin: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
  },
  statusText: {
    fontSize: type.size.micro,
    fontWeight: '700',
    color: color.white,
  },
});

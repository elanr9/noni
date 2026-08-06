import { StyleSheet, Text, View } from 'react-native';

import { color, radiusAdmin, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { PostThumb } from '../shared';
import { useVideoThumb } from './useVideoThumb';

export interface PostGridTileProps {
  title: string;
  format: 'video' | 'photo_carousel';
  /** Latest submission recording; Reel first frame is extracted from it. */
  videoPath: string | null;
  /** Tile width; height is the 9:16 box. */
  size: number;
  viewsLabel: string;
  onPress: () => void;
}

/**
 * Admin handoff §10 — profile grid tile: 9:16 media with the format glyph
 * and view count on a bottom scrim.
 */
export function PostGridTile({
  title,
  format,
  videoPath,
  size,
  onPress,
  viewsLabel,
}: PostGridTileProps) {
  const thumb = useVideoThumb(format === 'video' ? videoPath : null);
  const height = Math.round((size * 16) / 9);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={{ width: size, height }}
    >
      <PostThumb
        uri={thumb}
        format={format}
        width={size}
        height={height}
        radius={radiusAdmin.md}
      />
      <View style={styles.footer}>
        <Icon
          name={format === 'video' ? 'play' : 'images'}
          size={12}
          color={color.whiteA92}
        />
        <Text style={styles.views} numberOfLines={1}>
          {viewsLabel}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  footer: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: radiusAdmin.pill,
    backgroundColor: 'rgba(11,15,20,0.55)',
  },
  views: {
    fontSize: type.size.micro,
    fontWeight: '700',
    color: color.whiteA92,
  },
});

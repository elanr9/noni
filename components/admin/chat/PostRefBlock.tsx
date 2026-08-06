import { StyleSheet, Text, View } from 'react-native';

import type { MessagePostRef } from '../../../lib/messages-api';
import { color, radiusAdmin, type } from '../../../theme/tokens';
import { PostThumb } from '../shared';
import { PressableScale } from '../../ui/PressableScale';

export interface PostRefBlockProps {
  postRef: MessagePostRef;
  /** Admin bubbles are blue; the block goes translucent white on them. */
  onBlue: boolean;
  onPress?: () => void;
}

/**
 * Admin handoff §10 — a message can carry a post reference: a nested
 * translucent block with a 34×46 thumb, title and meta.
 */
export function PostRefBlock({ postRef, onBlue, onPress }: PostRefBlockProps) {
  const format = postRef.format === 'photo_carousel' ? 'photo_carousel' : 'video';

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Open ${postRef.title}`}
      disabled={onPress === undefined}
      onPress={onPress}
      style={[styles.block, onBlue ? styles.blockOnBlue : styles.blockOnQuiet]}
    >
      <PostThumb uri={null} format={format} width={34} height={46} />
      <View style={styles.body}>
        <Text
          style={[styles.title, onBlue ? styles.titleOnBlue : styles.titleOnQuiet]}
          numberOfLines={1}
        >
          {postRef.title}
        </Text>
        <Text
          style={[styles.meta, onBlue ? styles.metaOnBlue : styles.metaOnQuiet]}
          numberOfLines={1}
        >
          {format === 'video' ? 'Reel' : 'Slideshow'}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  block: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: radiusAdmin.md,
  },
  blockOnBlue: {
    backgroundColor: color.whiteA16,
  },
  blockOnQuiet: {
    backgroundColor: color.whiteA60,
  },
  body: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: type.size.chip,
    fontWeight: '700',
  },
  titleOnBlue: {
    color: color.white,
  },
  titleOnQuiet: {
    color: color.ink,
  },
  meta: {
    fontSize: type.size.micro11,
    fontWeight: '600',
  },
  metaOnBlue: {
    color: color.whiteA75,
  },
  metaOnQuiet: {
    color: color.slate500,
  },
});

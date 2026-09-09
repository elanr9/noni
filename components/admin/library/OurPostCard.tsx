import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMetric } from '../../../lib/analytics';
import type { OurPost } from '../../../lib/library-api';
import { borderWidth, color } from '../../../theme/tokens';
import { PostThumb } from '../shared';
import { shortDate } from '../LibraryItemCard';
import { MakeButton } from './MakeButton';

export const OUR_POST_ROW_HEIGHT = 63;

export interface OurPostRowProps {
  post: OurPost;
  last: boolean;
  /** Fires once per mount for rows that still have no thumbnail. */
  onNeedThumbnail: (post: OurPost) => void;
  onPress: () => void;
  make?: { busy: boolean; disabled: boolean; onPress: () => void };
}

/** One dense row in the Our posts card: 34x45 thumb, title, one meta line, views, Remake. */
export function OurPostRow({ post, last, onNeedThumbnail, onPress, make }: OurPostRowProps) {
  const needsThumb = !post.thumbnail_url && !!post.post_url;

  useEffect(() => {
    if (needsThumb) onNeedThumbnail(post);
    // Only the first render should kick off enrichment for this row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.post_id]);

  const format = post.family === 'photo_carousel' ? 'photo_carousel' : 'video';
  const bits: { text: string; ink?: boolean }[] = [];
  if (post.creator_name) bits.push({ text: post.creator_name, ink: true });
  if (post.post_type_label) bits.push({ text: post.post_type_label });
  bits.push({ text: format === 'photo_carousel' ? 'Slideshow' : 'Reel' });
  const date = shortDate(post.posted_at ?? null);
  if (date) bits.push({ text: date });
  const usedCount = post.used_count ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.row, !last && styles.rowDivider]}
    >
      <PostThumb uri={post.thumbnail_url ?? null} format={format} width={34} height={45} />
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {post.title ?? post.hook ?? ''}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {bits.map((bit, i) => (
            <Text key={i}>
              {i > 0 ? ' · ' : ''}
              <Text style={bit.ink ? styles.metaInk : undefined}>{bit.text}</Text>
            </Text>
          ))}
        </Text>
        {usedCount > 0 && <Text style={styles.used}>{`Used ${usedCount}x`}</Text>}
      </View>
      <View style={styles.views}>
        <Text style={styles.viewsValue}>{formatMetric(post.views ?? 0)}</Text>
        <Text style={styles.viewsLabel}>views</Text>
      </View>
      {make !== undefined && (
        <MakeButton label="Remake" busy={make.busy} disabled={make.disabled} onPress={make.onPress} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  rowDivider: {
    borderBottomWidth: borderWidth.hair,
    borderBottomColor: color.line,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 13.5,
    fontWeight: '700',
    color: color.ink,
  },
  meta: {
    fontSize: 11.5,
    fontWeight: '600',
    color: color.slate400,
  },
  metaInk: {
    color: color.ink,
  },
  used: {
    fontSize: 11,
    fontWeight: '700',
    color: color.blue700,
  },
  views: {
    alignItems: 'flex-end',
  },
  viewsValue: {
    fontSize: 13.5,
    fontWeight: '700',
    color: color.green,
  },
  viewsLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: color.slate400,
  },
});

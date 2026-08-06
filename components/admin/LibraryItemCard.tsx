import { Image, StyleSheet, Text, View } from 'react-native';

import type { LibraryItem, OurPost } from '../../lib/library-api';
import { formatMetric } from '../../lib/analytics';
import { borderWidth, color, radius, shadow, type } from '../../theme/tokens';
import { MediaFallback } from '../ui/MediaFallback';
import { PressableScale } from '../ui/PressableScale';

const THUMB_WIDTH = 52;

/** One shape for all four chips; built by the two mappers below. */
export type LibraryCardModel = {
  id: string;
  text: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  meta: string;
  usedCount: number;
};

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function itemCardModel(item: LibraryItem): LibraryCardModel {
  const bits: string[] = [];
  const host = hostOf(item.url);
  if (host) bits.push(host);
  if (item.created_at) {
    bits.push(new Date(item.created_at).toLocaleDateString());
  }
  return {
    id: item.id,
    text: item.text,
    url: item.url,
    thumbnailUrl: item.thumbnail_url,
    meta: bits.join(' · '),
    usedCount: item.used_count,
  };
}

export function ourPostCardModel(post: OurPost): LibraryCardModel {
  const bits: string[] = [];
  if (post.creator_name) bits.push(post.creator_name);
  if (post.post_type_label) bits.push(post.post_type_label);
  if (post.platform) bits.push(post.platform);
  bits.push(`${formatMetric(post.views ?? 0)} views`);
  return {
    id: post.post_id,
    text: post.title ?? post.hook,
    url: post.post_url,
    thumbnailUrl: null,
    meta: bits.join(' · '),
    usedCount: 0,
  };
}

export interface LibraryItemCardProps {
  model: LibraryCardModel;
  onPress: () => void;
}

export function LibraryItemCard({ model, onPress }: LibraryItemCardProps) {
  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, shadow.shadowCard]}
    >
      {model.thumbnailUrl ? (
        <Image
          source={{ uri: model.thumbnailUrl }}
          style={styles.thumb}
          resizeMode="cover"
        />
      ) : model.url ? (
        <MediaFallback glyph="link" width={THUMB_WIDTH} />
      ) : null}
      <View style={styles.body}>
        <Text style={styles.text} numberOfLines={3}>
          {model.text ?? model.url ?? ''}
        </Text>
        {model.meta.length > 0 && (
          <Text style={styles.meta} numberOfLines={1}>
            {model.meta}
          </Text>
        )}
        {model.usedCount > 0 && (
          <Text style={styles.used}>
            {`Used ${model.usedCount} time${model.usedCount === 1 ? '' : 's'}`}
          </Text>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: color.white,
    borderRadius: radius.md,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    padding: 12,
  },
  thumb: {
    width: THUMB_WIDTH,
    aspectRatio: 9 / 16,
    borderRadius: radius.sm,
    backgroundColor: color.fillQuiet,
  },
  body: { flex: 1, gap: 4, justifyContent: 'center' },
  text: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.ink,
    lineHeight: type.size.bodySm * type.leading.snug,
  },
  meta: {
    fontSize: type.size.label,
    fontWeight: '600',
    color: color.slate400,
  },
  used: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.blue700,
  },
});

import { StyleSheet, Text, View } from 'react-native';

import type { LibraryItem, OurPost } from '../../lib/library-api';
import { formatMetric } from '../../lib/analytics';
import { borderWidth, color, radiusAdmin, shadow, type } from '../../theme/tokens';
import { CreatorAvatar, PostThumb } from './shared';
import { Button } from '../ui/Button';
import { PressableScale } from '../ui/PressableScale';

export type LibraryCardKind = 'idea' | 'our_post' | 'reference' | 'from_creator';

/** One shape for all four chips; built by the two mappers below. */
export type LibraryCardModel = {
  id: string;
  kind: LibraryCardKind;
  title: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  format: 'video' | 'photo_carousel';
  /** Media badge — duration for Reels, slide count for Slideshows — when known. */
  badge?: string;
  meta: string;
  creatorName: string | null;
  usedCount: number;
};

/** Fixed card heights (README §1) — media rows and text rows, per list. */
export const MEDIA_CARD_HEIGHT = 96;
export const TEXT_CARD_HEIGHT = 84;

export function cardHeightFor(kind: LibraryCardKind): number {
  return kind === 'reference' || kind === 'our_post'
    ? MEDIA_CARD_HEIGHT
    : TEXT_CARD_HEIGHT;
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** TikTok and Instagram links carry the handle in the path. */
function handleOf(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/@([A-Za-z0-9._]+)/);
  return match ? match[1] : null;
}

function sourceKind(source: string): LibraryCardKind {
  switch (source) {
    case 'our_post':
    case 'reference':
    case 'from_creator':
      return source;
    default:
      return 'idea';
  }
}

function usedBit(usedCount: number): string[] {
  if (usedCount <= 0) return [];
  return [`Used ${usedCount} time${usedCount === 1 ? '' : 's'}`];
}

export function itemCardModel(
  item: LibraryItem,
  creatorName?: string | null,
): LibraryCardModel {
  const kind = sourceKind(item.source);
  const date = item.created_at
    ? new Date(item.created_at).toLocaleDateString()
    : null;

  const bits: string[] = [];
  if (kind === 'reference') {
    // README asks for `@handle · views`; views are not on library_items, so
    // the handle (or host) stands alone.
    const handle = handleOf(item.url);
    const host = hostOf(item.url);
    if (handle) bits.push(`@${handle}`);
    else if (host) bits.push(host);
    if (date) bits.push(date);
  } else if (kind === 'from_creator') {
    if (creatorName) bits.push(creatorName);
    if (date) bits.push(date);
  } else if (date) {
    bits.push(date);
  }
  bits.push(...usedBit(item.used_count));

  return {
    id: item.id,
    kind,
    title: item.text ?? item.url,
    url: item.url,
    thumbnailUrl: item.thumbnail_url,
    format: 'video',
    meta: bits.join(' · '),
    creatorName: creatorName ?? null,
    usedCount: item.used_count,
  };
}

export function ourPostCardModel(post: OurPost): LibraryCardModel {
  const bits: string[] = [];
  if (post.creator_name) bits.push(post.creator_name);
  if (post.post_type_label) bits.push(post.post_type_label);
  bits.push(`${formatMetric(post.views ?? 0)} views`);
  return {
    id: post.post_id,
    kind: 'our_post',
    title: post.title ?? post.hook,
    url: post.post_url,
    thumbnailUrl: null,
    format: post.family === 'photo_carousel' ? 'photo_carousel' : 'video',
    meta: bits.join(' · '),
    creatorName: post.creator_name ?? null,
    usedCount: 0,
  };
}

export interface LibraryItemCardProps {
  model: LibraryCardModel;
  onPress: () => void;
  /** From-creator rows carry a Use button. */
  onUse?: () => void;
  /** Picker rows highlight the choice before Attach. */
  selected?: boolean;
}

/**
 * Admin handoff §9 — one fixed-height card per list. References and our posts
 * lead with a PostThumb (gradient fallback per the media rule), from-creator
 * rows lead with the CreatorAvatar and carry a Use button.
 */
export function LibraryItemCard({
  model,
  onPress,
  onUse,
  selected = false,
}: LibraryItemCardProps) {
  const showThumb = model.kind === 'reference' || model.kind === 'our_post';

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={selected ? { selected } : undefined}
      onPress={onPress}
      style={[
        styles.card,
        { height: cardHeightFor(model.kind) },
        shadow.shadowCard,
        selected && styles.cardSelected,
      ]}
    >
      {showThumb && (
        <PostThumb
          uri={model.thumbnailUrl}
          format={model.format}
          badge={model.badge}
          width={54}
          height={72}
        />
      )}
      {model.kind === 'from_creator' && (
        <CreatorAvatar uri={null} name={model.creatorName ?? 'Creator'} size={36} />
      )}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {model.title ?? ''}
        </Text>
        {model.meta.length > 0 && (
          <Text style={styles.meta} numberOfLines={1}>
            {model.meta}
          </Text>
        )}
      </View>
      {model.kind === 'from_creator' && onUse !== undefined && (
        <Button size="sm" variant="tint" onPress={onUse}>
          Use
        </Button>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: color.white,
    borderRadius: radiusAdmin.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    paddingHorizontal: 12,
  },
  cardSelected: {
    backgroundColor: color.blue50,
    borderColor: color.blue500,
  },
  body: {
    flex: 1,
    gap: 4,
    justifyContent: 'center',
  },
  title: {
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
});

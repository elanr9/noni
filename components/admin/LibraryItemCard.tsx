import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { LibraryItem, LibraryItemWithBriefs, OurPost } from '../../lib/library-api';
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
  /** The brief this row last became; the meta line links to it. */
  lastBriefId?: string | null;
};

export function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

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

/** `Made 2x · Aug 24` once a row has become a post; `New` until then. */
function madeBits(usedCount: number, lastUsedAt: string | null): string[] {
  if (usedCount <= 0) return ['New'];
  const date = shortDate(lastUsedAt);
  return date ? [`Made ${usedCount}x`, date] : [`Made ${usedCount}x`];
}

function hasReadyBriefs(
  item: LibraryItem | LibraryItemWithBriefs,
): item is LibraryItemWithBriefs {
  return 'video_brief' in item;
}

/** "Ready as a reel" / "Ready as a slideshow" / "Ready in both lanes", lane first when given. */
function readyBits(item: LibraryItemWithBriefs, family?: 'video' | 'photo_carousel'): string[] {
  const video = item.video_brief !== null;
  const slides = item.carousel_brief !== null;
  if (!video && !slides) return [];
  if (family) {
    const inLane = family === 'video' ? video : slides;
    return [inLane ? 'Ready, copies in instantly' : 'Ready in the other lane, ports across'];
  }
  if (video && slides) return ['Ready in both lanes'];
  return [video ? 'Ready as a reel' : 'Ready as a slideshow'];
}

export function itemCardModel(
  item: LibraryItem | LibraryItemWithBriefs,
  creatorName?: string | null,
  family?: 'video' | 'photo_carousel',
): LibraryCardModel {
  const kind = sourceKind(item.source);
  const date = shortDate(item.created_at);
  const ready = hasReadyBriefs(item) ? readyBits(item, family) : [];
  const readyBrief = hasReadyBriefs(item)
    ? (family === 'photo_carousel' ? item.carousel_brief : item.video_brief) ??
      item.video_brief ??
      item.carousel_brief
    : null;

  const bits: string[] = [...ready];
  if (kind === 'reference') {
    const handle = handleOf(item.url);
    const host = hostOf(item.url);
    if (handle) bits.push(`@${handle}`);
    else if (host) bits.push(host);
    if (date) bits.push(date);
    if (item.used_count > 0) bits.push(`Made ${item.used_count}x`);
  } else if (kind === 'from_creator') {
    if (creatorName) bits.push(creatorName);
    if (date) bits.push(date);
    if (item.used_count > 0) bits.push(`Made ${item.used_count}x`);
  } else if (ready.length === 0) {
    bits.push(...madeBits(item.used_count, item.last_used_at));
  } else if (item.used_count > 0) {
    bits.push(`Made ${item.used_count}x`);
  }

  return {
    id: item.id,
    kind,
    title: readyBrief?.title ?? item.text ?? item.url,
    url: item.url,
    thumbnailUrl: item.thumbnail_url,
    format: readyBrief?.format === 'photo_carousel' ? 'photo_carousel' : 'video',
    meta: bits.join(' · '),
    creatorName: creatorName ?? null,
    usedCount: item.used_count,
    lastBriefId: item.last_brief_id,
  };
}

export function ourPostCardModel(post: OurPost): LibraryCardModel {
  const bits: string[] = [];
  if (post.creator_name) bits.push(post.creator_name);
  if (post.post_type_label) bits.push(post.post_type_label);
  bits.push(`${formatMetric(post.views ?? 0)} views`);
  bits.push(`${formatMetric(post.saves ?? 0)} saves`);
  const usedCount = post.used_count ?? 0;
  if (usedCount > 0) bits.push(`Remade ${usedCount}x`);
  return {
    id: post.post_id,
    kind: 'our_post',
    title: post.title ?? post.hook,
    url: post.post_url,
    thumbnailUrl: post.thumbnail_url ?? null,
    format: post.family === 'photo_carousel' ? 'photo_carousel' : 'video',
    meta: bits.join(' · '),
    creatorName: post.creator_name ?? null,
    usedCount,
  };
}

export interface LibraryItemCardProps {
  model: LibraryCardModel;
  onPress: () => void;
  /** From-creator rows carry a Use button. */
  onUse?: () => void;
  /** The row's trailing action, when it is not the Use button. */
  action?: { label: string; onPress: () => void; disabled?: boolean };
  /** Picker rows highlight the choice before Attach. */
  selected?: boolean;
  /** Library rows open a Delete action sheet on long press. */
  onLongPress?: () => void;
  /** Tapping the meta line opens the post this row last became. */
  onMetaPress?: () => void;
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
  action,
  selected = false,
  onLongPress,
  onMetaPress,
}: LibraryItemCardProps) {
  const showThumb = model.kind === 'reference' || model.kind === 'our_post';

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={selected ? { selected } : undefined}
      onPress={onPress}
      onLongPress={onLongPress}
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
        {model.meta.length > 0 && onMetaPress !== undefined ? (
          <Pressable onPress={onMetaPress} hitSlop={{ top: 6, bottom: 6 }}>
            <Text style={[styles.meta, styles.metaLink]} numberOfLines={1}>
              {model.meta}
            </Text>
          </Pressable>
        ) : model.meta.length > 0 ? (
          <Text style={styles.meta} numberOfLines={1}>
            {model.meta}
          </Text>
        ) : null}
      </View>
      {model.kind === 'from_creator' && onUse !== undefined && (
        <Button size="sm" variant="tint" onPress={onUse}>
          Use
        </Button>
      )}
      {action !== undefined && (
        <Button
          size="sm"
          variant="tint"
          disabled={action.disabled}
          onPress={action.onPress}
        >
          {action.label}
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
  metaLink: {
    color: color.blue700,
  },
});

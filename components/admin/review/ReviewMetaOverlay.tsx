import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { ContentFormat } from '../../../lib/admin-review-types';
import { color, radiusAdmin, type } from '../../../theme/tokens';
import { CreatorAvatar } from '../shared';
import { Icon, type IconName } from '../../ui/Icon';

export interface ReviewMetaOverlayProps {
  creatorName: string;
  /** @handle from the linked account; the name stands in when missing. */
  handle: string | null;
  /** post_types.label; the segment is dropped when unknown. */
  typeLabel: string | null;
  ageLabel: string;
  format: ContentFormat;
  caption: string;
  hashtags: string[];
  /** Slideshows only: pager dots sit between the photo and the caption. */
  slideCount?: number;
  slideIndex?: number;
}

const RAIL_ICONS: IconName[] = ['heart', 'message-circle', 'bookmark', 'share-2'];

/**
 * The post the way it lands in the feed: right hand action rail, bottom left
 * handle, caption, hashtags and sound row. Decorative, nothing here is tappable.
 */
export function ReviewMetaOverlay({
  creatorName,
  handle,
  typeLabel,
  ageLabel,
  format,
  caption,
  hashtags,
  slideCount = 0,
  slideIndex = 0,
}: ReviewMetaOverlayProps) {
  const shownHandle = handle !== null ? `@${handle}` : creatorName;
  const meta = typeLabel !== null ? `${typeLabel} \u00b7 ${ageLabel}` : ageLabel;
  const tags = hashtags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(' ');
  const sound = format === 'video' ? `Original sound  \u00b7  ${shownHandle}` : 'Photo mode';

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="noniReviewBottomScrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color.ink900} stopOpacity="0" />
            <Stop offset="1" stopColor={color.ink900} stopOpacity="0.82" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#noniReviewBottomScrim)" />
      </Svg>

      <View style={styles.row}>
        <View style={styles.left}>
          {slideCount > 1 && (
            <View style={styles.dots}>
              {Array.from({ length: slideCount }, (_, i) => (
                <View key={i} style={[styles.dot, i === slideIndex && styles.dotActive]} />
              ))}
            </View>
          )}
          <Text numberOfLines={1} style={styles.handle}>
            {shownHandle}
          </Text>
          <Text numberOfLines={1} style={styles.meta}>
            {meta}
          </Text>
          {(caption.length > 0 || tags.length > 0) && (
            <Text numberOfLines={4} style={styles.caption}>
              {caption}
              {caption.length > 0 && tags.length > 0 ? ' ' : ''}
              {tags.length > 0 && <Text style={styles.hashtags}>{tags}</Text>}
            </Text>
          )}
          <View style={styles.soundRow}>
            <Icon name="music-2" size={13} color={color.white} />
            <Text numberOfLines={1} style={styles.sound}>
              {sound}
            </Text>
          </View>
        </View>

        <View style={styles.rail}>
          <View style={styles.avatarWrap}>
            <CreatorAvatar uri={null} name={creatorName} size={44} style={styles.avatar} />
            <View style={styles.plusBadge}>
              <Icon name="plus" size={12} color={color.white} />
            </View>
          </View>
          {RAIL_ICONS.map((name) => (
            <View key={name} style={styles.railItem}>
              <Icon name={name} size={30} color={color.white} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: 72,
    paddingLeft: 14,
    paddingRight: 10,
    paddingBottom: 14,
    gap: 8,
  },
  left: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  dots: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.whiteA45,
  },
  dotActive: {
    backgroundColor: color.white,
  },
  handle: {
    fontSize: type.size.body,
    fontWeight: type.weight.bold,
    color: color.white,
  },
  meta: {
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.whiteA75,
  },
  caption: {
    fontSize: type.size.meta,
    lineHeight: type.size.meta * 1.4,
    fontWeight: type.weight.regular,
    color: color.whiteA92,
  },
  hashtags: {
    fontWeight: type.weight.bold,
    color: color.white,
  },
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  sound: {
    flex: 1,
    fontSize: type.size.chip,
    fontWeight: type.weight.regular,
    color: color.white,
  },
  rail: {
    width: 56,
    alignItems: 'center',
    gap: 20,
    paddingBottom: 2,
  },
  avatarWrap: {
    alignItems: 'center',
    marginBottom: 6,
  },
  avatar: {
    borderWidth: 1.5,
    borderColor: color.white,
  },
  plusBadge: {
    position: 'absolute',
    bottom: -9,
    width: 20,
    height: 20,
    borderRadius: radiusAdmin.pill,
    backgroundColor: '#FE2C55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  railItem: {
    alignItems: 'center',
  },
});

import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { ContentFormat } from '../../../lib/admin-review-types';
import { color, type } from '../../../theme/tokens';
import { CreatorAvatar } from '../shared';
import { FormatPill } from '../../ui/FormatPill';

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
}

/**
 * Admin handoff §3 bottom scrim — creator photo, @handle, type · age,
 * format chip, caption, hashtags. The platform layout, not a form.
 */
export function ReviewMetaOverlay({
  creatorName,
  handle,
  typeLabel,
  ageLabel,
  format,
  caption,
  hashtags,
}: ReviewMetaOverlayProps) {
  const meta = typeLabel !== null ? `${typeLabel} \u00b7 ${ageLabel}` : ageLabel;

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="noniReviewBottomScrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color.ink900} stopOpacity="0" />
            <Stop offset="1" stopColor={color.ink900} stopOpacity="0.88" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#noniReviewBottomScrim)" />
      </Svg>

      <View style={styles.content}>
        <View style={styles.creatorRow}>
          <CreatorAvatar uri={null} name={creatorName} size={34} />
          <View style={styles.creatorText}>
            <Text numberOfLines={1} style={styles.handle}>
              {handle !== null ? `@${handle}` : creatorName}
            </Text>
            <Text numberOfLines={1} style={styles.meta}>
              {meta}
            </Text>
          </View>
          <FormatPill format={format} overlay />
        </View>

        {caption.length > 0 && (
          <Text numberOfLines={3} style={styles.caption}>
            {caption}
          </Text>
        )}
        {hashtags.length > 0 && (
          <Text numberOfLines={2} style={styles.hashtags}>
            {hashtags.map((tag) => `#${tag}`).join(' ')}
          </Text>
        )}
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
  content: {
    paddingTop: 48,
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 8,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  creatorText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  handle: {
    fontSize: type.size.bodySm,
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
    lineHeight: type.size.meta * 1.45,
    fontWeight: type.weight.regular,
    color: color.whiteA92,
  },
  hashtags: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.white,
  },
});

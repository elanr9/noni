import { StyleSheet, Text, View } from 'react-native';

import { color, postTypeTone, radius, type, type PostTypeKey } from '../../theme/tokens';
import { Icon } from '../ui/Icon';

/**
 * On-media chips (README §"Post-type and format color coding"). They sit
 * top-left ON the media everywhere a post is shown, via MediaCard's `chips`
 * prop. Pillar tags never appear on creator cards.
 */

const FORMAT_TONE = {
  reel: { bg: color.blue100, fg: color.blue700, icon: 'video', label: 'Reel' },
  slideshow: { bg: '#ECE7FB', fg: '#5B44B4', icon: 'images', label: 'Slideshow' },
} as const;

export interface FormatTagProps {
  /** brief.format — 'photo_carousel' reads Slideshow, anything else Reel. */
  format: string;
}

export function FormatTag({ format }: FormatTagProps) {
  const tone = format === 'photo_carousel' ? FORMAT_TONE.slideshow : FORMAT_TONE.reel;
  return (
    <View style={[styles.chip, { backgroundColor: tone.bg }]}>
      <Icon name={tone.icon} size={12} color={tone.fg} />
      <Text numberOfLines={1} style={[styles.text, { color: tone.fg }]}>
        {tone.label}
      </Text>
    </View>
  );
}

const TYPE_FALLBACK = { bg: color.fillQuiet, fg: color.slate500 } as const;

function toneForTypeKey(typeKey: string | undefined): { bg: string; fg: string } {
  if (typeKey !== undefined && typeKey in postTypeTone) {
    return postTypeTone[typeKey as PostTypeKey];
  }
  return TYPE_FALLBACK;
}

export interface TypeTagProps {
  /** Display label, e.g. "Numbered list". */
  label: string;
  /** public.post_types.key — colors from theme postTypeTone when it matches. */
  typeKey?: string;
}

export function TypeTag({ label, typeKey }: TypeTagProps) {
  const tone = toneForTypeKey(typeKey);
  return (
    <View style={[styles.chip, { backgroundColor: tone.bg }]}>
      <Text numberOfLines={1} style={[styles.text, { color: tone.fg }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    flexShrink: 1,
  },
  text: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
  },
});

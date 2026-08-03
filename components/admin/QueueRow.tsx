import { StyleSheet, Text, View } from 'react-native';

import type { MockQueueItem } from '../../lib/admin-review-types';
import { borderWidth, color, radius, shadow, space, type } from '../../theme/tokens';
import { StatusChip } from '../StatusChip';
import { FormatPill } from '../ui/FormatPill';
import { Icon } from '../ui/Icon';
import { MediaFallback } from '../ui/MediaFallback';
import { PressableScale } from '../ui/PressableScale';

export interface QueueRowProps {
  item: MockQueueItem;
  onPress: () => void;
}

/** Queue option 1a row (README §4.2). The whole row is the tap target. */
export function QueueRow({ item, onPress }: QueueRowProps) {
  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, shadow.shadowCard]}
    >
      <MediaFallback
        glyph={item.format === 'photo_carousel' ? 'images' : 'play'}
        label={item.lengthLabel}
        width={56}
        radius={radius.sm}
        glyphSize={18}
        labelOffset={6}
      />
      <View style={styles.column}>
        <View style={styles.metaRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>{item.creator.initial}</Text>
          </View>
          <Text numberOfLines={1} style={styles.creator}>
            {item.creator.name}
          </Text>
          <Text style={styles.dot}>{'\u00b7'}</Text>
          <Text numberOfLines={1} style={styles.age}>
            {item.ageLabel}
          </Text>
        </View>
        <Text numberOfLines={2} style={styles.title}>
          {item.title}
        </Text>
        <View style={styles.chipRow}>
          <FormatPill format={item.format} />
          <StatusChip
            status={item.status}
            label={item.resubmitted ? 'Resubmitted' : undefined}
          />
        </View>
      </View>
      <Icon name="chevron-right" size={20} color={color.slate300} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: space.tapMin,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  column: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: type.size.micro,
    fontWeight: type.weight.heavy,
    color: color.blue700,
  },
  creator: {
    flexShrink: 1,
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.slate500,
  },
  dot: {
    fontSize: type.size.chip,
    fontWeight: type.weight.regular,
    color: color.slate300,
  },
  age: {
    fontSize: type.size.chip,
    fontWeight: type.weight.regular,
    color: color.slate400,
  },
  title: {
    fontSize: type.size.bodySm,
    lineHeight: 20,
    fontWeight: type.weight.bold,
    letterSpacing: -0.2,
    color: color.ink,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
});

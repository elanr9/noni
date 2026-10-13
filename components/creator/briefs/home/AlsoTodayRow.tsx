// One fixed height row in the Also today list: status tile, two line title,
// format and kind chips, chevron. From SSCreator.jsx CreatorHome.
import type { JSX } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CreatorBriefItem } from '../../../../lib/briefs-api';
import { color, radius, type as typeToken } from '../../../../theme/tokens';
import { FormatChip, KindChip } from '../../../shared/briefs';
import { Icon, type IconName } from '../../../ui/Icon';
import { creatorStatus } from '../model';

export const ALSO_TODAY_ROW_HEIGHT = 78;

export function AlsoTodayRow({ item, onPress }: { item: CreatorBriefItem; onPress: () => void }): JSX.Element {
  const { brief } = item;
  const status = creatorStatus(item.status);
  const tile =
    status === 'posted'
      ? { bg: color.greenSoft, fg: color.green, icon: 'circle-check-big' as IconName }
      : status === 'review'
        ? { bg: color.amberSoft, fg: color.amber, icon: 'clock' as IconName }
        : { bg: color.blue100, fg: color.blue700, icon: (brief.format === 'reel' ? 'video' : 'images') as IconName };
  const title = brief.kind === 'open' && !brief.title ? 'Freestyle' : brief.title;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${status === 'posted' ? 'Posted' : status === 'review' ? 'In review' : 'To make'}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      <View style={[styles.tile, { backgroundColor: tile.bg }]}>
        <Icon name={tile.icon} size={18} color={tile.fg} />
      </View>
      <View style={styles.body}>
        <Text numberOfLines={2} style={styles.title}>
          {title}
        </Text>
        <View style={styles.chips}>
          <FormatChip format={brief.format} size="sm" />
          <KindChip kind={brief.kind} format={brief.format} size="sm" />
        </View>
      </View>
      <Icon name="chevron-right" size={18} color={color.slate300} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    height: ALSO_TODAY_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.white,
  },
  pressed: { opacity: 0.85 },
  tile: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontFamily: typeToken.font.ui, fontSize: 14.5, lineHeight: 18, fontWeight: '700', color: color.ink },
  chips: { flexDirection: 'row', gap: 5 },
});

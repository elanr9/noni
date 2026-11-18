import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { TYPE_META, type Brief } from '../../../../lib/brief-library';
import { ageLabel } from '../../../../lib/v2-format';
import { color, tone as tones } from '../../../../theme/v2';
import { Card, Icon } from '../../../v2';
import { TypeTile } from './TypeTile';

/** Title with the searched words marked in blue tint. */
export function markWords(text: string, words: string[]): ReactNode {
  if (!words.length) return text;
  // One capture group: split puts every match at an odd index. (A global
  // regex's .test() keeps lastIndex between calls, so it can't be reused.)
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'i');
  return text.split(re).map((part, i) =>
    part && i % 2 === 1 ? (
      <Text key={i} style={{ backgroundColor: color.blueTint, color: color.blueDeep }}>
        {part}
      </Text>
    ) : (
      <Text key={i}>{part}</Text>
    ),
  );
}

/** Library row: 64 wide type column (tile 36 and the type in its tone), two-line title, age, chevron. */
export function BriefCard({ b, onPress, words = [] }: { b: Brief; onPress: () => void; words?: string[] }) {
  const m = TYPE_META[b.type] ?? TYPE_META['Talking Head'];
  return (
    <Card onPress={onPress} pad={0} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingBottom: 12, paddingLeft: 14, paddingRight: 12 }}>
      <View style={{ width: 64, alignItems: 'center', gap: 5 }}>
        <TypeTile type={b.type} size={36} />
        <Text allowFontScaling={false} style={{ fontSize: 10, lineHeight: 12, fontWeight: '700', color: tones[m.tone].fg, textAlign: 'center', width: 72, marginHorizontal: -4 }}>
          {b.type}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} style={{ fontSize: 16, lineHeight: 20, fontWeight: '600', color: color.ink }}>
          {markWords(b.title, words)}
        </Text>
        <Text style={{ marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '500', color: color.grey3 }}>{ageLabel(b.ts)}</Text>
      </View>
      <Icon name="chevron_right" size={22} color={color.grey3} />
    </Card>
  );
}

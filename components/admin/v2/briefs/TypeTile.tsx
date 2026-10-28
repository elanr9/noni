import { View } from 'react-native';

import { TYPE_META, type BriefType } from '../../../../lib/brief-library';
import { tone as tones } from '../../../../theme/v2';
import { Icon } from '../../../v2';

/** Tint square (44x58 at size 44) with the post type icon. */
export function TypeTile({ type, size = 44 }: { type: BriefType; size?: number }) {
  const m = TYPE_META[type] ?? TYPE_META['Talking Head'];
  const t = tones[m.tone];
  return (
    <View style={{ width: size, height: Math.round((size * 58) / 44), borderRadius: 10, backgroundColor: t.tint, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon name={m.icon} size={Math.round(size / 2)} color={t.fg} />
    </View>
  );
}

// White pill at the top of the Creators pane: the first three creators' avatars
// and "{n} creators", pushing the Creators list. With nobody on the roster
// it reads "Invite creators" and goes to the same place, where Invite lives.
import { Text, View } from 'react-native';

import type { V2Creator } from '../../../../lib/v2-posts';
import { color, radius, shadow } from '../../../../theme/v2';
import { Avatar, Icon, Press } from '../../../v2';

export function CreatorsButton({ creators, onPress }: { creators: V2Creator[]; onPress: () => void }) {
  const n = creators.length;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={n ? `${n} creators` : 'Invite creators'}
      onPress={onPress}
      style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingLeft: n ? 6 : 12, paddingRight: 12, borderRadius: radius.pill, backgroundColor: color.card, ...shadow.card }}
    >
      {n ? (
        <View style={{ flexDirection: 'row' }}>
          {creators.slice(0, 3).map((c, i) => (
            <View key={c.id} style={{ marginLeft: i ? -8 : 0, width: 30, height: 30, borderRadius: radius.pill, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center' }}>
              <Avatar name={c.name} photo={c.photo} tone={c.tone} size={26} ring={false} />
            </View>
          ))}
        </View>
      ) : (
        <Icon name="person" size={18} color={color.blue} />
      )}
      <Text style={{ fontSize: 13, lineHeight: 16, fontWeight: '700', color: color.ink }}>{n ? `${n} ${n === 1 ? 'creator' : 'creators'}` : 'Invite creators'}</Text>
      <Icon name="chevron_right" size={16} color={color.grey3} />
    </Press>
  );
}

import { StyleSheet, View } from 'react-native';

import { color } from '../../../theme/tokens';
import { CreatorAvatar } from './CreatorAvatar';

export type StackPerson = {
  id: string;
  name: string;
  me?: boolean;
};

export function AvatarStack({
  people,
  size = 30,
}: {
  people: StackPerson[];
  size?: number;
}) {
  return (
    <View style={styles.row}>
      {people.map((p, i) => (
        <View
          key={p.id}
          style={[
            styles.ring,
            { marginLeft: i === 0 ? 0 : -8, borderRadius: 999 },
          ]}
        >
          <CreatorAvatar
            name={p.name}
            size={size}
            tone={p.me ? 'brand' : 'quiet'}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ring: {
    borderWidth: 2,
    borderColor: color.white,
  },
});

import { Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { Card, Screen } from '../../components/v2';
import { text } from '../../theme/v2';

/** Create a post, or view a saved brief when `slot` is an existing id. Stage C fills this in. */
export default function NewBriefRoute() {
  const { slot } = useLocalSearchParams<{ slot?: string }>();
  return (
    <Screen close>
      <Card style={{ marginHorizontal: 20 }}>
        <Text style={text.body}>New post for slot {slot}. Stage C builds the three-step modal here.</Text>
      </Card>
    </Screen>
  );
}

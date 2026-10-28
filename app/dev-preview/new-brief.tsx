import { Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { Card, Screen } from '../../components/v2';
import { text } from '../../theme/v2';

export default function NewBriefPreview() {
  const { slot } = useLocalSearchParams<{ slot?: string }>();
  return (
    <Screen close>
      <Card style={{ marginHorizontal: 20 }}>
        <Text style={text.body}>Stage C: slot {slot}.</Text>
      </Card>
    </Screen>
  );
}

import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { color, text } from '../../../theme/v2';
import { Card, Icon, Row, Screen } from '../../../components/v2';

/** Earnings tab: the creator's own payout view. Payouts and history sit behind the Payouts row. */
export default function CreatorEarnings() {
  const router = useRouter();
  return (
    <Screen title="Earnings" scroll tabRoot>
      <Card pad={0} style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
        <Row last chevron onPress={() => router.push('/(creator)/balance')}>
          <View style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: color.greenTint, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="payments" size={22} color={color.green} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={text.row}>Payouts</Text>
            <Text style={text.meta}>Balance and history</Text>
          </View>
        </Row>
      </Card>
    </Screen>
  );
}

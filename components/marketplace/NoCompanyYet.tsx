// What a creator's other tabs show before any company has taken them on:
// one line on why it is empty and the way to Campaigns.
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { color, radius, text } from '../../theme/v2';
import { Button, Icon, Screen } from '../v2';

export function NoCompanyYet({ title }: { title: string }) {
  const router = useRouter();
  return (
    <Screen title={title} tabRoot>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <View style={{ width: 64, height: 64, borderRadius: radius.pill, backgroundColor: color.blueTint, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Icon name="storefront" size={30} color={color.blueDeep} />
        </View>
        <Text style={[text.card, { textAlign: 'center', marginBottom: 20 }]}>Join your first campaign</Text>
        <View style={{ flexDirection: 'row' }}>
          <Button label="Explore campaigns" pill onPress={() => router.navigate('/(creator)/(tabs)/market')} />
        </View>
      </View>
    </Screen>
  );
}

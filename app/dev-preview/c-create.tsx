import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { CreateSheet } from '../../components/creator/v2/CreateSheet';
import { color } from '../../theme/v2';

export default function Preview() {
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <CreateSheet onClose={() => router.back()} onPick={() => router.back()} />
    </View>
  );
}

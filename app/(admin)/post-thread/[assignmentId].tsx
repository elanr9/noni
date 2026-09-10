import { StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PostThread } from '../../../components/admin/messages/thread/PostThread';
import { useAuth } from '../../../lib/auth';
import { color } from '../../../theme/tokens';

/** One post, its whole life: every event and message about it. */
export default function PostThreadScreen() {
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();

  if (!profile || !assignmentId) return null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <PostThread companyId={profile.company_id} assignmentId={assignmentId} meId={profile.id} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.white },
});

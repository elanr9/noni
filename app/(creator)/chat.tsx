import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';

import { ChatThread } from '../../components/ChatThread';
import { useAuth } from '../../lib/auth';
import { color } from '../../theme/tokens';

/** The creator's side of the same one-thread-per-creator system. */
export default function CreatorChat() {
  const { profile } = useAuth();
  const headerHeight = useHeaderHeight();

  if (!profile) return null;

  return (
    <View style={styles.screen}>
      <ChatThread
        companyId={profile.company_id}
        creatorId={profile.id}
        meId={profile.id}
        keyboardOffset={headerHeight}
        onOpenPostRef={(ref) => {
          if (ref.assignmentId !== null) {
            router.push({
              pathname: '/(creator)/assignment/[id]',
              params: { id: ref.assignmentId },
            });
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
});

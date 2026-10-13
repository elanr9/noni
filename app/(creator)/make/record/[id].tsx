// Reel record route: the camera for one brief. Done goes to the editor;
// Close returns to where the creator came from with the draft kept.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { JSX } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { RecordScreen } from '../../../../components/creator/briefs/reel/RecordScreen';
import { useReelProject } from '../../../../components/creator/briefs/reel/useReelProject';
import { color, space, type } from '../../../../theme/tokens';

export default function RecordRoute(): JSX.Element {
  const { id, item, from } = useLocalSearchParams<{ id: string; item?: string; from?: string }>();
  const router = useRouter();
  const reel = useReelProject(id);

  if (reel.loading || !reel.brief || !reel.document) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        {reel.error ? <Text style={styles.error}>{reel.error}</Text> : <ActivityIndicator color={color.blue500} />}
      </View>
    );
  }

  const toEditor = () => router.replace({ pathname: '/(creator)/make/edit/[id]', params: { id } });

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <RecordScreen
        brief={reel.brief}
        document={reel.document}
        items={reel.items}
        setItems={reel.setItems}
        features={reel.features}
        companyName={reel.companyName}
        startItemId={item ?? null}
        onDone={toEditor}
        onClose={() => (from === 'edit' ? toEditor() : router.back())}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.ink900 },
  error: { fontSize: type.size.body, color: color.white, textAlign: 'center', paddingHorizontal: space[8] },
});

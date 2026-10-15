// Reel record route: the camera for one brief. Done goes to the editor;
// Close returns to where the creator came from with the draft kept. From
// changes requested, `flags` carries the manager's per clip labels (Hook,
// Point 2, CTA) and the camera opens on the first flagged clip.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, type JSX } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { flaggedItemIds } from '../../../../components/creator/briefs/reel/plan';
import { RecordScreen } from '../../../../components/creator/briefs/reel/RecordScreen';
import { useReelProject } from '../../../../components/creator/briefs/reel/useReelProject';
import { color, space, type } from '../../../../theme/tokens';

export default function RecordRoute(): JSX.Element {
  const { id, item, from, flags } = useLocalSearchParams<{ id: string; item?: string; from?: string; flags?: string }>();
  const router = useRouter();
  const reel = useReelProject(id);
  const ready = !reel.loading && reel.brief !== null;
  // Mapped once the plan is in; RecordScreen reads it when it mounts.
  const redoItemIds = useMemo(
    () => (ready && flags ? flaggedItemIds(reel.items, flags.split('|')) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, flags],
  );

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
        redoItemIds={redoItemIds}
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

import { Redirect, Stack } from 'expo-router';

import { seedPreviewData } from '../../lib/v2-preview-data';

// Seed at import time so no store updates happen during a render.
if (__DEV__) seedPreviewData();

/** Dev only: the v2 admin screens with sample data and no session. */
export default function DevPreviewLayout() {
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', animationDuration: 240 }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="new-brief" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', animationDuration: 240 }} />
    </Stack>
  );
}

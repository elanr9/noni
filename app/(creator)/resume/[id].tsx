// Resume an unfinished post: works out where it left off (editor, camera or
// slideshow maker) and hands over to that screen. Shown as a short
// "Opening your post" moment over whatever was underneath.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button, Icon } from '../../../components/v2';
import { useAuth } from '../../../lib/auth';
import { useLibStore } from '../../../lib/brief-library-api';
import { planResume } from '../../../lib/creator-resume';
import { color, radius, shadow, text } from '../../../theme/v2';

export default function ResumeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const companyId = profile?.active_company_id ?? null;
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!companyId || !id) return;
    let live = true;
    void (async () => {
      try {
        const lib = useLibStore.getState();
        if (!lib.loaded || lib.companyId !== companyId) await lib.load(companyId).catch(() => undefined);
        const plan = await planResume({
          companyId,
          assignmentId: id,
          libraryBrief: (bid) => useLibStore.getState().briefs.find((b) => b.id === bid),
        });
        if (live) router.replace(plan.href);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : 'Could not open this post');
      }
    })();
    return () => {
      live = false;
    };
  }, [companyId, id, router, attempt]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Animated.View entering={FadeIn.duration(160)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.scrim }} />
      {error ? (
        <Animated.View key="error" entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={{ width: '100%', maxWidth: 340, backgroundColor: color.card, borderRadius: radius.sheet, padding: 20, gap: 12, ...shadow.float }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="error" size={22} color={color.pink} />
            <Text style={text.card}>Could not open this post</Text>
          </View>
          <Text style={text.meta}>{error}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Button variant="quiet" label="Close" onPress={() => router.back()} />
            <Button
              label="Try again"
              onPress={() => {
                setError(null);
                setAttempt((n) => n + 1);
              }}
            />
          </View>
        </Animated.View>
      ) : (
        <Animated.View key="loading" entering={FadeIn.delay(120).duration(200)} exiting={FadeOut.duration(120)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: color.ink }}>
          <ActivityIndicator color={color.white} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: color.white }}>Opening your post</Text>
        </Animated.View>
      )}
    </View>
  );
}

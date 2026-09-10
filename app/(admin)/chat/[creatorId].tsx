import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CreatorThread } from '../../../components/admin/messages/thread/CreatorThread';
import { useAuth } from '../../../lib/auth';
import { getCreatorAccount } from '../../../lib/creator-accounts-api';
import { isCreatorThreadMuted, setCreatorThreadMuted } from '../../../lib/messages-api';
import { supabase } from '../../../lib/supabase';
import { color } from '../../../theme/tokens';

type CreatorHeader = { name: string; handle: string | null; muted: boolean };

function cleanHandle(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim().replace(/^@/, '') ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The one thread per creator. Reached from creator detail and from Review's
 * per-post chat button, which passes ?assignment= so the thread opens scrolled
 * to that post with it attached to the next message.
 */
export default function AdminCreatorChat() {
  const { creatorId, assignment } = useLocalSearchParams<{
    creatorId: string;
    assignment?: string;
  }>();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [header, setHeader] = useState<CreatorHeader | null>(null);

  useEffect(() => {
    if (!profile || !creatorId) return;
    let cancelled = false;
    void (async () => {
      const [{ data: creator }, account, muted] = await Promise.all([
        supabase
          .from('profiles')
          .select('full_name')
          .eq('company_id', profile.company_id)
          .eq('id', creatorId)
          .maybeSingle(),
        getCreatorAccount(profile.company_id, creatorId).catch(() => null),
        isCreatorThreadMuted(creatorId, profile.id).catch(() => false),
      ]);
      if (cancelled) return;
      setHeader({
        name: creator?.full_name?.trim() || 'Creator',
        handle: cleanHandle(account?.tiktok_handle) ?? cleanHandle(account?.instagram_handle),
        muted,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, creatorId]);

  const toggleMuted = async () => {
    if (!profile || !creatorId || header === null) return;
    const next = !header.muted;
    setHeader({ ...header, muted: next });
    try {
      await setCreatorThreadMuted({
        creatorId,
        profileId: profile.id,
        companyId: profile.company_id,
        muted: next,
      });
    } catch (e) {
      setHeader((h) => (h === null ? h : { ...h, muted: !next }));
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again');
    }
  };

  if (!profile || !creatorId) return null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      {header !== null && (
        <CreatorThread
          companyId={profile.company_id}
          creatorId={creatorId}
          meId={profile.id}
          creatorName={header.name}
          handle={header.handle}
          muted={header.muted}
          onToggleMute={() => void toggleMuted()}
          initialAssignmentId={assignment}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.white },
});

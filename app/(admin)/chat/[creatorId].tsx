import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';

import { ChatThread, type PendingPostRef } from '../../../components/ChatThread';
import { useAuth } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { color } from '../../../theme/tokens';

/**
 * The one thread per creator. Reached from creator detail (top right) and
 * from the per-post chat button in Review, which passes ?assignment= so the
 * thread opens scrolled to that post with the reference attached.
 */
export default function AdminCreatorChat() {
  const { creatorId, assignment } = useLocalSearchParams<{
    creatorId: string;
    assignment?: string;
  }>();
  const { profile } = useAuth();
  const headerHeight = useHeaderHeight();
  const [creatorName, setCreatorName] = useState('Chat');
  const [initialRef, setInitialRef] = useState<PendingPostRef | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!profile || !creatorId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [{ data: creator }, refRow] = await Promise.all([
          supabase
            .from('profiles')
            .select('full_name')
            .eq('company_id', profile.company_id)
            .eq('id', creatorId)
            .single(),
          assignment !== undefined
            ? supabase
                .from('assignments')
                .select('id, briefs:brief_id ( title )')
                .eq('company_id', profile.company_id)
                .eq('id', assignment)
                .single()
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (creator?.full_name?.trim()) setCreatorName(creator.full_name.trim());
        const briefTitle = (
          refRow?.data as { briefs: { title: string } | null } | null
        )?.briefs?.title;
        if (assignment !== undefined && briefTitle !== undefined) {
          setInitialRef({ assignmentId: assignment, title: briefTitle });
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, creatorId, assignment]);

  if (!profile || !creatorId) return null;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: creatorName }} />
      {ready && (
        <ChatThread
          companyId={profile.company_id}
          creatorId={creatorId}
          meId={profile.id}
          initialRef={initialRef}
          scrollToAssignmentId={assignment}
          keyboardOffset={headerHeight}
          onOpenPostRef={(ref) => {
            if (ref.assignmentId !== null) {
              router.push({
                pathname: '/(admin)/creator/post/[assignmentId]',
                params: { assignmentId: ref.assignmentId },
              });
            }
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
});

import { useCallback, useMemo, useState } from 'react';
import { Alert, RefreshControl, View, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import {
  CREATOR_CARD_HEIGHT,
  CreatorCard,
} from '../../../components/admin/creator/CreatorCard';
import { SortChips } from '../../../components/admin/creator/SortChips';
import { AdminHeader, AdminScreen, SkeletonCard } from '../../../components/admin/shared';
import { EmptyState } from '../../../components/ui/EmptyState';
import { useAuth } from '../../../lib/auth';
import {
  fetchCreatorLeaderboard,
  type CreatorLeaderboardRow,
} from '../../../lib/admin-api';
import { formatMetric } from '../../../lib/analytics';
import { supabase } from '../../../lib/supabase';
import { formatCents } from '../../../lib/wallet-api';
import { radiusAdmin } from '../../../theme/tokens';

type SortKey = 'earnedCents' | 'views' | 'postsCompleted';

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'earnedCents', label: 'Earnings' },
  { key: 'views', label: 'Views' },
  { key: 'postsCompleted', label: 'Posts' },
];

/** Handle + profile photo live outside the leaderboard query. */
type CreatorExtras = {
  handle: string | null;
  avatarUri: string | null;
};

async function fetchCreatorExtras(
  companyId: string,
): Promise<Map<string, CreatorExtras>> {
  const [{ data: profiles }, { data: accounts }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, avatar_path')
      .eq('company_id', companyId)
      .eq('role', 'creator'),
    supabase
      .from('creator_accounts')
      .select('creator_id, tiktok_handle, instagram_handle')
      .eq('company_id', companyId),
  ]);

  const avatarPaths = (profiles ?? [])
    .map((p) => p.avatar_path)
    .filter((path): path is string => path !== null);
  const signedByPath = new Map<string, string>();
  if (avatarPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from('avatars')
      .createSignedUrls(avatarPaths, 3600);
    for (const entry of signed ?? []) {
      if (entry.path !== null && entry.signedUrl) {
        signedByPath.set(entry.path, entry.signedUrl);
      }
    }
  }

  const handleByCreator = new Map<string, string>();
  for (const account of accounts ?? []) {
    const handle = account.tiktok_handle ?? account.instagram_handle;
    if (handle) handleByCreator.set(account.creator_id, handle);
  }

  const extras = new Map<string, CreatorExtras>();
  for (const p of profiles ?? []) {
    extras.set(p.id, {
      handle: handleByCreator.get(p.id) ?? null,
      avatarUri:
        p.avatar_path !== null ? (signedByPath.get(p.avatar_path) ?? null) : null,
    });
  }
  return extras;
}

export default function CreatorsScreen() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<CreatorLeaderboardRow[]>([]);
  const [extras, setExtras] = useState<Map<string, CreatorExtras>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('earnedCents');

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setRows(await fetchCreatorLeaderboard(profile.company_id));
    } catch (e) {
      Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // Handles and photos arrive after the roster; cards fall back gracefully.
    void fetchCreatorExtras(profile.company_id)
      .then(setExtras)
      .catch(() => undefined);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const sorted = useMemo(
    () => [...rows].sort((a, b) => b[sortKey] - a[sortKey]),
    [rows, sortKey],
  );

  return (
    <AdminScreen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
    >
      <AdminHeader title="Creators" />

      <SortChips options={SORTS} value={sortKey} onChange={setSortKey} />

      <View style={styles.list}>
        {loading ? (
          Array.from({ length: 4 }, (_, i) => (
            <SkeletonCard key={i} height={CREATOR_CARD_HEIGHT} radius={radiusAdmin.lg} />
          ))
        ) : sorted.length === 0 ? (
          <EmptyState
            icon="users"
            title="No creators yet"
            body="Invite creators from Settings and they show up here once they join."
            compact
          />
        ) : (
          sorted.map((c) => {
            const extra = extras.get(c.creatorId);
            return (
              <CreatorCard
                key={c.creatorId}
                name={c.creatorName}
                handle={extra?.handle ?? null}
                avatarUri={extra?.avatarUri ?? null}
                earned={formatCents(c.earnedCents)}
                posts={`${c.postsCompleted}`}
                views={formatMetric(c.views)}
                onPress={() =>
                  router.push({
                    pathname: '/(admin)/creator/[id]',
                    params: { id: c.creatorId },
                  })
                }
              />
            );
          })
        )}
      </View>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: 12,
    gap: 10,
  },
});

import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { router, Stack, useFocusEffect } from "expo-router";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";

import { InviteCreatorsSheet } from "../../components/admin/v2/review/InviteCreatorsSheet";
import { ErrorCard, StateCard } from "../../components/admin/v2/review/ReviewStates";
import { Avatar, Button, Card, Icon, Press, Screen, Seg, Skeleton, TextButton } from "../../components/v2";
import { useAuth } from "../../lib/auth";
import {
  fetchCreatorLeaderboard,
  listApprovedCreators,
  type CreatorLeaderboardRow,
} from "../../lib/admin-api";
import { formatMetric } from "../../lib/analytics";
import { supabase } from "../../lib/supabase";
import { color, text } from "../../theme/v2";

type SortKey = "views" | "postsCompleted";

const ALL_SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "views", label: "Views" },
  { key: "postsCompleted", label: "Posts" },
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
      .from("company_roster")
      .select("id, avatar_path")
      .eq("company_id", companyId)
      .or("member_role.eq.creator,can_create.eq.true"),
    supabase
      .from("creator_accounts")
      .select("creator_id, tiktok_handle, instagram_handle")
      .eq("company_id", companyId),
  ]);

  const avatarPaths = (profiles ?? [])
    .map((p) => p.avatar_path)
    .filter((path): path is string => path !== null);
  const signedByPath = new Map<string, string>();
  if (avatarPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("avatars")
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
    if (p.id === null) continue;
    extras.set(p.id, {
      handle: handleByCreator.get(p.id) ?? null,
      avatarUri:
        p.avatar_path !== null
          ? (signedByPath.get(p.avatar_path) ?? null)
          : null,
    });
  }
  return extras;
}

export default function CreatorsScreen() {
  const { profile, managerAccess, refreshManagerAccess } = useAuth();
  const [rows, setRows] = useState<CreatorLeaderboardRow[]>([]);
  const [extras, setExtras] = useState<Map<string, CreatorExtras>>(new Map());
  const [approvedIds, setApprovedIds] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const [next, approved] = await Promise.all([
        fetchCreatorLeaderboard(profile.active_company_id),
        listApprovedCreators(profile.active_company_id),
        refreshManagerAccess(),
      ]);
      setRows(next);
      setApprovedIds(new Set(approved.map((c) => c.id)));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // Handles and photos arrive after the roster; rows fall back gracefully.
    void fetchCreatorExtras(profile.active_company_id)
      .then(setExtras)
      .catch(() => undefined);
  }, [profile, refreshManagerAccess]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Only creators whose account passed review; the rest sit in the Review queue.
  const sorted = useMemo(
    () =>
      rows
        .filter((r) => approvedIds?.has(r.creatorId) ?? false)
        .sort((a, b) => b[sortKey] - a[sortKey]),
    [rows, approvedIds, sortKey],
  );
  const canInvite = managerAccess.inviteCreators;

  return (
    <Screen
      back
      title="Creators"
      right={canInvite ? <TextButton label="Invite" onPress={() => setInviteOpen(true)} /> : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }}
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
        {!loading && sorted.length > 0 ? (
          <>
            <Text style={[text.meta, { marginBottom: 10 }]}>{`${sorted.length} approved`}</Text>
            <Seg<SortKey>
              style={{ marginBottom: 16 }}
              value={sortKey}
              onChange={setSortKey}
              options={ALL_SORTS}
            />
          </>
        ) : null}
        {loading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} h={72} />)
        ) : failed && sorted.length === 0 ? (
          <ErrorCard onRetry={() => {
            setLoading(true);
            void load();
          }} />
        ) : sorted.length === 0 ? (
          <StateCard
            icon="person"
            title="No creators yet"
            body={
              canInvite
                ? "Invite your first creators. They sign in, set up their accounts, you approve them in Review, then briefs start landing."
                : "Creators show up here once they join. They upload warm-up proof, you approve, then briefs start landing."
            }
          >
            {canInvite ? (
              <View style={{ flexDirection: "row" }}>
                <Button label="Invite creators" icon="send" onPress={() => setInviteOpen(true)} />
              </View>
            ) : null}
          </StateCard>
        ) : (
          <Card pad={0} style={{ paddingHorizontal: 16 }}>
            {sorted.map((c, i) => {
              const extra = extras.get(c.creatorId);
              return (
                <Animated.View key={c.creatorId} entering={FadeInDown.duration(240).delay(Math.min(i, 8) * 30)} layout={LinearTransition.duration(240)}>
                  <Press
                    accessibilityRole="button"
                    accessibilityLabel={c.creatorName}
                    onPress={() =>
                      router.push({
                        pathname: "/(admin)/creator/[id]",
                        params: { id: c.creatorId },
                      })
                    }
                    style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: color.grey1 }}
                  >
                    <Avatar name={c.creatorName} photo={extra?.avatarUri ?? null} size={44} ring={false} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={text.row}>{c.creatorName}</Text>
                      <Text numberOfLines={1} style={text.meta}>
                        {[extra?.handle ? `@${extra.handle.replace(/^@/, "")}` : null, `${c.postsCompleted} ${c.postsCompleted === 1 ? "post" : "posts"}`, `${formatMetric(c.views)} views`].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    <Icon name="chevron_right" size={20} color={color.grey3} />
                  </Press>
                </Animated.View>
              );
            })}
          </Card>
        )}
      </ScrollView>
      <InviteCreatorsSheet open={inviteOpen} companyId={profile?.active_company_id} onClose={() => setInviteOpen(false)} />
    </Screen>
  );
}

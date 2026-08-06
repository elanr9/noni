import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  LibraryItemCard,
  cardHeightFor,
  itemCardModel,
  ourPostCardModel,
} from '../../../components/admin/LibraryItemCard';
import { LibraryListSkeleton } from '../../../components/admin/library/LibraryListSkeleton';
import { QuickCapture } from '../../../components/admin/library/QuickCapture';
import { SourceChips } from '../../../components/admin/library/SourceChips';
import { AdminHeader, AdminScreen } from '../../../components/admin/shared';
import { Dropdown } from '../../../components/ui/Dropdown';
import { EmptyState } from '../../../components/ui/EmptyState';
import type { IconName } from '../../../components/ui/Icon';
import { useAuth } from '../../../lib/auth';
import { listPostTypes, type PostType } from '../../../lib/briefs-api';
import {
  captureQuick,
  listCreatorOptions,
  listLibraryItems,
  listOurPosts,
  markLibraryItemUsed,
  type LibraryItem,
  type LibrarySource,
  type OurPost,
  type OurPostsSort,
} from '../../../lib/library-api';
import { borderWidth, color, radiusAdmin, space, type } from '../../../theme/tokens';

const PAGE = 50;
const SEARCH_DEBOUNCE_MS = 350;

type Row =
  | { kind: 'item'; item: LibraryItem }
  | { kind: 'our_post'; post: OurPost };

const EMPTY: Record<
  LibrarySource,
  { icon: IconName; title: string; body: string }
> = {
  idea: {
    icon: 'sparkles',
    title: 'No ideas yet',
    body: 'Type one above and save it. Paste a whole doc and every line becomes its own idea.',
  },
  our_post: {
    icon: 'trending-up',
    title: 'No posts yet',
    body: 'Posts land here as creators go live, sorted by how they perform.',
  },
  reference: {
    icon: 'link',
    title: 'No references yet',
    body: 'Paste a TikTok or Instagram link above and it saves here with a thumbnail.',
  },
  from_creator: {
    icon: 'users',
    title: 'Nothing from creators yet',
    body: 'When a creator sends in an idea, it shows up here with their name on it.',
  },
};

export default function LibraryScreen() {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [source, setSource] = useState<LibrarySource>('idea');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<OurPostsSort>('top');
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [postTypeId, setPostTypeId] = useState<string | null>(null);

  const [capture, setCapture] = useState('');
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [endReached, setEndReached] = useState(false);
  const [creators, setCreators] = useState<Array<{ id: string; full_name: string | null }>>([]);
  const [postTypes, setPostTypes] = useState<PostType[]>([]);

  // One counter guards every list write: filter changes mid-flight discard
  // the stale response instead of racing it.
  const queryVersion = useRef(0);

  const loadPage = useCallback(
    async (offset: number) => {
      const version = ++queryVersion.current;
      if (offset === 0) setLoading(true);
      try {
        const next: Row[] =
          source === 'our_post'
            ? (
                await listOurPosts({
                  days: sort === 'top' ? 60 : null,
                  creatorId: creatorId ?? undefined,
                  postTypeId: postTypeId ?? undefined,
                  search,
                  sort,
                  limit: PAGE,
                  offset,
                })
              ).map((post): Row => ({ kind: 'our_post', post }))
            : (
                await listLibraryItems({ source, search, limit: PAGE, offset })
              ).map((item): Row => ({ kind: 'item', item }));
        if (version !== queryVersion.current) return;
        setEndReached(next.length < PAGE);
        setRows((prev) => (offset === 0 ? next : [...prev, ...next]));
      } catch (e) {
        if (version !== queryVersion.current) return;
        Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again');
      } finally {
        if (version === queryVersion.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [source, search, sort, creatorId, postTypeId],
  );

  useEffect(() => {
    const timer = setTimeout(() => void loadPage(0), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [loadPage]);

  useFocusEffect(
    useCallback(() => {
      void loadPage(0);
      if (!profile) return;
      void listCreatorOptions(profile.company_id)
        .then(setCreators)
        .catch(() => undefined);
      void listPostTypes()
        .then(setPostTypes)
        .catch(() => undefined);
      // loadPage identity changes with filters; refetching on focus only.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile]),
  );

  function showNote(message: string) {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    setSavedNote(message);
    noteTimer.current = setTimeout(() => setSavedNote(null), 2500);
  }

  async function onCapture() {
    const raw = capture;
    if (!profile || raw.trim().length === 0) return;
    setCapture('');
    try {
      const result = await captureQuick(profile.company_id, profile.id, raw);
      if (result.reference) {
        showNote('Reference saved');
        if (source === 'reference') void loadPage(0);
      } else if (result.ideas > 0) {
        showNote(result.ideas === 1 ? 'Idea saved' : `${result.ideas} ideas saved`);
        if (source === 'idea') void loadPage(0);
      }
    } catch (e) {
      setCapture(raw);
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    }
  }

  function nameOf(id: string | null): string | null {
    if (!id) return null;
    return creators.find((c) => c.id === id)?.full_name ?? null;
  }

  function onRowPress(row: Row) {
    const url = row.kind === 'item' ? row.item.url : row.post.post_url;
    if (url) void Linking.openURL(url);
  }

  function onUse(item: LibraryItem) {
    // Using never removes — the count just goes up.
    markLibraryItemUsed(item).catch(() => undefined);
    setRows((prev) =>
      prev.map((row) =>
        row.kind === 'item' && row.item.id === item.id
          ? { kind: 'item', item: { ...item, used_count: item.used_count + 1 } }
          : row,
      ),
    );
  }

  const showOurPostControls = source === 'our_post';

  return (
    <AdminScreen scroll={false}>
      <View style={styles.header}>
        <AdminHeader title="Library" />

        <QuickCapture
          value={capture}
          onChangeText={setCapture}
          onSave={() => void onCapture()}
          note={savedNote}
        />

        <SourceChips
          value={source}
          onChange={(next) => {
            if (next === source) return;
            setRows([]);
            setSource(next);
          }}
        />

        {showOurPostControls && (
          <>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search topic"
              placeholderTextColor={color.slate400}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.search}
            />
            <View style={styles.controls}>
              <Dropdown<OurPostsSort>
                options={[
                  { label: 'Top 60 days', value: 'top' },
                  { label: 'Recent', value: 'recent' },
                ]}
                value={sort}
                onChange={setSort}
              />
              <Dropdown<string | null>
                options={[
                  { label: 'All creators', value: null },
                  ...creators.map((c) => ({
                    label: c.full_name ?? 'Unnamed',
                    value: c.id as string | null,
                  })),
                ]}
                value={creatorId}
                onChange={setCreatorId}
              />
              <Dropdown<string | null>
                options={[
                  { label: 'All types', value: null },
                  ...postTypes.map((t) => ({
                    label: t.label,
                    value: t.id as string | null,
                  })),
                ]}
                value={postTypeId}
                onChange={setPostTypeId}
              />
            </View>
          </>
        )}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(row) => (row.kind === 'item' ? row.item.id : row.post.post_id)}
        renderItem={({ item: row }) => (
          <LibraryItemCard
            model={
              row.kind === 'item'
                ? itemCardModel(row.item, nameOf(row.item.creator_id))
                : ourPostCardModel(row.post)
            }
            onPress={() => onRowPress(row)}
            onUse={
              row.kind === 'item' && row.item.source === 'from_creator'
                ? () => onUse(row.item)
                : undefined
            }
          />
        )}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 116 }]}
        ItemSeparatorComponent={ListGap}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (!loading && !endReached && rows.length > 0) {
            void loadPage(rows.length);
          }
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadPage(0);
            }}
          />
        }
        ListEmptyComponent={
          loading ? (
            <LibraryListSkeleton height={cardHeightFor(source)} />
          ) : (
            <EmptyState
              icon={EMPTY[source].icon}
              title={EMPTY[source].title}
              body={EMPTY[source].body}
              compact
            />
          )
        }
        keyboardShouldPersistTaps="handled"
      />
    </AdminScreen>
  );
}

function ListGap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.gutterAdmin,
    gap: 10,
  },
  search: {
    borderWidth: borderWidth.hair,
    borderColor: color.lineStrong,
    borderRadius: radiusAdmin.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.ink,
    backgroundColor: color.white,
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    zIndex: 30,
  },
  list: {
    paddingHorizontal: space.gutterAdmin,
    paddingTop: 12,
  },
  gap: {
    height: 10,
  },
});

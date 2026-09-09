import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IdeaRow } from '../../../components/admin/library/IdeaRow';
import { LibSearch } from '../../../components/admin/library/LibSearch';
import { LibraryListSkeleton } from '../../../components/admin/library/LibraryListSkeleton';
import { MakePostSheet, type MakeTarget } from '../../../components/admin/library/MakePostSheet';
import { MediaLane } from '../../../components/admin/library/MediaLane';
import { OUR_POST_ROW_HEIGHT, OurPostRow } from '../../../components/admin/library/OurPostCard';
import { OurPostsFilterSheet } from '../../../components/admin/library/OurPostsFilterSheet';
import { QuickCapture } from '../../../components/admin/library/QuickCapture';
import { ReferenceCard } from '../../../components/admin/library/ReferenceCard';
import { SourceChips, type LibraryLane } from '../../../components/admin/library/SourceChips';
import { SubTabs } from '../../../components/admin/library/SubTabs';
import { AdminHeader, AdminScreen } from '../../../components/admin/shared';
import { SoftToast } from '../../../components/states/SoftToast';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon, type IconName } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { useAuth } from '../../../lib/auth';
import { listPostTypes, type BriefFormat, type PostType } from '../../../lib/briefs-api';
import { fillPostSlot, type FillSource } from '../../../lib/post-fill';
import {
  captureQuick,
  countLibraryItems,
  deleteLibraryItem,
  enrichOurPostThumbnail,
  listCreatorOptions,
  listLibraryItems,
  listOurPosts,
  markLibraryItemUsed,
  markOurPostUsed,
  saveReference,
  updateLibraryItemText,
  type LibraryItem,
  type OurPost,
  type OurPostsSort,
} from '../../../lib/library-api';
import { borderWidth, color, radiusAdmin, space, type } from '../../../theme/tokens';

const PAGE = 50;
const SEARCH_DEBOUNCE_MS = 350;
const TOAST_MS = 1800;
const SOCIAL_LINK = /(tiktok\.com|instagram\.com)\//i;

type Row =
  | { kind: 'item'; item: LibraryItem }
  | { kind: 'our_post'; post: OurPost };

type UsedTab = 'unused' | 'used';
type ItemLane = 'idea' | 'reference';

const EMPTY: Record<ItemLane, Record<UsedTab, { icon: IconName; title: string; body: string }>> = {
  idea: {
    unused: {
      icon: 'zap',
      title: 'No ideas yet',
      body: 'Type one line above and save. Paste a whole doc to save one idea per line.',
    },
    used: {
      icon: 'zap',
      title: 'Nothing used yet',
      body: 'Ideas move here the moment you make a post from them.',
    },
  },
  reference: {
    unused: {
      icon: 'link',
      title: 'No references yet',
      body: 'Copy a TikTok or Instagram link, come back, tap Paste. It saves with a thumbnail and title.',
    },
    used: {
      icon: 'link',
      title: 'Nothing used yet',
      body: 'References move here the moment you make a post from them.',
    },
  },
};

function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function rowKey(row: Row): string {
  return row.kind === 'item' ? row.item.id : row.post.post_id;
}

export default function LibraryScreen() {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [lane, setLane] = useState<LibraryLane>('idea');
  const [sub, setSub] = useState<UsedTab>('unused');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<OurPostsSort>('top');
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [postTypeId, setPostTypeId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const [capture, setCapture] = useState('');
  const [pasting, setPasting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<ItemLane, { unused: number; used: number } | null>>({
    idea: null,
    reference: null,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [endReached, setEndReached] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creators, setCreators] = useState<{ id: string; full_name: string | null }[]>([]);
  const [postTypes, setPostTypes] = useState<PostType[]>([]);

  /** The row waiting on a slot before it becomes a post. */
  const [makeFrom, setMakeFrom] = useState<Row | null>(null);
  const [makeBusyKey, setMakeBusyKey] = useState<string | null>(null);

  // One counter guards every list write: filter changes mid flight discard
  // the stale response instead of racing it.
  const queryVersion = useRef(0);
  const enriching = useRef(new Set<string>());

  const refreshCounts = useCallback(async (which: ItemLane) => {
    try {
      const next = await countLibraryItems(which);
      setCounts((prev) => ({ ...prev, [which]: next }));
    } catch {
      // Counts are decoration; the list itself reports load errors.
    }
  }, []);

  const loadPage = useCallback(
    async (offset: number) => {
      if (lane === 'media') return;
      const version = ++queryVersion.current;
      if (offset === 0) setLoading(true);
      else setLoadingMore(true);
      try {
        const next: Row[] =
          lane === 'our_post'
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
                await listLibraryItems({
                  source: lane,
                  search,
                  used: sub === 'unused' ? 'new' : 'made',
                  limit: PAGE,
                  offset,
                })
              ).map((item): Row => ({ kind: 'item', item }));
        if (version !== queryVersion.current) return;
        setEndReached(next.length < PAGE);
        setRows((prev) => (offset === 0 ? next : [...prev, ...next]));
        if (offset === 0 && lane !== 'our_post') void refreshCounts(lane);
      } catch (e) {
        if (version !== queryVersion.current) return;
        Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again');
      } finally {
        if (version === queryVersion.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [lane, sub, search, sort, creatorId, postTypeId, refreshCounts],
  );

  useEffect(() => {
    const timer = setTimeout(() => void loadPage(0), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [loadPage]);

  // The debounce above covers the first mount; focus only refetches on return.
  const loadPageRef = useRef(loadPage);
  useEffect(() => {
    loadPageRef.current = loadPage;
  }, [loadPage]);
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) void loadPageRef.current(0);
      focusedBefore.current = true;
    }, []),
  );

  const companyId = profile?.company_id;
  useEffect(() => {
    if (!companyId) return;
    void listCreatorOptions(companyId).then(setCreators).catch(() => undefined);
    void listPostTypes().then(setPostTypes).catch(() => undefined);
    void Promise.all([countLibraryItems('idea'), countLibraryItems('reference')])
      .then(([idea, reference]) => setCounts({ idea, reference }))
      .catch(() => undefined);
  }, [companyId]);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function flash(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }

  function switchLane(next: LibraryLane) {
    if (next === lane) return;
    setRows([]);
    setSearch('');
    setSub('unused');
    setLane(next);
  }

  function switchSub(next: UsedTab) {
    if (next === sub) return;
    setRows([]);
    setSub(next);
  }

  async function onSaveIdeas() {
    const raw = capture;
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (!profile || lines.length === 0) return;
    setCapture('');
    try {
      const result = await captureQuick(profile.company_id, profile.id, raw);
      if (result.reference) {
        flash('That was a link, saved under References');
        void refreshCounts('reference');
        return;
      }
      flash(result.ideas === 1 ? 'Idea saved' : `${result.ideas} ideas saved`);
      if (sub !== 'unused') {
        setRows([]);
        setSub('unused');
      } else {
        void loadPage(0);
      }
    } catch (e) {
      setCapture(raw);
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    }
  }

  async function onPasteLink() {
    if (!profile || pasting) return;
    setPasting(true);
    try {
      const text = (await Clipboard.getStringAsync()).trim();
      if (!SOCIAL_LINK.test(text) || !/^https?:\/\/\S+$/i.test(text)) {
        flash('Copy a TikTok or Instagram link first');
        return;
      }
      await saveReference(profile.company_id, profile.id, text);
      flash('Reference saved');
      if (sub !== 'unused') {
        setRows([]);
        setSub('unused');
      } else {
        void loadPage(0);
      }
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setPasting(false);
    }
  }

  function openUrl(url: string | null) {
    if (url) void Linking.openURL(url);
  }

  function openBrief(briefId: string) {
    router.push(`/(admin)/post/${briefId}`);
  }

  /** One of ours ports from its brief; everything else generates fresh. */
  function fillSourceFor(row: Row): FillSource | null {
    if (row.kind === 'our_post') {
      if (row.post.brief_id) return { kind: 'port', sourceBriefId: row.post.brief_id };
      return row.post.post_url ? { kind: 'example', url: row.post.post_url } : null;
    }
    if (row.item.url) return { kind: 'example', url: row.item.url };
    return row.item.text ? { kind: 'idea', text: row.item.text } : null;
  }

  function sourceLabelFor(row: Row): string {
    if (row.kind === 'our_post') return `“${row.post.title ?? row.post.hook ?? 'this post'}”`;
    if (row.item.source === 'reference') {
      const handle = row.item.url?.match(/@([A-Za-z0-9._]+)/)?.[1];
      const platform = /tiktok/i.test(row.item.url ?? '')
        ? 'TikTok'
        : /instagram/i.test(row.item.url ?? '')
          ? 'Instagram'
          : null;
      return [handle ? `@${handle}` : row.item.text ?? 'this reference', platform]
        .filter(Boolean)
        .join(' · ');
    }
    const text = row.item.text ?? '';
    return `“${text.length > 80 ? `${text.slice(0, 77)}…` : text}”`;
  }

  function preferredFamilyFor(row: Row): BriefFormat | null {
    if (row.kind !== 'our_post') return null;
    return row.post.family === 'photo_carousel' ? 'photo_carousel' : 'video';
  }

  function patchItem(id: string, patch: Partial<LibraryItem>) {
    setRows((prev) =>
      prev.map((row) =>
        row.kind === 'item' && row.item.id === id
          ? { kind: 'item', item: { ...row.item, ...patch } }
          : row,
      ),
    );
  }

  function patchPost(postId: string, patch: Partial<OurPost>) {
    setRows((prev) =>
      prev.map((row) =>
        row.kind === 'our_post' && row.post.post_id === postId
          ? { kind: 'our_post', post: { ...row.post, ...patch } }
          : row,
      ),
    );
  }

  /**
   * Generates the whole post into the chosen empty slot: draft, slides, text
   * boxes, screenshots. Then opens the editor on it, ready to review.
   */
  async function buildPost(row: Row, target: MakeTarget) {
    const source = fillSourceFor(row);
    if (!profile || !source) return;
    const { slot, postType } = target;
    setMakeBusyKey(rowKey(row));
    try {
      const result = await fillPostSlot({
        briefId: slot.briefId,
        postTypeId: postType.id,
        postTypeKey: postType.key,
        family: slot.family,
        source,
        companyId: profile.company_id,
      });
      if (result.kind === 'kill') {
        setMakeFrom(null);
        Alert.alert('Not made', result.kill_reason);
        return;
      }
      const now = new Date().toISOString();
      if (row.kind === 'item') {
        markLibraryItemUsed(row.item, slot.briefId).catch(() => undefined);
        if (sub === 'unused') {
          setRows((prev) => prev.filter((r) => rowKey(r) !== row.item.id));
        } else {
          patchItem(row.item.id, {
            used_count: row.item.used_count + 1,
            last_used_at: now,
            last_brief_id: slot.briefId,
          });
        }
        void refreshCounts(row.item.source === 'reference' ? 'reference' : 'idea');
      } else {
        markOurPostUsed(profile.company_id, profile.id, row.post, slot.briefId).catch(
          () => undefined,
        );
        patchPost(row.post.post_id, { used_count: (row.post.used_count ?? 0) + 1 });
      }
      setMakeFrom(null);
      flash(
        `Made into ${slot.family === 'photo_carousel' ? 'Slideshow' : 'Reel'} ${String(slot.laneIndex).padStart(2, '0')}`,
      );
      openBrief(slot.briefId);
    } catch (e) {
      Alert.alert('Could not make the post', e instanceof Error ? e.message : 'Try again');
    } finally {
      setMakeBusyKey(null);
    }
  }

  function onSaveIdeaText(item: LibraryItem, text: string) {
    patchItem(item.id, { text });
    updateLibraryItemText(item.id, text).catch((e: unknown) => {
      patchItem(item.id, { text: item.text });
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    });
  }

  function confirmDelete(item: LibraryItem) {
    Alert.alert(
      item.source === 'reference' ? 'Delete this reference?' : 'Delete this idea?',
      'Posts made from it are not affected.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setRows((prev) => prev.filter((row) => rowKey(row) !== item.id));
            deleteLibraryItem(item.id)
              .then(() => refreshCounts(item.source === 'reference' ? 'reference' : 'idea'))
              .catch((e: unknown) => {
                Alert.alert('Could not delete', e instanceof Error ? e.message : 'Try again');
                void loadPage(0);
              });
          },
        },
      ],
    );
  }

  function onNeedThumbnail(post: OurPost) {
    if (!profile || enriching.current.has(post.post_id)) return;
    enriching.current.add(post.post_id);
    enrichOurPostThumbnail(profile.company_id, profile.id, post)
      .then((url) => {
        if (url) patchPost(post.post_id, { thumbnail_url: url });
      })
      .catch(() => undefined)
      .finally(() => enriching.current.delete(post.post_id));
  }

  function makeFor(row: Row) {
    if (fillSourceFor(row) === null) return undefined;
    return {
      busy: makeBusyKey === rowKey(row),
      disabled: makeBusyKey !== null,
      onPress: () => setMakeFrom(row),
    };
  }

  function renderRow(row: Row, index: number) {
    const first = index === 0;
    const last = index === rows.length - 1;
    if (row.kind === 'our_post') {
      return (
        <View style={[styles.cardRow, first && styles.cardRowFirst, last && styles.cardRowLast]}>
          <OurPostRow
            post={row.post}
            last={last}
            onNeedThumbnail={onNeedThumbnail}
            onPress={() => openUrl(row.post.post_url)}
            make={makeFor(row)}
          />
        </View>
      );
    }
    const briefId = row.item.last_brief_id;
    const onMetaPress = briefId ? () => openBrief(briefId) : undefined;
    if (row.item.source === 'idea') {
      return (
        <View style={[styles.cardRow, first && styles.cardRowFirst, last && styles.cardRowLast]}>
          <IdeaRow
            text={row.item.text ?? ''}
            usedCount={row.item.used_count}
            lastUsedLabel={shortDate(row.item.last_used_at)}
            last={last}
            onSaveText={(text) => onSaveIdeaText(row.item, text)}
            onLongPress={() => confirmDelete(row.item)}
            onMetaPress={onMetaPress}
            make={makeFor(row)}
          />
        </View>
      );
    }
    return (
      <View style={!last && styles.referenceGap}>
        <ReferenceCard
          item={row.item}
          onPress={() => openUrl(row.item.url)}
          onLongPress={() => confirmDelete(row.item)}
          onMetaPress={onMetaPress}
          make={makeFor(row)}
        />
      </View>
    );
  }

  const activeFilters = (creatorId ? 1 : 0) + (postTypeId ? 1 : 0);
  const bottomPadding = insets.bottom + 116;
  const itemLane: ItemLane | null = lane === 'idea' || lane === 'reference' ? lane : null;
  const laneCounts = itemLane ? counts[itemLane] : null;

  function renderEmpty(): ReactNode {
    if (loading) {
      return <LibraryListSkeleton height={lane === 'our_post' ? OUR_POST_ROW_HEIGHT : 84} />;
    }
    if (lane === 'our_post') {
      return search.length > 0 || activeFilters > 0 ? (
        <Text style={styles.noMatch}>No posts match these filters</Text>
      ) : (
        <EmptyState
          icon="play"
          title="No posts yet"
          body="Every post you publish lands here the day it goes live."
          compact
          style={styles.emptyState}
        />
      );
    }
    if (!itemLane) return null;
    if (search.length > 0) {
      return (
        <Text style={styles.noMatch}>
          {itemLane === 'idea' ? 'No ideas match' : 'No references match'}
        </Text>
      );
    }
    const copy = EMPTY[itemLane][sub];
    return (
      <EmptyState icon={copy.icon} title={copy.title} body={copy.body} compact style={styles.emptyState} />
    );
  }

  const list = (
    <FlatList
      data={rows}
      keyExtractor={rowKey}
      renderItem={({ item: row, index }) => renderRow(row, index)}
      contentContainerStyle={[styles.list, { paddingBottom: bottomPadding }]}
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (!loading && !loadingMore && !endReached && rows.length > 0) void loadPage(rows.length);
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
      ListEmptyComponent={<>{renderEmpty()}</>}
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.more}>
            <ActivityIndicator size="small" color={color.slate300} />
            <Text style={styles.moreText}>Loading more</Text>
          </View>
        ) : null
      }
      keyboardShouldPersistTaps="handled"
    />
  );

  return (
    <AdminScreen scroll={false}>
      <View style={styles.header}>
        <AdminHeader title="Library" />
        <SourceChips value={lane} onChange={switchLane} />

        {itemLane !== null && (
          <>
            <QuickCapture
              mode={itemLane}
              value={capture}
              onChangeText={setCapture}
              onSave={() => void onSaveIdeas()}
              onPaste={() => void onPasteLink()}
              busy={pasting}
              note={null}
            />
            <SubTabs<UsedTab>
              items={[
                { id: 'unused', label: 'Unused', count: laneCounts?.unused },
                { id: 'used', label: 'Used', count: laneCounts?.used },
              ]}
              value={sub}
              onChange={switchSub}
            />
            {(rows.length > 0 || search.length > 0) && (
              <View style={styles.toolbar}>
                <LibSearch
                  value={search}
                  onChangeText={setSearch}
                  placeholder={
                    itemLane === 'idea'
                      ? sub === 'used'
                        ? 'Search used ideas'
                        : 'Search unused ideas'
                      : sub === 'used'
                        ? 'Search used references'
                        : 'Search unused references'
                  }
                />
              </View>
            )}
          </>
        )}

        {lane === 'our_post' && (
          <View style={styles.toolbar}>
            <LibSearch value={search} onChangeText={setSearch} placeholder="Search posts" />
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Change sort"
              onPress={() => setSort(sort === 'top' ? 'recent' : 'top')}
              style={styles.sortButton}
            >
              <Text style={styles.sortText}>{sort === 'top' ? 'Top 60d' : 'Recent'}</Text>
              <Icon name="chevrons-up-down" size={13} color={color.slate500} />
            </PressableScale>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Filter posts"
              onPress={() => setFilterOpen(true)}
              style={[styles.filterButton, activeFilters > 0 && styles.filterButtonActive]}
            >
              <Icon
                name="layout-list"
                size={16}
                color={activeFilters > 0 ? color.blue700 : color.slate500}
              />
              {activeFilters > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{activeFilters}</Text>
                </View>
              )}
            </PressableScale>
          </View>
        )}
      </View>

      {lane === 'media' ? (
        profile ? (
          <MediaLane
            companyId={profile.company_id}
            userId={profile.id}
            bottomPadding={bottomPadding}
            onToast={flash}
            renderHeader={(header) => <View style={styles.laneHeader}>{header}</View>}
          />
        ) : null
      ) : (
        list
      )}

      <MakePostSheet
        visible={makeFrom !== null}
        sourceLabel={makeFrom ? sourceLabelFor(makeFrom) : ''}
        preferredFamily={makeFrom ? preferredFamilyFor(makeFrom) : null}
        postTypes={postTypes}
        busy={makeBusyKey !== null}
        onPick={(target) => {
          if (makeFrom) void buildPost(makeFrom, target);
        }}
        onOpenWeek={(campaignId) => {
          setMakeFrom(null);
          router.push(`/(admin)/week/${campaignId}`);
        }}
        onClose={() => setMakeFrom(null)}
      />

      <OurPostsFilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        creators={creators}
        postTypes={postTypes}
        creatorId={creatorId}
        postTypeId={postTypeId}
        onChangeCreator={setCreatorId}
        onChangePostType={setPostTypeId}
      />

      <SoftToast visible={toast !== null} message={toast ?? ''} tone="success" durationMs={TOAST_MS} />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.gutterAdmin,
    paddingBottom: 10,
    gap: 10,
  },
  laneHeader: {
    paddingHorizontal: space.gutterAdmin,
    paddingBottom: 10,
    gap: 10,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sortButton: {
    height: 38,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radiusAdmin.pill,
  },
  sortText: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.slate500,
  },
  filterButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.fillQuiet,
  },
  filterButtonActive: {
    backgroundColor: color.blue100,
  },
  filterBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: color.blue500,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: color.offWhite,
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: color.white,
  },
  list: {
    paddingHorizontal: space.gutterAdmin,
    paddingTop: 4,
  },
  cardRow: {
    backgroundColor: color.white,
    borderLeftWidth: borderWidth.hair,
    borderRightWidth: borderWidth.hair,
    borderColor: color.line,
  },
  cardRowFirst: {
    borderTopWidth: borderWidth.hair,
    borderTopLeftRadius: radiusAdmin.lg,
    borderTopRightRadius: radiusAdmin.lg,
    overflow: 'hidden',
  },
  cardRowLast: {
    borderBottomWidth: borderWidth.hair,
    borderBottomLeftRadius: radiusAdmin.lg,
    borderBottomRightRadius: radiusAdmin.lg,
    overflow: 'hidden',
  },
  referenceGap: {
    marginBottom: 8,
  },
  noMatch: {
    marginVertical: 32,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
    color: color.slate400,
  },
  emptyState: {
    marginTop: 24,
  },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 18,
    paddingBottom: 6,
  },
  moreText: {
    fontSize: type.size.label,
    fontWeight: '600',
    color: color.slate400,
  },
});

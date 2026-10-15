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
import { useShareIntentContext } from 'expo-share-intent';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { editorHref, weekHref } from '../../../components/admin/briefs/routes';
import { LibSearch } from '../../../components/admin/library/LibSearch';
import { LibraryListSkeleton } from '../../../components/admin/library/LibraryListSkeleton';
import { MakeComposer, type FormatPick } from '../../../components/admin/library/MakeComposer';
import { MediaLane } from '../../../components/admin/library/MediaLane';
import { OUR_POST_ROW_HEIGHT, OurPostRow } from '../../../components/admin/library/OurPostCard';
import { OurPostsFilterSheet } from '../../../components/admin/library/OurPostsFilterSheet';
import { ReadyPostCard, type MakeJob } from '../../../components/admin/library/ReadyPostCard';
import { SourceChips, type LibraryLane } from '../../../components/admin/library/SourceChips';
import { SubTabs } from '../../../components/admin/library/SubTabs';
import { WeekPickSheet } from '../../../components/admin/library/WeekPickSheet';
import { AdminHeader, AdminScreen } from '../../../components/admin/shared';
import { ContextRow } from '../../../components/shared';
import { SoftToast } from '../../../components/states/SoftToast';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon, type IconName } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { useAuth } from '../../../lib/auth';
import { FORMAT_LABEL, slotLabel } from '../../../lib/brief-copy';
import {
  listPostTypes,
  toMediaFormat,
  type BriefFormat,
  type BriefKind,
  type BriefMediaFormat,
  type PostType,
} from '../../../lib/briefs-api';
import {
  countLibraryFamilies,
  countLibraryItems,
  deleteLibraryItem,
  enrichOurPostThumbnail,
  getLibraryItemWithBriefs,
  listCreatorOptions,
  listLibraryItems,
  listOurPosts,
  type LibraryItem,
  type LibraryItemWithBriefs,
  type OurPost,
  type OurPostsSort,
  type ReadyBrief,
} from '../../../lib/library-api';
import {
  addMadeToSlot,
  createLibraryItem,
  isNewFormat,
  listTargetSlots,
  madeBriefOf,
  makeForItem,
  pickTargetSlot,
  previewOf,
  type TargetSlot,
} from '../../../lib/library-make';
import { borderWidth, color, radiusAdmin, space, type } from '../../../theme/tokens';

const PAGE = 50;
const SEARCH_DEBOUNCE_MS = 350;
const TOAST_MS = 1800;
const SOCIAL_LINK = /^https?:\/\/(www\.|vm\.|vt\.|m\.)?(tiktok\.com|instagram\.com)\/\S+$/i;

type Row =
  | { kind: 'item'; item: LibraryItemWithBriefs }
  | { kind: 'our_post'; post: OurPost };

type UsedTab = 'unused' | 'used';
type ItemLane = 'idea' | 'reference';

const EMPTY: Record<ItemLane, Record<UsedTab, { icon: IconName; title: string; body: string }>> = {
  idea: {
    unused: {
      icon: 'zap',
      title: 'No ideas yet',
      body: 'Type a post idea above and tap Make. The whole post is written and saved here, ready to edit or add to a week.',
    },
    used: {
      icon: 'zap',
      title: 'Nothing in a week yet',
      body: 'Ideas move here the moment their post lands in a week.',
    },
  },
  reference: {
    unused: {
      icon: 'link',
      title: 'No references yet',
      body: 'Paste a TikTok or Instagram post that did well, say what ours should be about, and tap Make. We keep its structure and write ours.',
    },
    used: {
      icon: 'link',
      title: 'Nothing in a week yet',
      body: 'References move here the moment their post lands in a week.',
    },
  },
};

function rowKey(row: Row): string {
  return row.kind === 'item' ? row.item.id : row.post.post_id;
}

function toFamily(format: BriefMediaFormat): BriefFormat {
  return format === 'slideshow' ? 'photo_carousel' : 'video';
}

/** The first TikTok or Instagram link in pasted text, or null. */
function socialLinkIn(text: string): string | null {
  const url = text.match(/https?:\/\/\S+/i)?.[0]?.replace(/[)\].,]+$/, '') ?? null;
  return url && SOCIAL_LINK.test(url) ? url : null;
}

const asItem = (item: LibraryItem): LibraryItemWithBriefs => ({ ...item, video_brief: null, carousel_brief: null });

export default function LibraryScreen() {
  const { profile } = useAuth();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [lane, setLane] = useState<LibraryLane>('idea');
  const [sub, setSub] = useState<UsedTab>('unused');
  const [family, setFamily] = useState<BriefFormat>('video');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<OurPostsSort>('top');
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [postTypeId, setPostTypeId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const [idea, setIdea] = useState('');
  const [ideaFormat, setIdeaFormat] = useState<FormatPick>(null);
  const [link, setLink] = useState('');
  const [direction, setDirection] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  /** Makes running (or failed) on this device, by library row. */
  const [jobs, setJobs] = useState<Record<string, MakeJob>>({});

  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<ItemLane, { unused: number; used: number } | null>>({
    idea: null,
    reference: null,
  });
  const [familyCounts, setFamilyCounts] = useState<{ video: number; photo_carousel: number; none: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [endReached, setEndReached] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creators, setCreators] = useState<{ id: string; full_name: string | null }[]>([]);
  const [postTypes, setPostTypes] = useState<PostType[]>([]);

  /** Add to week: the row being added, and the weeks to pick from when there are several. */
  const [addingId, setAddingId] = useState<string | null>(null);
  const [weekPick, setWeekPick] = useState<{ item: LibraryItemWithBriefs; brief: ReadyBrief; targets: TargetSlot[] } | null>(null);
  const [weekBusyId, setWeekBusyId] = useState<string | null>(null);

  // One counter guards every list write: filter changes mid flight discard
  // the stale response instead of racing it.
  const queryVersion = useRef(0);
  const enriching = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Read at call time, so counts refreshed from a finished make use the tab shown now.
  const subRef = useRef(sub);
  const familyRef = useRef(family);
  useEffect(() => {
    subRef.current = sub;
    familyRef.current = family;
  }, [sub, family]);

  const refreshCounts = useCallback(async (which: ItemLane) => {
    try {
      const [next, families] = await Promise.all([
        countLibraryItems(which),
        countLibraryFamilies(which, subRef.current === 'unused' ? 'new' : 'made'),
      ]);
      if (!mounted.current) return;
      setCounts((prev) => ({ ...prev, [which]: next }));
      setFamilyCounts(families);
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
        let next: Row[];
        let full: boolean;
        if (lane === 'our_post') {
          const posts = await listOurPosts({
            days: sort === 'top' ? 60 : null,
            creatorId: creatorId ?? undefined,
            postTypeId: postTypeId ?? undefined,
            search,
            sort,
            limit: PAGE,
            offset,
          });
          next = posts.map((post): Row => ({ kind: 'our_post', post }));
          full = posts.length === PAGE;
        } else {
          const used = sub === 'unused' ? 'new' : 'made';
          // Rows whose post never got made show in every tab, first, with Retry.
          const [made, unmade] = await Promise.all([
            listLibraryItems({ source: lane, search, used, family, limit: PAGE, offset }),
            offset === 0 ? listLibraryItems({ source: lane, search, used, family: 'none', limit: PAGE }) : Promise.resolve([]),
          ]);
          const seen = new Set<string>();
          next = [...unmade, ...made]
            .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
            .map((item): Row => ({ kind: 'item', item }));
          full = made.length === PAGE;
        }
        if (version !== queryVersion.current) return;
        setEndReached(!full);
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
    [lane, sub, family, search, sort, creatorId, postTypeId, refreshCounts],
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

  const companyId = profile?.active_company_id;
  useEffect(() => {
    if (!companyId) return;
    void listCreatorOptions(companyId).then(setCreators).catch(() => undefined);
    void listPostTypes().then(setPostTypes).catch(() => undefined);
    void Promise.all([countLibraryItems('idea'), countLibraryItems('reference')])
      .then(([ideaCounts, reference]) => setCounts({ idea: ideaCounts, reference }))
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
    setFamily('video');
    setFamilyCounts(null);
    setLane(next);
  }

  function switchSub(next: UsedTab) {
    if (next === sub) return;
    setRows([]);
    setFamilyCounts(null);
    setSub(next);
  }

  function switchFamily(next: BriefFormat) {
    if (next === family) return;
    setRows([]);
    setFamily(next);
  }

  function setJob(id: string, job: MakeJob | null) {
    if (!mounted.current) return;
    setJobs((prev) => {
      const out = { ...prev };
      if (job) out[id] = job;
      else delete out[id];
      return out;
    });
  }

  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const rowsHave = (id: string) => rowsRef.current.some((r) => r.kind === 'item' && r.item.id === id);

  function patchItem(id: string, item: LibraryItemWithBriefs) {
    setRows((prev) => prev.map((row) => (row.kind === 'item' && row.item.id === id ? { kind: 'item', item } : row)));
  }

  /**
   * Makes the post for a row with real steps: the reference read (polled),
   * then the writing call, then the save. Redo writes over the same post.
   */
  async function runMake(item: LibraryItem, opts: { format: BriefMediaFormat | null; replace?: { briefId: string; format: BriefMediaFormat; cover: string } }) {
    if (!profile || jobs[item.id]?.error === null) return;
    setJob(item.id, { phase: item.source === 'reference' ? 'reading' : 'writing', error: null });
    try {
      const made = await makeForItem({
        companyId: profile.active_company_id,
        userId: profile.id,
        item,
        format: opts.format,
        replace: opts.replace ?? null,
        onPhase: (phase) => setJob(item.id, { phase, error: null }),
        isCancelled: () => !mounted.current,
      });
      if (!mounted.current) return;
      setJob(item.id, null);
      const target = toFamily(made.format);
      if (subRef.current === 'unused' && target !== familyRef.current) {
        // The post lives in its format's tab now; go there.
        setRows([]);
        setFamily(target);
      } else {
        const fresh = await getLibraryItemWithBriefs(item.id).catch(() => null);
        if (fresh && rowsHave(item.id)) patchItem(item.id, fresh);
        else void loadPageRef.current(0);
      }
      void refreshCounts(item.source === 'reference' ? 'reference' : 'idea');
      flash(opts.replace ? 'Fresh take ready' : `${FORMAT_LABEL[made.format]} ready`);
    } catch (e) {
      setJob(item.id, { phase: null, error: e instanceof Error ? e.message : 'Could not make the post. Try again.' });
    }
  }

  /** A new row first, shown at once with its live steps, then the make. */
  async function startMake(source: { kind: 'idea'; text: string; format: FormatPick } | { kind: 'reference'; url: string; direction: string }) {
    if (!profile) return;
    const targetLane: ItemLane = source.kind;
    if (lane !== targetLane) {
      setRows([]);
      setSearch('');
      setLane(targetLane);
    }
    if (sub !== 'unused') {
      setRows([]);
      setSub('unused');
    }
    try {
      const item = await createLibraryItem({
        companyId: profile.active_company_id,
        userId: profile.id,
        source: source.kind === 'idea' ? { kind: 'idea', text: source.text } : { kind: 'reference', url: source.url, direction: source.direction },
      });
      setRows((prev) => [{ kind: 'item', item: asItem(item) }, ...prev.filter((r) => rowKey(r) !== item.id)]);
      void refreshCounts(targetLane);
      void runMake(item, { format: source.kind === 'idea' ? source.format : null });
    } catch (e) {
      Alert.alert('Could not save it', e instanceof Error ? e.message : 'Try again');
    }
  }

  function onMakeIdea() {
    const text = idea.replace(/\s*\n+\s*/g, ' ').trim();
    if (!text) return;
    setIdea('');
    void startMake({ kind: 'idea', text, format: ideaFormat });
  }

  function onMakeLink() {
    const url = socialLinkIn(link);
    if (!url) {
      flash('Paste a TikTok or Instagram link');
      return;
    }
    const about = direction.trim();
    setLink('');
    setDirection('');
    void startMake({ kind: 'reference', url, direction: about });
  }

  async function onPasteLink() {
    const url = socialLinkIn(await Clipboard.getStringAsync().catch(() => ''));
    if (!url) {
      flash('Copy a TikTok or Instagram link first');
      return;
    }
    setLink(url);
  }

  /**
   * A link shared to Noni from the TikTok or Instagram share sheet lands in
   * the References field, ready for what ours should be about.
   */
  useFocusEffect(
    useCallback(() => {
      if (!hasShareIntent) return;
      const url = socialLinkIn(shareIntent.webUrl ?? shareIntent.text ?? '');
      resetShareIntent();
      if (!url) {
        flash('Share a TikTok or Instagram link');
        return;
      }
      setRows([]);
      setSearch('');
      setSub('unused');
      setLane('reference');
      setLink(url);
    }, [hasShareIntent, shareIntent, resetShareIntent]),
  );

  function openUrl(url: string | null) {
    if (url) void Linking.openURL(url);
  }

  /** New format posts open in the brief editor, saving back to the same brief; old ones in the old editor. */
  function openPost(brief: ReadyBrief) {
    if (!isNewFormat(brief)) {
      router.push(`/(admin)/post/${brief.id}`);
      return;
    }
    router.push(
      editorHref({
        briefId: brief.id,
        campaignId: '',
        slot: '0',
        format: toMediaFormat(brief.format),
        kind: (brief.kind ?? 'handheld') as BriefKind,
        postTypeKey: brief.post_types?.key,
      }),
    );
  }

  function redo(item: LibraryItemWithBriefs, brief: ReadyBrief | null) {
    if (!brief) {
      void runMake(item, { format: null });
      return;
    }
    const format = toMediaFormat(brief.format);
    void runMake(item, { format, replace: { briefId: brief.id, format, cover: previewOf(brief).cover } });
  }

  async function addTo(item: LibraryItemWithBriefs, brief: ReadyBrief, target: TargetSlot) {
    setWeekBusyId(target.slot.briefId);
    try {
      await addMadeToSlot({ item, madeBriefId: brief.id, slotBriefId: target.slot.briefId });
      setWeekPick(null);
      if (sub === 'unused') setRows((prev) => prev.filter((r) => rowKey(r) !== item.id));
      else patchItem(item.id, { ...item, used_count: item.used_count + 1, last_brief_id: target.slot.briefId });
      void refreshCounts(item.source === 'reference' ? 'reference' : 'idea');
      router.push(weekHref(target.campaign.id, slotLabel(target.slot.index), target.slot.format));
    } catch (e) {
      Alert.alert('Could not add it', e instanceof Error ? e.message : 'Try again');
    } finally {
      setWeekBusyId(null);
    }
  }

  /** The first empty slot of the post's format: straight in when one week has room, else pick the week. */
  async function onAdd(item: LibraryItemWithBriefs, brief: ReadyBrief) {
    if (addingId) return;
    const format = toMediaFormat(brief.format);
    setAddingId(item.id);
    try {
      const pick = pickTargetSlot(await listTargetSlots(format));
      if (pick.kind === 'none') {
        Alert.alert(
          `No empty ${FORMAT_LABEL[format].toLowerCase()} slot`,
          `Every open week is full for ${format === 'slideshow' ? 'slideshows' : 'reels'}. Add a slot or start a week in Briefs, then add it.`,
        );
      } else if (pick.kind === 'one') {
        await addTo(item, brief, pick.target);
      } else {
        setWeekPick({ item, brief, targets: pick.targets });
      }
    } catch (e) {
      Alert.alert('Could not find a slot', e instanceof Error ? e.message : 'Try again');
    } finally {
      setAddingId(null);
    }
  }

  function confirmDelete(item: LibraryItem) {
    Alert.alert(
      item.source === 'reference' ? 'Delete this reference?' : 'Delete this idea?',
      'Its post goes with it. Posts already in a week are not affected.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setRows((prev) => prev.filter((row) => rowKey(row) !== item.id));
            setJob(item.id, null);
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
    enrichOurPostThumbnail(profile.active_company_id, profile.id, post)
      .then((url) => {
        if (url) {
          setRows((prev) =>
            prev.map((row) =>
              row.kind === 'our_post' && row.post.post_id === post.post_id ? { kind: 'our_post', post: { ...row.post, thumbnail_url: url } } : row,
            ),
          );
        }
      })
      .catch(() => undefined)
      .finally(() => enriching.current.delete(post.post_id));
  }

  function renderRow(row: Row, index: number) {
    const first = index === 0;
    const last = index === rows.length - 1;
    if (row.kind === 'our_post') {
      const url = row.post.post_url;
      return (
        <View style={[styles.cardRow, first && styles.cardRowFirst, last && styles.cardRowLast]}>
          <OurPostRow
            post={row.post}
            last={last}
            onNeedThumbnail={onNeedThumbnail}
            onPress={() => openUrl(url)}
            // Remake one of ours: it becomes a reference and is remixed like any pasted post.
            make={url ? { busy: false, disabled: false, onPress: () => void startMake({ kind: 'reference', url, direction: '' }) } : undefined}
          />
        </View>
      );
    }
    const item = row.item;
    const job = jobs[item.id] ?? null;
    const brief = madeBriefOf(item, toMediaFormat(family)) ?? madeBriefOf(item);
    return (
      <View style={!last && styles.referenceGap}>
        <ReadyPostCard
          item={item}
          brief={brief}
          job={job}
          onOpenSource={item.url ? () => openUrl(item.url) : undefined}
          onOpen={openPost}
          onAdd={(b) => void onAdd(item, b)}
          adding={addingId === item.id}
          onRedo={() => redo(item, brief)}
          onDelete={() => confirmDelete(item)}
          locked={(job !== null && job.error === null) || addingId !== null}
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
      return <Text style={styles.noMatch}>{itemLane === 'idea' ? 'No ideas match' : 'No references match'}</Text>;
    }
    const otherFamily = family === 'video' ? 'photo_carousel' : 'video';
    if ((familyCounts?.[otherFamily] ?? 0) > 0) {
      return <Text style={styles.noMatch}>{family === 'video' ? 'No reels here yet' : 'No slideshows here yet'}</Text>;
    }
    const copy = EMPTY[itemLane][sub];
    return <EmptyState icon={copy.icon} title={copy.title} body={copy.body} compact style={styles.emptyState} />;
  }

  const list = (
    <FlatList
      data={rows}
      keyExtractor={rowKey}
      renderItem={({ item: row, index }) => renderRow(row, index)}
      extraData={[jobs, addingId, family]}
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
        <ContextRow />
        <AdminHeader title="Library" />
        <SourceChips value={lane} onChange={switchLane} />

        {itemLane !== null && (
          <>
            {itemLane === 'idea' ? (
              <MakeComposer
                mode="idea"
                idea={idea}
                onChangeIdea={setIdea}
                format={ideaFormat}
                onChangeFormat={setIdeaFormat}
                canMake={Boolean(profile) && idea.trim().length > 0}
                onMake={onMakeIdea}
              />
            ) : (
              <MakeComposer
                mode="reference"
                link={link}
                onChangeLink={setLink}
                direction={direction}
                onChangeDirection={setDirection}
                onPaste={() => void onPasteLink()}
                canMake={Boolean(profile) && socialLinkIn(link) !== null}
                onMake={onMakeLink}
              />
            )}
            <SubTabs<UsedTab>
              items={[
                { id: 'unused', label: 'Unused', count: laneCounts?.unused },
                { id: 'used', label: 'Used', count: laneCounts?.used },
              ]}
              value={sub}
              onChange={switchSub}
            />
            <SubTabs<BriefFormat>
              items={[
                { id: 'video', label: 'Reel', count: familyCounts?.video },
                { id: 'photo_carousel', label: 'Slideshow', count: familyCounts?.photo_carousel },
              ]}
              value={family}
              onChange={switchFamily}
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
              <Icon name="layout-list" size={16} color={activeFilters > 0 ? color.blue700 : color.slate500} />
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
            companyId={profile.active_company_id}
            userId={profile.id}
            bottomPadding={bottomPadding}
            onToast={flash}
            renderHeader={(header) => <View style={styles.laneHeader}>{header}</View>}
          />
        ) : null
      ) : (
        list
      )}

      <WeekPickSheet
        visible={weekPick !== null}
        targets={weekPick?.targets ?? []}
        busyId={weekBusyId}
        onPick={(target) => {
          if (weekPick) void addTo(weekPick.item, weekPick.brief, target);
        }}
        onClose={() => setWeekPick(null)}
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
    marginBottom: 10,
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

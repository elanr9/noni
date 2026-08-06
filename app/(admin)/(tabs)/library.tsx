import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  LibraryItemCard,
  itemCardModel,
  ourPostCardModel,
  type LibraryCardModel,
} from '../../../components/admin/LibraryItemCard';
import { PressableScale } from '../../../components/ui/PressableScale';
import { Dropdown } from '../../../components/ui/Dropdown';
import { useAuth } from '../../../lib/auth';
import { listPostTypes, type PostType } from '../../../lib/briefs-api';
import {
  captureQuick,
  listCreatorOptions,
  listLibraryItems,
  listOurPosts,
  type LibrarySource,
  type OurPostsSort,
} from '../../../lib/library-api';
import { borderWidth, color, radius, ringFocus, space, type } from '../../../theme/tokens';

const CHIPS: Array<{ source: LibrarySource; label: string }> = [
  { source: 'idea', label: 'Ideas' },
  { source: 'our_post', label: 'Our posts' },
  { source: 'reference', label: 'References' },
  { source: 'from_creator', label: 'From creator' },
];

const PAGE = 50;
const SEARCH_DEBOUNCE_MS = 350;

const EMPTY_COPY: Record<LibrarySource, string> = {
  idea: 'Nothing captured yet. Type above, hit enter, saved. Paste the whole doc for one idea per line.',
  our_post: 'No posts in this window yet. Posts appear here as creators go live.',
  reference: 'Paste a link above to save it as a reference with a thumbnail.',
  from_creator: 'Nothing submitted by creators yet.',
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
  const [captureFocused, setCaptureFocused] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [cards, setCards] = useState<LibraryCardModel[]>([]);
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
        const next =
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
              ).map(ourPostCardModel)
            : (
                await listLibraryItems({ source, search, limit: PAGE, offset })
              ).map(itemCardModel);
        if (version !== queryVersion.current) return;
        setEndReached(next.length < PAGE);
        setCards((prev) => (offset === 0 ? next : [...prev, ...next]));
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

  function onCardPress(card: LibraryCardModel) {
    if (card.url) void Linking.openURL(card.url);
  }

  const showOurPostControls = source === 'our_post';

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <Text style={styles.h1}>Library</Text>

        <View style={[styles.captureRing, captureFocused && ringFocus]}>
          <TextInput
            value={capture}
            onChangeText={setCapture}
            onFocus={() => setCaptureFocused(true)}
            onBlur={() => setCaptureFocused(false)}
            onSubmitEditing={() => void onCapture()}
            placeholder="Idea or link. Paste lines for many at once."
            placeholderTextColor={color.slate400}
            multiline
            submitBehavior="blurAndSubmit"
            returnKeyType="done"
            style={styles.capture}
          />
        </View>
        {savedNote !== null && <Text style={styles.savedNote}>{savedNote}</Text>}

        <View style={styles.chipRow}>
          {CHIPS.map((chip) => {
            const active = chip.source === source;
            return (
              <PressableScale
                key={chip.source}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  if (chip.source === source) return;
                  setCards([]);
                  setSource(chip.source);
                }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {chip.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={showOurPostControls ? 'Search topic' : 'Search'}
          placeholderTextColor={color.slate400}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.search}
        />

        {showOurPostControls && (
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
        )}
      </View>

      <FlatList
        data={cards}
        keyExtractor={(card) => card.id}
        renderItem={({ item }) => (
          <LibraryItemCard model={item} onPress={() => onCardPress(item)} />
        )}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 116 }]}
        ItemSeparatorComponent={ListGap}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (!loading && !endReached && cards.length > 0) {
            void loadPage(cards.length);
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
          <Text style={styles.empty}>
            {loading ? 'Loading…' : EMPTY_COPY[source]}
          </Text>
        }
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

function ListGap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
  header: { paddingHorizontal: space.gutter, gap: 10 },
  h1: {
    fontSize: type.size.titleXl,
    lineHeight: type.size.titleXl * type.leading.title,
    fontWeight: '800',
    letterSpacing: type.tracking.title,
    color: color.ink,
    marginTop: 10,
  },
  captureRing: { borderRadius: radius.sm },
  capture: {
    minHeight: 48,
    maxHeight: 120,
    borderWidth: borderWidth.field,
    borderColor: color.lineStrong,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: type.size.body,
    fontWeight: '600',
    color: color.ink,
    backgroundColor: color.white,
  },
  savedNote: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.green,
  },
  chipRow: { flexDirection: 'row', gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  chipActive: {
    backgroundColor: color.blue100,
    borderColor: color.blue600,
  },
  chipText: {
    fontSize: type.size.chip,
    fontWeight: '700',
    color: color.slate500,
  },
  chipTextActive: { color: color.blue700 },
  search: {
    borderWidth: borderWidth.hair,
    borderColor: color.lineStrong,
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.ink,
    backgroundColor: color.white,
  },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, zIndex: 30 },
  list: { paddingHorizontal: space.gutter, paddingTop: 12 },
  gap: { height: 10 },
  empty: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
    lineHeight: type.size.bodySm * type.leading.body,
    paddingVertical: 8,
  },
});

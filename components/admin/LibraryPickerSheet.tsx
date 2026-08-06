// The Library picker that opens from inside the post editor. Filtered to the
// post's type (README §9): a filter line names the type, a References /
// Our posts segmented control, and one primary action — Attach to post.
// Attaching marks the item used — used_count increments, nothing is ever
// removed — then hands the result to the editor:
//   { kind: 'example', url }  -> attach as example_url
//   { kind: 'fill', text }    -> seed the post's content

import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '../../lib/auth';
import { listPostTypes, type PostType } from '../../lib/briefs-api';
import {
  listLibraryItems,
  listOurPosts,
  markLibraryItemUsed,
  markOurPostUsed,
  type LibraryItem,
  type OurPost,
} from '../../lib/library-api';
import { borderWidth, color, radiusAdmin, type } from '../../theme/tokens';
import { LibraryListSkeleton } from './library/LibraryListSkeleton';
import { Segmented, Sheet } from './shared';
import { Button } from '../ui/Button';
import {
  LibraryItemCard,
  MEDIA_CARD_HEIGHT,
  itemCardModel,
  ourPostCardModel,
} from './LibraryItemCard';

export type LibraryPick =
  | { kind: 'example'; url: string }
  | { kind: 'fill'; text: string };

export interface LibraryPickerSheetProps {
  visible: boolean;
  /** The post's type; filters both lanes. Null on legacy briefs shows all. */
  postTypeId: string | null;
  onClose: () => void;
  onPick: (pick: LibraryPick) => void;
}

const SEARCH_DEBOUNCE_MS = 350;

type Row =
  | { kind: 'item'; item: LibraryItem }
  | { kind: 'our_post'; post: OurPost };

function rowId(row: Row): string {
  return row.kind === 'item' ? row.item.id : row.post.post_id;
}

function filterLine(postType: PostType | null): string | null {
  if (!postType) return null;
  const noun = postType.family === 'photo_carousel' ? 'slideshows' : 'videos';
  return `Filtered to ${postType.label.toLowerCase()} ${noun}.`;
}

export function LibraryPickerSheet({
  visible,
  postTypeId,
  onClose,
  onPick,
}: LibraryPickerSheetProps) {
  const { profile } = useAuth();
  const [segment, setSegment] = useState(0);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [postType, setPostType] = useState<PostType | null>(null);

  const ourPosts = segment === 1;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (ourPosts) {
        const posts = await listOurPosts({
          postTypeId: postTypeId ?? undefined,
          search,
          sort: 'top',
        });
        setRows(posts.map((post): Row => ({ kind: 'our_post', post })));
      } else {
        const items = await listLibraryItems({
          source: 'reference',
          search,
          postTypeId: postTypeId ?? undefined,
        });
        setRows(items.map((item): Row => ({ kind: 'item', item })));
      }
    } catch (e) {
      Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again');
    } finally {
      setLoading(false);
    }
  }, [ourPosts, search, postTypeId]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => void load(), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [visible, load]);

  useEffect(() => {
    if (!visible || postTypeId === null) return;
    void listPostTypes()
      .then((types) => setPostType(types.find((t) => t.id === postTypeId) ?? null))
      .catch(() => undefined);
  }, [visible, postTypeId]);

  const selected = rows.find((row) => rowId(row) === selectedId) ?? null;

  function attach() {
    if (!selected) return;

    if (profile) {
      // Usage tracking must never block the pick; using never removes.
      const marked =
        selected.kind === 'item'
          ? markLibraryItemUsed(selected.item)
          : markOurPostUsed(profile.company_id, profile.id, selected.post);
      marked.catch(() => undefined);
    }

    const url = selected.kind === 'item' ? selected.item.url : selected.post.post_url;
    const text =
      selected.kind === 'item'
        ? selected.item.text
        : (selected.post.title ?? selected.post.hook);
    if (url) onPick({ kind: 'example', url });
    else if (text) onPick({ kind: 'fill', text });
  }

  const line = filterLine(postType);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      pinnedTop={90}
      footer={
        <Button block disabled={selected === null} onPress={attach}>
          Attach to post
        </Button>
      }
    >
      <Text style={styles.title}>Library</Text>
      {line !== null && <Text style={styles.filterLine}>{line}</Text>}

      <View style={styles.segmentWrap}>
        <Segmented
          options={[{ label: 'References' }, { label: 'Our posts' }]}
          value={segment}
          onChange={(index) => {
            if (index === segment) return;
            setRows([]);
            setSelectedId(null);
            setSegment(index);
          }}
        />
      </View>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search"
        placeholderTextColor={color.slate400}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.search}
      />

      <View style={styles.list}>
        {loading && rows.length === 0 ? (
          <LibraryListSkeleton height={MEDIA_CARD_HEIGHT} count={3} />
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>Nothing here for this post type yet.</Text>
        ) : (
          rows.map((row) => {
            const id = rowId(row);
            const model =
              row.kind === 'item' ? itemCardModel(row.item) : ourPostCardModel(row.post);
            return (
              <LibraryItemCard
                key={id}
                model={model}
                selected={id === selectedId}
                onPress={() => setSelectedId(id === selectedId ? null : id)}
              />
            );
          })
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: type.size.cardLg,
    fontWeight: '800',
    letterSpacing: type.tracking.title,
    color: color.ink,
    marginBottom: 4,
  },
  filterLine: {
    fontSize: type.size.meta,
    fontWeight: '600',
    color: color.slate500,
    marginBottom: 8,
  },
  segmentWrap: {
    marginTop: 4,
    marginBottom: 10,
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
    marginBottom: 12,
  },
  list: {
    gap: 10,
  },
  empty: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
    paddingVertical: 8,
  },
});

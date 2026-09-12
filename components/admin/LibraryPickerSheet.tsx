// The Library picker that opens from inside the post editor. A Media /
// References / Our posts / Ideas segmented control, a filter line naming the
// post's type where it applies, and one primary action. Picking marks the
// item used (used_count increments, nothing is ever removed) then hands the
// result to the editor:
//   { kind: 'media', mediaId }     -> write a post about what a media library item shows
//   { kind: 'copy', briefId }      -> clone a ready library post in, no AI, instant
//   { kind: 'port', briefId }      -> port that finished post into this slot
//   { kind: 'example', url, notes } -> generate from the reference, keep the link
//   { kind: 'fill', text }         -> generate from the idea

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '../../lib/auth';
import { listPostTypes, type BriefFormat, type PostType } from '../../lib/briefs-api';
import {
  listLibraryItems,
  listOurPosts,
  markLibraryItemUsed,
  markOurPostUsed,
  readyBriefFor,
  type LibraryItemWithBriefs,
  type OurPost,
} from '../../lib/library-api';
import { listMediaLibrary, type MediaLibraryItem } from '../../lib/media-library-api';
import { borderWidth, color, radiusAdmin, shadow, type } from '../../theme/tokens';
import { LibraryListSkeleton } from './library/LibraryListSkeleton';
import { PostThumb, Segmented, Sheet } from './shared';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import {
  LibraryItemCard,
  MEDIA_CARD_HEIGHT,
  itemCardModel,
  ourPostCardModel,
} from './LibraryItemCard';

export type LibraryPick =
  | { kind: 'copy'; briefId: string; sourceKind: 'idea' | 'example' }
  | { kind: 'port'; briefId: string }
  | { kind: 'example'; url: string; notes: string | null }
  | { kind: 'fill'; text: string }
  | { kind: 'media'; mediaId: string };

export interface LibraryPickerSheetProps {
  visible: boolean;
  /** The post's type; filters references, our posts and ideas. Null on legacy briefs shows all. */
  postTypeId: string | null;
  /** The slot's lane; a library row with a ready post in it copies in instantly. */
  family: BriefFormat;
  /** True while the editor is generating from the pick. */
  busy?: boolean;
  onClose: () => void;
  onPick: (pick: LibraryPick) => void;
}

const SEARCH_DEBOUNCE_MS = 350;

const SEGMENT_MEDIA = 0;
const SEGMENT_OUR_POSTS = 2;
const SEGMENT_IDEAS = 3;

type Row =
  | { kind: 'media'; media: MediaLibraryItem }
  | { kind: 'item'; item: LibraryItemWithBriefs }
  | { kind: 'our_post'; post: OurPost };

function rowId(row: Row): string {
  switch (row.kind) {
    case 'media':
      return row.media.id;
    case 'item':
      return row.item.id;
    case 'our_post':
      return row.post.post_id;
  }
}

function filterLine(postType: PostType | null): string | null {
  if (!postType) return null;
  const noun = postType.family === 'photo_carousel' ? 'slideshows' : 'videos';
  return `Filtered to ${postType.label.toLowerCase()} ${noun}.`;
}

function matchesMedia(media: MediaLibraryItem, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return (
    (media.title?.toLowerCase().includes(q) ?? false) ||
    (media.description?.toLowerCase().includes(q) ?? false)
  );
}

/** True when some loaded row already carries this exact idea text. */
function ideaExists(rows: Row[], text: string): boolean {
  const q = text.trim().toLowerCase();
  return rows.some(
    (row) => row.kind === 'item' && row.item.text?.trim().toLowerCase() === q,
  );
}

function MediaRow({
  media,
  selected,
  onPress,
}: {
  media: MediaLibraryItem;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={selected ? { selected } : undefined}
      onPress={onPress}
      style={[styles.card, shadow.shadowCard, selected && styles.cardSelected]}
    >
      <PostThumb
        uri={media.previewUrl}
        format={media.kind === 'recording' ? 'video' : 'photo_carousel'}
        width={54}
        height={72}
      />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {media.title ?? 'Untitled'}
        </Text>
        {media.description !== null && (
          <Text style={styles.cardMeta} numberOfLines={2}>
            {media.description}
          </Text>
        )}
      </View>
      <Text style={styles.trailing}>{media.kind === 'recording' ? 'Recording' : 'Screenshot'}</Text>
    </PressableScale>
  );
}

function NewIdeaRow({ text, onPress }: { text: string; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, styles.newIdea, shadow.shadowCard]}
    >
      <View style={styles.newIdeaGlyph}>
        <Icon name="plus" size={18} color={color.blue700} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {`Use "${text}" as a new idea`}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          Writes the post from what you typed
        </Text>
      </View>
    </PressableScale>
  );
}

export function LibraryPickerSheet({
  visible,
  postTypeId,
  family,
  busy = false,
  onClose,
  onPick,
}: LibraryPickerSheetProps) {
  const { profile } = useAuth();
  const [segment, setSegment] = useState(SEGMENT_MEDIA);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [mediaItems, setMediaItems] = useState<MediaLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [postType, setPostType] = useState<PostType | null>(null);

  const companyId = profile?.company_id ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (segment === SEGMENT_MEDIA) {
        if (!companyId) {
          setMediaItems([]);
          return;
        }
        setMediaItems(await listMediaLibrary(companyId));
      } else if (segment === SEGMENT_OUR_POSTS) {
        const posts = await listOurPosts({
          postTypeId: postTypeId ?? undefined,
          search,
          sort: 'top',
        });
        setRows(posts.map((post): Row => ({ kind: 'our_post', post })));
      } else {
        const items = await listLibraryItems({
          source: segment === SEGMENT_IDEAS ? 'idea' : 'reference',
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
  }, [segment, search, postTypeId, companyId]);

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

  const visibleRows = useMemo<Row[]>(() => {
    if (segment !== SEGMENT_MEDIA) return rows;
    return mediaItems
      .filter((media) => matchesMedia(media, search))
      .map((media): Row => ({ kind: 'media', media }));
  }, [segment, rows, mediaItems, search]);

  const selected = visibleRows.find((row) => rowId(row) === selectedId) ?? null;

  const typedIdea = search.trim();
  const showNewIdea =
    segment === SEGMENT_IDEAS && typedIdea.length > 0 && !ideaExists(rows, typedIdea);

  function attach() {
    if (!selected) return;

    if (selected.kind === 'media') {
      onPick({ kind: 'media', mediaId: selected.media.id });
      return;
    }

    if (profile) {
      // Usage tracking must never block the pick; using never removes.
      const marked =
        selected.kind === 'item'
          ? markLibraryItemUsed(selected.item)
          : markOurPostUsed(profile.company_id, profile.id, selected.post);
      marked.catch(() => undefined);
    }

    // A library row already made into this lane copies in as is. One made
    // only for the other lane ports across instead of regenerating.
    if (selected.kind === 'item') {
      const sourceKind = selected.item.source === 'reference' ? 'example' : 'idea';
      const ready = readyBriefFor(selected.item, family);
      if (ready) {
        onPick({ kind: 'copy', briefId: ready.id, sourceKind });
        return;
      }
      const other = readyBriefFor(
        selected.item,
        family === 'video' ? 'photo_carousel' : 'video',
      );
      if (other) {
        onPick({ kind: 'port', briefId: other.id });
        return;
      }
    }

    // One of ours carries its brief, so it ports whole rather than being
    // re-scraped off the platform.
    if (selected.kind === 'our_post' && selected.post.brief_id) {
      onPick({ kind: 'port', briefId: selected.post.brief_id });
      return;
    }
    const url = selected.kind === 'item' ? selected.item.url : selected.post.post_url;
    const text =
      selected.kind === 'item'
        ? selected.item.text
        : (selected.post.title ?? selected.post.hook);
    const notes = selected.kind === 'item' ? selected.item.notes : null;
    if (url) onPick({ kind: 'example', url, notes });
    else if (text) onPick({ kind: 'fill', text });
  }

  const selectedReady =
    selected?.kind === 'item' ? readyBriefFor(selected.item, family) : null;
  const writes = segment === SEGMENT_MEDIA || segment === SEGMENT_IDEAS;
  const primaryLabel = busy
    ? 'Building the post…'
    : selectedReady
      ? 'Use this post'
      : writes
        ? 'Write this post'
        : 'Attach to post';

  const line = segment === SEGMENT_MEDIA ? null : filterLine(postType);

  const emptyCopy =
    segment === SEGMENT_MEDIA
      ? 'No media yet. Add screenshots and recordings in the Library tab.'
      : 'Nothing here for this post type yet.';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      pinnedTop={90}
      footer={
        <Button block disabled={selected === null || busy} onPress={attach}>
          {primaryLabel}
        </Button>
      }
    >
      <Text style={styles.title}>Library</Text>
      {line !== null && <Text style={styles.filterLine}>{line}</Text>}

      <View style={styles.segmentWrap}>
        <Segmented
          options={[
            { label: 'Media' },
            { label: 'References' },
            { label: 'Our posts' },
            { label: 'Ideas' },
          ]}
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
        placeholder={segment === SEGMENT_IDEAS ? 'Search or type a new idea' : 'Search'}
        placeholderTextColor={color.slate400}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.search}
      />

      <View style={styles.list}>
        {showNewIdea && !busy && (
          <NewIdeaRow text={typedIdea} onPress={() => onPick({ kind: 'fill', text: typedIdea })} />
        )}
        {loading && visibleRows.length === 0 ? (
          <LibraryListSkeleton height={MEDIA_CARD_HEIGHT} count={3} />
        ) : visibleRows.length === 0 ? (
          !showNewIdea && <Text style={styles.empty}>{emptyCopy}</Text>
        ) : (
          visibleRows.map((row) => {
            const id = rowId(row);
            const isSelected = id === selectedId;
            const toggle = () => setSelectedId(isSelected ? null : id);
            if (row.kind === 'media') {
              return (
                <MediaRow key={id} media={row.media} selected={isSelected} onPress={toggle} />
              );
            }
            const model =
              row.kind === 'item'
                ? itemCardModel(row.item, null, family)
                : ourPostCardModel(row.post);
            return (
              <LibraryItemCard key={id} model={model} selected={isSelected} onPress={toggle} />
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
  card: {
    height: MEDIA_CARD_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: color.white,
    borderRadius: radiusAdmin.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    paddingHorizontal: 12,
  },
  cardSelected: {
    backgroundColor: color.blue50,
    borderColor: color.blue500,
  },
  cardBody: {
    flex: 1,
    gap: 4,
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.ink,
    lineHeight: type.size.bodySm * type.leading.snug,
  },
  cardMeta: {
    fontSize: type.size.label,
    fontWeight: '600',
    color: color.slate400,
  },
  trailing: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.slate500,
  },
  newIdea: {
    borderColor: color.blue500,
    borderStyle: 'dashed',
  },
  newIdeaGlyph: {
    width: 54,
    height: 72,
    borderRadius: radiusAdmin.sm,
    backgroundColor: color.blue50,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

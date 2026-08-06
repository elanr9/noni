// The Library picker that opens from inside the post editor (Agent 3 mounts
// it). Filtered to the post's type: our_post rows by post_type_id, other
// sources show typed matches plus untyped items (ideas carry no type).
// Picking an item marks it used — used_count increments, nothing is ever
// removed — then hands the result to the editor:
//   { kind: 'example', url }  -> attach as example_url
//   { kind: 'fill', text }    -> seed the post's content
// Items offer only the actions their data supports.

import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '../../lib/auth';
import {
  listLibraryItems,
  listOurPosts,
  markLibraryItemUsed,
  markOurPostUsed,
  type LibraryItem,
  type LibrarySource,
  type OurPost,
} from '../../lib/library-api';
import { borderWidth, color, radius, type } from '../../theme/tokens';
import { PressableScale } from '../ui/PressableScale';
import { SheetShell } from '../ui/SheetShell';
import {
  LibraryItemCard,
  itemCardModel,
  ourPostCardModel,
} from './LibraryItemCard';

export type LibraryPick =
  | { kind: 'example'; url: string }
  | { kind: 'fill'; text: string };

export interface LibraryPickerSheetProps {
  visible: boolean;
  /** The post's type; filters every chip. Null on legacy briefs shows all. */
  postTypeId: string | null;
  onClose: () => void;
  onPick: (pick: LibraryPick) => void;
}

const CHIPS: Array<{ source: LibrarySource; label: string }> = [
  { source: 'idea', label: 'Ideas' },
  { source: 'our_post', label: 'Our posts' },
  { source: 'reference', label: 'References' },
  { source: 'from_creator', label: 'From creator' },
];

const SEARCH_DEBOUNCE_MS = 350;

type Row =
  | { kind: 'item'; item: LibraryItem }
  | { kind: 'our_post'; post: OurPost };

export function LibraryPickerSheet({
  visible,
  postTypeId,
  onClose,
  onPick,
}: LibraryPickerSheetProps) {
  const { profile } = useAuth();
  const [source, setSource] = useState<LibrarySource>('idea');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (source === 'our_post') {
        const posts = await listOurPosts({
          postTypeId: postTypeId ?? undefined,
          search,
          sort: 'top',
        });
        setRows(posts.map((post) => ({ kind: 'our_post', post })));
      } else {
        const items = await listLibraryItems({
          source,
          search,
          postTypeId: postTypeId ?? undefined,
        });
        setRows(items.map((item) => ({ kind: 'item', item })));
      }
    } catch (e) {
      Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again');
    } finally {
      setLoading(false);
    }
  }, [source, search, postTypeId]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => void load(), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [visible, load]);

  function markUsed(row: Row) {
    if (!profile) return;
    const done =
      row.kind === 'item'
        ? markLibraryItemUsed(row.item)
        : markOurPostUsed(profile.company_id, profile.id, row.post);
    // Usage tracking must never block the pick.
    done.catch(() => undefined);
  }

  function onRowPress(row: Row) {
    const url = row.kind === 'item' ? row.item.url : row.post.post_url;
    const text =
      row.kind === 'item' ? row.item.text : (row.post.title ?? row.post.hook);

    const actions: Array<{ text: string; onPress: () => void }> = [];
    if (url) {
      actions.push({
        text: 'Use as example',
        onPress: () => {
          markUsed(row);
          onPick({ kind: 'example', url });
        },
      });
    }
    if (text) {
      actions.push({
        text: 'Fill from this',
        onPress: () => {
          markUsed(row);
          onPick({ kind: 'fill', text });
        },
      });
    }
    if (actions.length === 0) return;
    if (actions.length === 1) {
      actions[0].onPress();
      return;
    }
    Alert.alert('Use this item', text ?? url ?? '', [
      ...actions,
      { text: 'Cancel', style: 'cancel', onPress: () => undefined },
    ]);
  }

  return (
    <SheetShell visible={visible} onClose={onClose} pinnedTop={90}>
      <Text style={styles.title}>Library</Text>

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
                setRows([]);
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
        placeholder="Search"
        placeholderTextColor={color.slate400}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.search}
      />

      <View style={styles.list}>
        {loading && rows.length === 0 ? (
          <Text style={styles.empty}>Loading…</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>Nothing here for this post type yet.</Text>
        ) : (
          rows.map((row) => {
            const model =
              row.kind === 'item'
                ? itemCardModel(row.item)
                : ourPostCardModel(row.post);
            return (
              <LibraryItemCard
                key={model.id}
                model={model}
                onPress={() => onRowPress(row)}
              />
            );
          })
        )}
      </View>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: type.size.cardLg,
    fontWeight: '800',
    color: color.ink,
    marginBottom: 12,
  },
  chipRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
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
    marginBottom: 12,
  },
  list: { gap: 10 },
  empty: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
    paddingVertical: 8,
  },
});

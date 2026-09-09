import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';

import {
  addToMediaLibrary,
  contentTypeForLocal,
  extensionForContentType,
  listMediaLibrary,
  removeFromMediaLibrary,
  renameMediaLibraryItem,
  type LocalMedia,
  type MediaKind,
  type MediaLibraryItem,
} from '../../../lib/media-library-api';
import { fileSize } from '../../../lib/storage-upload';
import { borderWidth, color, radiusAdmin, shadow, space, type } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Icon } from '../../ui/Icon';
import { MediaThumb } from '../../ui/MediaThumb';
import { PressableScale } from '../../ui/PressableScale';
import { NameMediaSheet, type NameMediaPrompt } from './NameMediaSheet';
import { SubTabs } from './SubTabs';

const COLUMNS = 2;
const GAP = 12;
const TILE_RATIO = 5 / 4;

const NOUN: Record<MediaKind, { one: string; many: string; add: string }> = {
  screenshot: { one: 'screenshot', many: 'screenshots', add: 'Add screenshot' },
  recording: { one: 'recording', many: 'recordings', add: 'Add recording' },
};

type Tile = { kind: 'item'; item: MediaLibraryItem } | { kind: 'add' };

type Pending =
  | { mode: 'add'; media: LocalMedia }
  | { mode: 'rename'; item: MediaLibraryItem };

export interface MediaLaneProps {
  companyId: string;
  userId: string;
  bottomPadding: number;
  onToast: (message: string) => void;
  /** The pinned header renders the lane's sub tabs and toolbar. */
  renderHeader: (header: ReactNode) => ReactNode;
}

export function durationLabel(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function localFromPickerAsset(asset: ImagePicker.ImagePickerAsset, kind: MediaKind): LocalMedia {
  return {
    uri: asset.uri,
    kind,
    contentType: contentTypeForLocal(asset.uri, kind, asset.mimeType),
    durationMs: kind === 'recording' && typeof asset.duration === 'number' ? asset.duration : null,
    width: asset.width,
    height: asset.height,
  };
}

function extOf(pathOrUrl: string): string {
  const match = pathOrUrl.match(/\.([a-z0-9]+)(\?|#|$)/i);
  return match ? match[1].toLowerCase() : '';
}

function localFileMeta(media: LocalMedia): string {
  const ext = extensionForContentType(media.contentType);
  if (media.kind === 'recording') {
    const bits = [ext];
    if (media.durationMs !== null) bits.push(durationLabel(media.durationMs));
    bits.push(`${Math.max(1, Math.round(fileSize(media.uri) / (1024 * 1024)))} MB`);
    return bits.join(' · ');
  }
  return media.width && media.height ? `${ext} · ${media.width} × ${media.height}` : ext;
}

function itemMeta(item: MediaLibraryItem): string {
  const ext = extOf(item.path);
  if (item.kind === 'recording') {
    const bits = ['Recording'];
    if (item.durationMs !== null) bits.push(durationLabel(item.durationMs));
    if (ext) bits.push(ext);
    return bits.join(' · ');
  }
  return ext ? `Screenshot · ${ext}` : 'Screenshot';
}

function RecordingPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={styles.previewMedia} contentFit="contain" nativeControls />;
}

/**
 * Screenshots and recordings in two separate sub tabs. Every file is named on
 * the way in so it reads as "Highlight video" in every picker.
 */
export function MediaLane({ companyId, userId, bottomPadding, onToast, renderHeader }: MediaLaneProps) {
  const { width } = useWindowDimensions();
  const [kind, setKind] = useState<MediaKind>('screenshot');
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [preview, setPreview] = useState<MediaLibraryItem | null>(null);

  const tileWidth = (width - space.gutterAdmin * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
  const tileHeight = tileWidth * TILE_RATIO;
  const visible = items.filter((item) => item.kind === kind);
  const counts = {
    screenshot: items.filter((i) => i.kind === 'screenshot').length,
    recording: items.filter((i) => i.kind === 'recording').length,
  };
  const noun = NOUN[kind];

  const load = useCallback(async () => {
    try {
      setItems(await listMediaLibrary(companyId));
    } catch (e) {
      Alert.alert('Could not load media', e instanceof Error ? e.message : 'Try again');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [companyId]);

  useEffect(() => {
    let live = true;
    listMediaLibrary(companyId)
      .then((list) => {
        if (live) setItems(list);
      })
      .catch((e: unknown) => {
        if (live) Alert.alert('Could not load media', e instanceof Error ? e.message : 'Try again');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [companyId]);

  async function pick() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === 'recording' ? ['videos'] : ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setSaveError(null);
    setPending({ mode: 'add', media: localFromPickerAsset(result.assets[0], kind) });
  }

  async function onSaveTitle(title: string) {
    if (!pending) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (pending.mode === 'add') {
        const added = await addToMediaLibrary({
          companyId,
          createdBy: userId,
          media: pending.media,
          title,
        });
        setItems((prev) => [added, ...prev]);
        onToast(added.kind === 'recording' ? 'Recording added' : 'Screenshot added');
      } else {
        await renameMediaLibraryItem(pending.item.id, title);
        setItems((prev) =>
          prev.map((item) => (item.id === pending.item.id ? { ...item, title } : item)),
        );
        setPreview((prev) => (prev && prev.id === pending.item.id ? { ...prev, title } : prev));
      }
      setPending(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(item: MediaLibraryItem) {
    Alert.alert('Delete this media?', 'Posts already using it keep their copy.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setItems((prev) => prev.filter((i) => i.id !== item.id));
          setPreview((prev) => (prev && prev.id === item.id ? null : prev));
          removeFromMediaLibrary(item).catch((e: unknown) => {
            Alert.alert('Could not delete', e instanceof Error ? e.message : 'Try again');
            void load();
          });
        },
      },
    ]);
  }

  const prompt: NameMediaPrompt | null =
    pending === null
      ? null
      : pending.mode === 'add'
        ? {
            kind: pending.media.kind,
            previewUri: pending.media.kind === 'screenshot' ? pending.media.uri : null,
            fileMeta: localFileMeta(pending.media),
            initialTitle: '',
          }
        : {
            kind: pending.item.kind,
            previewUri: pending.item.previewUrl,
            fileMeta: itemMeta(pending.item),
            initialTitle: pending.item.title ?? '',
          };

  const tiles: Tile[] = [
    ...visible.map((item): Tile => ({ kind: 'item', item })),
    { kind: 'add' },
  ];

  const header = (
    <>
      <SubTabs<MediaKind>
        items={[
          { id: 'screenshot', label: 'Screenshots', count: loading ? undefined : counts.screenshot },
          { id: 'recording', label: 'Recordings', count: loading ? undefined : counts.recording },
        ]}
        value={kind}
        onChange={setKind}
      />
      {!loading && visible.length > 0 && (
        <View style={styles.toolbar}>
          <Text style={styles.count}>
            {`${visible.length} ${visible.length === 1 ? noun.one : noun.many}`}
          </Text>
          <Button size="sm" icon="plus" onPress={() => void pick()}>
            {noun.add}
          </Button>
        </View>
      )}
    </>
  );

  return (
    <>
      {renderHeader(header)}

      <FlatList
        data={loading || visible.length === 0 ? [] : tiles}
        numColumns={COLUMNS}
        keyExtractor={(tile) => (tile.kind === 'add' ? 'add' : tile.item.id)}
        columnWrapperStyle={styles.rowWrap}
        contentContainerStyle={[styles.grid, { paddingBottom: bottomPadding }]}
        renderItem={({ item: tile }) =>
          tile.kind === 'add' ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={noun.add}
              onPress={() => void pick()}
              style={{ width: tileWidth }}
            >
              <View style={[styles.addTile, { height: tileHeight }]}>
                <Icon
                  name={kind === 'recording' ? 'video' : 'image-plus'}
                  size={24}
                  color={color.blue500}
                />
                <Text style={styles.addText}>{noun.add}</Text>
              </View>
            </PressableScale>
          ) : (
            <Pressable
              accessibilityRole="imagebutton"
              accessibilityLabel={tile.item.title ?? `Untitled ${noun.one}`}
              onPress={() => setPreview(tile.item)}
              onLongPress={() => confirmDelete(tile.item)}
              style={{ width: tileWidth }}
            >
              <View style={[styles.tile, shadow.shadowMedia, { height: tileHeight }]}>
                <MediaThumb
                  uri={tile.item.url}
                  posterUri={tile.item.thumbPath ? tile.item.previewUrl : undefined}
                  style={styles.thumb}
                  badgeSize={36}
                />
                {tile.item.kind === 'recording' && tile.item.durationMs !== null && (
                  <View style={styles.durationBadge}>
                    <Text style={styles.durationText}>{durationLabel(tile.item.durationMs)}</Text>
                  </View>
                )}
              </View>
              <View style={styles.caption}>
                <Icon
                  name={tile.item.kind === 'recording' ? 'video' : 'images'}
                  size={12}
                  color={color.slate400}
                />
                <Text
                  style={[styles.captionText, tile.item.title === null && styles.captionMuted]}
                  numberOfLines={1}
                >
                  {tile.item.title ?? 'Untitled'}
                </Text>
              </View>
            </Pressable>
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={styles.spinner} color={color.blue500} />
          ) : (
            <EmptyState
              icon={kind === 'recording' ? 'video' : 'images'}
              title={kind === 'recording' ? 'No recordings yet' : 'No screenshots yet'}
              body={
                kind === 'recording'
                  ? 'Add screen recordings of the product. Give each one a title so it is easy to find in the editor. Up to 200 MB.'
                  : 'Add screenshots of the product. Give each one a title so it is easy to find in the editor.'
              }
              actionLabel={noun.add}
              onAction={() => void pick()}
              compact
              style={styles.empty}
            />
          )
        }
      />

      <NameMediaSheet
        prompt={prompt}
        busy={saving}
        error={saveError}
        onSave={(title) => void onSaveTitle(title)}
        onClose={() => {
          if (saving) return;
          setPending(null);
          setSaveError(null);
        }}
      />

      <Modal
        visible={preview !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreview(null)}
      >
        {preview ? (
          <View style={styles.previewRoot}>
            <View style={styles.previewHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close preview"
                onPress={() => setPreview(null)}
                style={styles.previewClose}
              >
                <Icon name="x" size={18} color={color.white} />
              </Pressable>
              <View style={styles.previewTitles}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Rename"
                  onPress={() => {
                    setSaveError(null);
                    setPending({ mode: 'rename', item: preview });
                  }}
                  style={styles.previewTitleRow}
                >
                  <Text style={styles.previewTitle} numberOfLines={1}>
                    {preview.title ?? 'Untitled'}
                  </Text>
                  <Icon name="pencil" size={13} color="rgba(255,255,255,0.6)" />
                </Pressable>
                <Text style={styles.previewMeta} numberOfLines={1}>
                  {itemMeta(preview)}
                </Text>
              </View>
            </View>
            <View style={styles.previewFrame}>
              {preview.kind === 'recording' ? (
                <RecordingPreview uri={preview.url} />
              ) : (
                <Image source={{ uri: preview.url }} style={styles.previewMedia} resizeMode="contain" />
              )}
            </View>
          </View>
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  count: {
    flex: 1,
    paddingHorizontal: 2,
    fontSize: type.size.label,
    fontWeight: '600',
    color: color.slate500,
  },
  grid: {
    paddingHorizontal: space.gutterAdmin,
    paddingTop: 4,
    gap: GAP,
  },
  rowWrap: {
    gap: GAP,
  },
  tile: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: color.fillQuiet,
  },
  thumb: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  addTile: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addText: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.slate500,
  },
  caption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 7,
    paddingHorizontal: 2,
  },
  captionText: {
    flex: 1,
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.ink,
  },
  captionMuted: {
    fontWeight: '600',
    color: color.slate400,
  },
  durationBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radiusAdmin.pill,
    backgroundColor: 'rgba(11,15,20,0.6)',
  },
  durationText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: color.white,
  },
  spinner: {
    paddingTop: 40,
  },
  empty: {
    marginTop: 24,
  },
  previewRoot: {
    flex: 1,
    backgroundColor: color.surfaceDark,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 58,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  previewClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTitles: {
    flex: 1,
    gap: 2,
  },
  previewTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewTitle: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '700',
    color: color.white,
  },
  previewMeta: {
    fontSize: type.size.label,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  previewFrame: {
    flex: 1,
    marginTop: 8,
    marginHorizontal: 20,
    marginBottom: 40,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: borderWidth.hair,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: color.ink,
  },
  previewMedia: {
    width: '100%',
    height: '100%',
  },
});

// The media sheet for a clip or slide. A top toggle picks Screenshots or
// Recordings, then two sources: the company's shared Library (one tap
// places, plus Add and long-press Remove so managers keep it stocked from
// here) and Photos (the camera roll, with a Save to library switch). Company
// Brain shots from the web ride along in the screenshot library. Falls back
// to the system picker when photo access is denied.
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';

import type { NoniLibraryGroup } from '../../../lib/briefs-api';
import {
  addToMediaLibrary,
  contentTypeForLocal,
  removeFromMediaLibrary,
  type LocalMedia,
  type MediaKind,
  type MediaLibraryItem,
} from '../../../lib/media-library-api';
import { color, radiusAdmin, space } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { Sheet, SkeletonCard } from '../shared';

const PAGE_SIZE = 60;
const TILE_GAP = 8;

type RollTile = {
  id: string;
  uri: string;
  date: string;
  durationMs: number | null;
  width: number;
  height: number;
};

export type MediaPick =
  | { source: 'local'; media: LocalMedia; saveToLibrary: boolean }
  | { source: 'library'; item: MediaLibraryItem }
  | { source: 'noni'; url: string };

function dateBadge(creationTime: number): string {
  return new Date(creationTime).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function durationLabel(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export interface CameraRollSheetProps {
  visible: boolean;
  onClose: () => void;
  onPick: (pick: MediaPick) => void;
  companyId: string;
  userId: string;
  /** Slideshows take stills only; the Recordings toggle hides. */
  allowRecordings: boolean;
  library: MediaLibraryItem[];
  onLibraryChange: (items: MediaLibraryItem[]) => void;
  /** Company Brain feature shots, shown under the shared screenshots. */
  noniLibrary?: NoniLibraryGroup[];
}

export function CameraRollSheet({
  visible,
  onClose,
  onPick,
  companyId,
  userId,
  allowRecordings,
  library,
  onLibraryChange,
  noniLibrary = [],
}: CameraRollSheetProps) {
  const { width } = useWindowDimensions();
  const [kind, setKind] = useState<MediaKind>('screenshot');
  const [tab, setTab] = useState<'library' | 'roll'>('library');
  const [tiles, setTiles] = useState<RollTile[]>([]);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveToLibrary, setSaveToLibrary] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const tileSize = Math.max(96, (width - 48 - TILE_GAP * 2) / 3);
  const items = useMemo(() => library.filter((i) => i.kind === kind), [library, kind]);
  const noun = kind === 'recording' ? 'recording' : 'screenshot';

  // Fresh state on every open, without an effect: reset when visible flips on.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setKind('screenshot');
      setTab('library');
      setSelectedId(null);
      setSaveToLibrary(false);
    }
  }

  function switchKind(next: MediaKind) {
    setKind(next);
    setSelectedId(null);
  }

  function switchTab(next: 'library' | 'roll') {
    setTab(next);
    setSelectedId(null);
  }

  useEffect(() => {
    if (!visible || tab !== 'roll') return;
    setLoading(true);
    void (async () => {
      try {
        const permission = await MediaLibrary.requestPermissionsAsync();
        if (!permission.granted) {
          setDenied(true);
          return;
        }
        setDenied(false);
        const page = await MediaLibrary.getAssetsAsync({
          mediaType: kind === 'recording' ? 'video' : 'photo',
          first: PAGE_SIZE,
          sortBy: [MediaLibrary.SortBy.creationTime],
        });
        setTiles(
          page.assets.map((asset) => ({
            id: asset.id,
            uri: asset.uri,
            date: dateBadge(asset.creationTime),
            durationMs: kind === 'recording' ? Math.round(asset.duration * 1000) : null,
            width: asset.width,
            height: asset.height,
          })),
        );
      } catch {
        setDenied(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, tab, kind]);

  function localFromPickerAsset(asset: ImagePicker.ImagePickerAsset): LocalMedia {
    return {
      uri: asset.uri,
      kind,
      contentType: contentTypeForLocal(asset.uri, kind, asset.mimeType),
      durationMs: kind === 'recording' && typeof asset.duration === 'number' ? asset.duration : null,
      width: asset.width,
      height: asset.height,
    };
  }

  /** ph:// assets need their file uri resolved before upload can read them. */
  async function localFromRollTile(tile: RollTile): Promise<LocalMedia> {
    const info = await MediaLibrary.getAssetInfoAsync(tile.id);
    const uri = info.localUri ?? info.uri;
    return {
      uri,
      kind,
      contentType: contentTypeForLocal(info.filename ?? uri, kind),
      durationMs: tile.durationMs,
      width: tile.width,
      height: tile.height,
    };
  }

  async function confirmRoll() {
    const tile = tiles.find((t) => t.id === selectedId);
    if (!tile) return;
    setConfirming(true);
    try {
      const media = await localFromRollTile(tile);
      onPick({ source: 'local', media, saveToLibrary });
    } catch (e) {
      Alert.alert(`Could not read the ${noun}`, e instanceof Error ? e.message : 'Try again');
    } finally {
      setConfirming(false);
    }
  }

  async function pickFromSystem(): Promise<LocalMedia | null> {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === 'recording' ? ['videos'] : ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return null;
    return localFromPickerAsset(result.assets[0]);
  }

  async function pickFromSystemForClip() {
    const media = await pickFromSystem();
    if (media) onPick({ source: 'local', media, saveToLibrary });
  }

  async function addToLibrary() {
    const media = await pickFromSystem();
    if (!media) return;
    setAdding(true);
    try {
      const item = await addToMediaLibrary({ companyId, createdBy: userId, media });
      onLibraryChange([item, ...library]);
    } catch (e) {
      Alert.alert('Could not add to the library', e instanceof Error ? e.message : 'Try again');
    } finally {
      setAdding(false);
    }
  }

  function confirmRemove(item: MediaLibraryItem) {
    Alert.alert(
      `Remove this ${noun}?`,
      'It leaves the shared library for everyone. Posts already using it keep their copy.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setRemovingId(item.id);
            void removeFromMediaLibrary(item)
              .then(() => onLibraryChange(library.filter((i) => i.id !== item.id)))
              .catch((e: unknown) =>
                Alert.alert('Could not remove', e instanceof Error ? e.message : 'Try again'),
              )
              .finally(() => setRemovingId(null));
          },
        },
      ],
    );
  }

  const showNoni = kind === 'screenshot' && noniLibrary.length > 0;

  const footer =
    tab === 'roll' && !denied ? (
      <View style={styles.footer}>
        <View style={styles.saveRow}>
          <View style={styles.saveText}>
            <Text style={styles.saveTitle}>Save to library</Text>
            <Text style={styles.saveHint}>Every manager can reuse it on other posts.</Text>
          </View>
          <Switch value={saveToLibrary} onValueChange={setSaveToLibrary} />
        </View>
        <Button
          block
          disabled={selectedId === null || confirming}
          onPress={() => void confirmRoll()}
        >
          {confirming ? 'Preparing…' : `Use ${noun}`}
        </Button>
      </View>
    ) : undefined;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={allowRecordings ? 'Add a screenshot or recording' : 'Add a picture'}
      footer={footer}
    >
      {allowRecordings ? (
        <View style={styles.kindBar} accessibilityRole="tablist">
          {(
            [
              { key: 'screenshot', label: 'Screenshots', icon: 'images' },
              { key: 'recording', label: 'Recordings', icon: 'video' },
            ] as const
          ).map((k) => {
            const active = kind === k.key;
            return (
              <PressableScale
                key={k.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => switchKind(k.key)}
                style={[styles.kindSeg, active && styles.kindSegActive]}
              >
                <Icon
                  name={k.icon}
                  size={15}
                  color={active ? color.ink : color.slate500}
                  strokeWidth={2.2}
                />
                <Text style={[styles.kindText, active && styles.kindTextActive]}>{k.label}</Text>
              </PressableScale>
            );
          })}
        </View>
      ) : null}

      <View style={styles.tabs}>
        {(
          [
            { key: 'library', label: 'Library' },
            { key: 'roll', label: 'Photos' },
          ] as const
        ).map((t) => {
          const active = tab === t.key;
          return (
            <PressableScale
              key={t.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => switchTab(t.key)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
            </PressableScale>
          );
        })}
      </View>

      {tab === 'library' ? (
        <View>
          <Text style={styles.hint}>
            {`Shared with every manager here. Tap a ${noun} to place it. Hold one to remove it.`}
          </Text>
          <View style={styles.grid}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`Add a ${noun} to the library`}
              disabled={adding}
              onPress={() => void addToLibrary()}
              style={[styles.tile, styles.addTile, { width: tileSize, height: tileSize }]}
            >
              <Icon name="plus" size={22} color={color.blue500} strokeWidth={2.5} />
              <Text style={styles.addText}>{adding ? 'Adding…' : 'Add'}</Text>
            </PressableScale>
            {items.map((item) => {
              const removing = removingId === item.id;
              return (
                <View key={item.id} style={{ width: tileSize }}>
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel={item.title ?? `Place this ${noun}`}
                    disabled={removing}
                    onPress={() => onPick({ source: 'library', item })}
                    onLongPress={() => confirmRemove(item)}
                    style={[
                      styles.tile,
                      { width: tileSize, height: tileSize },
                      removing && styles.tileDim,
                    ]}
                  >
                    <Image source={{ uri: item.previewUrl }} style={StyleSheet.absoluteFill} />
                    {item.kind === 'recording' ? (
                      <>
                        <View style={styles.playBadge}>
                          <Icon name="play" size={11} color={color.white} strokeWidth={3} />
                        </View>
                        {item.durationMs !== null ? (
                          <View style={styles.dateBadge}>
                            <Text style={styles.dateText}>{durationLabel(item.durationMs)}</Text>
                          </View>
                        ) : null}
                      </>
                    ) : null}
                  </PressableScale>
                  <Text
                    style={[styles.tileTitle, item.title === null && styles.tileTitleMuted]}
                    numberOfLines={1}
                  >
                    {item.title ?? 'Untitled'}
                  </Text>
                </View>
              );
            })}
          </View>
          {items.length === 0 ? (
            <Text style={styles.empty}>
              {kind === 'recording'
                ? 'No recordings in the library yet. Add one and it is here for every post.'
                : 'No screenshots in the library yet. Add one and it is here for every post.'}
            </Text>
          ) : null}

          {showNoni
            ? noniLibrary.map((group) => (
                <View key={group.featureId} style={styles.group}>
                  <Text style={styles.groupName}>{group.name}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.groupRow}>
                      {group.shots.map((shot) => (
                        <PressableScale
                          key={shot.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Place the ${group.name} screenshot`}
                          onPress={() => onPick({ source: 'noni', url: shot.url })}
                          style={[
                            styles.tile,
                            shot.shape === 'phone' ? styles.phoneTile : styles.laptopTile,
                          ]}
                        >
                          <Image source={{ uri: shot.url }} style={StyleSheet.absoluteFill} />
                          {shot.source === 'noni' ? (
                            <View style={styles.noniBadge}>
                              <Text style={styles.noniBadgeText}>Noni</Text>
                            </View>
                          ) : null}
                        </PressableScale>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              ))
            : null}
        </View>
      ) : denied ? (
        <View style={styles.deniedBlock}>
          <Text style={styles.deniedText}>
            Photo access is off. Pick from the system library instead, or allow access in
            Settings.
          </Text>
          <Button variant="tint" onPress={() => void pickFromSystemForClip()}>
            Open photo library
          </Button>
        </View>
      ) : loading ? (
        <View style={styles.grid}>
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard
              key={i}
              radius={radiusAdmin.md}
              style={{ width: tileSize, height: tileSize }}
            />
          ))}
        </View>
      ) : tiles.length === 0 ? (
        <Text style={styles.loading}>
          {kind === 'recording' ? 'No videos on this device yet.' : 'No photos on this device yet.'}
        </Text>
      ) : (
        <View style={styles.grid}>
          {tiles.map((tile) => {
            const selected = tile.id === selectedId;
            return (
              <PressableScale
                key={tile.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setSelectedId(selected ? null : tile.id)}
                style={[
                  styles.tile,
                  { width: tileSize, height: tileSize },
                  selected && styles.tileSelected,
                ]}
              >
                <Image source={{ uri: tile.uri }} style={StyleSheet.absoluteFill} />
                <View style={styles.dateBadge}>
                  <Text style={styles.dateText}>
                    {tile.durationMs !== null ? durationLabel(tile.durationMs) : tile.date}
                  </Text>
                </View>
                {selected && (
                  <View style={styles.check}>
                    <Icon name="check" size={12} color={color.white} strokeWidth={3} />
                  </View>
                )}
              </PressableScale>
            );
          })}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  kindBar: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
    marginBottom: 14,
  },
  kindSeg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: radiusAdmin.pill,
  },
  kindSegActive: {
    backgroundColor: color.white,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  kindText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: color.slate500,
  },
  kindTextActive: {
    color: color.ink,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  tab: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
  },
  tabActive: {
    backgroundColor: color.blue500,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: color.slate500,
  },
  tabTextActive: {
    color: color.white,
  },
  hint: {
    fontSize: 13,
    fontWeight: '600',
    color: color.slate400,
    marginBottom: 12,
  },
  empty: {
    fontSize: 13.5,
    lineHeight: 13.5 * 1.45,
    color: color.slate500,
    marginTop: 4,
    marginBottom: 16,
  },
  group: {
    marginTop: 8,
    marginBottom: 16,
  },
  groupName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: color.ink,
    marginBottom: 8,
  },
  groupRow: {
    flexDirection: 'row',
    gap: TILE_GAP,
  },
  phoneTile: {
    width: 92,
    height: 164,
  },
  laptopTile: {
    width: 164,
    height: 102,
  },
  noniBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue500,
  },
  noniBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: color.white,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
    paddingBottom: space[2],
  },
  tile: {
    borderRadius: radiusAdmin.md,
    overflow: 'hidden',
    backgroundColor: color.fillQuiet,
  },
  tileDim: {
    opacity: 0.4,
  },
  tileTitle: {
    marginTop: 5,
    paddingHorizontal: 2,
    fontSize: 12,
    fontWeight: '700',
    color: color.ink,
  },
  tileTitleMuted: {
    fontWeight: '600',
    color: color.slate400,
  },
  addTile: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.blue500,
    backgroundColor: color.blue100,
  },
  addText: {
    fontSize: 12,
    fontWeight: '700',
    color: color.blue700,
  },
  tileSelected: {
    borderWidth: 2.5,
    borderColor: color.blue500,
  },
  playBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    paddingLeft: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.scrim,
  },
  dateText: {
    fontSize: 10,
    fontWeight: '700',
    color: color.white,
  },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    gap: 12,
  },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  saveText: {
    flex: 1,
  },
  saveTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: color.ink,
  },
  saveHint: {
    fontSize: 12.5,
    color: color.slate500,
    marginTop: 2,
  },
  deniedBlock: {
    gap: 12,
    paddingVertical: 8,
  },
  deniedText: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 14 * 1.45,
    color: color.slate500,
  },
  loading: {
    paddingVertical: 16,
    fontSize: 14,
    fontWeight: '600',
    color: color.slate400,
  },
});

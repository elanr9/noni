// Admin handoff §8 — the screenshot sheet for screenshot slots. Two
// sources: the Noni library (Company Brain feature shots, default when the
// admin filled it) and the camera roll (3-up grid of 124px tiles with date
// badges). Selection is a 2.5px blue-500 outline with a blue check. Falls
// back to the system picker when photo access is denied.
import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';

import type { NoniLibraryGroup } from '../../../lib/briefs-api';
import { color, radiusAdmin, space } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { Sheet } from '../shared';

const PAGE_SIZE = 30;
const TILE_GAP = 8;

type Tile = {
  id: string;
  uri: string;
  /** e.g. "Aug 6". */
  date: string;
};

function dateBadge(creationTime: number): string {
  return new Date(creationTime).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export interface CameraRollSheetProps {
  visible: boolean;
  onClose: () => void;
  /** A readable local uri, ready for the existing upload path. */
  onPick: (localUri: string) => void;
  /** Noni library groups; the library tab shows when any exist. */
  library?: NoniLibraryGroup[];
}

export function CameraRollSheet({
  visible,
  onClose,
  onPick,
  library = [],
}: CameraRollSheetProps) {
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<'noni' | 'roll'>('noni');
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const hasLibrary = library.length > 0;
  const showRoll = tab === 'roll' || !hasLibrary;

  // Sheet content is inset 24 each side; three tiles per row.
  const tileSize = Math.max(96, (width - 48 - TILE_GAP * 2) / 3);

  useEffect(() => {
    if (!visible) return;
    setTab(hasLibrary ? 'noni' : 'roll');
    setSelectedId(null);
    setSelectedUrl(null);
  }, [visible, hasLibrary]);

  useEffect(() => {
    if (!visible || !showRoll) return;
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
          mediaType: 'photo',
          first: PAGE_SIZE,
          sortBy: [MediaLibrary.SortBy.creationTime],
        });
        setTiles(
          page.assets.map((asset) => ({
            id: asset.id,
            uri: asset.uri,
            date: dateBadge(asset.creationTime),
          })),
        );
      } catch {
        setDenied(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, showRoll]);

  /** ph:// assets need their file uri resolved before upload can read them. */
  async function confirm() {
    if (!showRoll && selectedUrl !== null) {
      onPick(selectedUrl);
      return;
    }
    if (selectedId === null) return;
    setConfirming(true);
    try {
      const info = await MediaLibrary.getAssetInfoAsync(selectedId);
      const uri = info.localUri ?? info.uri;
      onPick(uri);
    } catch (e) {
      Alert.alert(
        'Could not read the photo',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setConfirming(false);
    }
  }

  /** Permission denied: the system picker is the existing, always-open door. */
  async function pickFromSystem() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    onPick(result.assets[0].uri);
  }

  const canConfirm = showRoll ? selectedId !== null : selectedUrl !== null;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      footer={
        showRoll && denied ? undefined : (
          <Button block disabled={!canConfirm || confirming} onPress={() => void confirm()}>
            {confirming ? 'Preparing…' : 'Use screenshot'}
          </Button>
        )
      }
    >
      <Text style={styles.title}>Add a screenshot</Text>

      {hasLibrary && (
        <View style={styles.tabs}>
          {(
            [
              { key: 'noni', label: 'Noni library' },
              { key: 'roll', label: 'Camera roll' },
            ] as const
          ).map((t) => {
            const active = tab === t.key;
            return (
              <PressableScale
                key={t.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setTab(t.key)}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {t.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      )}

      {!showRoll ? (
        <View>
          <Text style={styles.libraryHint}>
            Video-ready shots from your Company Brain. Tap one, done.
          </Text>
          {library.map((group) => (
            <View key={group.featureId} style={styles.group}>
              <Text style={styles.groupName}>{group.name}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.groupRow}>
                  {group.shots.map((shot) => {
                    const selected = shot.url === selectedUrl;
                    const phone = shot.shape === 'phone';
                    return (
                      <PressableScale
                        key={shot.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => setSelectedUrl(selected ? null : shot.url)}
                        style={[
                          styles.tile,
                          phone ? styles.phoneTile : styles.laptopTile,
                          selected && styles.tileSelected,
                        ]}
                      >
                        <Image source={{ uri: shot.url }} style={StyleSheet.absoluteFill} />
                        {shot.source === 'noni' && (
                          <View style={styles.noniBadge}>
                            <Text style={styles.noniBadgeText}>Noni</Text>
                          </View>
                        )}
                        {selected && (
                          <View style={styles.check}>
                            <Icon name="check" size={12} color={color.white} strokeWidth={3} />
                          </View>
                        )}
                      </PressableScale>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          ))}
        </View>
      ) : denied ? (
        <View style={styles.deniedBlock}>
          <Text style={styles.deniedText}>
            Photo access is off. Pick from the system library instead, or
            allow access in Settings.
          </Text>
          <Button variant="tint" onPress={() => void pickFromSystem()}>
            Open photo library
          </Button>
        </View>
      ) : loading ? (
        <Text style={styles.loading}>Loading photos…</Text>
      ) : tiles.length === 0 ? (
        <Text style={styles.loading}>No photos on this device yet.</Text>
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
                  <Text style={styles.dateText}>{tile.date}</Text>
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
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: color.ink,
    marginBottom: 12,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
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
  libraryHint: {
    fontSize: 13,
    fontWeight: '600',
    color: color.slate400,
    marginBottom: 12,
  },
  group: {
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
  tileSelected: {
    borderWidth: 2.5,
    borderColor: color.blue500,
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

// Where a picture pop-up comes from: the camera roll or the company's brand
// media library (screenshots only). Returns the pick; the caller builds the
// asset and overlay.
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState, type JSX } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { listMediaLibrary, type MediaLibraryItem } from '../../../../lib/media-library-api';
import { toast } from '../../../v2/Toast';
import { color, editor, editorType, radius } from '../../../../theme/v2';
import { Icon, Press } from '../../../v2';

export type PicturePick = {
  localUri: string | null;
  storagePath: string | null;
  width: number | null;
  height: number | null;
};

const COLUMNS = 3;
const TILE_GAP = 6;

export function PicturePickerSheet(props: {
  companyId: string;
  onPick: (pick: PicturePick) => void;
  onClose: () => void;
}): JSX.Element {
  const { companyId, onPick, onClose } = props;
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<MediaLibraryItem[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listMediaLibrary(companyId)
      .then((all) => {
        if (!cancelled) setItems(all.filter((i) => i.kind === 'screenshot'));
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
        toast.error("Could not load your team's pictures. Your camera roll still works.");
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  async function pickFromCameraRoll() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      onPick({
        localUri: asset.uri,
        storagePath: null,
        width: asset.width > 0 ? asset.width : null,
        height: asset.height > 0 ? asset.height : null,
      });
    } catch (e) {
      Alert.alert('Could not open your photos', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable accessibilityLabel="Close" style={styles.scrim} onPress={onClose} />
        <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Add a picture</Text>
            <Press accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10} style={styles.headerBtn}>
              <Icon name="close" size={20} color={color.white} />
            </Press>
          </View>
          <Press
            accessibilityRole="button"
            accessibilityLabel="Camera roll"
            onPress={() => void pickFromCameraRoll()}
            disabled={busy}
            style={styles.rowBtn}
          >
            <Icon name="photo_library" size={20} color={color.white} />
            <Text style={styles.rowText}>Camera roll</Text>
            {busy ? <ActivityIndicator color={color.white} /> : <Icon name="chevron_right" size={18} color={editor.w60} />}
          </Press>
          <Text style={styles.sectionLabel}>Brand library</Text>
          {items === null ? (
            <ActivityIndicator color={color.white} style={styles.loader} />
          ) : items.length === 0 ? (
            <Text style={styles.empty}>No screenshots in the brand library yet.</Text>
          ) : (
            <FlatList
              data={items}
              numColumns={COLUMNS}
              keyExtractor={(item) => item.id}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.grid}
              style={styles.gridList}
              renderItem={({ item }) => (
                <Press
                  accessibilityRole="button"
                  accessibilityLabel={item.title ?? 'Screenshot'}
                  onPress={() =>
                    onPick({ localUri: null, storagePath: item.path, width: item.width, height: item.height })
                  }
                  style={styles.tile}
                >
                  <Image source={{ uri: item.previewUrl }} resizeMode="cover" style={styles.tileImage} />
                </Press>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: editor.k45,
  },
  panel: {
    backgroundColor: color.ink,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 10,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 40,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: editor.control,
  },
  title: {
    color: color.white,
    fontSize: editorType.size.bodySm,
    fontWeight: '700',
  },
  rowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    paddingHorizontal: 12,
    borderRadius: radius.thumb,
    backgroundColor: editor.control,
  },
  rowText: {
    flex: 1,
    color: color.white,
    fontSize: editorType.size.bodySm,
    fontWeight: '600',
  },
  sectionLabel: {
    color: editor.w60,
    fontSize: editorType.size.label,
    fontWeight: '600',
    letterSpacing: editorType.tracking.label,
    textTransform: 'uppercase',
    paddingTop: 4,
  },
  loader: {
    paddingVertical: 24,
  },
  empty: {
    color: editor.w60,
    fontSize: editorType.size.meta,
    paddingVertical: 16,
  },
  gridList: {
    flexGrow: 0,
  },
  grid: {
    gap: TILE_GAP,
  },
  gridRow: {
    gap: TILE_GAP,
  },
  tile: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.thumb,
    overflow: 'hidden',
    backgroundColor: editor.control,
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
});

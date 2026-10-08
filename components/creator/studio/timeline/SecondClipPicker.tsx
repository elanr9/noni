// Picks the clip for the other half of a split: any asset already in the
// document, or a video or photo from the camera roll.
import * as ImagePicker from 'expo-image-picker';
import { useState, type JSX } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { newId, type MediaAsset, type VideoDocument } from '../../../../lib/edit-document';
import { formatSeconds } from '../../../../lib/video-edit';
import { color, type } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { PressableScale } from '../../../ui/PressableScale';
import { PickerPanel } from './PickerPanel';
import { useAssetFrames } from './useAssetFrames';

const THUMB = 64;

export function SecondClipPicker(props: {
  doc: VideoDocument;
  title: string;
  onPick: (asset: MediaAsset) => void;
  onClose: () => void;
}): JSX.Element {
  const { doc, title, onPick, onClose } = props;
  const [busy, setBusy] = useState(false);
  const assets = doc.assets.filter((a) => a.localUri !== null);

  const fromLibrary = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos', 'images'], quality: 1 });
      const picked = result.canceled ? null : (result.assets[0] ?? null);
      if (!picked) return;
      const isVideo = picked.type === 'video';
      if (isVideo && !picked.duration) {
        Alert.alert('Could not read that video', 'Try another clip.');
        return;
      }
      onPick({
        id: newId('a'),
        kind: isVideo ? 'video' : 'image',
        localUri: picked.uri,
        storagePath: null,
        durationMs: isVideo ? Math.round(picked.duration ?? 0) : null,
        width: picked.width,
        height: picked.height,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PickerPanel title={title} onClose={onClose}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Choose from library"
          disabled={busy}
          onPress={() => void fromLibrary()}
          style={[styles.thumb, styles.library]}
        >
          <Icon name="images" size={22} color={color.white} />
          <Text style={styles.libraryLabel}>Library</Text>
        </PressableScale>
        {assets.map((asset) => (
          <AssetThumb key={asset.id} asset={asset} onPress={() => onPick(asset)} />
        ))}
      </ScrollView>
    </PickerPanel>
  );
}

function AssetThumb(props: { asset: MediaAsset; onPress: () => void }): JSX.Element {
  const { asset, onPress } = props;
  const { frames } = useAssetFrames(asset);
  const uri = asset.kind === 'image' ? asset.localUri : (frames[0] ?? null);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={asset.kind === 'video' ? 'Use this clip' : 'Use this photo'}
      onPress={onPress}
      style={styles.thumb}
    >
      {uri ? <Image source={{ uri }} resizeMode="cover" style={StyleSheet.absoluteFill} /> : null}
      {asset.kind === 'video' ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{formatSeconds(asset.durationMs ?? 0)}</Text>
        </View>
      ) : (
        <View style={styles.badge}>
          <Icon name="image" size={10} color={color.white} />
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingBottom: 4 },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: color.ink800,
    alignItems: 'center',
    justifyContent: 'center',
  },
  library: { backgroundColor: '#1C1C1E', gap: 4 },
  libraryLabel: { color: color.white, fontSize: type.size.micro, fontWeight: type.weight.semibold },
  badge: {
    position: 'absolute',
    bottom: 3,
    left: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: color.inkA55,
  },
  badgeText: {
    fontSize: type.size.micro,
    lineHeight: 12,
    fontWeight: type.weight.semibold,
    color: color.white,
    fontVariant: ['tabular-nums'],
  },
});

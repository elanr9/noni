import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import Animated, { FadeIn, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { GsMedia } from '../../../../lib/brief-library';
import { color, radius } from '../../../../theme/v2';
import { Button, Icon, Press } from '../../../v2';
import { BRAND_MEDIA, GradientFill, GRADS } from './ClipFrame';

const ED = { panel: '#17171C', chip: '#26262D' };
const PAGE = 48;

type Tile = { id: string; uri: string; dur: number; label: string };

export interface MediaPickerSheetProps {
  open: boolean;
  onClose: () => void;
  onPick: (m: GsMedia) => void;
}

/** Dark panel, 62% tall: Camera roll (photos and videos) or Noni media (brand tiles). */
export function MediaPickerSheet({ open, onClose, onPick }: MediaPickerSheetProps) {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'roll' | 'brand'>('roll');
  const [tiles, setTiles] = useState<Tile[] | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!open || tiles) return;
    let live = true;
    (async () => {
      try {
        const perm = await MediaLibrary.requestPermissionsAsync();
        if (!perm.granted) {
          if (live) setDenied(true);
          return;
        }
        const page = await MediaLibrary.getAssetsAsync({ mediaType: ['photo', 'video'], first: PAGE, sortBy: [MediaLibrary.SortBy.creationTime] });
        if (!live) return;
        setTiles(page.assets.map((a) => ({ id: a.id, uri: a.uri, dur: Math.round(a.duration), label: a.filename })));
      } catch {
        if (live) setDenied(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [open, tiles]);

  const pickSystem = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.9 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    const dur = a.type === 'video' ? Math.round((a.duration ?? 0) / 1000) : 0;
    onPick({ src: a.uri, label: a.fileName ?? 'Camera roll', kind: dur > 0 ? 'video' : 'image', dur });
    onClose();
  };

  const pickTile = async (t: Tile) => {
    let uri = t.uri;
    try {
      const info = await MediaLibrary.getAssetInfoAsync(t.id);
      uri = info.localUri ?? t.uri;
    } catch {
      uri = t.uri;
    }
    onPick({ src: uri, label: t.label, kind: t.dur > 0 ? 'video' : 'image', dur: t.dur });
    onClose();
  };

  if (!open) return null;
  const cols = 3;
  const tileW = (width - 4 - 2 * (cols - 1)) / cols;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1 }} />
      </Animated.View>
      <Animated.View entering={SlideInDown.duration(320)} exiting={SlideOutDown.duration(240)} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: height * 0.62, backgroundColor: ED.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 4, paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}>
          <View style={{ flex: 1, flexDirection: 'row', backgroundColor: ED.chip, borderRadius: radius.pill, padding: 3 }}>
            {(
              [
                ['roll', 'Camera roll'],
                ['brand', 'Noni media'],
              ] as const
            ).map(([k, l]) => (
              <Press key={k} onPress={() => setTab(k)} style={{ flex: 1, height: 32, borderRadius: radius.pill, backgroundColor: tab === k ? color.white : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: tab === k ? '#000000' : color.white }}>
                  {l}
                </Text>
              </Press>
            ))}
          </View>
          <Press accessibilityLabel="Close" onPress={onClose} style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: ED.chip, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" size={20} color={color.white} />
          </Press>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 2, paddingBottom: 30 + insets.bottom, flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
          {tab === 'roll' ? (
            denied ? (
              <View style={{ width: '100%', padding: 20, gap: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 15, lineHeight: 20, color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>Photos access is off. Pick one file instead.</Text>
                <Button label="Choose a photo or video" onPress={() => void pickSystem()} style={{ flex: 0, alignSelf: 'stretch' }} />
              </View>
            ) : (
              (tiles ?? []).map((t) => (
                <Press key={t.id} onPress={() => void pickTile(t)} style={{ width: tileW, height: tileW, overflow: 'hidden' }}>
                  <Image source={{ uri: t.uri }} resizeMode="cover" style={{ width: tileW, height: tileW }} />
                  {t.dur > 0 ? (
                    <Text style={{ position: 'absolute', right: 5, bottom: 3, fontSize: 11, lineHeight: 13, fontWeight: '600', color: color.white, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>
                      {Math.floor(t.dur / 60)}:{String(t.dur % 60).padStart(2, '0')}
                    </Text>
                  ) : null}
                </Press>
              ))
            )
          ) : (
            BRAND_MEDIA.map((b) => (
              <Press
                key={b.src}
                onPress={() => {
                  onPick({ src: b.src, label: b.label, kind: 'image', dur: 0 });
                  onClose();
                }}
                style={{ width: tileW, height: tileW, overflow: 'hidden', justifyContent: 'flex-end', padding: 8 }}
              >
                <GradientFill colors={GRADS[b.src]} deg={160} />
                <Text style={{ fontSize: 12, lineHeight: 14, fontWeight: '700', color: color.white }}>{b.label}</Text>
              </Press>
            ))
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// Freestyle: pick photos first, numbered in the order they will play, then
// edit. The camera roll is the system picker (multi select, up to 10); the
// numbered strip and Next are from SSFreestyle.jsx FreestylePicker.
import { useState, type JSX } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PickedPhoto } from '../../../../lib/submissions';
import { briefTone, color, radius, type as typeToken } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { pickFromLibrary, takePhoto } from './photo-picker';

const MAX_PHOTOS = 10;

export function FreestylePicker({
  title = 'Select photos',
  min = 1,
  onDone,
  onClose,
}: {
  title?: string;
  min?: number;
  onDone: (photos: PickedPhoto[]) => void;
  onClose: () => void;
}): JSX.Element {
  const insets = useSafeAreaInsets();
  const [sel, setSel] = useState<PickedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const room = MAX_PHOTOS - sel.length;

  const fromRoll = async () => {
    if (room <= 0) return;
    setBusy(true);
    try {
      const picked = await pickFromLibrary(room);
      if (picked.length) setSel((a) => [...a, ...picked].slice(0, MAX_PHOTOS));
    } finally {
      setBusy(false);
    }
  };
  const fromCamera = async () => {
    if (room <= 0) return;
    setBusy(true);
    try {
      const photo = await takePhoto();
      if (photo) setSel((a) => [...a, photo].slice(0, MAX_PHOTOS));
    } finally {
      setBusy(false);
    }
  };
  const ready = sel.length >= min;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
          <Icon name="x" size={20} color={color.white} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.close} />
      </View>
      <View style={styles.grid}>
        <Pressable accessibilityRole="button" disabled={busy || room <= 0} onPress={() => void fromRoll()} style={styles.tile}>
          <Icon name="images" size={26} color={color.white} />
          <Text style={styles.tileText}>Camera roll</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy || room <= 0} onPress={() => void fromCamera()} style={styles.tile}>
          <Icon name="camera" size={26} color={color.white} />
          <Text style={styles.tileText}>Camera</Text>
        </Pressable>
        <Text style={styles.count}>{sel.length} of {MAX_PHOTOS}</Text>
      </View>
      <View style={[styles.footer, { paddingBottom: Math.max(30, insets.bottom + 12) }]}>
        <View style={styles.strip}>
          {sel.map((p, k) => (
            <View key={`${p.uri}${k}`} style={styles.chip}>
              <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              <View style={styles.num}>
                <Text style={styles.numText}>{k + 1}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove"
                hitSlop={8}
                onPress={() => setSel((a) => a.filter((_, j) => j !== k))}
                style={styles.remove}
              >
                <Icon name="x" size={11} color={color.ink} />
              </Pressable>
            </View>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          disabled={!ready}
          onPress={() => onDone(sel)}
          style={[styles.next, ready ? styles.nextOn : styles.nextOff]}
        >
          <Text style={[styles.nextText, { color: ready ? color.white : color.whiteA45 }]}>Next{sel.length ? ` (${sel.length})` : ''}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink900 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10 },
  close: { width: 44, height: 44, borderRadius: 999, backgroundColor: color.whiteA16, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontFamily: typeToken.font.ui, fontSize: 16, fontWeight: '700', color: color.white },
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 2, paddingHorizontal: 2, alignContent: 'flex-start' },
  tile: {
    width: '33%',
    aspectRatio: 3 / 4,
    backgroundColor: briefTone.canvas.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tileText: { fontFamily: typeToken.font.ui, fontSize: 12, fontWeight: '700', color: color.white },
  count: { width: '100%', paddingTop: 14, textAlign: 'center', fontFamily: typeToken.font.ui, fontSize: 13, fontWeight: '600', color: color.whiteA60 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 12 },
  strip: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { width: 34, height: 46, borderRadius: 6, overflow: 'visible', backgroundColor: briefTone.canvas.chrome },
  num: { position: 'absolute', left: 3, bottom: 3, minWidth: 16, height: 16, borderRadius: 999, paddingHorizontal: 4, backgroundColor: color.blue500, alignItems: 'center', justifyContent: 'center' },
  numText: { fontFamily: typeToken.font.ui, fontSize: 10, fontWeight: '800', color: color.white },
  remove: { position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: 999, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center' },
  next: { height: 46, paddingHorizontal: 20, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  nextOn: { backgroundColor: color.blue500 },
  nextOff: { backgroundColor: color.whiteA16 },
  nextText: { fontFamily: typeToken.font.ui, fontSize: 15, fontWeight: '700' },
});

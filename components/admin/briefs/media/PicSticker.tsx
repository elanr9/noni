// A camera roll picture on a slide (BriefSlide.pics): movable and pinchable
// like the inset, with a small remove badge. Storage paths sign from
// brief-assets once and are cached; URLs draw as they are.
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import type { SlidePic } from '../../../../lib/briefs-api';
import { signedMediaUrl } from '../../../../lib/media-library-api';
import { color } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { Sticker } from '../canvas/Sticker';

const urlCache = new Map<string, Promise<string>>();

export function usePicUri(src: string): string | null {
  // Anything with a scheme (https, file, ph, assets-library) draws as it is; a bare path signs.
  const direct = /^[a-z][a-z0-9+.-]*:/i.test(src) ? src : null;
  const [signed, setSigned] = useState<{ for: string; url: string } | null>(null);
  useEffect(() => {
    if (direct) return;
    let live = true;
    let pending = urlCache.get(src);
    if (!pending) {
      pending = signedMediaUrl(src);
      pending.catch(() => urlCache.delete(src));
      urlCache.set(src, pending);
    }
    pending.then((url) => live && setSigned({ for: src, url })).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [src, direct]);
  return direct ?? (signed?.for === src ? signed.url : null);
}

const aspectCache = new Map<string, number>();

/** width / height of a picture, measured once per uri; 3:4 until it is known. */
export function useImageAspect(uri: string | null): number {
  const [aspect, setAspect] = useState<{ for: string; value: number } | null>(null);
  useEffect(() => {
    if (!uri || aspectCache.has(uri)) return;
    let live = true;
    Image.getSize(
      uri,
      (w, h) => {
        if (w > 0 && h > 0) {
          aspectCache.set(uri, w / h);
          if (live) setAspect({ for: uri, value: w / h });
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [uri]);
  if (!uri) return 3 / 4;
  return aspectCache.get(uri) ?? (aspect?.for === uri ? aspect.value : 3 / 4);
}

export function PicSticker({
  pic,
  W,
  H,
  onChange,
  onRemove,
}: {
  pic: SlidePic;
  W: number;
  H: number;
  onChange: (pic: SlidePic) => void;
  onRemove: () => void;
}) {
  const uri = usePicUri(pic.src);
  const aspect = useImageAspect(uri);
  const w = W * pic.box.w;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return (
    <Sticker
      x={pic.box.x}
      y={pic.box.y}
      width={w}
      W={W}
      H={H}
      onMove={(dx, dy) => onChange({ ...pic, box: { ...pic.box, x: clamp(pic.box.x + dx, 0.1, 0.9), y: clamp(pic.box.y + dy, 0.08, 0.95) } })}
      onScale={(r) => onChange({ ...pic, box: { ...pic.box, w: clamp(pic.box.w * r, 0.2, 0.9) } })}
    >
      <View style={[styles.card, { width: w, height: w / aspect, borderRadius: w * 0.04 }]}>
        {uri ? <Image source={{ uri }} resizeMode="cover" style={StyleSheet.absoluteFill} /> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Remove picture" onPress={onRemove} hitSlop={8} style={styles.remove}>
          <Icon name="x" size={13} color={color.white} />
        </Pressable>
      </View>
    </Sticker>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', backgroundColor: color.whiteA16 },
  remove: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 999, backgroundColor: color.inkA55, alignItems: 'center', justifyContent: 'center' },
});

// Shared pieces of Music and Account approval (design_handoff_v2_review §3.4,
// §3.5): the TikTok and Instagram cards, the notes sheet, the amber saved note
// card, the creator's screen recording cards and the popup player.
import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useVideoPlayer, VideoView } from 'expo-video';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { posterForVideo } from '../../../ui/MediaThumb';
import { color, radius, shadow, text } from '../../../../theme/v2';
import { Button, Icon, InstagramFill, InstagramMark, Press, Sheet, TikTokMark } from '../../../v2';
import { toast } from '../../../v2/Toast';

export type Platform = 'tiktok' | 'instagram';

const LABEL: Record<Platform, string> = { tiktok: 'TikTok', instagram: 'Instagram' };

/** Opens a platform URL: an installed app takes universal links, otherwise the browser does. */
export async function openPlatformUrl(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    toast.error('Could not open that link.');
  }
}

export function profileUrl(platform: Platform, handle: string): string {
  const clean = handle.replace(/^@/, '');
  return platform === 'instagram' ? `https://www.instagram.com/${clean}` : `https://www.tiktok.com/@${clean}`;
}

function PlatformDisc({ platform }: { platform: Platform }) {
  if (platform === 'instagram') {
    return (
      <InstagramFill style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
        <InstagramMark size={20} />
      </InstagramFill>
    );
  }
  return (
    <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' }}>
      <TikTokMark size={20} />
    </View>
  );
}

/** 118 high card: platform disc and open_in_new on top, label and sub below. Disabled without a URL. */
export function PlatformCard({ platform, sub, url }: { platform: Platform; sub: string; url: string | null }) {
  const off = url === null;
  return (
    <Press
      accessibilityRole="link"
      accessibilityLabel={`${LABEL[platform]}, ${sub}`}
      accessibilityState={{ disabled: off }}
      disabled={off}
      onPress={() => url && void openPlatformUrl(url)}
      style={[styles.platform, off && { opacity: 0.55 }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <PlatformDisc platform={platform} />
        <Icon name="open_in_new" size={18} color={color.grey3} />
      </View>
      <View>
        <Text style={{ fontSize: 15, lineHeight: 19, fontWeight: '600', color: color.ink }}>{LABEL[platform]}</Text>
        <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', color: color.grey4 }}>
          {sub}
        </Text>
      </View>
    </Press>
  );
}

/** TikTok always left, Instagram always right. */
export function PlatformGrid({ tiktok, instagram }: { tiktok: { sub: string; url: string | null }; instagram: { sub: string; url: string | null } }) {
  return (
    <View style={styles.grid}>
      <PlatformCard platform="tiktok" {...tiktok} />
      <PlatformCard platform="instagram" {...instagram} />
    </View>
  );
}

/** Request changes: a 120px note and Save changes, disabled while empty. */
export function NoteSheet({ open, creator, initial, onClose, onSave }: { open: boolean; creator: string; initial: string; onClose: () => void; onSave: (note: string) => void }) {
  const [note, setNote] = useState(initial);
  useEffect(() => {
    if (open) setNote(initial);
  }, [open, initial]);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      footer={<Button label="Save changes" disabled={note.trim().length === 0} onPress={() => onSave(note.trim())} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <Press accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.closeDisc}>
          <Icon name="close" size={18} color={color.ink} />
        </Press>
        <Text numberOfLines={1} style={[text.row, { flex: 1 }]}>
          Notes for {creator}
        </Text>
      </View>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Note"
        placeholderTextColor={color.grey3}
        multiline
        autoFocus
        style={styles.textarea}
      />
    </Sheet>
  );
}

/** Saved note under the grid: amber tint, edit_note, the text, chevron to edit. */
export function NoteCard({ note, onPress }: { note: string; onPress: () => void }) {
  return (
    <Press accessibilityRole="button" accessibilityLabel="Edit note" onPress={onPress} style={styles.noteCard}>
      <Icon name="edit_note" size={22} color={color.amber} />
      <Text style={[text.body, { flex: 1, color: color.ink }]}>{note}</Text>
      <Icon name="chevron_right" size={20} color={color.amber} />
    </Press>
  );
}

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Shade() {
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 1 1">
      <Defs>
        <LinearGradient id="clipShade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0.4" stopColor={color.ink} stopOpacity={0} />
          <Stop offset="1" stopColor={color.ink} stopOpacity={0.65} />
        </LinearGradient>
      </Defs>
      <Rect width={1} height={1} fill="url(#clipShade)" />
    </Svg>
  );
}

/** 9:12 recording card: poster frame, play disc, label and sub at bottom left. */
export function ClipCard({ label, sub, uri, onPress }: { label: string; sub: string; uri: string | null; onPress: () => void }) {
  const [poster, setPoster] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (uri) void posterForVideo(uri).then((p) => live && setPoster(p));
    return () => {
      live = false;
    };
  }, [uri]);
  const off = uri === null;
  return (
    <Press accessibilityRole="button" accessibilityLabel={off ? `${label}, not uploaded` : `Play ${label}`} disabled={off} onPress={onPress} style={[styles.clip, off && { opacity: 0.6 }]}>
      {poster ? <Animated.Image source={{ uri: poster }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      <Shade />
      <View style={styles.clipPlay}>
        <Icon name={off ? 'videocam' : 'play_arrow'} size={28} color={color.ink} />
      </View>
      <View style={{ position: 'absolute', left: 12, right: 12, bottom: 12 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 19, fontWeight: '600', color: color.white }}>
          {label}
        </Text>
        <Text numberOfLines={2} style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', color: color.white, opacity: 0.8 }}>
          {off ? 'Not uploaded' : sub}
        </Text>
      </View>
    </Press>
  );
}

function PopupBody({ uri, label, onClose }: { uri: string; label: string; onClose: () => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.25;
    p.play();
  });
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const fade = useSharedValue(0);
  const scale = useSharedValue(0.94);

  useEffect(() => {
    fade.set(withTiming(1, { duration: 220 }));
    scale.set(withTiming(1, { duration: 260, easing: Easing.bezier(0.22, 0.61, 0.36, 1) }));
    const a = player.addListener('timeUpdate', (e) => {
      setTime(e.currentTime);
      if (player.duration > 0) setDuration(player.duration);
    });
    const b = player.addListener('playingChange', (e) => setPlaying(e.isPlaying));
    return () => {
      a.remove();
      b.remove();
    };
  }, [player, fade, scale]);

  const scrim = useAnimatedStyle(() => ({ opacity: fade.get() }));
  const frame = useAnimatedStyle(() => ({ opacity: fade.get(), transform: [{ scale: scale.get() }] }));
  const close = () => {
    fade.set(withTiming(0, { duration: 180 }));
    setTimeout(onClose, 180);
  };
  const progress = duration > 0 ? Math.min(1, time / duration) : 0;

  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color.ink, opacity: 0.92 }, scrim]}>
        <Pressable accessibilityLabel="Close" style={{ flex: 1 }} onPress={close} />
      </Animated.View>
      <View pointerEvents="box-none" style={{ flex: 1, paddingTop: 72, paddingHorizontal: 24, paddingBottom: 48, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[styles.popupFrame, frame]}>
          <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'} style={StyleSheet.absoluteFill} onPress={() => (playing ? player.pause() : player.play())}>
            <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
            {!playing ? (
              <View style={{ ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' }}>
                <View style={[styles.clipPlay, { width: 64, height: 64, position: 'relative', top: 0, left: 0, marginTop: 0, marginLeft: 0 }]}>
                  <Icon name="play_arrow" size={36} color={color.ink} />
                </View>
              </View>
            ) : null}
          </Pressable>
          <Text style={{ position: 'absolute', top: 14, left: 14, fontSize: 14, fontWeight: '700', color: color.white }}>{label}</Text>
          <Press accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={styles.popupClose}>
            <Icon name="close" size={20} color={color.white} />
          </Press>
          <View pointerEvents="none" style={{ position: 'absolute', left: 14, right: 14, bottom: 14, gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: color.white }}>{fmtTime(time)}</Text>
            <View style={{ height: 3, borderRadius: radius.pill, backgroundColor: color.grey4 }}>
              <View style={{ height: 3, width: `${progress * 100}%`, borderRadius: radius.pill, backgroundColor: color.white }} />
            </View>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

/** Popup player over the screen: scrim fades in, the 9:16 frame scales up, autoplay, tap to pause. */
export function ClipPopup({ clip, onClose }: { clip: { uri: string; label: string } | null; onClose: () => void }) {
  if (!clip) return null;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <PopupBody uri={clip.uri} label={clip.label} onClose={onClose} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 10 },
  platform: { flex: 1, height: 118, padding: 14, borderRadius: radius.card, backgroundColor: color.card, justifyContent: 'space-between', ...shadow.card },
  closeDisc: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: color.grey1, alignItems: 'center', justifyContent: 'center' },
  textarea: { height: 120, padding: 14, borderRadius: radius.option, backgroundColor: color.grey1, fontSize: 15, lineHeight: 20, color: color.ink, textAlignVertical: 'top' },
  noteCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.card, backgroundColor: color.amberTint, marginTop: 12 },
  clip: { flex: 1, aspectRatio: 9 / 12, borderRadius: radius.card, overflow: 'hidden', backgroundColor: color.ink },
  clipPlay: { position: 'absolute', top: '50%', left: '50%', marginTop: -24, marginLeft: -24, width: 48, height: 48, borderRadius: radius.pill, backgroundColor: color.white, opacity: 0.92, alignItems: 'center', justifyContent: 'center' },
  popupFrame: { width: '100%', maxWidth: 320, aspectRatio: 9 / 16, borderRadius: 20, overflow: 'hidden', backgroundColor: color.ink },
  popupClose: { position: 'absolute', top: 10, right: 10, width: 36, height: 36, borderRadius: radius.pill, backgroundColor: color.grey4, alignItems: 'center', justifyContent: 'center' },
});

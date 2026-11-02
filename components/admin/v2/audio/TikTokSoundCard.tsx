// After posting: TikTok has no sound API, so the creator copies the name and
// adds the sound in TikTok (AUDIO.md, V2Audio.jsx TikTokSoundCard).
import { useEffect, useRef, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { tiktokSearchText } from '../../../../lib/audio-api';
import type { PostAudio } from '../../../../lib/brief-library';
import { color, radius } from '../../../../theme/v2';
import { Button, Icon, Press } from '../../../v2';
import { AudioCover } from './AudioCover';

export interface TikTokSoundCardProps {
  audio: PostAudio;
  /** The posted video on TikTok when known; the app otherwise. */
  tiktokUrl?: string | null;
  onDone: () => void;
}

const STEPS = ['Open your post in TikTok', 'Tap Edit post, then Add sound', 'Paste the name and pick the top result'];

export function TikTokSoundCard({ audio, tiktokUrl, onDone }: TikTokSoundCardProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const t = audio.track;
  const copy = () => {
    setCopied(true);
    Clipboard.setStringAsync(tiktokSearchText(t)).catch(() => undefined);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  };
  const openTikTok = async () => {
    const url = tiktokUrl ?? 'https://www.tiktok.com';
    try {
      await Linking.openURL(url);
    } catch {
      // Nothing to open to; the steps still apply.
    }
  };
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: color.grey1 }}>
        <AudioCover t={t} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: color.ink }}>{t.title}</Text>
          <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 16, color: color.grey4 }}>{t.artist}</Text>
        </View>
        <Press onPress={copy} accessibilityRole="button" accessibilityLabel="Copy sound name" style={{ height: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: copied ? color.green : color.ink, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Icon name={copied ? 'check' : 'content_copy'} size={16} color={color.white} />
          <Text style={{ fontSize: 13, lineHeight: 36, fontWeight: '700', color: color.white }}>{copied ? 'Copied' : 'Copy'}</Text>
        </Press>
      </View>
      <View style={{ gap: 10 }}>
        {STEPS.map((s, i) => (
          <View key={s} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ width: 22, height: 22, borderRadius: radius.pill, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, lineHeight: 22, fontWeight: '700', color: color.white }}>{i + 1}</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 15, lineHeight: 22, color: color.ink }}>{s}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant="ink" label="Open TikTok" onPress={() => void openTikTok()} />
        <Button label="Done" onPress={onDone} />
      </View>
    </View>
  );
}

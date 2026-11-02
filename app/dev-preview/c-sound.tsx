import { useState } from 'react';
import { View } from 'react-native';

import { AudioChip } from '../../components/admin/v2/audio/AudioChip';
import { AudioSheet } from '../../components/admin/v2/audio/AudioSheet';
import { TikTokSoundCard } from '../../components/admin/v2/audio/TikTokSoundCard';
import { Button, Card, Screen } from '../../components/v2';
import { AUDIO_LIB } from '../../lib/audio-library';
import type { PostAudio } from '../../lib/brief-library';

export default function Preview() {
  const [open, setOpen] = useState(false);
  const [audio, setAudio] = useState<PostAudio | null>({ track: AUDIO_LIB[1], start: 4, vol: 100, voice: 100 });
  return (
    <Screen title="Sound" scroll>
      <View style={{ height: 120, borderRadius: 16, backgroundColor: '#1A1A1F', marginBottom: 12, justifyContent: 'flex-end', padding: 12 }}>
        <AudioChip audio={audio} onPress={() => setOpen(true)} />
      </View>
      <Button label="Add sound" onPress={() => setOpen(true)} style={{ marginBottom: 12 }} />
      {audio ? (
        <Card>
          <TikTokSoundCard audio={audio} onDone={() => undefined} />
        </Card>
      ) : null}
      <AudioSheet open={open} onClose={() => setOpen(false)} len={15} value={audio} onChange={setAudio} onRemove={() => setAudio(null)} />
    </Screen>
  );
}

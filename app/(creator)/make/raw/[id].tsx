// Raw camera for a Story or Freestyle reel: record the whole post the way
// you would on TikTok, in one take or a few (tap or hold, delete the last,
// import from the camera roll). Each take is transcribed in the background
// as soon as it uploads, so Done goes to Edit my video with only the cut
// left to plan. The brief's title and ideas sit in the notes drawer for a
// glance mid take.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, type JSX } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { useRawProject } from '../../../../components/creator/briefs/raw/useRawProject';
import { CaptureScreen } from '../../../../components/creator/studio/capture/CaptureScreen';
import type { CaptureNotes } from '../../../../components/creator/studio/capture/NotesDrawer';
import { addTake, rememberWords, removeLastTake, runAutoEdit, takesDurationMs, takesOf, unheardTakes } from '../../../../lib/auto-edit';
import type { MediaAsset } from '../../../../lib/edit-document';
import { onVideo, useStudioStore } from '../../../../lib/studio-store';
import { color, space, type } from '../../../../theme/tokens';

export default function RawRecordRoute(): JSX.Element {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();
  const raw = useRawProject(id);
  const { brief, document, scope } = raw;
  const heard = useRef(new Set<string>());

  // Head start: listen to each take once it is in storage.
  useEffect(() => {
    if (!document || !scope) return;
    for (const take of unheardTakes(document)) {
      if (heard.current.has(take.id)) continue;
      heard.current.add(take.id);
      runAutoEdit({ assignmentId: scope.assignmentId, takes: [take], features: [], mode: 'words' })
        .then((reply) => {
          const words = reply.takes.find((t) => t.asset_id === take.id)?.words;
          if (!words) return;
          useStudioStore.getState().amend(onVideo((d) => (d.assets.some((a) => a.id === take.id) ? rememberWords(d, take.id, words) : d)));
        })
        .catch(() => heard.current.delete(take.id));
    }
  }, [document, scope]);

  const notes = useMemo<CaptureNotes | null>(() => {
    if (!brief) return null;
    const lines: string[] = [];
    for (const s of brief.slides) if (s.role === 'point' && s.text.trim()) lines.push(s.text.trim());
    if (brief.creatorNote) lines.push(brief.creatorNote);
    if (brief.cta.text) lines.push(`Plug: ${brief.cta.text}`);
    return { title: brief.title || 'Freestyle', lines };
  }, [brief]);

  if (raw.loading || !brief || !document) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        {raw.error ? <Text style={styles.error}>{raw.error}</Text> : <ActivityIndicator color={color.blue500} />}
      </View>
    );
  }

  const toCut = () => router.replace({ pathname: '/(creator)/make/cut/[id]', params: { id } });

  const onAsset = (asset: MediaAsset) => {
    if (asset.kind !== 'video') {
      Alert.alert('Videos only here', 'Add pictures in the editor after.');
      return;
    }
    useStudioStore.getState().commit(onVideo((d) => addTake(d, asset)));
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <CaptureScreen
        notes={notes}
        clipCount={takesOf(document).length}
        totalMs={takesDurationMs(document)}
        onAsset={onAsset}
        onDeleteLast={() => useStudioStore.getState().commit(onVideo(removeLastTake))}
        onDone={toCut}
        onClose={() => (from === 'edit' ? toCut() : router.back())}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.ink900 },
  error: { fontSize: type.size.body, color: color.white, textAlign: 'center', paddingHorizontal: space[8] },
});

// Captions on the phone preview, from the words Edit my video heard. The
// render burns its own from the same audio; this only shows the creator
// what they will get while they edit.
import { memo, useMemo, type JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { captionAt, captionLines, outputWords } from '../../../../lib/auto-edit';
import type { VideoDocument } from '../../../../lib/edit-document';
import { OVERLAY_TEXT_SPEC } from '../../../../lib/overlay-boxes';
import { useStudioStore } from '../../../../lib/studio-store';

/** Caption letters as a fraction of the stage width (the render's 3.6 vmin). */
const SIZE = 0.048;

export const CaptionPreview = memo(function CaptionPreview({ doc, width, height }: { doc: VideoDocument; width: number; height: number }): JSX.Element | null {
  const lines = useMemo(() => (doc.subtitles.enabled ? captionLines(outputWords(doc)) : []), [doc]);
  const playheadMs = useStudioStore((s) => s.playheadMs);
  const line = captionAt(lines, playheadMs);
  if (!line || width <= 0) return null;
  const fontSize = Math.round(width * SIZE);
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: height * doc.subtitles.y - fontSize * 1.2, paddingHorizontal: width * 0.12 }]}>
      <Text style={[styles.text, { fontSize, lineHeight: fontSize * 1.18 }]}>{line.text}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  text: {
    fontFamily: OVERLAY_TEXT_SPEC.condensed.fontFamily,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.95)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
});

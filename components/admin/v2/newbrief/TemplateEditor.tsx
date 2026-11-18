// The creator's reel editor mounted over the brief screen with the template
// on its timeline (BRIEFS.md section 5). Loads the template into the studio
// store once, keeps the teleprompter lines beside it, and on Save folds the
// timeline back onto the clips through docToTemplate.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { blockRanges } from '../../../../lib/edit-document';
import type { BriefType, GuidedState } from '../../../../lib/brief-library';
import { appendPlaceholderClip, docToTemplate, templateToDoc } from '../../../../lib/brief-template-doc';
import { onVideo, useStudioStore, useVideoDocument } from '../../../../lib/studio-store';
import { color, motion } from '../../../../theme/v2';
import { ReelEditor } from '../../../creator/briefs/reel/ReelEditor';
import { useOverlayUi } from '../../../creator/studio/overlays/overlay-ui-store';
import { SlideTemplateEditor } from './SlideTemplateEditor';

export interface TemplateEditorProps {
  g: GuidedState;
  type: BriefType;
  /** Open with the playhead on this clip. */
  startClipId: string | null;
  /** Marks the studio document as this template's. */
  ownerId: string;
  /** Brand library for the Image tool. */
  companyId: string;
  onChange: (fn: (cur: GuidedState) => GuidedState) => void;
  onClose: () => void;
}

/** Slideshows open the slide editor (BRIEFS.md 4a); every other type the reel editor. */
export function TemplateEditor(props: TemplateEditorProps) {
  return props.type === 'Slideshow' ? <SlideTemplateEditor {...props} /> : <ReelTemplateEditor {...props} />;
}

function ReelTemplateEditor({ g, type, startClipId, ownerId, companyId, onChange, onClose }: TemplateEditorProps) {
  // The timeline is built once from the template as it was when the editor opened; edits live in the studio store.
  const [init] = useState(() => ({ doc: templateToDoc(g, type), startClipId }));
  const [scripts, setScripts] = useState<Record<string, string>>(() => Object.fromEntries(g.clips.map((c) => [c.id, c.text])));
  const doc = useVideoDocument();
  const owner = useStudioStore((s) => s.ownerId);
  const key = `template:${ownerId}`;

  useEffect(() => {
    const store = useStudioStore.getState();
    store.load(init.doc, key);
    const at = init.startClipId ? blockRanges(init.doc).find((r) => r.block.id === init.startClipId) : null;
    if (at) store.setPlayhead(at.startMs);
    return () => {
      useOverlayUi.getState().closeEditor();
      useStudioStore.getState().setPlaying(false);
    };
  }, [init, key]);

  const save = () => {
    const d = useStudioStore.getState().document;
    if (d && d.format === 'video') onChange((cur) => ({ ...cur, clips: docToTemplate(d, cur, scripts) }));
    onClose();
  };

  const script = (blockId: string, text: string) => {
    setScripts((s) => ({ ...s, [blockId]: text }));
    onChange((cur) => (cur.clips.some((c) => c.id === blockId) ? { ...cur, clips: cur.clips.map((c) => (c.id === blockId ? { ...c, text } : c)) } : cur));
  };

  const addClip = () => useStudioStore.getState().commit(onVideo(appendPlaceholderClip));

  return (
    <Animated.View entering={FadeIn.duration(motion.tabInShort)} style={[StyleSheet.absoluteFill, styles.root]}>
      {doc && owner === key ? (
        <ReelEditor
          doc={doc}
          items={[]}
          companyId={companyId}
          cuts={0}
          place="any"
          onBack={onClose}
          onNext={save}
          onAddClip={addClip}
          onClose={onClose}
          title={g.title.trim() || 'Template'}
          scripts={type === 'Slideshow' ? undefined : scripts}
          onScript={type === 'Slideshow' ? undefined : script}
        />
      ) : (
        <View style={styles.root} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, zIndex: 50, backgroundColor: color.ink },
});

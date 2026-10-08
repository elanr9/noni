import { useEffect, useState, type JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MAX_SLIDES, assetById, type SlideshowDocument } from '../../../../lib/edit-document';
import { useKeyboardHeight } from '../../../../lib/keyboard';
import { PLATFORM_SLIDE_ASPECT, type SlidePlatform } from '../../../../lib/submissions';
import { color, radius, space, type } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { PressableScale } from '../../../ui/PressableScale';
import { FrameFit } from '../../slides/FrameFit';
import { centeredCrop } from '../../slides/photo-crop';
import { TextEditPanel } from '../../slides/TextEditPanel';
import { AddPhotosButton } from './AddPhotosButton';
import { useAssetSource, useAssetUri } from './asset-uri';
import { CropSheet } from './CropSheet';
import { Filmstrip } from './Filmstrip';
import { NotesSheet, type StudioNotes } from './NotesSheet';
import { SlideCanvas } from './SlideCanvas';
import { SlideTools } from './SlideTools';
import { cropPlatforms, frameAspect, slideCrop } from './slide-edits';
import { useSlideEdits } from './useSlideEdits';

export function SlideshowEditor(props: {
  doc: SlideshowDocument;
  notes: StudioNotes | null;
  companyId: string;
}): JSX.Element {
  const { doc, notes } = props;
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const edits = useSlideEdits(doc);
  const { current } = edits;
  const [cropState, setCropState] = useState<{ slideId: string; platform: SlidePlatform } | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  const asset = current ? assetById(doc, current.assetId) : null;
  const uri = useAssetUri(asset);
  const source = useAssetSource(asset, uri);
  const selectedBox = current?.boxes.find((b) => b.id === edits.selectedBoxId) ?? null;
  const currentId = current?.id ?? null;
  const cropPlatform = cropState !== null && cropState.slideId === currentId ? cropState.platform : null;
  const setCropPlatform = (next: SlidePlatform | null) =>
    setCropState(next !== null && currentId !== null ? { slideId: currentId, platform: next } : null);
  const platform: SlidePlatform = cropPlatform ?? 'tiktok';
  const aspect = frameAspect(doc.aspect, platform);
  const crop = current ? slideCrop(current, platform) : null;

  // A platform without a window yet starts centred, as the picker does for the first one.
  useEffect(() => {
    if (cropPlatform === null || current === null || source === null) return;
    if (slideCrop(current, cropPlatform) === null) {
      edits.setCrop(cropPlatform, centeredCrop(source, frameAspect(doc.aspect, cropPlatform)));
    }
  }, [cropPlatform, current, source, doc.aspect, edits]);

  function startCrop() {
    if (source === null) return;
    edits.deselectBox();
    setCropPlatform('tiktok');
  }

  if (doc.slides.length === 0 || current === null) {
    return (
      <View style={styles.root}>
        <View style={styles.empty}>
          <Icon name="images" size={36} color={color.whiteA60} />
          <Text style={styles.emptyTitle}>Build your slideshow</Text>
          <Text style={styles.emptySub}>
            Pick up to {MAX_SLIDES} photos. Add text and frame each one after.
          </Text>
          <AddPhotosButton variant="hero" remaining={MAX_SLIDES} onAdd={edits.addPhotos} />
          {notes ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Open brief notes"
              onPress={() => setNotesOpen(true)}
              style={styles.emptyNotes}
            >
              <Text style={styles.emptyNotesText}>See the brief</Text>
            </PressableScale>
          ) : null}
        </View>
        <NotesSheet visible={notesOpen} onClose={() => setNotesOpen(false)} notes={notes} slideIndex={-1} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.toolsRow}>
        {cropPlatform !== null ? (
          <Text style={styles.cropTitle}>Frame the photo</Text>
        ) : (
          <SlideTools
            onAddText={edits.addBox}
            onCrop={startCrop}
            onNotes={() => setNotesOpen(true)}
            onRemove={edits.removeCurrent}
            canCrop={source !== null}
            hasNotes={notes !== null}
          />
        )}
      </View>

      <FrameFit style={styles.stage} frameStyle={styles.frame} aspect={aspect}>
        <SlideCanvas
          uri={uri}
          crop={crop}
          source={source}
          frameAspect={aspect}
          chrome={platform === 'tiktok' && doc.aspect === PLATFORM_SLIDE_ASPECT.tiktok}
          boxes={current.boxes}
          editing={{
            selectedBoxId: edits.selectedBoxId,
            onChange: edits.changeBox,
            onTap: edits.selectBox,
            onTapEmpty: edits.deselectBox,
          }}
          onCropChange={
            cropPlatform !== null ? (next) => edits.setCrop(cropPlatform, next) : null
          }
        />
      </FrameFit>

      <Filmstrip
        doc={doc}
        currentId={currentId}
        onSelect={edits.jumpTo}
        reorder={edits.reorder}
        onAdd={edits.addPhotos}
      />

      <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 14) + keyboardHeight }]}>
        {cropPlatform !== null ? (
          <CropSheet
            platforms={cropPlatforms(doc.aspect)}
            platform={cropPlatform}
            onPlatform={setCropPlatform}
            onDone={() => setCropPlatform(null)}
          />
        ) : selectedBox !== null ? (
          <TextEditPanel
            key={selectedBox.id}
            box={selectedBox}
            autoFocus={edits.freshBoxId === selectedBox.id}
            onChange={edits.editBox}
            onDelete={() => edits.deleteBox(selectedBox.id)}
            onDone={edits.finishEditing}
          />
        ) : (
          <View style={styles.hintRow}>
            <Text style={styles.hintText}>Drag to move, pinch to resize, tap to edit</Text>
            <Text style={styles.counter}>
              Slide {edits.index + 1} of {doc.slides.length}
            </Text>
          </View>
        )}
      </View>

      <NotesSheet
        visible={notesOpen}
        onClose={() => setNotesOpen(false)}
        notes={notes}
        slideIndex={edits.index}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.ink900,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: space.gutter,
  },
  emptyTitle: {
    color: color.white,
    fontSize: type.size.card,
    fontWeight: type.weight.heavy,
  },
  emptySub: {
    color: color.whiteA60,
    fontSize: type.size.bodySm,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyNotes: {
    height: 40,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyNotesText: {
    color: color.whiteA75,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
  },
  toolsRow: {
    height: 44,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cropTitle: {
    color: color.white,
    fontSize: type.size.body,
    fontWeight: type.weight.heavy,
  },
  stage: {
    flex: 1,
    paddingHorizontal: 16,
  },
  frame: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  panel: {
    backgroundColor: color.white,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  hintRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  hintText: {
    flex: 1,
    color: color.slate500,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.semibold,
  },
  counter: {
    color: color.ink,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
  },
});

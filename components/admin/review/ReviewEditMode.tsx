// Full-screen edit mode over the reviewed post. The manager picks a clip or
// slide, then drags, pinches and retypes its text boxes, moves the inset, and
// on reels drags the subtitle band. Every change saves as it happens; Done
// flushes what is pending and reports whether anything changed.
import { useCallback, useState, type JSX } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BriefSegment } from '../../../lib/briefs-api';
import { newOverlayBox } from '../../../lib/overlay-boxes';
import { color, radius, type } from '../../../theme/tokens';
import { SLIDE_INSET_DEFAULTS, type SlideInset } from '../../SlideStage';
import {
  DEFAULT_INSET_WIDTH,
  DEFAULT_INSET_X,
  DEFAULT_INSET_Y,
} from '../../creator/editor/StageInset';
import {
  clampBoxSize,
  nextBoxId,
  segmentBoxes,
} from '../../creator/slides/segment-boxes';
import { TextEditPanel } from '../../creator/slides/TextEditPanel';
import { SoftToast } from '../../states';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { EditClipPicker } from './EditClipPicker';
import { EditStage, type EditStageBackground } from './EditStage';
import { useReviewEdits, type InsetDefaults } from './useReviewEdits';

export type EditTarget = {
  segment: BriefSegment;
  /** "Hook" / "Clip 2" / "Slide 3". */
  label: string;
  background: EditStageBackground;
  /** Signed URL of the admin's inset picture, when the segment has one. */
  insetUri?: string;
};

const REEL_INSET_DEFAULTS: InsetDefaults = {
  x: DEFAULT_INSET_X,
  y: DEFAULT_INSET_Y,
  width: DEFAULT_INSET_WIDTH,
};

export function ReviewEditMode(props: {
  format: 'video' | 'photo_carousel';
  briefId: string;
  targets: EditTarget[];
  index: number;
  onIndex: (index: number) => void;
  onSegments: (update: (prev: BriefSegment[]) => BriefSegment[]) => void;
  /** Reels with subtitles on: the band's centre and its optimistic setter. */
  subtitles: { y: number; onChange: (y: number) => void } | null;
  /** Fires once pending saves are flushed; `changed` asks for a re-render. */
  onDone: (changed: boolean) => void;
}): JSX.Element {
  const { format, briefId, targets, index, onIndex, onSegments, subtitles, onDone } = props;
  const insets = useSafeAreaInsets();
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [freshBoxId, setFreshBoxId] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  const onError = useCallback((message: string) => setErrorToast(message), []);
  const edits = useReviewEdits({ briefId, onSegments, onError });

  const isReel = format === 'video';
  const target = targets[Math.min(index, Math.max(targets.length - 1, 0))];
  const segment = target?.segment;
  const boxes = segment !== undefined ? segmentBoxes(segment) : [];
  const selectedBox = boxes.find((b) => b.id === selectedBoxId) ?? null;
  const insetDefaults = isReel ? REEL_INSET_DEFAULTS : SLIDE_INSET_DEFAULTS;
  const inset: SlideInset | undefined =
    segment !== undefined && target?.insetUri !== undefined
      ? {
          uri: target.insetUri,
          x: segment.screenshot_x ?? insetDefaults.x,
          y: segment.screenshot_y ?? insetDefaults.y,
          width: segment.screenshot_width ?? insetDefaults.width,
        }
      : undefined;

  const clearSelection = () => {
    setSelectedBoxId(null);
    setFreshBoxId(null);
  };

  const changeIndex = (next: number) => {
    clearSelection();
    onIndex(next);
  };

  const deleteBox = (boxId: string) => {
    if (segment === undefined) return;
    edits.updateBoxes(segment, (all) => all.filter((b) => b.id !== boxId));
    clearSelection();
  };

  const addBox = () => {
    if (segment === undefined) return;
    const id = nextBoxId(boxes);
    edits.updateBoxes(segment, (all) => [
      ...all,
      newOverlayBox({
        id,
        text: 'Your text',
        style: 'classic',
        themeColor: null,
        index: all.length,
      }),
    ]);
    setSelectedBoxId(id);
    setFreshBoxId(id);
  };

  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    await edits.flush();
    onDone(edits.isDirty());
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top + 8 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Add text"
          onPress={addBox}
          disabled={segment === undefined}
          style={[styles.toolBtn, segment === undefined && styles.toolBtnOff]}
        >
          <Icon name="plus" size={15} color={color.white} />
          <Text style={styles.toolText}>Text</Text>
        </PressableScale>
        <Text style={styles.title}>{isReel ? 'Edit video' : 'Edit slides'}</Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Done editing"
          onPress={() => void finish()}
          disabled={finishing}
          style={styles.doneBtn}
        >
          <Text style={styles.doneText}>Done</Text>
        </PressableScale>
      </View>

      {targets.length > 1 ? (
        <EditClipPicker
          labels={targets.map((t) => t.label)}
          index={index}
          onIndex={changeIndex}
        />
      ) : null}

      {segment !== undefined && target !== undefined ? (
        <EditStage
          background={target.background}
          boxes={boxes}
          inset={inset}
          editing={{
            onMoveBox: (boxId, x, y) =>
              edits.updateBoxes(segment, (all) =>
                all.map((b) => (b.id === boxId ? { ...b, x, y } : b)),
              ),
            onScaleBox: (boxId, size) =>
              edits.updateBoxes(segment, (all) =>
                all.map((b) => (b.id === boxId ? { ...b, size: clampBoxSize(size) } : b)),
              ),
            onTapBox: (boxId) => {
              setFreshBoxId(null);
              setSelectedBoxId(boxId);
            },
            onMoveInset: (x, y) => edits.placeInset(segment, { x, y }, insetDefaults),
            onScaleInset: (width) => edits.placeInset(segment, { width }, insetDefaults),
            selectedBoxId,
          }}
          subtitles={
            isReel && subtitles !== null
              ? {
                  y: subtitles.y,
                  onMove: (y) => {
                    subtitles.onChange(y);
                    edits.placeSubtitles(y);
                  },
                }
              : undefined
          }
          onDragStart={() => setTouched(true)}
        />
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Nothing to edit on this post yet.</Text>
        </View>
      )}

      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) + 6 }]}>
        {selectedBox !== null && segment !== undefined ? (
          <TextEditPanel
            key={selectedBox.id}
            box={selectedBox}
            autoFocus={freshBoxId === selectedBox.id}
            onChange={(box) =>
              edits.updateBoxes(segment, (all) => all.map((b) => (b.id === box.id ? box : b)))
            }
            onDelete={() => deleteBox(selectedBox.id)}
            onDone={(finalText) => {
              if (finalText.trim().length === 0) deleteBox(selectedBox.id);
              else clearSelection();
            }}
          />
        ) : (
          <Text style={styles.hint}>
            {touched
              ? 'Changes save as you go. Done re-edits the post.'
              : 'Drag to move, pinch to resize, tap to edit.'}
          </Text>
        )}
      </View>

      <SoftToast
        visible={errorToast !== null}
        message={errorToast ?? ''}
        tone="error"
        onHide={() => setErrorToast(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: color.ink900,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  title: {
    color: color.white,
    fontSize: type.size.body,
    fontWeight: type.weight.heavy,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA16,
  },
  toolBtnOff: {
    opacity: 0.45,
  },
  toolText: {
    color: color.white,
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
  },
  doneBtn: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    color: color.ink,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: color.whiteA60,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.semibold,
  },
  sheet: {
    backgroundColor: color.white,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingHorizontal: 24,
    paddingTop: 18,
    gap: 10,
  },
  hint: {
    textAlign: 'center',
    color: color.slate500,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.semibold,
    paddingVertical: 6,
  },
});

// Full-screen edit mode over the reviewed post. The manager picks a clip or
// slide, then drags, pinches and retypes its text boxes, moves the inset, and
// on reels drags the subtitle band. Every change saves as it happens; Done
// flushes what is pending, then asks for the re-render. Cancel puts every
// touched row back and reloads.
//
// Layout is fixed: header, picker, stage, then a bottom sheet of constant
// minimum height that slides above the keyboard. The stage never reflows.
import { useCallback, useRef, useState, type JSX } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BriefSegment } from '../../../lib/briefs-api';
import { useKeyboardPadding } from '../../../lib/keyboard';
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
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { EditClipPicker } from './EditClipPicker';
import { EditStage, type EditStageBackground } from './EditStage';
import { EditTextPanel } from './EditTextPanel';
import { EditToast, type EditToastState } from './EditToast';
import { useReviewEdits, type EditSnapshot, type InsetDefaults } from './useReviewEdits';

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
/** Where the first box lands on a segment that has none. */
const FIRST_BOX_Y = 0.3;
/** Bottom sheet floor so the stage size does not depend on what the sheet shows. */
const SHEET_MIN_HEIGHT = 184;
const HEADER_HEIGHT = 48;
const PICKER_HEIGHT = 42;

export function ReviewEditMode(props: {
  format: 'video' | 'photo_carousel';
  briefId: string;
  targets: EditTarget[];
  index: number;
  onIndex: (index: number) => void;
  onSegments: (update: (prev: BriefSegment[]) => BriefSegment[]) => void;
  /** Reels with subtitles on: the band's centre and its optimistic setter. */
  subtitles: { y: number; onChange: (y: number) => void } | null;
  /** Pending saves are flushed first; resolves once the re-render is requested. */
  onDone: (changed: boolean) => Promise<void>;
  /** Touched rows are already restored; reload from the server and close. */
  onCancel: () => Promise<void>;
}): JSX.Element {
  const { format, briefId, targets, index, onIndex, onSegments, subtitles, onDone, onCancel } =
    props;
  const insets = useSafeAreaInsets();
  const keyboardPad = useKeyboardPadding();
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [freshBoxId, setFreshBoxId] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [toast, setToast] = useState<EditToastState | null>(null);
  const [leaving, setLeaving] = useState<'done' | 'cancel' | null>(null);

  // What the rows looked like when edit mode opened; Cancel restores this.
  const snapshot = useRef<EditSnapshot>({
    segments: targets.map((t) => t.segment),
    subtitlesY: subtitles?.y ?? null,
  });

  const onError = useCallback(
    (message: string, retry: () => void) => setToast({ message, retry }),
    [],
  );
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
  const sheetHeight = SHEET_MIN_HEIGHT + Math.max(insets.bottom, 14);

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
    edits.updateBoxes(segment, (all) => {
      const fresh = newOverlayBox({
        id,
        text: 'Your text',
        style: 'classic',
        themeColor: null,
        index: all.length,
      });
      return [...all, all.length === 0 ? { ...fresh, x: 0.5, y: FIRST_BOX_Y } : fresh];
    });
    setTouched(true);
    setSelectedBoxId(id);
    setFreshBoxId(id);
  };

  const finish = async () => {
    if (leaving !== null) return;
    setLeaving('done');
    setToast(null);
    try {
      await edits.flush();
      await onDone(edits.isDirty());
    } catch {
      setLeaving(null);
      setToast({ message: 'Could not start the re-edit.', retry: () => void finish() });
    }
  };

  const cancel = async () => {
    if (leaving !== null) return;
    setLeaving('cancel');
    setToast(null);
    await edits.discard(snapshot.current);
    await onCancel();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Cancel and discard edits"
          onPress={() => void cancel()}
          disabled={leaving !== null}
          hitSlop={8}
          style={styles.cancelBtn}
        >
          {leaving === 'cancel' ? (
            <ActivityIndicator size="small" color={color.white} />
          ) : (
            <Text style={styles.cancelText}>Cancel</Text>
          )}
        </PressableScale>
        <Text style={styles.title}>{isReel ? 'Edit video' : 'Edit slides'}</Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Done editing"
          onPress={() => void finish()}
          disabled={leaving !== null}
          style={styles.doneBtn}
        >
          {leaving === 'done' ? (
            <ActivityIndicator size="small" color={color.ink} />
          ) : (
            <Text style={styles.doneText}>Done</Text>
          )}
        </PressableScale>
      </View>

      <View style={styles.picker}>
        <View style={styles.pickerScroll}>
          {targets.length > 1 ? (
            <EditClipPicker
              labels={targets.map((t) => t.label)}
              index={index}
              onIndex={changeIndex}
            />
          ) : null}
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Add text"
          onPress={addBox}
          disabled={segment === undefined || leaving !== null}
          style={[styles.toolBtn, segment === undefined && styles.toolBtnOff]}
        >
          <Icon name="plus" size={15} color={color.white} />
          <Text style={styles.toolText}>Text</Text>
        </PressableScale>
      </View>

      <View style={[styles.stageArea, { paddingBottom: sheetHeight + 12 }]}>
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
              onChangeBox: (boxId, patch) =>
                edits.updateBoxes(segment, (all) =>
                  all.map((b) =>
                    b.id === boxId
                      ? {
                          ...b,
                          ...patch,
                          ...(patch.size !== undefined ? { size: clampBoxSize(patch.size) } : {}),
                        }
                      : b,
                  ),
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
            onTapEmpty={clearSelection}
          />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nothing to edit on this post yet.</Text>
          </View>
        )}
      </View>

      <View
        style={[
          styles.sheet,
          {
            minHeight: sheetHeight,
            paddingBottom: Math.max(insets.bottom, 14),
            transform: [{ translateY: -keyboardPad }],
          },
        ]}
      >
        {selectedBox !== null && segment !== undefined ? (
          <EditTextPanel
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
          <View style={styles.hintWrap}>
            <Text style={styles.hintTitle}>
              {touched ? 'Saved as you go' : 'Drag to move, pinch to resize'}
            </Text>
            <Text style={styles.hint}>
              {touched
                ? 'Done re-edits the post with these changes. Cancel puts everything back.'
                : 'Tap a text box to change the words or colour. Tap the ground to deselect.'}
            </Text>
          </View>
        )}
      </View>

      <EditToast
        toast={toast}
        bottom={sheetHeight + keyboardPad + 12}
        onDismiss={() => setToast(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: color.ink900,
  },
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  title: {
    color: color.white,
    fontSize: type.size.body,
    fontWeight: type.weight.heavy,
  },
  cancelBtn: {
    minWidth: 64,
    height: 32,
    justifyContent: 'center',
  },
  cancelText: {
    color: color.whiteA75,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
  },
  doneBtn: {
    minWidth: 64,
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
  picker: {
    height: PICKER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 20,
    gap: 6,
  },
  pickerScroll: {
    flex: 1,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
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
  stageArea: {
    flex: 1,
    paddingTop: 8,
    paddingHorizontal: 20,
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
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.white,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingHorizontal: 24,
    paddingTop: 18,
    gap: 10,
  },
  hintWrap: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  hintTitle: {
    color: color.ink,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
  },
  hint: {
    color: color.slate500,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.semibold,
    lineHeight: type.size.bodySm * 1.4,
  },
});

// Admin handoff §8 step 5. The hook rides as the pinned first card so the
// whole script reads in order; each talking point is a draggable card with
// one delete control (confirm before removing). The plug sentence renders
// as script inside its point. Overlay chrome lives on brief_segments and
// opens OverlayEditor.
import { useRef, useState, type JSX } from 'react';
import { Alert, Image, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';

import type { TalkingPoint } from '../../../lib/briefs-api';
import { type OverlayBox } from '../../../lib/overlay-boxes';
import { color, radiusAdmin, shadow } from '../../../theme/tokens';
import { SlideStage, type SlideInset } from '../../SlideStage';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { AiPill } from './AiPill';
import { type OverlayEditorMode } from './OverlayEditor';

/** Matches styles.section gap so drag swap distances line up. */
const CARD_GAP = 10;

function shotLabel(url: string): string {
  return /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(url) ? 'Recording' : 'Screenshot';
}

export function PointsEditor(props: {
  points: TalkingPoint[];
  /** Clip on videos, Slide on slideshows — naming only, never a count field. */
  family: 'video' | 'photo_carousel';
  /** The hook script, pinned as the first card. */
  hook: string;
  onChangeHook: (text: string) => void;
  /** Overlay text boxes on the hook clip's segment. */
  hookOverlayBoxes: OverlayBox[];
  onOpenHookOverlay: () => void;
  /** The plug sentence from the CTA step, shown as script inside the plug point. */
  cta: string;
  busyAll: boolean;
  onChange: (points: TalkingPoint[]) => void;
  onRegenerateAll: () => void;
  /** Signed URL for a screenshot attached to this point's segment, if any. */
  screenshotUrlForIndex: (index: number) => string | undefined;
  screenshotBusyIndex: number | null;
  onAttachScreenshot: (index: number) => void;
  onRemoveScreenshot: (index: number) => void;
  overlayBoxesForIndex: (index: number) => OverlayBox[];
  /** The admin's inset picture on a slide, slideshow cards only. */
  insetForIndex?: (index: number) => SlideInset | undefined;
  onOpenOverlay: (index: number, mode: OverlayEditorMode) => void;
  /** Fires while a card drags so the parent scroll can pause. */
  onDragStateChange: (dragging: boolean) => void;
}): JSX.Element {
  const {
    points,
    family,
    hook,
    onChangeHook,
    hookOverlayBoxes,
    onOpenHookOverlay,
    cta,
    busyAll,
    onChange,
    onRegenerateAll,
    screenshotUrlForIndex,
    screenshotBusyIndex,
    onAttachScreenshot,
    onRemoveScreenshot,
    overlayBoxesForIndex,
    insetForIndex,
    onOpenOverlay,
    onDragStateChange,
  } = props;

  const pointsRef = useRef(points);
  pointsRef.current = points;

  // Slideshows have no spoken script: no hook card, no plug, and each card
  // is a slide numbered from 1 carrying only its text and screenshot.
  const slideshow = family === 'photo_carousel';

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const drag = useRef({ id: '', index: 0, prevY: 0, offset: 0 });
  const cardHeights = useRef<Record<string, number>>({});

  function updatePoint(id: string, text: string) {
    onChange(
      points.map((p) => (p.id === id ? { ...p, text, edited_by_admin: true } : p)),
    );
  }

  function confirmDelete(id: string) {
    Alert.alert(slideshow ? 'Delete this slide?' : 'Delete this point?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => onChange(pointsRef.current.filter((p) => p.id !== id)),
      },
    ]);
  }

  function addPoint() {
    onChange([
      ...points,
      {
        id: Crypto.randomUUID(),
        text: '',
        is_product: false,
        edited_by_admin: true,
        claim_id: null,
      },
    ]);
  }

  function markProduct(id: string) {
    onChange(points.map((p) => ({ ...p, is_product: p.id === id })));
  }

  // Drag reorder: the grip handle owns the gesture. Deltas track our own
  // pageY so re-renders mid-drag never jump, and crossing half of the
  // neighbouring card swaps the order live.
  function startDrag(pointId: string, pageY: number) {
    const index = pointsRef.current.findIndex((p) => p.id === pointId);
    if (index < 0) return;
    drag.current = { id: pointId, index, prevY: pageY, offset: 0 };
    setDragId(pointId);
    setDragOffset(0);
    onDragStateChange(true);
  }

  function moveDrag(pageY: number) {
    const d = drag.current;
    if (!d.id) return;
    d.offset += pageY - d.prevY;
    d.prevY = pageY;
    const list = pointsRef.current;
    if (d.offset > 0 && d.index < list.length - 1) {
      const next = list[d.index + 1];
      const nextH = (next ? cardHeights.current[next.id] : undefined) ?? 120;
      if (d.offset > (nextH + CARD_GAP) / 2) {
        const swapped = [...list];
        const dragged = swapped[d.index];
        const other = swapped[d.index + 1];
        if (dragged && other) {
          swapped[d.index] = other;
          swapped[d.index + 1] = dragged;
          onChange(swapped);
          d.offset -= nextH + CARD_GAP;
          d.index += 1;
        }
      }
    } else if (d.offset < 0 && d.index > 0) {
      const prev = list[d.index - 1];
      const prevH = (prev ? cardHeights.current[prev.id] : undefined) ?? 120;
      if (-d.offset > (prevH + CARD_GAP) / 2) {
        const swapped = [...list];
        const dragged = swapped[d.index];
        const other = swapped[d.index - 1];
        if (dragged && other) {
          swapped[d.index] = other;
          swapped[d.index - 1] = dragged;
          onChange(swapped);
          d.offset += prevH + CARD_GAP;
          d.index -= 1;
        }
      }
    }
    setDragOffset(d.offset);
  }

  function endDrag() {
    drag.current = { id: '', index: 0, prevY: 0, offset: 0 };
    setDragId(null);
    setDragOffset(0);
    onDragStateChange(false);
  }

  return (
    <View style={styles.section}>
      <View style={styles.headRow}>
        <AiPill
          icon="rotate-ccw"
          label="Regenerate all"
          busy={busyAll}
          onPress={onRegenerateAll}
        />
      </View>

      {slideshow ? null : (
      <View style={[styles.card, shadow.shadowCard]}>
        <View style={styles.cardHead}>
          <View style={styles.hookTag}>
            <Icon name="megaphone" size={13} color={color.blue600} />
            <Text style={styles.hookTagText}>Hook</Text>
          </View>
        </View>
        <TextInput
          multiline
          value={hook}
          onChangeText={onChangeHook}
          placeholder="The opening line, spoken first"
          placeholderTextColor={color.slate400}
          style={styles.text}
        />
        {hookOverlayBoxes.length > 0 ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Edit overlay text on the hook"
            onPress={onOpenHookOverlay}
            style={styles.textPreview}
          >
            <Icon name="pencil" size={13} color={color.slate400} />
            {hookOverlayBoxes.map((box) => (
              <View key={box.id} style={styles.textChip}>
                <Text numberOfLines={1} style={styles.textChipLabel}>
                  {box.text}
                </Text>
              </View>
            ))}
          </PressableScale>
        ) : (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Add overlay text on the hook"
            onPress={onOpenHookOverlay}
            style={styles.addText}
          >
            <Icon name="pencil" size={13} color={color.slate400} />
            <Text style={styles.addShotText}>Add text</Text>
          </PressableScale>
        )}
      </View>
      )}

      {points.map((point, i) => {
        const shotBusy = screenshotBusyIndex === i;
        const shotUrl = screenshotUrlForIndex(i);
        const overlayBoxes = overlayBoxesForIndex(i);
        const plug = !slideshow && point.is_product;
        const dragging = dragId === point.id;
        return (
          <View
            key={point.id}
            onLayout={(e) => {
              cardHeights.current[point.id] = e.nativeEvent.layout.height;
            }}
            style={[
              styles.card,
              shadow.shadowCard,
              plug && styles.cardPlug,
              dragging && [
                styles.cardDragging,
                { transform: [{ translateY: dragOffset }] },
              ],
            ]}
          >
            <View style={styles.cardHead}>
              <View
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={(e) =>
                  startDrag(point.id, e.nativeEvent.pageY)
                }
                onResponderMove={(e) => moveDrag(e.nativeEvent.pageY)}
                onResponderRelease={endDrag}
                onResponderTerminate={endDrag}
                onResponderTerminationRequest={() => false}
                style={styles.dragHandle}
              >
                <Icon name="grip-vertical" size={15} color={color.slate300} />
                <View style={[styles.badge, plug && styles.badgePlug]}>
                  <Text style={[styles.badgeText, plug && styles.badgeTextPlug]}>
                    {slideshow ? i + 1 : i + 2}
                  </Text>
                </View>
              </View>
              {slideshow ? null : plug ? (
                <View style={styles.plugTag}>
                  <Icon name="zap" size={13} color={color.blue600} />
                  <Text style={styles.plugTagText}>Plug</Text>
                </View>
              ) : (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Move the plug to point ${i + 1}`}
                  onPress={() => markProduct(point.id)}
                  style={styles.plugGhost}
                >
                  <Text style={styles.plugGhostText}>Add plug</Text>
                </PressableScale>
              )}
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={
                  slideshow ? `Delete slide ${i + 1}` : `Delete point ${i + 1}`
                }
                onPress={() => confirmDelete(point.id)}
                style={styles.deleteBtn}
              >
                <Icon name="x" size={14} color={color.slate400} />
              </PressableScale>
            </View>

            {slideshow ? (
              <View style={styles.slideRow}>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Edit slide ${i + 1}`}
                  onPress={() => onOpenOverlay(i, 'text')}
                  style={styles.slidePreviewPress}
                >
                  <SlideStage
                    boxes={overlayBoxes}
                    inset={insetForIndex?.(i)}
                    placeholder={
                      overlayBoxes.length === 0
                        ? 'Tap to add text'
                        : "Creator's photo"
                    }
                    style={styles.slidePreview}
                  />
                </PressableScale>
                <View style={styles.slideActions}>
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel={`Edit the text on slide ${i + 1}`}
                    onPress={() => onOpenOverlay(i, 'text')}
                    style={styles.slideAction}
                  >
                    <Icon name="pencil" size={14} color={color.slate500} />
                    <Text style={styles.slideActionText}>
                      {overlayBoxes.length > 0 ? 'Edit text' : 'Add text'}
                    </Text>
                  </PressableScale>
                  {shotUrl !== undefined ? (
                    <View style={styles.slideShotRow}>
                      <PressableScale
                        accessibilityRole="button"
                        accessibilityLabel={`Place the picture on slide ${i + 1}`}
                        disabled={shotBusy}
                        onPress={() => onOpenOverlay(i, 'media')}
                        style={styles.slideShotPress}
                      >
                        <Image
                          source={{ uri: shotUrl }}
                          style={styles.shotThumb}
                        />
                        <Text style={styles.shotName} numberOfLines={1}>
                          {shotBusy ? 'Uploading…' : 'Picture'}
                        </Text>
                      </PressableScale>
                      <PressableScale
                        accessibilityRole="button"
                        accessibilityLabel={`Remove the picture on slide ${i + 1}`}
                        disabled={shotBusy}
                        onPress={() => onRemoveScreenshot(i)}
                        style={styles.slideShotRemove}
                      >
                        <Icon name="x" size={13} color={color.slate500} />
                      </PressableScale>
                    </View>
                  ) : (
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={`Add a picture to slide ${i + 1}`}
                      disabled={shotBusy}
                      onPress={() => onAttachScreenshot(i)}
                      style={styles.slideAction}
                    >
                      <Icon name="images" size={14} color={color.slate500} />
                      <Text style={styles.slideActionText}>
                        {shotBusy ? 'Uploading…' : 'Add picture'}
                      </Text>
                    </PressableScale>
                  )}
                  <Text style={styles.slideHint}>
                    The creator&apos;s photo fills the background. Your text and
                    picture go on top.
                  </Text>
                </View>
              </View>
            ) : (
              <>
            <TextInput
              multiline
              value={point.text ?? ''}
              onChangeText={(text) => updatePoint(point.id, text)}
              placeholder="Beat, not a line. Under 25 words."
              placeholderTextColor={color.slate400}
              style={styles.text}
            />

            {plug && cta.trim() ? (
              <Text style={styles.plugScript}>{cta.trim()}</Text>
            ) : null}

            <View style={styles.shotRow}>
              {shotUrl !== undefined ? (
                <>
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel={`Place the ${shotLabel(shotUrl).toLowerCase()} on point ${i + 1}`}
                    disabled={shotBusy}
                    onPress={() => onOpenOverlay(i, 'media')}
                    style={styles.shotPress}
                  >
                    <Image source={{ uri: shotUrl }} style={styles.shotThumb} />
                    <Text style={styles.shotName} numberOfLines={1}>
                      {shotBusy ? 'Uploading…' : shotLabel(shotUrl)}
                    </Text>
                  </PressableScale>
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel={`Remove the ${shotLabel(shotUrl).toLowerCase()} on point ${i + 1}`}
                    disabled={shotBusy}
                    onPress={() => onRemoveScreenshot(i)}
                    style={styles.deleteBtn}
                  >
                    <Icon name="x" size={13} color={color.slate500} />
                  </PressableScale>
                </>
              ) : (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Add a screenshot or recording to point ${i + 1}`}
                  disabled={shotBusy}
                  onPress={() => onAttachScreenshot(i)}
                  style={styles.addShot}
                >
                  <Icon name="images" size={14} color={color.slate400} />
                  <Text style={styles.addShotText} numberOfLines={1}>
                    {shotBusy ? 'Uploading…' : 'Add screenshot or recording'}
                  </Text>
                </PressableScale>
              )}
            </View>
            {overlayBoxes.length > 0 ? (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`Edit overlay text on point ${i + 1}`}
                onPress={() => onOpenOverlay(i, 'text')}
                style={styles.textPreview}
              >
                <Icon name="pencil" size={13} color={color.slate400} />
                {overlayBoxes.map((box) => (
                  <View key={box.id} style={styles.textChip}>
                    <Text numberOfLines={1} style={styles.textChipLabel}>
                      {box.text}
                    </Text>
                  </View>
                ))}
              </PressableScale>
            ) : (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`Add overlay text on point ${i + 1}`}
                onPress={() => onOpenOverlay(i, 'text')}
                style={styles.addText}
              >
                <Icon name="pencil" size={13} color={color.slate400} />
                <Text style={styles.addShotText}>Add text</Text>
              </PressableScale>
            )}
              </>
            )}
          </View>
        );
      })}

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={slideshow ? 'Add a slide' : 'Add a point'}
        onPress={addPoint}
        style={styles.addPoint}
      >
        <Icon name="plus" size={14} color={color.blue700} />
        <Text style={styles.addPointText}>
          {slideshow ? 'Add slide' : 'Add point'}
        </Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: CARD_GAP },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  card: {
    gap: 10,
    padding: 14,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
    borderWidth: 1.5,
    borderColor: color.white,
  },
  cardPlug: {
    borderColor: color.blue300,
  },
  cardDragging: {
    zIndex: 10,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    borderColor: color.blue300,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dragHandle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingRight: 6,
  },
  badge: {
    width: 26,
    height: 26,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgePlug: {
    backgroundColor: color.blue500,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: color.slate500,
  },
  badgeTextPlug: {
    color: color.white,
  },
  hookTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  hookTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: color.blue600,
  },
  plugTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  plugTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: color.blue600,
  },
  plugGhost: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radiusAdmin.pill,
    borderWidth: 1,
    borderColor: color.lineStrong,
  },
  plugGhostText: {
    fontSize: 11,
    fontWeight: '700',
    color: color.slate400,
  },
  deleteBtn: {
    width: 30,
    height: 30,
    borderRadius: radiusAdmin.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.fillQuiet,
    marginLeft: 'auto',
  },
  text: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 15 * 1.4,
    color: color.ink,
    minHeight: 40,
    textAlignVertical: 'top',
    padding: 0,
  },
  plugScript: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 15 * 1.4,
    color: color.slate500,
  },
  shotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shotPress: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  shotThumb: {
    width: 30,
    height: 40,
    borderRadius: radiusAdmin.sm,
    backgroundColor: color.fillQuiet,
  },
  shotName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: color.slate500,
  },
  addShot: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    borderRadius: radiusAdmin.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.lineStrong,
  },
  addText: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    borderRadius: radiusAdmin.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.lineStrong,
  },
  addShotText: {
    fontSize: 12,
    fontWeight: '700',
    color: color.slate500,
  },
  textPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    minHeight: 44,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: radiusAdmin.sm,
    backgroundColor: color.fillQuiet,
  },
  textChip: {
    minWidth: 0,
    flexShrink: 1,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
  },
  textChipLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: color.ink,
  },
  slideRow: {
    flexDirection: 'row',
    gap: 14,
  },
  slidePreviewPress: {
    width: 128,
  },
  slidePreview: {
    width: 128,
    aspectRatio: 9 / 16,
    borderRadius: radiusAdmin.md,
  },
  slideActions: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  slideAction: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    borderRadius: radiusAdmin.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.lineStrong,
  },
  slideActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: color.slate500,
  },
  slideShotRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    borderRadius: radiusAdmin.sm,
    backgroundColor: color.fillQuiet,
  },
  slideShotPress: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  slideShotRemove: {
    width: 30,
    height: 30,
    borderRadius: radiusAdmin.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.white,
  },
  slideHint: {
    fontSize: 11,
    lineHeight: 11 * 1.45,
    fontWeight: '600',
    color: color.slate400,
  },
  addPoint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.blue100,
  },
  addPointText: {
    fontSize: 13,
    fontWeight: '700',
    color: color.blue700,
  },
});

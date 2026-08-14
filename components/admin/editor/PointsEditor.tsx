// Admin handoff §8 step 5. One card per talking point: numbered badge,
// text, screenshot slot, Move control. The plug card is starred. Overlay
// chrome lives on brief_segments and opens OverlayEditor.
import type { JSX } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';

import type { TalkingPoint } from '../../../lib/briefs-api';
import { color, radiusAdmin, shadow } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { SectionLabel } from '../shared';
import { AiPill } from './AiPill';
import {
  overlayTextContrast,
  type OverlayEditorMode,
  type OverlayStyleValue,
} from './OverlayEditor';

function shotLabel(url: string): string {
  return /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(url) ? 'Recording' : 'Screenshot';
}

export function PointsEditor(props: {
  points: TalkingPoint[];
  minPoints: number | null;
  maxPoints: number | null;
  /** Clip on videos, Slide on slideshows — naming only, never a count field. */
  family: 'video' | 'photo_carousel';
  busyAll: boolean;
  busyIndex: number | null;
  onChange: (points: TalkingPoint[]) => void;
  onRegenerateAll: () => void;
  onRegeneratePoint: (index: number) => void;
  /** Signed URL for a screenshot attached to this point's segment, if any. */
  screenshotUrlForIndex: (index: number) => string | undefined;
  screenshotBusyIndex: number | null;
  onAttachScreenshot: (index: number) => void;
  onMoveScreenshot: (index: number) => void;
  onRemoveScreenshot: (index: number) => void;
  /** Kept for the parent; overlay media mode replaces PlacementSheet. */
  onPlaceScreenshot?: (index: number) => void;
  /** Recording layout for this point's segment. */
  layoutForIndex: (index: number) => 'standard' | 'green_screen';
  overlayTextForIndex: (index: number) => string | undefined;
  overlayStyleForIndex: (index: number) => OverlayStyleValue;
  placementLabelForIndex: (index: number) => string;
  onOpenOverlay: (index: number, mode: OverlayEditorMode) => void;
}): JSX.Element {
  const {
    points,
    minPoints,
    maxPoints,
    family,
    busyAll,
    busyIndex,
    onChange,
    onRegenerateAll,
    onRegeneratePoint,
    screenshotUrlForIndex,
    screenshotBusyIndex,
    onAttachScreenshot,
    onMoveScreenshot,
    layoutForIndex,
    overlayTextForIndex,
    overlayStyleForIndex,
    placementLabelForIndex,
    onOpenOverlay,
  } = props;

  const slotNoun = family === 'photo_carousel' ? 'Slide' : 'Clip';

  function updatePoint(id: string, text: string) {
    onChange(
      points.map((p) => (p.id === id ? { ...p, text, edited_by_admin: true } : p)),
    );
  }

  function movePoint(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= points.length) return;
    const next = [...points];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function deletePoint(id: string) {
    onChange(points.filter((p) => p.id !== id));
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

  const countOff =
    minPoints !== null &&
    maxPoints !== null &&
    (points.length < minPoints || points.length > maxPoints);

  return (
    <View style={styles.section}>
      <View style={styles.headRow}>
        <SectionLabel>{`${points.length} points`}</SectionLabel>
        <AiPill
          icon="rotate-ccw"
          label="Regenerate all"
          busy={busyAll}
          onPress={onRegenerateAll}
        />
      </View>
      {countOff ? (
        <Text style={styles.countWarn}>
          This type wants {minPoints} to {maxPoints} points.
        </Text>
      ) : null}

      {points.map((point, i) => {
        const busy = busyIndex === i;
        const shotBusy = screenshotBusyIndex === i;
        const shotUrl = screenshotUrlForIndex(i);
        const greenScreen = layoutForIndex(i) === 'green_screen';
        const overlayText = overlayTextForIndex(i);
        const overlayStyle = overlayStyleForIndex(i);
        const placeLabel = placementLabelForIndex(i);
        const overlayFill = overlayStyle.color ?? color.white;
        const overlayBg = overlayStyle.bg ?? true;
        const plug = point.is_product;
        return (
          <View
            key={point.id}
            style={[styles.card, shadow.shadowCard, plug && styles.cardPlug]}
          >
            <View style={styles.cardHead}>
              <View style={[styles.badge, plug && styles.badgePlug]}>
                <Text style={[styles.badgeText, plug && styles.badgeTextPlug]}>
                  {i + 1}
                </Text>
              </View>
              {plug ? (
                <View style={styles.plugTag}>
                  <Icon name="zap" size={13} color={color.blue600} />
                  <Text style={styles.plugTagText}>Plug rides here</Text>
                </View>
              ) : (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Move the plug to point ${i + 1}`}
                  onPress={() => markProduct(point.id)}
                  style={styles.plugGhost}
                >
                  <Text style={styles.plugGhostText}>Plug here</Text>
                </PressableScale>
              )}
              <View style={styles.tools}>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Regenerate point ${i + 1}`}
                  disabled={busy || busyAll}
                  onPress={() => onRegeneratePoint(i)}
                  style={styles.toolBtn}
                >
                  {busy ? (
                    <Text style={styles.toolText}>…</Text>
                  ) : (
                    <Icon name="rotate-ccw" size={13} color={color.slate500} />
                  )}
                </PressableScale>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Move point ${i + 1} up`}
                  onPress={() => movePoint(i, -1)}
                  style={styles.toolBtn}
                >
                  <Icon name="chevron-up" size={14} color={color.slate500} />
                </PressableScale>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Move point ${i + 1} down`}
                  onPress={() => movePoint(i, 1)}
                  style={styles.toolBtn}
                >
                  <Icon name="chevron-down" size={14} color={color.slate500} />
                </PressableScale>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Delete point ${i + 1}`}
                  onPress={() => deletePoint(point.id)}
                  style={styles.toolBtn}
                >
                  <Icon name="x" size={13} color={color.danger} />
                </PressableScale>
              </View>
            </View>

            <TextInput
              multiline
              value={point.text ?? ''}
              onChangeText={(text) => updatePoint(point.id, text)}
              placeholder={
                plug
                  ? 'The plug sentence rides inside this point.'
                  : family === 'photo_carousel'
                    ? 'One slide per point. Written to be read.'
                    : 'Beat, not a line. Under 25 words.'
              }
              placeholderTextColor={color.slate400}
              style={styles.text}
            />

            <View style={styles.shotRow}>
              {shotUrl !== undefined ? (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Replace the ${shotLabel(shotUrl).toLowerCase()} on point ${i + 1}`}
                  disabled={shotBusy}
                  onPress={() => onAttachScreenshot(i)}
                  style={styles.shotPress}
                >
                  <Image source={{ uri: shotUrl }} style={styles.shotThumb} />
                  <Text style={styles.shotName} numberOfLines={1}>
                    {shotBusy ? 'Uploading…' : shotLabel(shotUrl)}
                  </Text>
                </PressableScale>
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
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`Move the screenshot on point ${i + 1}`}
                disabled={shotBusy || shotUrl === undefined}
                onPress={() => onMoveScreenshot(i)}
                style={styles.movePill}
              >
                <Text style={styles.movePillText}>{slotNoun}</Text>
                <Icon name="chevron-down" size={13} color={color.slate400} />
              </PressableScale>
            </View>
            {shotUrl !== undefined ? (
              <View style={styles.gsRow}>
                {greenScreen ? (
                  <View style={styles.gsChip}>
                    <Icon name="switch-camera" size={13} color={color.green} />
                    <Text style={styles.gsChipText} numberOfLines={1}>
                      Green screen · fills the background
                    </Text>
                  </View>
                ) : null}
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Place the screenshot on point ${i + 1}`}
                  disabled={shotBusy}
                  onPress={() => onOpenOverlay(i, 'media')}
                  style={styles.movePill}
                >
                  <Text style={styles.movePillText}>{placeLabel}</Text>
                  <Icon name="chevron-down" size={13} color={color.slate400} />
                </PressableScale>
              </View>
            ) : null}
            {overlayText ? (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`Edit overlay text on point ${i + 1}`}
                onPress={() => onOpenOverlay(i, 'text')}
                style={styles.textPreview}
              >
                <View
                  style={[
                    styles.textPill,
                    overlayBg
                      ? { backgroundColor: overlayFill }
                      : styles.textPillClear,
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.textPillLabel,
                      {
                        color: overlayBg
                          ? overlayTextContrast(overlayFill)
                          : overlayFill,
                      },
                    ]}
                  >
                    {overlayText}
                  </Text>
                </View>
                <Text style={styles.textPos}>{placeLabel}</Text>
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
          </View>
        );
      })}

      <Text style={styles.helper}>
        {family === 'photo_carousel'
          ? 'The screenshot or recording pops up on the slide you choose.'
          : 'The screenshot or recording pops up on the clip you choose.'}
      </Text>

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Add a point"
        onPress={addPoint}
        style={styles.addPoint}
      >
        <Icon name="plus" size={14} color={color.blue700} />
        <Text style={styles.addPointText}>Add point</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  countWarn: {
    fontSize: 13,
    fontWeight: '600',
    color: color.amber,
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
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  tools: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 'auto',
  },
  toolBtn: {
    width: 30,
    height: 30,
    borderRadius: radiusAdmin.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.fillQuiet,
  },
  toolText: {
    fontSize: 13,
    fontWeight: '700',
    color: color.slate500,
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
  movePill: {
    flexShrink: 0,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
  },
  movePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: color.ink,
  },
  gsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  gsChip: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    borderRadius: radiusAdmin.sm,
    backgroundColor: color.greenSoft,
  },
  gsChipText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: color.green,
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
    gap: 9,
    minHeight: 44,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: radiusAdmin.sm,
    backgroundColor: color.ink900,
  },
  textPill: {
    minWidth: 0,
    flexShrink: 1,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  textPillClear: {
    backgroundColor: 'transparent',
  },
  textPillLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  textPos: {
    marginLeft: 'auto',
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '600',
    color: color.whiteA60,
  },
  helper: {
    fontSize: 12.5,
    fontWeight: '400',
    lineHeight: 12.5 * 1.45,
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

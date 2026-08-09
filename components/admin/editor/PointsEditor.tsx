// Admin handoff §8 step 5 — one card per talking point: numbered badge,
// text, screenshot slot, Move control. The plug card is starred. Spoken
// content only; overlay text lives on brief_segments, never here.
import type { JSX } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';

import type { TalkingPoint } from '../../../lib/briefs-api';
import { color, radiusAdmin, shadow } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { SectionLabel } from '../shared';
import { AiPill } from './AiPill';

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
  /** Opens the drag-to-place sheet for this point's screenshot and text. */
  onPlaceScreenshot: (index: number) => void;
  /** Whether this point's segment shows on-screen text (placeable). */
  hasTextForIndex: (index: number) => boolean;
  /** Recording layout for this point's segment; toggles green screen. */
  layoutForIndex: (index: number) => 'standard' | 'green_screen';
  onToggleLayout: (index: number) => void;
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
    onRemoveScreenshot,
    onPlaceScreenshot,
    hasTextForIndex,
    layoutForIndex,
    onToggleLayout,
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

            {shotUrl !== undefined ? (
              <View style={styles.shotRow}>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Position the screenshot on point ${i + 1}`}
                  disabled={shotBusy}
                  onPress={() => onPlaceScreenshot(i)}
                  style={styles.shotPress}
                >
                  <Image source={{ uri: shotUrl }} style={styles.shotThumb} />
                  <View style={styles.shotText}>
                    <Text style={styles.shotName} numberOfLines={1}>
                      Screenshot
                    </Text>
                    <Text style={styles.shotHint} numberOfLines={1}>
                      Tap to position
                    </Text>
                  </View>
                </PressableScale>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Move the screenshot on point ${i + 1}`}
                  disabled={shotBusy}
                  onPress={() => onMoveScreenshot(i)}
                  style={styles.movePill}
                >
                  <Text style={styles.movePillText}>
                    {shotBusy ? '…' : `${slotNoun} ${i + 1}`}
                  </Text>
                  <Icon name="chevron-down" size={13} color={color.slate500} />
                </PressableScale>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Remove the screenshot on point ${i + 1}`}
                  disabled={shotBusy}
                  onPress={() => onRemoveScreenshot(i)}
                  style={styles.shotRemove}
                >
                  <Icon name="x" size={13} color={color.slate400} />
                </PressableScale>
              </View>
            ) : null}
            {shotUrl !== undefined ? (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`Toggle green screen on point ${i + 1}`}
                disabled={shotBusy}
                onPress={() => onToggleLayout(i)}
                style={[styles.gsRow, greenScreen && styles.gsRowOn]}
              >
                <Icon
                  name={greenScreen ? 'circle-check-big' : 'switch-camera'}
                  size={14}
                  color={greenScreen ? color.blue600 : color.slate400}
                />
                <View style={styles.gsText}>
                  <Text style={[styles.gsLabel, greenScreen && styles.gsLabelOn]}>
                    Green screen
                  </Text>
                  <Text style={styles.gsHint}>
                    {greenScreen
                      ? 'Screenshot becomes the background and the creator is cut out over it'
                      : 'Screenshot floats as a card over the creator'}
                  </Text>
                </View>
              </PressableScale>
            ) : null}
            {shotUrl === undefined ? (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`Add a screenshot to point ${i + 1}`}
                disabled={shotBusy}
                onPress={() => onAttachScreenshot(i)}
                style={styles.addShot}
              >
                <Icon name="plus" size={14} color={color.slate400} />
                <Text style={styles.addShotText}>
                  {shotBusy ? 'Uploading…' : 'Add screenshot'}
                </Text>
              </PressableScale>
            ) : null}
            {shotUrl === undefined && hasTextForIndex(i) ? (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`Position the on-screen text for point ${i + 1}`}
                onPress={() => onPlaceScreenshot(i)}
                style={styles.gsRow}
              >
                <Icon name="pencil" size={14} color={color.slate400} />
                <View style={styles.gsText}>
                  <Text style={styles.gsLabel}>On screen text</Text>
                  <Text style={styles.gsHint}>Tap to position it on the video</Text>
                </View>
              </PressableScale>
            ) : null}
          </View>
        );
      })}

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
    gap: 10,
  },
  shotPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shotThumb: {
    width: 30,
    height: 40,
    borderRadius: radiusAdmin.sm,
    backgroundColor: color.fillQuiet,
  },
  shotText: {
    flex: 1,
    gap: 1,
  },
  shotName: {
    fontSize: 13,
    fontWeight: '600',
    color: color.slate500,
  },
  shotHint: {
    fontSize: 11,
    fontWeight: '600',
    color: color.blue600,
  },
  movePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
  },
  movePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: color.slate500,
  },
  shotRemove: {
    width: 28,
    height: 28,
    borderRadius: radiusAdmin.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.fillQuiet,
  },
  gsRowOn: {
    backgroundColor: color.blue100,
  },
  gsText: {
    flex: 1,
    gap: 1,
  },
  gsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: color.slate500,
  },
  gsLabelOn: {
    color: color.blue700,
  },
  gsHint: {
    fontSize: 11,
    fontWeight: '600',
    color: color.slate400,
  },
  addShot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radiusAdmin.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.lineStrong,
  },
  addShotText: {
    fontSize: 13,
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

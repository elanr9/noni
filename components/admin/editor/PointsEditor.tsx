import type { JSX } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';

import type { TalkingPoint } from '../../../lib/briefs-api';
import { color, radius, type } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { PressableScale } from '../../ui/PressableScale';

/**
 * Spoken content only. The plug rides inside the one is_product point;
 * overlay text lives on brief_segments, never here.
 */
export function PointsEditor(props: {
  points: TalkingPoint[];
  minPoints: number | null;
  maxPoints: number | null;
  busyAll: boolean;
  busyIndex: number | null;
  onChange: (points: TalkingPoint[]) => void;
  onRegenerateAll: () => void;
  onRegeneratePoint: (index: number) => void;
}): JSX.Element {
  const {
    points,
    minPoints,
    maxPoints,
    busyAll,
    busyIndex,
    onChange,
    onRegenerateAll,
    onRegeneratePoint,
  } = props;

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
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          Talking points
          {minPoints !== null && maxPoints !== null
            ? ` (${points.length} of ${minPoints}–${maxPoints})`
            : ` (${points.length})`}
        </Text>
        <Button size="sm" variant="tint" disabled={busyAll} onPress={onRegenerateAll}>
          {busyAll ? 'Regenerating…' : 'Regenerate all'}
        </Button>
      </View>
      {countOff ? (
        <Text style={styles.countWarn}>
          This type wants {minPoints} to {maxPoints} points.
        </Text>
      ) : null}
      {points.map((point, i) => {
        const busy = busyIndex === i;
        return (
          <View
            key={point.id}
            style={[styles.pointCard, point.is_product && styles.productCard]}
          >
            <View style={styles.pointHead}>
              <Text style={styles.pointIndex}>{i + 1}</Text>
              {point.is_product ? (
                <View style={styles.fvTag}>
                  <Text style={styles.fvTagText}>FV</Text>
                </View>
              ) : (
                <PressableScale
                  accessibilityRole="button"
                  onPress={() => markProduct(point.id)}
                  style={styles.fvGhost}
                >
                  <Text style={styles.fvGhostText}>FV</Text>
                </PressableScale>
              )}
              <View style={styles.pointTools}>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Regenerate point ${i + 1}`}
                  disabled={busy || busyAll}
                  onPress={() => onRegeneratePoint(i)}
                  style={styles.toolBtn}
                >
                  <Text style={styles.toolText}>{busy ? '…' : '↻'}</Text>
                </PressableScale>
                <PressableScale
                  accessibilityRole="button"
                  onPress={() => movePoint(i, -1)}
                  style={styles.toolBtn}
                >
                  <Text style={styles.toolText}>↑</Text>
                </PressableScale>
                <PressableScale
                  accessibilityRole="button"
                  onPress={() => movePoint(i, 1)}
                  style={styles.toolBtn}
                >
                  <Text style={styles.toolText}>↓</Text>
                </PressableScale>
                <PressableScale
                  accessibilityRole="button"
                  onPress={() => deletePoint(point.id)}
                  style={styles.toolBtn}
                >
                  <Text style={[styles.toolText, styles.toolDanger]}>✕</Text>
                </PressableScale>
              </View>
            </View>
            <TextInput
              multiline
              value={point.text ?? ''}
              onChangeText={(text) => updatePoint(point.id, text)}
              placeholder={
                point.is_product
                  ? 'Product point. The plug sentence rides inside it.'
                  : 'Beat, not a line. Under 25 words.'
              }
              placeholderTextColor={color.slate400}
              style={styles.pointInput}
            />
          </View>
        );
      })}
      <Button size="sm" variant="tint" onPress={addPoint}>
        Add point
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, marginBottom: 16 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.slate400,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
  },
  countWarn: {
    fontSize: type.size.meta,
    fontWeight: '600',
    color: color.amber,
  },
  pointCard: {
    gap: 6,
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: color.lineStrong,
    backgroundColor: color.white,
  },
  productCard: {
    borderColor: color.blue700,
    borderWidth: 2,
  },
  pointHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pointIndex: {
    fontSize: type.size.bodySm,
    fontWeight: '800',
    color: color.slate400,
    width: 18,
  },
  fvTag: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: color.blue700,
  },
  fvTagText: {
    fontSize: type.size.micro,
    fontWeight: '800',
    color: color.white,
  },
  fvGhost: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.lineStrong,
  },
  fvGhostText: {
    fontSize: type.size.micro,
    fontWeight: '800',
    color: color.slate400,
  },
  pointTools: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 'auto',
  },
  toolBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.fillQuiet,
  },
  toolText: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.slate500,
  },
  toolDanger: { color: color.danger },
  pointInput: {
    fontSize: type.size.bodySm,
    color: color.ink,
    minHeight: 40,
    textAlignVertical: 'top',
    paddingVertical: 0,
  },
});

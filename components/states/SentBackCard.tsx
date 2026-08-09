import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, radius, space, type } from '../../theme/tokens';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';

export interface SentBackCardProps {
  reason: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Amber account / warm-up sent-back callout. */
export function SentBackCard({
  reason,
  actionLabel,
  onAction,
  style,
}: SentBackCardProps) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.row}>
        <Icon name="circle-alert" size={19} color={color.amber} />
        <View style={styles.copy}>
          <Text style={styles.label}>Sent back</Text>
          <Text style={styles.reason}>{reason}</Text>
        </View>
      </View>
      {actionLabel !== undefined && onAction !== undefined ? (
        <Button size="sm" variant="outline" onPress={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.amberSoft,
    borderRadius: radius.lg,
    padding: space[5],
    gap: space[4],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
  },
  copy: {
    flex: 1,
    gap: space[1],
  },
  label: {
    fontSize: type.size.meta,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.amber,
  },
  reason: {
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    fontWeight: type.weight.semibold,
    color: color.ink,
  },
});

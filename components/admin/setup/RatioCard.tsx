// Admin handoff §7 step 1 — one ratio card per format with a blue-100
// icon circle and a 34px round stepper.
import { StyleSheet, Text, View } from 'react-native';

import { color, radiusAdmin, shadow } from '../../../theme/tokens';
import { Icon, type IconName } from '../../ui/Icon';
import { Stepper } from './Stepper';

export interface RatioCardProps {
  icon: IconName;
  label: string;
  /** e.g. "Reels" / "Photo carousels". */
  sub: string;
  value: number;
  onChange: (value: number) => void;
}

export function RatioCard({ icon, label, sub, value, onChange }: RatioCardProps) {
  return (
    <View style={[styles.card, shadow.shadowCard]}>
      <View style={styles.iconCircle}>
        <Icon name={icon} size={18} color={color.blue600} />
      </View>
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.sub}>{sub}</Text>
      </View>
      <Stepper label={label} value={value} onChange={onChange} valueSize={26} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    color: color.ink,
  },
  sub: {
    fontSize: 12,
    fontWeight: '400',
    color: color.slate400,
  },
});

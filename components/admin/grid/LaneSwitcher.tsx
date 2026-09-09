// Admin handoff §6: two lane cards, Videos / Slideshows. Active card is
// blue-500 with the accent shadow; the 5px rail shows progress to target.
import { StyleSheet, Text, View } from 'react-native';

import { color, radiusAdmin, shadow, type } from '../../../theme/tokens';
import { Icon, type IconName } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export type Lane = 'video' | 'photo_carousel';

export interface LaneCount {
  done: number;
  target: number;
}

export interface LaneSwitcherProps {
  lane: Lane;
  video: LaneCount;
  slideshow: LaneCount;
  disabled?: boolean;
  onChange: (lane: Lane) => void;
}

const LANES: { key: Lane; label: string; icon: IconName }[] = [
  { key: 'video', label: 'Videos', icon: 'video' },
  { key: 'photo_carousel', label: 'Slideshows', icon: 'images' },
];

export function LaneSwitcher({
  lane,
  video,
  slideshow,
  disabled = false,
  onChange,
}: LaneSwitcherProps) {
  return (
    <View style={styles.row}>
      {LANES.map(({ key, label, icon }) => {
        const active = key === lane;
        const count = key === 'video' ? video : slideshow;
        const pct =
          count.target > 0
            ? Math.min(100, Math.round((count.done / count.target) * 100))
            : 0;
        return (
          <PressableScale
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            onPress={() => onChange(key)}
            style={[
              styles.card,
              active ? [styles.cardActive, shadow.shadowAccent] : styles.cardInactive,
            ]}
          >
            <View style={styles.labelRow}>
              <Icon
                name={icon}
                size={15}
                color={active ? color.white : color.ink}
              />
              <Text style={[styles.label, active && styles.onBlue]}>{label}</Text>
            </View>
            <Text style={[styles.count, active && styles.onBlue]}>
              {count.done}
              <Text style={[styles.target, active && styles.onBlue]}>
                {` / ${count.target}`}
              </Text>
            </Text>
            <View style={[styles.rail, active && styles.railActive]}>
              <View
                style={[
                  styles.fill,
                  active && styles.fillActive,
                  { width: `${pct}%` },
                ]}
              />
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  card: {
    flex: 1,
    gap: 8,
    padding: 14,
    borderRadius: radiusAdmin.lg,
  },
  cardActive: {
    backgroundColor: color.blue500,
  },
  cardInactive: {
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.border,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: color.ink,
  },
  count: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  target: {
    fontSize: 17,
    fontWeight: '700',
    opacity: 0.6,
  },
  onBlue: {
    color: color.white,
  },
  rail: {
    height: 5,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
    overflow: 'hidden',
  },
  railActive: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  fill: {
    height: 5,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue500,
  },
  fillActive: {
    backgroundColor: color.white,
  },
});

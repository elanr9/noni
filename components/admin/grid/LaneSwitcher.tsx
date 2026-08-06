// Admin handoff §6 — two lane cards, Videos / Slideshows. Active card is
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
  onChange: (lane: Lane) => void;
}

const LANES: { key: Lane; label: string; icon: IconName }[] = [
  { key: 'video', label: 'Videos', icon: 'video' },
  { key: 'photo_carousel', label: 'Slideshows', icon: 'images' },
];

export function LaneSwitcher({ lane, video, slideshow, onChange }: LaneSwitcherProps) {
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
            accessibilityState={{ selected: active }}
            onPress={() => onChange(key)}
            style={[
              styles.card,
              active
                ? [styles.cardActive, shadow.shadowAccent]
                : shadow.shadowCard,
            ]}
          >
            <View style={styles.labelRow}>
              <Icon
                name={icon}
                size={15}
                color={active ? color.white : color.slate500}
              />
              <Text style={[styles.label, active && styles.onBlue]}>{label}</Text>
            </View>
            <Text style={[styles.count, active && styles.onBlue]}>
              {count.done}
              <Text style={[styles.target, active && styles.targetActive]}>
                {` / ${count.target}`}
              </Text>
            </Text>
            <View style={[styles.rail, active && styles.railActive]}>
              <View
                style={[
                  styles.fill,
                  active ? styles.fillActive : null,
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
    backgroundColor: color.white,
  },
  cardActive: {
    backgroundColor: color.blue500,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: color.slate500,
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
  targetActive: {
    color: color.white,
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
    backgroundColor: color.whiteA28,
  },
  fill: {
    height: 5,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue300,
  },
  fillActive: {
    backgroundColor: color.white,
  },
});

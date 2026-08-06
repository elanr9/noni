import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { color, radiusAdmin, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export interface ReviewTopBarProps {
  topInset: number;
  /** "1 of 5". */
  counterLabel: string;
  /** Amber "Take 2" pill when attempt > 1. */
  takeLabel?: string;
  onBack: () => void;
  onChat: () => void;
}

/** Admin handoff §3 top scrim bar — glass back, take pill, counter, glass chat. */
export function ReviewTopBar({ topInset, counterLabel, takeLabel, onBack, onChat }: ReviewTopBarProps) {
  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Svg width="100%" height={topInset + 84} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="noniReviewTopScrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color.ink900} stopOpacity="0.6" />
            <Stop offset="1" stopColor={color.ink900} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#noniReviewTopScrim)" />
      </Svg>

      <View style={[styles.row, { paddingTop: topInset + 6 }]}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.glassButton}
        >
          <Icon name="chevron-left" size={20} color={color.white} />
        </PressableScale>

        <View style={styles.spacer} />

        {takeLabel !== undefined && (
          <View style={styles.takePill}>
            <Text style={styles.takeText}>{takeLabel}</Text>
          </View>
        )}
        <View style={styles.counterChip}>
          <Text style={styles.counterText}>{counterLabel}</Text>
        </View>

        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Message the creator about this post"
          onPress={onChat}
          style={styles.glassButton}
        >
          <Icon name="message-circle" size={18} color={color.white} />
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  spacer: {
    flex: 1,
  },
  glassButton: {
    width: 36,
    height: 36,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.whiteA16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  takePill: {
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.amberSoft,
  },
  takeText: {
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
    color: color.amber,
  },
  counterChip: {
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.whiteA16,
  },
  counterText: {
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
    color: color.white,
  },
});

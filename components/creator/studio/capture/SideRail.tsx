import type { JSX, ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { CameraType } from 'expo-camera';

import { type } from '../../../../theme/tokens';
import { Icon, type IconName } from '../../../ui/Icon';
import { PressableScale } from '../../../ui/PressableScale';
import { CHROME_BG, CHROME_BORDER, WHITE, type CountdownSeconds } from './constants';

const BUTTON = 44;
const INK = '#111111';

export type SideRailProps = {
  facing: CameraType;
  onFlip(): void;
  torch: boolean;
  onToggleTorch(): void;
  countdown: CountdownSeconds;
  onCycleCountdown(): void;
  grid: boolean;
  onToggleGrid(): void;
  hasNotes: boolean;
  notesOpen: boolean;
  onToggleNotes(): void;
  recording: boolean;
  style?: StyleProp<ViewStyle>;
};

type RailButtonProps = {
  label: string;
  accessibilityLabel: string;
  onPress(): void;
  icon?: IconName;
  text?: string;
  glyph?: ReactNode;
  filled?: boolean;
  disabled?: boolean;
};

function RailButton({ label, accessibilityLabel, onPress, icon, text, glyph, filled, disabled }: RailButtonProps): JSX.Element {
  const fg = filled ? INK : WHITE;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={[styles.item, disabled && styles.itemDisabled]}
    >
      <View style={[styles.circle, filled && styles.circleFilled]}>
        {icon ? <Icon name={icon} size={22} color={fg} strokeWidth={2} /> : null}
        {text ? <Text style={[styles.circleText, { color: fg }]}>{text}</Text> : null}
        {glyph ?? null}
      </View>
      <Text style={styles.label}>{label}</Text>
    </PressableScale>
  );
}

function GridGlyph({ color }: { color: string }): JSX.Element {
  return (
    <View style={styles.gridGlyph}>
      {[0, 1, 2].map((row) => (
        <View key={row} style={styles.gridRow}>
          {[0, 1, 2].map((col) => (
            <View key={col} style={[styles.gridCell, { borderColor: color }]} />
          ))}
        </View>
      ))}
    </View>
  );
}

export function SideRail({
  facing,
  onFlip,
  torch,
  onToggleTorch,
  countdown,
  onCycleCountdown,
  grid,
  onToggleGrid,
  hasNotes,
  notesOpen,
  onToggleNotes,
  recording,
  style,
}: SideRailProps): JSX.Element {
  return (
    <View style={[styles.rail, style]} pointerEvents="box-none">
      <RailButton
        label="Flip"
        accessibilityLabel={facing === 'front' ? 'Switch to back camera' : 'Switch to front camera'}
        icon="switch-camera"
        onPress={onFlip}
        disabled={recording}
      />
      <RailButton
        label="Flash"
        accessibilityLabel={torch ? 'Turn flash off' : 'Turn flash on'}
        icon={torch ? 'zap' : 'zap-off'}
        filled={torch}
        onPress={onToggleTorch}
      />
      <RailButton
        label="Timer"
        accessibilityLabel={countdown === 0 ? 'Timer off' : `Timer ${countdown} seconds`}
        icon={countdown === 0 ? 'clock' : undefined}
        text={countdown === 0 ? undefined : `${countdown}s`}
        filled={countdown !== 0}
        onPress={onCycleCountdown}
        disabled={recording}
      />
      <RailButton
        label="Grid"
        accessibilityLabel={grid ? 'Hide grid' : 'Show grid'}
        glyph={<GridGlyph color={grid ? INK : WHITE} />}
        filled={grid}
        onPress={onToggleGrid}
      />
      {hasNotes ? (
        <RailButton
          label="Notes"
          accessibilityLabel={notesOpen ? 'Hide brief notes' : 'Show brief notes'}
          icon="layout-list"
          filled={notesOpen}
          onPress={onToggleNotes}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    position: 'absolute',
    right: 12,
    alignItems: 'center',
    gap: 18,
  },
  item: {
    alignItems: 'center',
    gap: 4,
  },
  itemDisabled: {
    opacity: 0.4,
  },
  circle: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    backgroundColor: CHROME_BG,
    borderWidth: 1,
    borderColor: CHROME_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleFilled: {
    backgroundColor: WHITE,
    borderColor: WHITE,
  },
  circleText: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    letterSpacing: -0.2,
  },
  label: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.semibold,
    color: WHITE,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  gridGlyph: {
    width: 18,
    height: 18,
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
  },
  gridCell: {
    flex: 1,
    borderWidth: 1,
    margin: -0.5,
  },
});

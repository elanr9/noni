import { useCallback, useRef } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { type } from '../../../theme/tokens';
import { Icon, type IconName } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export type PrompterSpeed = 0.75 | 1 | 1.25 | 1.5;

export interface CameraRailProps {
  facing: 'front' | 'back';
  onFlip: () => void;
  flashOn: boolean;
  onToggleFlash: () => void;
  /** 0.5 only shown when hasUltraWide && facing === 'back'. */
  zoom: 0.5 | 1;
  hasUltraWide: boolean;
  onToggleZoom: () => void;
  speed: PrompterSpeed;
  onCycleSpeed: () => void;
  /** Hide the prompter speed button when the clip has no script. */
  showSpeed: boolean;
  recording: boolean;
  style?: StyleProp<ViewStyle>;
}

const BUTTON = 44;
const WHITE = '#FFFFFF';
const INK = '#111111';

interface RailButtonProps {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  icon?: IconName;
  text?: string;
  filled?: boolean;
}

function RailButton({ label, accessibilityLabel, onPress, icon, text, filled }: RailButtonProps) {
  const fg = filled ? INK : WHITE;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={6}
      style={styles.item}
    >
      <View style={[styles.circle, filled && styles.circleFilled]}>
        {icon ? <Icon name={icon} size={22} color={fg} strokeWidth={2} /> : null}
        {text ? <Text style={[styles.circleText, { color: fg }]}>{text}</Text> : null}
      </View>
      <Text style={styles.label}>{label}</Text>
    </PressableScale>
  );
}

function formatSpeed(speed: PrompterSpeed): string {
  return `${speed}x`;
}

export function CameraRail({
  facing,
  onFlip,
  flashOn,
  onToggleFlash,
  zoom,
  hasUltraWide,
  onToggleZoom,
  speed,
  onCycleSpeed,
  showSpeed,
  style,
}: CameraRailProps) {
  const showZoom = hasUltraWide && facing === 'back';

  return (
    <View style={[styles.rail, style]} pointerEvents="box-none">
      <RailButton
        label="Flip"
        accessibilityLabel="Flip camera"
        icon="switch-camera"
        onPress={onFlip}
      />
      <RailButton
        label="Flash"
        accessibilityLabel={flashOn ? 'Turn flash off' : 'Turn flash on'}
        icon={flashOn ? 'zap' : 'zap-off'}
        filled={flashOn}
        onPress={onToggleFlash}
      />
      {showSpeed ? (
        <RailButton
          label="Speed"
          accessibilityLabel={`Prompter speed ${formatSpeed(speed)}`}
          text={formatSpeed(speed)}
          onPress={onCycleSpeed}
        />
      ) : null}
      {showZoom ? (
        <RailButton
          label="Zoom"
          accessibilityLabel={zoom === 0.5 ? 'Zoom 0.5x' : 'Zoom 1x'}
          text={zoom === 0.5 ? '0.5' : '1x'}
          onPress={onToggleZoom}
        />
      ) : null}
    </View>
  );
}

/** Returns an onPress handler that fires `onDoubleTap` when two presses land within `windowMs`. */
export function useDoubleTap(onDoubleTap: () => void, windowMs = 280): () => void {
  const lastTap = useRef(0);
  return useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < windowMs) {
      lastTap.current = 0;
      onDoubleTap();
    } else {
      lastTap.current = now;
    }
  }, [onDoubleTap, windowMs]);
}

const styles = StyleSheet.create({
  rail: {
    position: 'absolute',
    right: 12,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 18,
  },
  item: {
    alignItems: 'center',
    gap: 4,
  },
  circle: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
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
});

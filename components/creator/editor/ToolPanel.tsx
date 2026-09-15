import { useRef, useState, type JSX, type ReactNode } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { MAX_GAIN, MIN_GAIN, clampGain } from '../../../lib/video-edit';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { color, type } from '../../../theme/tokens';

/** Dark inline panel that swaps in for the toolbar while one tool is open. */
export function ToolPanel(props: {
  title: string;
  onCancel: () => void;
  onDone: () => void;
  children: ReactNode;
}): JSX.Element {
  const { title, onCancel, onDone, children } = props;
  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={onCancel}
          hitSlop={10}
          style={styles.headerBtn}
        >
          <Icon name="x" size={20} color={color.white} />
        </PressableScale>
        <Text style={styles.title}>{title}</Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Done"
          onPress={onDone}
          hitSlop={10}
          style={styles.headerBtn}
        >
          <Icon name="check" size={20} color={color.white} />
        </PressableScale>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

export function SpeedOptions(props: {
  options: readonly number[];
  value: number;
  onChange: (speed: number) => void;
  caption: string;
}): JSX.Element {
  const { options, value, onChange, caption } = props;
  return (
    <View style={styles.speedWrap}>
      <View style={styles.speedRow}>
        {options.map((s) => {
          const on = s === value;
          return (
            <PressableScale
              key={s}
              accessibilityRole="button"
              accessibilityLabel={`${s}x speed`}
              accessibilityState={{ selected: on }}
              onPress={() => onChange(s)}
              style={[styles.speedChip, on && styles.speedChipOn]}
            >
              <Text style={[styles.speedText, on && styles.speedTextOn]}>{s}x</Text>
            </PressableScale>
          );
        })}
      </View>
      <Text style={styles.caption}>{caption}</Text>
    </View>
  );
}

const KNOB = 22;
const GAIN_TICKS = [1, 2];

/** Horizontal fader for the post volume, 50 to 300 percent. */
export function GainFader(props: {
  value: number;
  onChange: (gain: number) => void;
}): JSX.Element {
  const { value, onChange } = props;
  const [width, setWidth] = useState(0);
  // Where the touch started, in track x and in page x, so moves are deltas.
  const grabRef = useRef({ trackX: 0, pageX: 0 });

  function emitAt(x: number) {
    if (width <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / width));
    onChange(clampGain(MIN_GAIN + ratio * (MAX_GAIN - MIN_GAIN)));
  }

  const ratio = (value - MIN_GAIN) / (MAX_GAIN - MIN_GAIN);
  const knobX = ratio * width - KNOB / 2;

  return (
    <View style={styles.faderRow}>
      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(evt: GestureResponderEvent) => {
          const { locationX, pageX } = evt.nativeEvent;
          grabRef.current = { trackX: locationX, pageX };
          emitAt(locationX);
        }}
        onResponderMove={(evt: GestureResponderEvent) => {
          const grab = grabRef.current;
          emitAt(grab.trackX + (evt.nativeEvent.pageX - grab.pageX));
        }}
        accessibilityRole="adjustable"
        accessibilityLabel="Volume"
        accessibilityValue={{ text: `${Math.round(value * 100)}%` }}
        style={styles.faderTouch}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        <View style={styles.faderTrack} />
        <View style={[styles.faderFill, { width: Math.max(0, ratio * width) }]} />
        {GAIN_TICKS.map((tick) => (
          <View
            key={tick}
            style={[
              styles.faderTick,
              { left: ((tick - MIN_GAIN) / (MAX_GAIN - MIN_GAIN)) * width - 1 },
            ]}
          />
        ))}
        {width > 0 ? <View style={[styles.faderKnob, { left: knobX }]} /> : null}
      </View>
      <Text style={styles.faderValue}>{`${Math.round(value * 100)}%`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    paddingHorizontal: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 40,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
  },
  title: {
    color: color.white,
    fontSize: type.size.bodySm,
    fontWeight: '700',
  },
  body: {
    paddingTop: 10,
  },
  speedWrap: {
    gap: 10,
  },
  speedRow: {
    flexDirection: 'row',
    gap: 8,
  },
  speedChip: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedChipOn: {
    backgroundColor: color.white,
  },
  speedText: {
    color: color.white,
    fontSize: type.size.bodySm,
    fontWeight: '700',
  },
  speedTextOn: {
    color: color.ink,
  },
  caption: {
    color: color.whiteA60,
    fontSize: type.size.label,
    textAlign: 'center',
  },
  faderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    height: 44,
    paddingHorizontal: 6,
  },
  faderTouch: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  faderTrack: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  faderFill: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: color.white,
  },
  faderTick: {
    position: 'absolute',
    width: 2,
    height: 10,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  faderKnob: {
    position: 'absolute',
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: color.white,
  },
  faderValue: {
    width: 48,
    textAlign: 'right',
    color: color.white,
    fontSize: type.size.meta,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});

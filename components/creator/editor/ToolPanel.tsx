import type { JSX, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
});

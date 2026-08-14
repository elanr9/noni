import { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { color, motion, shadow } from '../../theme/tokens';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

export interface DropdownOption<T> {
  label: string;
  value: T;
}

export interface DropdownProps<T> {
  options: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  icon?: IconName;
  labelPrefix?: string;
}

export function Dropdown<T>({ options, value, onChange, icon, labelPrefix }: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const rotation = useRef(new Animated.Value(0)).current;
  const menu = useRef(new Animated.Value(0)).current;
  const selected = options.find((o) => o.value === value);

  const setOpenAnimated = (next: boolean) => {
    if (next) menu.setValue(0);
    setOpen(next);
    Animated.parallel([
      Animated.timing(rotation, {
        toValue: next ? 1 : 0,
        duration: motion.fast,
        easing: motion.easeOut,
        useNativeDriver: true,
      }),
      Animated.timing(menu, {
        toValue: next ? 1 : 0,
        duration: motion.fast,
        easing: motion.easeOut,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['90deg', '-90deg'],
  });

  return (
    <View style={open && styles.wrapOpen}>
      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpenAnimated(!open)}
        style={styles.trigger}
      >
        {icon !== undefined && <Icon name={icon} size={15} color={color.slate500} />}
        {labelPrefix !== undefined && <Text style={styles.prefix}>{labelPrefix}</Text>}
        <Text style={styles.value}>{selected?.label}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Icon name="chevron-right" size={15} color={color.slate500} />
        </Animated.View>
      </PressableScale>

      {open && (
        <>
          <Pressable
            accessibilityLabel="Close menu"
            style={styles.catcher}
            onPress={() => setOpenAnimated(false)}
          />
          <Animated.View
            style={[
              styles.menu,
              shadow.shadowRaised,
              {
                opacity: menu,
                transform: [
                  {
                    scale: menu.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.96, 1],
                    }),
                  },
                  {
                    translateY: menu.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-6, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.menuClip}>
            {options.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <Pressable
                  key={option.label}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    onChange(option.value);
                    setOpenAnimated(false);
                  }}
                  style={[styles.row, index === options.length - 1 && styles.rowLast]}
                >
                  <Text style={[styles.rowText, isSelected && styles.rowTextSelected]}>
                    {option.label}
                  </Text>
                  {isSelected && <Icon name="check" size={16} color={color.blue600} />}
                </Pressable>
              );
            })}
            </View>
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapOpen: {
    zIndex: 30,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: color.white,
    borderWidth: 1.5,
    borderColor: color.borderStrong,
  },
  prefix: {
    fontSize: 14,
    fontWeight: '700',
    color: color.slate500,
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
    color: color.ink,
  },
  catcher: {
    position: 'absolute',
    top: -1000,
    bottom: -1000,
    left: -1000,
    right: -1000,
    zIndex: 25,
  },
  menu: {
    position: 'absolute',
    top: 44,
    left: 0,
    minWidth: 176,
    backgroundColor: color.white,
    borderRadius: 16,
    zIndex: 30,
  },
  menuClip: {
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowText: {
    fontSize: 14,
    fontWeight: '600',
    color: color.ink,
  },
  rowTextSelected: {
    color: color.blue700,
  },
});

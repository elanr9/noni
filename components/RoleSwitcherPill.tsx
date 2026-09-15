import { useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { modesForProfile, type AppMode } from '../lib/active-mode';
import { useAuth } from '../lib/auth';
import {
  borderWidth,
  color,
  motion,
  radius,
  shadow,
  space,
  type,
} from '../theme/tokens';
import { Icon } from './ui/Icon';
import { PressableScale } from './ui/PressableScale';

type Role = Extract<AppMode, 'admin' | 'creator'>;

const LABEL: Record<Role, string> = {
  creator: 'Creator',
  admin: 'Campaign Manager',
};

const ORDER: Role[] = ['creator', 'admin'];

interface Props {
  current: Role;
  companyInitial: string;
}

/** Compact role pill with an anchored popover, shared by creator and manager tabs. */
export function RoleSwitcherPill({ current, companyInitial }: Props) {
  const { profile, setActiveMode, enableCreatorMode } = useAuth();
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(0);
  const anchor = useRef<View>(null);
  const pop = useRef(new Animated.Value(0)).current;

  if (!profile) return null;

  const modes = modesForProfile(profile);
  const options = ORDER.filter(
    (role) =>
      role === current ||
      modes.includes(role) ||
      (role === 'creator' && current === 'admin'),
  );

  function openPopover() {
    anchor.current?.measureInWindow((_x, y, _w, h) => {
      setTop(y + h + 6);
      setOpen(true);
      pop.setValue(0);
      Animated.timing(pop, {
        toValue: 1,
        duration: motion.fast,
        easing: motion.easeOut,
        useNativeDriver: true,
      }).start();
    });
  }

  async function choose(role: Role) {
    setOpen(false);
    if (role === current) return;
    try {
      if (role === 'creator' && !modes.includes('creator')) {
        await enableCreatorMode();
      } else {
        await setActiveMode(role);
      }
    } catch (e) {
      Alert.alert('Could not switch', e instanceof Error ? e.message : 'Try again');
    }
  }

  const popStyle = {
    opacity: pop,
    transform: [
      { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
      { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) },
    ],
  };

  return (
    <>
      <View ref={anchor} collapsable={false} style={styles.anchor}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Switch role"
          onPress={openPopover}
          style={styles.pill}
        >
          <View style={styles.tile}>
            <Text style={styles.tileText}>{companyInitial}</Text>
          </View>
          <Text numberOfLines={1} style={styles.pillText}>
            {LABEL[current]}
          </Text>
          <View style={styles.chevrons}>
            <Icon name="chevron-up" size={11} color={color.slate400} />
            <Icon name="chevron-down" size={11} color={color.slate400} />
          </View>
        </PressableScale>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close role switcher"
          style={styles.scrim}
          onPress={() => setOpen(false)}
        >
          <Animated.View
            style={[styles.popover, shadow.shadowRaised, { top }, popStyle]}
          >
            {options.map((role, i) => (
              <PressableScale
                key={role}
                accessibilityRole="button"
                accessibilityLabel={
                  role === current
                    ? `${LABEL[role]}, current role`
                    : `Switch to ${LABEL[role]}`
                }
                onPress={() => void choose(role)}
                style={[styles.row, i > 0 && styles.rowBorder]}
              >
                <View style={styles.tile}>
                  <Text style={styles.tileText}>{companyInitial}</Text>
                </View>
                <Text numberOfLines={1} style={styles.rowText}>
                  {LABEL[role]}
                </Text>
                {role === current && (
                  <Icon name="check" size={16} color={color.accent} />
                )}
              </PressableScale>
            ))}
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  anchor: {
    alignSelf: 'flex-start',
    maxWidth: '86%',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
  },
  tile: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    color: color.blue700,
  },
  pillText: {
    flexShrink: 1,
    fontSize: type.size.meta,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  chevrons: {
    alignItems: 'center',
    marginVertical: -2,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
  },
  popover: {
    position: 'absolute',
    left: space.gutter,
    right: space.gutter + 40,
    borderRadius: radius.md,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[4],
    paddingHorizontal: space[4],
  },
  rowBorder: {
    borderTopWidth: borderWidth.hair,
    borderTopColor: color.line,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    fontSize: type.size.meta,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
});

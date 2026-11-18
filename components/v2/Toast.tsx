import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { color, radius } from '../../theme/v2';
import { Icon } from './Icon';
import { Press } from './Press';

type ToastKind = 'info' | 'error' | 'success';
type ToastItem = { id: number; message: string; kind: ToastKind; action?: { label: string; onPress: () => void } };

const useToasts = create<{ current: ToastItem | null; set: (t: ToastItem | null) => void }>((set) => ({
  current: null,
  set: (current) => set({ current }),
}));

let seq = 0;

/** App-wide toast: one at a time, newest wins. Errors stay longer and can carry a retry. */
export const toast = {
  show(message: string, opts: { kind?: ToastKind; action?: ToastItem['action'] } = {}) {
    useToasts.getState().set({ id: ++seq, message, kind: opts.kind ?? 'info', action: opts.action });
  },
  error(message: string, action?: ToastItem['action']) {
    toast.show(message, { kind: 'error', action });
  },
  success(message: string) {
    toast.show(message, { kind: 'success' });
  },
  hide() {
    useToasts.getState().set(null);
  },
};

/** Mount once at the root, above every stack. */
export function ToastHost() {
  const current = useToasts((s) => s.current);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!current) return;
    const ms = current.kind === 'error' || current.action ? 5000 : 2600;
    const t = setTimeout(() => {
      if (useToasts.getState().current?.id === current.id) toast.hide();
    }, ms);
    return () => clearTimeout(t);
  }, [current]);
  if (!current) return null;
  const icon = current.kind === 'error' ? 'error' : current.kind === 'success' ? 'check_circle' : 'info';
  const iconColor = current.kind === 'error' ? color.pink : current.kind === 'success' ? color.green : color.blue;
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', paddingBottom: insets.bottom + 96 }]}>
      <Animated.View key={current.id} entering={FadeInDown.duration(240)} exiting={FadeOutDown.duration(180)} style={styles.toast} accessibilityLiveRegion="polite" accessibilityRole="alert">
        <Icon name={icon} size={20} color={iconColor} />
        <Text style={styles.text} numberOfLines={3}>
          {current.message}
        </Text>
        {current.action ? (
          <Press
            accessibilityRole="button"
            onPress={() => {
              const a = current.action;
              toast.hide();
              a?.onPress();
            }}
            style={styles.action}
          >
            <Text style={styles.actionText}>{current.action.label}</Text>
          </Press>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    marginHorizontal: 16,
    minHeight: 52,
    borderRadius: radius.card,
    backgroundColor: color.ink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  text: { flex: 1, color: color.white, fontSize: 15, lineHeight: 20, fontWeight: '500' },
  action: { paddingHorizontal: 8, paddingVertical: 6 },
  actionText: { color: color.blue, fontSize: 15, fontWeight: '700' },
});

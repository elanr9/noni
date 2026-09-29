// Sticky error pill for edit mode: what failed, Retry, dismiss.
import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, radiusAdmin, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export type EditToastState = { message: string; retry: () => void };

export function EditToast(props: {
  toast: EditToastState | null;
  bottom: number;
  onDismiss: () => void;
}): JSX.Element | null {
  const { toast, bottom, onDismiss } = props;
  if (toast === null) return null;
  return (
    <View style={[styles.host, { bottom }]} pointerEvents="box-none">
      <View style={styles.pill} accessibilityLiveRegion="polite">
        <Text style={styles.text} numberOfLines={2}>
          {toast.message}
        </Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Retry"
          onPress={() => {
            onDismiss();
            toast.retry();
          }}
          style={styles.retry}
        >
          <Text style={styles.retryText}>Retry</Text>
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          hitSlop={6}
          onPress={onDismiss}
        >
          <Icon name="x" size={14} color={color.whiteA75} />
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: '100%',
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 12,
    borderRadius: radiusAdmin.pill,
    backgroundColor: 'rgba(200, 40, 40, 0.92)',
  },
  text: {
    flexShrink: 1,
    color: color.white,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.semibold,
  },
  retry: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: color.danger,
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
  },
});

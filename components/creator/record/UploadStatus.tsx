// Background upload feedback that never blocks: a slim pill while clips
// finish in the queue, and a toast with Retry when one gives up.
import type { JSX } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { color, radius, type } from '../../../theme/tokens';

export function UploadPill(props: { label: string }): JSX.Element {
  return (
    <View style={styles.pill} accessibilityLiveRegion="polite">
      <ActivityIndicator size="small" color={color.white} />
      <Text style={styles.pillText}>{props.label}</Text>
    </View>
  );
}

export function UploadFailedToast(props: {
  message: string;
  onRetry: () => void;
}): JSX.Element {
  return (
    <View style={styles.toast} accessibilityLiveRegion="assertive">
      <Text style={styles.toastText} numberOfLines={2}>
        {props.message}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry upload"
        onPress={props.onRetry}
        hitSlop={8}
        style={styles.retry}
      >
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: color.inkA55,
  },
  pillText: {
    color: color.white,
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 8,
    borderRadius: radius.pill,
    backgroundColor: color.danger,
    maxWidth: '92%',
  },
  toastText: {
    flexShrink: 1,
    color: color.white,
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
  },
  retry: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.white,
  },
  retryText: {
    color: color.ink,
    fontSize: type.size.chip,
    fontWeight: type.weight.heavy,
  },
});

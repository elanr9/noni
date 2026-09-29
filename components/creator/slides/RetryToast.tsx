// A save failed: say so and offer to run it again. Sits above the bottom
// panel and stays until dismissed or retried.
import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, radius, shadow, space, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export type Failure = {
  message: string;
  retry?: () => void;
};

export function RetryToast(props: {
  failure: Failure | null;
  bottom: number;
  onDismiss: () => void;
}): JSX.Element | null {
  const { failure, bottom, onDismiss } = props;
  if (failure === null) return null;
  return (
    <View style={[styles.wrap, shadow.shadowFloat, { bottom }]}>
      <Icon name="circle-alert" size={18} color={color.danger} />
      <Text style={styles.text} numberOfLines={3}>
        {failure.message}
      </Text>
      {failure.retry ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Retry"
          onPress={() => {
            const run = failure.retry;
            onDismiss();
            run?.();
          }}
          style={styles.retry}
        >
          <Text style={styles.retryText}>Retry</Text>
        </PressableScale>
      ) : null}
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={onDismiss}
        hitSlop={8}
      >
        <Icon name="x" size={16} color={color.danger} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: space.gutter,
    right: space.gutter,
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.lg,
    backgroundColor: color.dangerSoft,
  },
  text: {
    flex: 1,
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    fontWeight: type.weight.semibold,
    color: color.danger,
  },
  retry: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: color.white,
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
  },
});

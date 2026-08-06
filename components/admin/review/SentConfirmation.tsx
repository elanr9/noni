import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, motion, radiusAdmin, type } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';

export interface SentConfirmationProps {
  creatorName: string;
  onNext: () => void;
}

/** Admin handoff §3 sent confirmation — only the noted sections go back. */
export function SentConfirmation({ creatorName, onNext }: SentConfirmationProps) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: motion.base,
      easing: motion.easeOut,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.overlay,
        { opacity, paddingTop: insets.top + 48, paddingBottom: Math.max(insets.bottom, 16) },
      ]}
    >
      <View style={styles.body}>
        <View style={styles.circle}>
          <Icon name="rotate-ccw" size={28} color={color.blue600} />
        </View>
        <Text style={styles.h1}>Sent back</Text>
        <Text style={styles.lead}>
          {`${creatorName} gets this post back with your notes on the sections you marked. Nothing else has to be re-recorded.`}
        </Text>
      </View>

      <Button variant="primary" size="lg" block onPress={onNext}>
        Next in queue
      </Button>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: color.offWhite,
    paddingHorizontal: 20,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    gap: 12,
  },
  circle: {
    width: 72,
    height: 72,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  h1: {
    fontSize: 28,
    fontWeight: type.weight.bold,
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  lead: {
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * 1.45,
    fontWeight: type.weight.regular,
    color: color.slate500,
    textAlign: 'center',
    maxWidth: 320,
  },
});

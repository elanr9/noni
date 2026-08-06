import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ContentFormat } from '../../../lib/admin-review-types';
import { borderWidth, color, motion, radiusAdmin, shadow, type } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';

export interface ApprovedOverlayProps {
  title: string;
  format: ContentFormat;
  creatorName: string;
  onNext: () => void;
}

/**
 * Admin handoff §3 approved overlay — the last human touch. The three
 * automatic steps differ by format.
 */
export function ApprovedOverlay({ title, format, creatorName, onNext }: ApprovedOverlayProps) {
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

  const steps =
    format === 'video'
      ? ['Clips stitch into the final cut', 'Posts at its slot time', 'Tracking starts on its own']
      : [
          'Slides assemble into the post',
          'Posts with auto-add music on TikTok, silent on Instagram',
          `${creatorName} adds the song, then one tap back here`,
        ];

  return (
    <Animated.View
      style={[
        styles.overlay,
        { opacity, paddingTop: insets.top + 48, paddingBottom: Math.max(insets.bottom, 16) },
      ]}
    >
      <View style={styles.body}>
        <View style={styles.checkCircle}>
          <Icon name="check" size={32} color={color.green} strokeWidth={2.5} />
        </View>
        <Text style={styles.h1}>Approved</Text>
        <Text style={styles.lead}>
          {`${title} is out of your hands. Noni takes it from here.`}
        </Text>

        <View style={[styles.steps, shadow.shadowCard]}>
          {steps.map((step, i) => (
            <View key={step} style={styles.stepRow}>
              <Text style={styles.stepIndex}>{i + 1}</Text>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
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
  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.greenSoft,
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
    maxWidth: 300,
  },
  steps: {
    alignSelf: 'stretch',
    marginTop: 16,
    gap: 14,
    padding: 16,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepIndex: {
    width: 22,
    height: 22,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue100,
    textAlign: 'center',
    lineHeight: 22,
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
    color: color.blue700,
    overflow: 'hidden',
  },
  stepText: {
    flex: 1,
    fontSize: type.size.meta,
    lineHeight: type.size.meta * 1.35,
    fontWeight: type.weight.semibold,
    color: color.ink,
  },
});

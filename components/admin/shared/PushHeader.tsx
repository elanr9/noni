import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, shadow } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export interface PushHeaderProps {
  title: string;
  /** Meta line under the title, e.g. "Numbered list · Week 14" or "Step 1 of 3". */
  subtitle?: string;
  onBack: () => void;
  /** Trailing slot, e.g. Save progress. */
  trailing?: ReactNode;
}

/** Admin handoff — push screen header: 36px circled chevron, title 700 17px. */
export function PushHeader({ title, subtitle, onBack, trailing }: PushHeaderProps) {
  return (
    <View style={styles.row}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={[styles.back, shadow.shadowCard]}
      >
        <Icon name="chevron-left" size={18} color={color.ink} />
      </PressableScale>

      <View style={styles.titleBlock}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {subtitle !== undefined && (
          <Text numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
        )}
      </View>

      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: color.ink,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: color.slate400,
  },
});

import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { CampaignPill } from './CampaignPill';

export interface ContextRowProps {
  /** The screen's trailing controls (bell, compose, gear, toggles). */
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Top row of every tab screen: active company pill left, screen controls right. */
export function ContextRow({ right, style }: ContextRowProps) {
  return (
    <View style={[styles.row, style]}>
      <CampaignPill style={styles.pill} />
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 6,
  },
  pill: {
    flexShrink: 1,
  },
});

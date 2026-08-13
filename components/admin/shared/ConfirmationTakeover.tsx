import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, space, type } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { Icon, type IconName } from '../../ui/Icon';

export type ConfirmationTone = 'brand' | 'good' | 'warn' | 'danger';

const TONES: Record<ConfirmationTone, { bg: string; fg: string }> = {
  brand: { bg: color.blue100, fg: color.blue600 },
  good: { bg: color.greenSoft, fg: color.green },
  warn: { bg: color.amberSoft, fg: color.amber },
  danger: { bg: color.dangerSoft, fg: color.danger },
};

export interface ConfirmationTakeoverProps {
  icon: IconName;
  tone?: ConfirmationTone;
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  /** Renders the top-left circled chevron when provided. */
  onBack?: () => void;
  /** Optional rows between the paragraph and the button (e.g. what happens next). */
  children?: ReactNode;
}

/**
 * Admin handoff — full-screen white takeover: 68px icon disc, 700 26px title,
 * one slate-500 paragraph, primary button.
 */
export function ConfirmationTakeover({
  icon,
  tone = 'good',
  title,
  body,
  actionLabel,
  onAction,
  onBack,
  children,
}: ConfirmationTakeoverProps) {
  const insets = useSafeAreaInsets();
  const t = TONES[tone];

  return (
    <View style={[StyleSheet.absoluteFill, styles.screen]}>
      {onBack !== undefined && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={4}
          onPress={onBack}
          style={[styles.back, { top: insets.top + 10 }]}
        >
          <Icon name="chevron-left" size={20} color={color.ink} />
        </Pressable>
      )}

      <View style={styles.center}>
        <View style={[styles.disc, { backgroundColor: t.bg }]}>
          <Icon name={icon} size={30} color={t.fg} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>

      {children}

      <Button variant="primary" size="lg" block onPress={onAction} style={styles.action}>
        {actionLabel}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: color.white,
    justifyContent: 'center',
    paddingHorizontal: space.gutterAdmin,
    gap: 22,
  },
  back: {
    position: 'absolute',
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  center: {
    alignItems: 'center',
    gap: 14,
  },
  disc: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: type.tracking.title,
    color: color.ink,
    textAlign: 'center',
  },
  body: {
    maxWidth: 290,
    fontSize: 15,
    lineHeight: 15 * 1.5,
    color: color.slate500,
    textAlign: 'center',
  },
  action: {
    marginTop: 8,
  },
});

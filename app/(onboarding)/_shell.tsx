import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '../../components/layout/Screen';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { PressableScale } from '../../components/ui/PressableScale';
import { color, space, type } from '../../theme/tokens';

const TOTAL_STEPS = 12;

export interface OnboardingShellProps {
  /** 1-based step for the thin progress bar. */
  step: number;
  total?: number;
  onBack?: () => void;
  title: string;
  /** Screen title (34) for auth; question title (30) for the rest. */
  titleSize?: 'screen' | 'question';
  subtitle?: string;
  children?: ReactNode;
  primaryLabel?: string;
  onPrimary?: () => void;
  primaryDisabled?: boolean;
  /** Rendered above the pinned primary CTA (skip links, etc.). */
  footerExtra?: ReactNode;
  /** Vertically center children in the remaining space (1b auth). */
  centerContent?: boolean;
}

export function OnboardingShell({
  step,
  total = TOTAL_STEPS,
  onBack,
  title,
  titleSize = 'question',
  subtitle,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  footerExtra,
  centerContent = false,
}: OnboardingShellProps) {
  const progress = Math.min(1, Math.max(0, step / total));
  const titleStyle =
    titleSize === 'screen' ? styles.titleScreen : styles.titleQuestion;

  const footer =
    primaryLabel !== undefined && onPrimary !== undefined ? (
      <>
        {footerExtra}
        <Button
          size="lg"
          block
          disabled={primaryDisabled}
          onPress={onPrimary}
        >
          {primaryLabel}
        </Button>
      </>
    ) : footerExtra !== undefined ? (
      <>{footerExtra}</>
    ) : undefined;

  return (
    <Screen footer={footer} contentStyle={styles.content}>
      <View style={styles.header}>
        {onBack !== undefined ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            style={styles.back}
          >
            <Icon name="chevron-left" size={24} color={color.ink} />
          </PressableScale>
        ) : (
          <View style={styles.backSpacer} />
        )}
        <View style={styles.progressWrap}>
          <ProgressBar progress={progress} />
        </View>
      </View>

      <Text style={titleStyle}>{title}</Text>
      {subtitle !== undefined ? (
        <Text style={styles.subtitle}>{subtitle}</Text>
      ) : null}

      <View style={[styles.body, centerContent && styles.bodyCentered]}>
        {children}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingTop: space[3],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[6],
    paddingBottom: space[8],
  },
  back: {
    width: space[11],
    height: space[11],
    borderRadius: 999,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  backSpacer: {
    width: space[11],
    height: space[11],
    flexShrink: 0,
  },
  progressWrap: {
    flex: 1,
  },
  titleScreen: {
    fontSize: type.size.titleXl,
    lineHeight: type.size.titleXl * type.leading.title,
    letterSpacing: type.tracking.title,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  titleQuestion: {
    fontSize: type.size.title,
    lineHeight: type.size.title * type.leading.title,
    letterSpacing: type.tracking.title,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  subtitle: {
    marginTop: space[3],
    fontSize: type.size.body,
    lineHeight: type.size.body * type.leading.body,
    color: color.slate500,
  },
  body: {
    flex: 1,
    marginTop: space[7],
    gap: space.stackGap,
  },
  bodyCentered: {
    justifyContent: 'center',
  },
});

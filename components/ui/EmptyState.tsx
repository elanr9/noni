import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { color } from '../../theme/tokens';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Home uses tighter padding (24 vertical, 0 horizontal). */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({
  icon = 'inbox',
  title,
  body,
  actionLabel,
  onAction,
  compact = false,
  style,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, compact && styles.compact, style]}>
      <View style={styles.circle}>
        <Icon name={icon} size={30} color={color.blue500} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {actionLabel !== undefined && (
        <Button variant="tint" size="md" onPress={onAction} style={styles.action}>
          {actionLabel}
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  compact: {
    paddingVertical: 24,
    paddingHorizontal: 0,
  },
  circle: {
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: color.ink,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 22.5,
    color: color.textMuted,
    maxWidth: 300,
    textAlign: 'center',
  },
  action: {
    marginTop: 4,
  },
});

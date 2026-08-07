import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { space } from '../../theme/tokens';
import { EmptyState } from '../ui/EmptyState';

export interface SuccessStateProps {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Full-screen success branch. Reuses EmptyState; never invent a parallel layout. */
export function SuccessState({
  title,
  body,
  actionLabel,
  onAction,
  style,
}: SuccessStateProps) {
  return (
    <View style={[styles.wrap, style]}>
      <EmptyState
        icon="circle-check-big"
        title={title}
        body={body}
        actionLabel={actionLabel}
        onAction={onAction}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: space[8],
  },
});

// The creator screens' "could not load" card: what went wrong in plain words
// and a Retry button. Used when a load fails before anything is on screen.
import { Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { color, text } from '../../../theme/v2';
import { Button, Card, Icon } from '../../v2';

export interface LoadErrorProps {
  title?: string;
  /** Plain words for the creator; defaults to a connection hint. */
  message?: string | null;
  onRetry: () => void;
  retrying?: boolean;
}

export function LoadError({ title = 'Could not load', message, onRetry, retrying = false }: LoadErrorProps) {
  return (
    <Animated.View entering={FadeIn.duration(220)}>
      <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
        <View style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: color.grey1, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="cloud_off" size={22} color={color.grey4} />
        </View>
        <Text style={[text.row, { textAlign: 'center' }]}>{title}</Text>
        <Text style={[text.meta, { textAlign: 'center' }]}>{message?.trim() || 'Check your connection and try again.'}</Text>
        <Button pill label={retrying ? 'Trying again' : 'Retry'} icon="refresh" disabled={retrying} onPress={onRetry} style={{ marginTop: 4 }} />
      </Card>
    </Animated.View>
  );
}

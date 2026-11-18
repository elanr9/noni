// Shown in place of figures when the posts store failed to load and has
// nothing to show, so a dropped connection never reads as zero views.
// Also the not-found card for a post or creator that isn't in the company.
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { color, motion, radius, shadow } from '../../../../theme/v2';
import { Button, Icon, type IconName } from '../../../v2';

export interface StateCardProps {
  icon: IconName;
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}

export function StateCard({ icon, title, body, action }: StateCardProps) {
  return (
    <Animated.View entering={FadeInDown.duration(motion.tabIn).easing(motion.tabEase)} style={{ backgroundColor: color.card, borderRadius: radius.card, paddingVertical: 24, paddingHorizontal: 20, alignItems: 'center', gap: 8, ...shadow.card }}>
      <View style={{ width: 48, height: 48, borderRadius: radius.pill, backgroundColor: color.grey1, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
        <Icon name={icon} size={24} color={color.grey4} />
      </View>
      <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', color: color.ink, textAlign: 'center' }}>{title}</Text>
      <Text style={{ fontSize: 15, lineHeight: 20, color: color.grey4, textAlign: 'center' }}>{body}</Text>
      {action ? <Button variant="secondary" label={action.label} icon="refresh" onPress={action.onPress} style={{ flex: 0, alignSelf: 'stretch', marginTop: 8 }} /> : null}
    </Animated.View>
  );
}

export function LoadError({ onRetry, what = 'your posts' }: { onRetry: () => void; what?: string }) {
  return <StateCard icon="cloud_off" title={`Couldn't load ${what}`} body="Check your connection and try again." action={{ label: 'Try again', onPress: onRetry }} />;
}

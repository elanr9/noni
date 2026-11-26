// Empty, error and first-run states for the Review screens.
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';

import { color, radius, text, tone as tones, type Tone } from '../../../../theme/v2';
import { Button, Card, Icon, type IconName } from '../../../v2';

export function StateCard({ icon, tone = 'blue', title, body, children }: { icon: IconName; tone?: Tone; title: string; body?: string; children?: ReactNode }) {
  const t = tones[tone];
  return (
    <Animated.View entering={FadeIn.duration(260)}>
      <Card style={{ alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20 }}>
        <View style={{ width: 56, height: 56, borderRadius: radius.pill, backgroundColor: t.tint, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <Icon name={icon} size={28} color={t.fg} />
        </View>
        <Text style={[text.card, { textAlign: 'center' }]}>{title}</Text>
        {body ? <Text style={[text.body, { color: color.grey4, textAlign: 'center', marginTop: 6 }]}>{body}</Text> : null}
        {children ? <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 18 }}>{children}</View> : null}
      </Card>
    </Animated.View>
  );
}

/** Could not load: says so and offers Retry. */
export function ErrorCard({ message, onRetry }: { message?: string | null; onRetry: () => void }) {
  return (
    <StateCard icon="cloud_off" tone="pink" title="Could not load the queue" body={message ? `${message}. Pull down or tap Retry.` : 'Check your connection, then pull down or tap Retry.'}>
      <View style={{ flexDirection: 'row' }}>
        <Button label="Retry" icon="refresh" variant="secondary" onPress={onRetry} />
      </View>
    </StateCard>
  );
}

export interface LaneEmptyProps {
  icon: IconName;
  tone?: Tone;
  /** 2 to 4 plain words. */
  title: string;
  /** The one thing to do from here. */
  action: string;
  actionIcon?: IconName;
  onAction: () => void;
}

/** A Review lane with nothing in it: fills the lane, a flat tinted disc that pops in, the title, one button. */
export function LaneEmpty({ icon, tone = 'blue', title, action, actionIcon, onAction }: LaneEmptyProps) {
  const t = tones[tone];
  return (
    <View style={{ flex: 1, minHeight: 300, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 24 }}>
      <Animated.View
        entering={ZoomIn.springify().damping(11)}
        style={{ width: 120, height: 120, borderRadius: radius.pill, backgroundColor: t.tint, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name={icon} size={64} color={t.fg} />
      </Animated.View>
      <Animated.Text entering={FadeInDown.duration(260).delay(80)} style={[text.card, { fontSize: 24, lineHeight: 30, textAlign: 'center', marginTop: 24 }]}>
        {title}
      </Animated.Text>
      <Animated.View entering={FadeInDown.duration(260).delay(140)} style={{ flexDirection: 'row', width: 220, marginTop: 20 }}>
        <Button label={action} icon={actionIcon} onPress={onAction} />
      </Animated.View>
    </View>
  );
}

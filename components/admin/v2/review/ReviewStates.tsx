// Empty, error and first-run states for the Review screens.
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

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

export interface FirstRunProps {
  /** No creators on the roster yet: a brand-new company. */
  noCreators: boolean;
  canInvite: boolean;
  onInvite: () => void;
  onCreators: () => void;
  onNewBrief: () => void;
  /** Shown while the manager setup checklist is incomplete. */
  onSetup?: () => void;
}

/** Posts lane with nothing waiting. A fresh company gets the three steps to its first post. */
export function PostsEmpty({ noCreators, canInvite, onInvite, onCreators, onNewBrief, onSetup }: FirstRunProps) {
  if (noCreators) {
    return (
      <StateCard
        icon="inbox"
        title="Your review queue starts here"
        body={
          canInvite
            ? 'Invite your creators, approve their accounts in the Accounts lane, then send a brief. Their posts land here for you to approve.'
            : 'Once creators join and post from your briefs, their posts land here for you to approve.'
        }
      >
        {canInvite ? <View style={{ flexDirection: 'row' }}><Button label="Invite creators" icon="send" onPress={onInvite} /></View> : null}
        <View style={{ flexDirection: 'row' }}><Button label="Write a brief" icon="add" variant="secondary" onPress={onNewBrief} /></View>
        {onSetup ? <View style={{ flexDirection: 'row' }}><Button label="Finish setup" icon="auto_awesome" variant="quiet" onPress={onSetup} /></View> : null}
      </StateCard>
    );
  }
  return (
    <StateCard icon="check_circle" tone="green" title="Nothing to review." body="New posts from your creators show up here the moment they submit.">
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="Creators" icon="person" variant="secondary" onPress={onCreators} />
        {canInvite ? <Button label="Invite" icon="send" variant="quiet" onPress={onInvite} /> : null}
      </View>
    </StateCard>
  );
}

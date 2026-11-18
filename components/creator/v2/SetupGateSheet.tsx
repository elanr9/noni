// What Create shows before setup is done: the steps still open, each one a
// row that goes straight to it, so the raised button never does nothing.
import { useState } from 'react';
import { Text, View } from 'react-native';
import type { Href } from 'expo-router';

import type { SetupState, SetupStepStatus } from '../../../lib/setup';
import { color, motion, text, tone } from '../../../theme/v2';
import { Button, Chip, Icon, Row, Sheet, type IconName } from '../../v2';

type Step = { key: string; label: string; sub: string; icon: IconName; status: SetupStepStatus; href: Href };

function stepsOf(s: SetupState): Step[] {
  return [
    { key: 'accounts', label: 'Add your accounts', sub: 'Your TikTok and Instagram handles', icon: 'person', status: s.accounts, href: '/(creator)/account-setup' },
    { key: 'connect', label: 'Connect your socials', sub: 'So approved posts can go live', icon: 'link', status: s.connect, href: '/(creator)/setup/connect' },
    { key: 'warmup', label: 'Warm up', sub: 'A few days of normal use on each app', icon: 'rocket_launch', status: s.warmup, href: '/(creator)/setup/warmup' },
  ];
}

export function SetupGateSheet({ state, onClose, onOpen }: { state: SetupState; onClose: () => void; onOpen: (href: Href) => void }) {
  const [open, setOpen] = useState(true);
  const leave = (after: () => void) => {
    setOpen(false);
    setTimeout(after, motion.sheet);
  };
  const steps = stepsOf(state);
  const left = steps.filter((s) => s.status !== 'done');
  const next = left.find((s) => s.status === 'todo') ?? left[0];
  return (
    <Sheet
      open={open}
      onClose={() => leave(onClose)}
      title="Finish setup to post"
      footer={
        next && next.status === 'todo' ? (
          <Button label={next.label} onPress={() => leave(() => onOpen(next.href))} />
        ) : (
          <Button variant="quiet" label="Got it" onPress={() => leave(onClose)} />
        )
      }
    >
      <Text style={[text.body, { color: color.grey4, marginBottom: 8 }]}>
        {left.length === 1 ? 'One step left before you can make posts.' : `${left.length} steps left before you can make posts.`}
      </Text>
      <View>
        {steps.map((s, i) => {
          const done = s.status === 'done';
          const review = s.status === 'in_review';
          return (
            <Row key={s.key} last={i === steps.length - 1} chevron={!done} onPress={done ? undefined : () => leave(() => onOpen(s.href))}>
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: done ? tone.green.tint : tone.blue.tint, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={done ? 'check' : s.icon} size={20} color={done ? tone.green.fg : tone.blue.fg} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[text.row, done ? { color: color.grey4 } : null]}>{s.label}</Text>
                <Text numberOfLines={1} style={text.meta}>{s.sub}</Text>
              </View>
              {review ? <Chip small tone="amber" label="In review" /> : null}
            </Row>
          );
        })}
      </View>
    </Sheet>
  );
}

// Small v2 pieces the creator setup screens share: tinted notices, the
// "sent back" reason, upload slots and section labels.
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { color, radius, shadow, space, text, tone as tones, type Tone } from '../../../../theme/v2';
import { Icon, Press, type IconName } from '../../../v2';

/** Uppercase grey label above a group. */
export function SetupLabel({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: color.grey4, marginTop: space[4], marginBottom: space[2] }}>
      {children}
    </Text>
  );
}

/** Tinted card with an icon, a bold line and an optional body. */
export function Notice({ tone = 'blue', icon, title, body, right }: { tone?: Tone; icon: IconName; title: string; body?: string; right?: ReactNode }) {
  const t = tones[tone];
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      style={{ flexDirection: 'row', alignItems: body ? 'flex-start' : 'center', gap: 12, padding: 14, marginBottom: space.cardGap, borderRadius: radius.card, backgroundColor: t.tint }}
    >
      <Icon name={icon} size={20} color={t.fg} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[text.body, { fontWeight: '700', color: t.text }]}>{title}</Text>
        {body ? <Text style={[text.meta, { color: color.ink }]}>{body}</Text> : null}
      </View>
      {right}
    </Animated.View>
  );
}

/** The reviewer's reason when accounts come back for changes. */
export function SentBackNote({ reason }: { reason: string }) {
  return <Notice tone="amber" icon="error" title="Sent back" body={reason} />;
}

/** A tappable upload slot: label, hint or status, green check once filled. */
export function UploadSlot({
  icon,
  label,
  hint,
  chosen,
  already,
  disabled,
  index = 0,
  onPress,
}: {
  icon: IconName;
  label: string;
  hint: string;
  chosen: boolean;
  already: boolean;
  disabled?: boolean;
  index?: number;
  onPress: () => void;
}) {
  const filled = chosen || already;
  return (
    <Animated.View entering={FadeInDown.duration(240).delay(index * 50)}>
      <Press
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={onPress}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: space.cardGap, borderRadius: radius.card, backgroundColor: color.card, opacity: disabled ? 0.5 : 1, ...shadow.card }}
      >
        <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: filled ? color.greenTint : color.grey1, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={20} color={filled ? color.green : color.grey4} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={text.row}>{label}</Text>
          <Text style={text.meta}>{chosen ? 'Ready to upload' : already ? 'Uploaded. Tap to replace' : hint}</Text>
        </View>
        {filled ? <Icon name="check_circle" size={22} color={color.green} /> : <Icon name="add" size={22} color={color.grey3} />}
      </Press>
    </Animated.View>
  );
}

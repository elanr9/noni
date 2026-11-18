// Shown once, the moment both socials finish linking through Upload-Post:
// a green seal that pops in and the two linked handles.
import { Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { formatHandle } from '../../../../lib/social-accounts';
import { color, motion, radius, space, text } from '../../../../theme/v2';
import { Button, Icon, Sheet } from '../../../v2';
import { PlatformBadge, type SetupPlatform } from './PlatformBadge';

export interface ConnectedSheetProps {
  open: boolean;
  instagramHandle: string | null;
  tiktokHandle: string | null;
  onDone: () => void;
}

function LinkedRow({ platform, label, handle, index }: { platform: SetupPlatform; label: string; handle: string | null; index: number }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(motion.tabIn).delay(180 + index * 80)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: index === 0 ? 1 : 0, borderBottomColor: color.grey1 }}
    >
      <PlatformBadge platform={platform} size={36} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={text.row}>{label}</Text>
        <Text numberOfLines={1} style={text.meta}>
          {handle !== null ? formatHandle(handle) : 'Linked'}
        </Text>
      </View>
      <Icon name="check_circle" size={22} color={color.green} />
    </Animated.View>
  );
}

export function ConnectedSheet({ open, instagramHandle, tiktokHandle, onDone }: ConnectedSheetProps) {
  return (
    <Sheet open={open} onClose={onDone} footer={<Button label="Done" onPress={onDone} />}>
      <View style={{ alignItems: 'center', paddingTop: 4 }}>
        {open ? (
          <Animated.View
            entering={ZoomIn.duration(motion.sheet).easing(motion.spring)}
            style={{ width: 68, height: 68, borderRadius: radius.pill, backgroundColor: color.green, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="check" size={36} weight={700} color={color.white} />
          </Animated.View>
        ) : null}
        <Text style={[text.card, { fontSize: 24, lineHeight: 30, textAlign: 'center', marginTop: space[4] }]}>You are connected</Text>
        <Text style={[text.body, { color: color.grey4, textAlign: 'center', marginTop: space[2] }]}>
          Approved posts publish to these accounts on their own.
        </Text>
      </View>
      <View style={{ marginTop: space[4] }}>
        <LinkedRow platform="instagram" label="Instagram" handle={instagramHandle} index={0} />
        <LinkedRow platform="tiktok" label="TikTok" handle={tiktokHandle} index={1} />
      </View>
    </Sheet>
  );
}

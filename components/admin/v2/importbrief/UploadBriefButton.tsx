import { Text } from 'react-native';

import { color, radius, shadow } from '../../../../theme/v2';
import { Icon, Press } from '../../../v2';

/** Small white pill at the top right of the Briefs tab: opens Upload brief. */
export function UploadBriefButton({ onPress }: { onPress: () => void }) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel="Upload brief"
      onPress={onPress}
      style={{ height: 40, paddingLeft: 10, paddingRight: 14, borderRadius: radius.pill, backgroundColor: color.card, flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0, ...shadow.card }}
    >
      <Icon name="upload_file" size={20} weight={700} color={color.blue} />
      <Text style={{ fontSize: 14, fontWeight: '700', color: color.ink }}>Upload brief</Text>
    </Press>
  );
}

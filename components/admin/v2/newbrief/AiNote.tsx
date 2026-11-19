// What Fill in with AI has to say besides the fields it filled: why it
// declined, what it could not read from a reference link, and the checks a
// draft still fails. Amber tint, the same card as a saved review note.
import { Text, View } from 'react-native';

import { color, radius } from '../../../../theme/v2';
import { Icon, type IconName } from '../../../v2';

export interface AiNoteProps {
  icon?: IconName;
  title?: string;
  body?: string;
  /** Short lines under the body: questions to answer, or checks to look at. */
  lines?: string[];
}

export function AiNote({ icon = 'info', title, body, lines }: AiNoteProps) {
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.card, backgroundColor: color.amberTint }}>
      <Icon name={icon} size={20} color={color.amber} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        {title ? <Text style={{ fontSize: 14, lineHeight: 19, fontWeight: '700', color: color.ink }}>{title}</Text> : null}
        {body ? <Text style={{ fontSize: 14, lineHeight: 20, color: color.ink }}>{body}</Text> : null}
        {(lines ?? []).map((l) => (
          <Text key={l} style={{ fontSize: 13, lineHeight: 18, color: color.grey4 }}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

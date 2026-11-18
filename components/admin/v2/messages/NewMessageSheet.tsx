import { Text, View } from 'react-native';

import { color, radius, text, type Tone } from '../../../../theme/v2';
import { Avatar, Icon, Label, Press, Sheet } from '../../../v2';

export type NewMessagePerson = { id: string; name: string; meta: string | null; kind: 'creator' | 'team'; photo: string | null; tone: Tone };

export interface NewMessageSheetProps {
  open: boolean;
  onClose: () => void;
  people: NewMessagePerson[];
  onPick: (p: NewMessagePerson) => void;
  /** Shown as a row under the list (and as the empty state's action). */
  onInvite?: () => void;
}

/** The pencil: pick a creator or a teammate and open that thread. */
export function NewMessageSheet({ open, onClose, people, onPick, onInvite }: NewMessageSheetProps) {
  const creators = people.filter((p) => p.kind === 'creator').sort((a, b) => a.name.localeCompare(b.name));
  const team = people.filter((p) => p.kind === 'team').sort((a, b) => a.name.localeCompare(b.name));
  const group = (label: string, rows: NewMessagePerson[]) =>
    rows.length ? (
      <View key={label} style={{ marginBottom: 12 }}>
        <Label style={{ marginBottom: 6 }}>{label}</Label>
        {rows.map((p, i) => (
          <Press key={p.id} onPress={() => onPick(p)} accessibilityRole="button" accessibilityLabel={p.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: color.grey1 }}>
            <Avatar name={p.name} photo={p.photo} tone={p.tone} size={40} ring={false} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={text.row}>{p.name}</Text>
              {p.meta ? <Text style={text.meta}>{p.meta}</Text> : null}
            </View>
            <Icon name="chevron_right" size={22} color={color.grey3} />
          </Press>
        ))}
      </View>
    ) : null;
  return (
    <Sheet open={open} onClose={onClose} title="New message">
      {group('Creators', creators)}
      {group('Team', team)}
      {people.length === 0 ? <Text style={[text.body, { color: color.grey4, textAlign: 'center', paddingVertical: 12 }]}>No one to message yet. Invite a creator and their thread opens here.</Text> : null}
      {onInvite ? (
        <Press onPress={onInvite} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
          <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.blueTint, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="add" size={22} weight={700} color={color.blueDeep} />
          </View>
          <Text style={[text.row, { flex: 1, color: color.blueDeep }]}>Invite a creator</Text>
        </Press>
      ) : null}
    </Sheet>
  );
}

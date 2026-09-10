import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DmInboxRow } from '../../../../lib/inbox-api';
import { color, type } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { Avatar, SectionLabel, Sheet } from '../../shared';

export interface NewMessageSheetProps {
  visible: boolean;
  onClose: () => void;
  people: DmInboxRow[];
  onPick: (row: DmInboxRow) => void;
}

/** The pencil button: pick a creator or team member, then open that thread. */
export function NewMessageSheet({ visible, onClose, people, onPick }: NewMessageSheetProps) {
  const creators = people
    .filter((p) => p.kind === 'creator')
    .sort((a, b) => a.name.localeCompare(b.name));
  const team = people
    .filter((p) => p.kind === 'member')
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Sheet visible={visible} onClose={onClose} title="New message" subtitle="Pick who to write to.">
      {creators.length > 0 && (
        <>
          <SectionLabel style={styles.label}>Creators</SectionLabel>
          <View style={styles.list}>
            {creators.map((p) => (
              <PersonRow key={p.id} row={p} onPress={() => onPick(p)} />
            ))}
          </View>
        </>
      )}
      {team.length > 0 && (
        <>
          <SectionLabel style={styles.label}>Team</SectionLabel>
          <View style={styles.list}>
            {team.map((p) => (
              <PersonRow key={p.id} row={p} onPress={() => onPick(p)} />
            ))}
          </View>
        </>
      )}
      {people.length === 0 && <Text style={styles.empty}>Nothing here</Text>}
    </Sheet>
  );
}

function PersonRow({ row, onPress }: { row: DmInboxRow; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={row.name}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Avatar name={row.name} size={36} tone={row.kind === 'creator' ? 'brand' : 'quiet'} />
      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.name}>
          {row.name}
        </Text>
        {row.role !== null && <Text style={styles.role}>{row.role}</Text>}
      </View>
      <Icon name="chevron-right" size={16} color={color.slate300} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 2,
  },
  list: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: color.fillQuiet,
  },
  rowPressed: {
    backgroundColor: color.blue100,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: type.size.meta,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  role: {
    marginTop: 1,
    fontSize: type.size.micro11,
    fontWeight: type.weight.semibold,
    color: color.slate400,
  },
  empty: {
    marginVertical: 40,
    textAlign: 'center',
    fontSize: type.size.meta,
    fontWeight: type.weight.medium,
    color: color.slate400,
  },
});

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TeamMember } from '../../../../lib/inbox-api';
import {
  roleLabel,
  type ChannelMember,
  type ManagerChatInfo,
} from '../../../../lib/manager-messages-api';
import { borderWidth, color } from '../../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { Avatar, SectionLabel, Sheet } from '../../shared';

export type MembersSheetProps = {
  visible: boolean;
  onClose: () => void;
  chat: ManagerChatInfo;
  meId: string;
  members: ChannelMember[];
  team: TeamMember[];
  busy: boolean;
  onToggleAllCreators: (next: boolean) => void;
  onAddMembers: (ids: string[]) => Promise<void>;
  onLeave: () => void;
};

export function MembersSheet({
  visible,
  onClose,
  chat,
  meId,
  members,
  team,
  busy,
  onToggleAllCreators,
  onAddMembers,
  onLeave,
}: MembersSheetProps) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const isChannel = chat.kind === 'channel';
  const memberIds = new Set(members.map((m) => m.id));
  const candidates = team.filter((t) => !memberIds.has(t.id));
  const canLeave = isChannel && chat.createdBy !== meId;

  const togglePick = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const add = async () => {
    const ids = candidates.map((c) => c.id).filter((id) => picked.has(id));
    if (ids.length === 0) return;
    await onAddMembers(ids);
    setPicked(new Set());
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={chat.title}
      subtitle="Members"
      footer={
        canLeave ? (
          <Button variant="outline" size="md" block disabled={busy} onPress={onLeave}>
            Leave channel
          </Button>
        ) : undefined
      }
    >
      <View style={styles.list}>
        {members.map((m) => (
          <View key={m.id} style={styles.row}>
            <Avatar name={m.name} size={32} tone="quiet" />
            <Text numberOfLines={1} style={styles.name}>
              {m.id === meId ? 'You' : m.name}
            </Text>
            <Text style={styles.role}>{roleLabel(m.role)}</Text>
          </View>
        ))}
      </View>

      {isChannel && (
        <>
          <SectionLabel style={styles.label}>Creators</SectionLabel>
          <CheckRow
            label="Let all approved creators in"
            on={chat.allCreators}
            disabled={busy}
            onToggle={() => onToggleAllCreators(!chat.allCreators)}
          />

          {candidates.length > 0 && (
            <>
              <SectionLabel style={styles.label}>Add team members</SectionLabel>
              <View style={styles.list}>
                {candidates.map((c) => (
                  <CheckRow
                    key={c.id}
                    label={c.name}
                    right={c.roleLabel}
                    on={picked.has(c.id)}
                    disabled={busy}
                    onToggle={() => togglePick(c.id)}
                  />
                ))}
              </View>
              <View style={styles.addRow}>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy || picked.size === 0}
                  onPress={() => void add()}
                >
                  Add
                </Button>
              </View>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

function CheckRow({
  label,
  right,
  on,
  disabled,
  onToggle,
}: {
  label: string;
  right?: string;
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled }}
      disabled={disabled}
      onPress={onToggle}
      style={[styles.check, on && styles.checkOn]}
    >
      <View style={[styles.box, on ? styles.boxOn : styles.boxOff]}>
        {on && <Icon name="check" size={12} color={color.white} strokeWidth={3} />}
      </View>
      <Text numberOfLines={1} style={[styles.checkLabel, on && styles.checkLabelOn]}>
        {label}
      </Text>
      {right !== undefined && (
        <Text style={[styles.role, on && styles.checkRightOn]}>{right}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  name: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: color.ink,
  },
  role: {
    fontSize: 12,
    fontWeight: '600',
    color: color.slate400,
  },
  label: {
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 2,
  },
  addRow: {
    marginTop: 10,
    alignItems: 'flex-end',
  },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: color.fillQuiet,
  },
  checkOn: {
    backgroundColor: color.blue100,
  },
  box: {
    width: 18,
    height: 18,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: {
    backgroundColor: color.blue500,
  },
  boxOff: {
    backgroundColor: color.white,
    borderWidth: borderWidth.field,
    borderColor: color.borderStrong,
  },
  checkLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: color.ink,
  },
  checkLabelOn: {
    color: color.blue700,
  },
  checkRightOn: {
    color: color.blue700,
  },
});

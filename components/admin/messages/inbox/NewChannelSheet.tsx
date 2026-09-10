import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { TeamMember } from '../../../../lib/inbox-api';
import { createChannel, slugifyChannelName } from '../../../../lib/manager-messages-api';
import { borderWidth, color, radiusAdmin, type } from '../../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { SectionLabel, Sheet } from '../../shared';

export interface NewChannelSheetProps {
  visible: boolean;
  onClose: () => void;
  companyId: string;
  meId: string;
  team: TeamMember[];
  approvedCreatorCount: number;
  onCreated: (chatId: string, name: string) => void;
}

export function NewChannelSheet({
  visible,
  onClose,
  companyId,
  meId,
  team,
  approvedCreatorCount,
  onCreated,
}: NewChannelSheetProps) {
  const others = team.filter((t) => t.id !== meId);
  const [name, setName] = useState('');
  const [who, setWho] = useState<Set<string>>(() => new Set(others.map((o) => o.id)));
  const [creators, setCreators] = useState(false);
  const [busy, setBusy] = useState(false);

  const slug = slugifyChannelName(name);
  const canCreate = slug.length > 0 && !busy;

  const toggle = (id: string) => {
    setWho((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const create = async () => {
    if (!canCreate) return;
    setBusy(true);
    try {
      const chatId = await createChannel({
        companyId,
        myId: meId,
        name: slug,
        memberIds: [...who],
        allCreators: creators,
      });
      onCreated(chatId, slug);
    } catch (e) {
      Alert.alert('Could not create channel', e instanceof Error ? e.message : 'Try again');
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="New channel"
      subtitle="Pick who is in it. You can add creators too."
      footer={
        <Button variant="primary" size="lg" block disabled={!canCreate} onPress={() => void create()}>
          {`Create #${slug || 'channel'}`}
        </Button>
      }
    >
      <View style={[styles.field, name.length > 0 && styles.fieldActive]}>
        <Text style={styles.hash}>#</Text>
        <TextInput
          autoFocus
          value={name}
          onChangeText={setName}
          placeholder="channel-name"
          placeholderTextColor={color.slate400}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => void create()}
          style={styles.input}
        />
      </View>

      {others.length > 0 && (
        <>
          <SectionLabel style={styles.label}>Team</SectionLabel>
          <View style={styles.list}>
            {others.map((p) => (
              <CheckRow
                key={p.id}
                label={p.name}
                right={p.roleLabel}
                on={who.has(p.id)}
                onToggle={() => toggle(p.id)}
              />
            ))}
          </View>
        </>
      )}

      <SectionLabel style={styles.label}>Creators</SectionLabel>
      <CheckRow
        label="Let all approved creators in"
        right={String(approvedCreatorCount)}
        on={creators}
        onToggle={() => setCreators((v) => !v)}
      />
    </Sheet>
  );
}

function CheckRow({
  label,
  right,
  on,
  onToggle,
}: {
  label: string;
  right: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      onPress={onToggle}
      style={[styles.check, on && styles.checkOn]}
    >
      <View style={[styles.box, on ? styles.boxOn : styles.boxOff]}>
        {on && <Icon name="check" size={12} color={color.white} strokeWidth={3} />}
      </View>
      <Text style={[styles.checkLabel, on && styles.checkLabelOn]}>{label}</Text>
      <Text style={[styles.checkRight, on && styles.checkRightOn]}>{right}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radiusAdmin.md,
    borderWidth: borderWidth.field,
    borderColor: color.borderStrong,
  },
  fieldActive: {
    borderColor: color.blue500,
  },
  hash: {
    fontSize: type.size.body,
    fontWeight: type.weight.bold,
    color: color.slate400,
  },
  input: {
    flex: 1,
    padding: 0,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.semibold,
    color: color.ink,
  },
  label: {
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 2,
  },
  list: {
    gap: 6,
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
    fontSize: type.size.meta,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  checkLabelOn: {
    color: color.blue700,
  },
  checkRight: {
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.slate400,
  },
  checkRightOn: {
    color: color.blue700,
  },
});

import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { TeamMember } from '../../../../lib/inbox-api';
import { createChannel, roleLabel, slugifyChannelName, type ChannelMember, type ManagerChatInfo } from '../../../../lib/manager-messages-api';
import { color, motion, radius, text } from '../../../../theme/v2';
import { Avatar, Button, Icon, Label, Press, Sheet, Toggle } from '../../../v2';
import { toast } from '../../../v2/Toast';

/** Checkbox row: blue tint and a popping check when on. */
function CheckRow({ label, right, on, disabled, onToggle }: { label: string; right?: string; on: boolean; disabled?: boolean; onToggle: () => void }) {
  const pop = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    pop.set(withTiming(on ? 1 : 0, { duration: 180, easing: motion.spring }));
  }, [on, pop]);
  const check = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }], opacity: pop.get() }));
  return (
    <Press
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled }}
      onPress={onToggle}
      disabled={disabled}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 12, marginBottom: 6, borderRadius: radius.option, backgroundColor: on ? color.blueTint : color.grey1, opacity: disabled ? 0.5 : 1 }}
    >
      <View style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: on ? color.blue : color.card, borderWidth: on ? 0 : 1.5, borderColor: color.grey3, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={check}>
          <Icon name="check" size={16} weight={700} color={color.white} />
        </Animated.View>
      </View>
      <Text numberOfLines={1} style={[text.row, { flex: 1, fontSize: 15, color: on ? color.blueDeep : color.ink }]}>{label}</Text>
      {right ? <Text style={[text.meta, on ? { color: color.blueDeep, fontWeight: '600' } : null]}>{right}</Text> : null}
    </Press>
  );
}

export interface NewChannelSheetProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  meId: string;
  team: TeamMember[];
  approvedCreatorCount: number;
  onCreated: (chatId: string, slug: string) => void;
}

/** "+ New" channel: name, which teammates are in, and whether approved creators can read it. */
export function NewChannelSheet({ open, onClose, companyId, meId, team, approvedCreatorCount, onCreated }: NewChannelSheetProps) {
  const others = team.filter((t) => t.id !== meId);
  const [name, setName] = useState('');
  const [who, setWho] = useState<Set<string>>(() => new Set());
  const [creators, setCreators] = useState(false);
  const [busy, setBusy] = useState(false);

  // Fresh form each time it opens; every teammate starts checked.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName('');
      setCreators(false);
      setBusy(false);
      setWho(new Set(others.map((t) => t.id)));
    }
  }

  const slug = slugifyChannelName(name);
  const canCreate = slug.length > 0 && !busy;

  const create = async () => {
    if (!canCreate) return;
    setBusy(true);
    try {
      const chatId = await createChannel({ companyId, myId: meId, name: slug, memberIds: [...who], allCreators: creators });
      onCreated(chatId, slug);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      toast.error(/duplicate|unique/i.test(msg) ? `#${slug} already exists. Pick another name.` : 'Could not create the channel. Try again.');
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New channel"
      footer={<Button label={busy ? 'Creating...' : `Create #${slug || 'channel'}`} disabled={!canCreate} onPress={() => void create()} />}
    >
      <Text style={[text.meta, { marginTop: -8, marginBottom: 14 }]}>Pick who is in it. You can let creators in too.</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 52, paddingHorizontal: 14, borderRadius: radius.option, borderWidth: 1.5, borderColor: name ? color.blue : color.grey2, marginBottom: 16 }}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: color.grey3 }}>#</Text>
        <TextInput
          autoFocus
          value={name}
          onChangeText={setName}
          placeholder="channel-name"
          placeholderTextColor={color.grey3}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => void create()}
          style={{ flex: 1, fontSize: 16, fontWeight: '600', color: color.ink }}
        />
      </View>
      {others.length > 0 ? (
        <>
          <Label style={{ marginBottom: 8 }}>Team</Label>
          {others.map((p) => (
            <CheckRow
              key={p.id}
              label={p.name}
              right={p.roleLabel}
              on={who.has(p.id)}
              onToggle={() =>
                setWho((prev) => {
                  const next = new Set(prev);
                  if (next.has(p.id)) next.delete(p.id);
                  else next.add(p.id);
                  return next;
                })
              }
            />
          ))}
        </>
      ) : null}
      <Label style={{ marginTop: 10, marginBottom: 8 }}>Creators</Label>
      <CheckRow label="Let all approved creators in" right={String(approvedCreatorCount)} on={creators} onToggle={() => setCreators((v) => !v)} />
    </Sheet>
  );
}

export interface MembersSheetProps {
  open: boolean;
  onClose: () => void;
  chat: ManagerChatInfo;
  meId: string;
  members: ChannelMember[] | null;
  team: TeamMember[];
  busy: boolean;
  onToggleAllCreators: (next: boolean) => void;
  onAddMembers: (ids: string[]) => Promise<void>;
  onLeave: () => void;
}

/** Channel header tap: who is in it, add teammates, let creators in, leave. */
export function MembersSheet({ open, onClose, chat, meId, members, team, busy, onToggleAllCreators, onAddMembers, onLeave }: MembersSheetProps) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const isChannel = chat.kind === 'channel' && !chat.isGeneral;
  const memberIds = new Set((members ?? []).map((m) => m.id));
  const candidates = team.filter((t) => !memberIds.has(t.id));
  const canLeave = isChannel && chat.createdBy !== meId;

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setPicked(new Set());
  }

  const add = async () => {
    const ids = candidates.map((c) => c.id).filter((id) => picked.has(id));
    if (ids.length === 0) return;
    await onAddMembers(ids);
    setPicked(new Set());
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={chat.title}
      footer={canLeave ? <Button label="Leave channel" variant="quiet" disabled={busy} onPress={onLeave} /> : undefined}
    >
      <Text style={[text.meta, { marginTop: -8, marginBottom: 12 }]}>
        {chat.isGeneral ? 'Everyone on the team' : chat.kind === 'brief' ? 'Everyone on this week’s brief' : `${members?.length ?? chat.memberCount} ${(members?.length ?? chat.memberCount) === 1 ? 'member' : 'members'}`}
      </Text>
      {members === null ? (
        <Text style={[text.body, { color: color.grey4, paddingVertical: 8 }]}>Loading members...</Text>
      ) : (
        members.map((m, i) => (
          <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i === members.length - 1 ? 0 : 1, borderBottomColor: color.grey1 }}>
            <Avatar name={m.name} tone={m.role === 'creator' ? 'blue' : 'pink'} size={36} ring={false} />
            <Text numberOfLines={1} style={[text.row, { flex: 1, fontSize: 15 }]}>{m.id === meId ? 'You' : m.name}</Text>
            <Text style={text.meta}>{roleLabel(m.role)}</Text>
          </View>
        ))
      )}
      {isChannel ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={[text.row, { fontSize: 15 }]}>Let all approved creators in</Text>
              <Text style={text.meta}>They can read and post here</Text>
            </View>
            <Toggle on={chat.allCreators} onChange={(v) => !busy && onToggleAllCreators(v)} accessibilityLabel="Let all approved creators in" />
          </View>
          {candidates.length > 0 ? (
            <>
              <Label style={{ marginTop: 12, marginBottom: 8 }}>Add teammates</Label>
              {candidates.map((c) => (
                <CheckRow
                  key={c.id}
                  label={c.name}
                  right={c.roleLabel}
                  on={picked.has(c.id)}
                  disabled={busy}
                  onToggle={() =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (next.has(c.id)) next.delete(c.id);
                      else next.add(c.id);
                      return next;
                    })
                  }
                />
              ))}
              <Button pill label={picked.size ? `Add ${picked.size}` : 'Add'} disabled={busy || picked.size === 0} onPress={() => void add()} style={{ alignSelf: 'flex-end', marginTop: 6 }} />
            </>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

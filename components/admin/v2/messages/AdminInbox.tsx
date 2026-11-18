import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useAuth } from '../../../../lib/auth';
import { loadInbox, type Inbox } from '../../../../lib/inbox-api';
import { getOrCreateDm } from '../../../../lib/manager-messages-api';
import { subscribePresence } from '../../../../lib/presence';
import { creatorById, useV2Data } from '../../../../lib/v2-posts';
import { color, radius, text } from '../../../../theme/v2';
import { ContextRow } from '../../../shared/ContextRow';
import { InboxScreen, type InboxData } from '../../../shared/messages';
import { Button, Card, Icon } from '../../../v2';
import { toast } from '../../../v2/Toast';
import { InviteCreatorsSheet } from '../review/InviteCreatorsSheet';
import { NewChannelSheet } from './ChannelSheets';
import { NewMessageSheet, type NewMessagePerson } from './NewMessageSheet';

const POLL_MS = 20_000;
const FILTERS = ['All', 'Unread', 'Creators', 'Team', 'Channels'] as const;

/** Campaign manager inbox: review card, creator threads and team DMs, channels. */
export function AdminInbox() {
  const router = useRouter();
  const { profile } = useAuth();
  const companyId = profile?.active_company_id ?? null;
  const meId = profile?.id ?? null;
  const creators = useV2Data((s) => s.creators);
  const loadData = useV2Data((s) => s.load);

  // Keyed by company so a switch starts from skeletons, never the last company's threads.
  const [loaded, setLoaded] = useState<{ companyId: string; inbox: Inbox | null; failed: boolean } | null>(null);
  const inbox = loaded && loaded.companyId === companyId ? loaded.inbox : null;
  const failed = loaded !== null && loaded.companyId === companyId && loaded.failed;
  const [online, setOnline] = useState<Set<string>>(() => new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async (manual = false) => {
    if (!companyId || !meId) return;
    const mine = ++seq.current;
    try {
      const next = await loadInbox(companyId, meId);
      if (mine !== seq.current) return;
      setLoaded({ companyId, inbox: next, failed: false });
    } catch {
      if (mine !== seq.current) return;
      // With an inbox on screen the poll retries quietly; with none, show Retry.
      setLoaded((prev) => ({ companyId, inbox: prev && prev.companyId === companyId ? prev.inbox : null, failed: true }));
      if (manual) toast.error('Could not refresh messages. Check your connection.');
    } finally {
      if (mine === seq.current) setRefreshing(false);
    }
  }, [companyId, meId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), POLL_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  useEffect(() => {
    if (!companyId) return;
    void loadData(companyId);
    return subscribePresence(companyId, setOnline);
  }, [companyId, loadData]);

  const data = useMemo<InboxData | null>(() => {
    if (!inbox) return null;
    return {
      review: inbox.queue.length ? { count: inbox.queue.length, names: [...new Set(inbox.queue.map((q) => q.creatorShort))] } : null,
      dms: inbox.dms.map((d) => {
        const c = d.kind === 'member' ? undefined : creatorById(creators, d.personId);
        return {
          id: d.id,
          name: d.name,
          photo: c?.photo ?? null,
          tone: c?.tone ?? (d.kind === 'member' ? 'pink' : 'blue'),
          online: d.kind !== 'member' && online.has(d.personId),
          last: d.preview,
          lastAt: d.lastMessageAt,
          unread: d.unread,
          kind: d.kind === 'member' ? 'team' : 'creator',
        };
      }),
      channels: inbox.channels.map((c) => ({ id: c.chatId, name: c.isGeneral ? '#general' : `#${c.name ?? 'channel'}`, last: c.preview, lastAt: c.lastMessageAt, unread: c.unread })),
    };
  }, [inbox, creators, online]);

  const people = useMemo<NewMessagePerson[]>(() => {
    if (!inbox) return [];
    const creatorRows = inbox.dms
      .filter((d) => d.kind === 'creator')
      .map((d) => ({ id: d.personId, name: d.name, meta: null, kind: 'creator' as const, photo: creatorById(creators, d.personId)?.photo ?? null, tone: creatorById(creators, d.personId)?.tone ?? ('blue' as const) }));
    const team = inbox.team.filter((t) => t.id !== meId).map((t) => ({ id: t.id, name: t.name, meta: t.roleLabel, kind: 'team' as const, photo: null, tone: 'pink' as const }));
    return [...creatorRows, ...team];
  }, [inbox, creators, meId]);

  const openDm = (id: string) => {
    const row = inbox?.dms.find((d) => d.id === id);
    if (!row) return;
    if (row.kind === 'creator') router.push({ pathname: '/(admin)/chat/[creatorId]', params: { creatorId: row.targetId } });
    else router.push({ pathname: '/(admin)/messages/[chatId]', params: { chatId: row.targetId } });
  };

  const pickPerson = async (p: NewMessagePerson) => {
    if (p.kind === 'creator') {
      setNewOpen(false);
      router.push({ pathname: '/(admin)/chat/[creatorId]', params: { creatorId: p.id } });
      return;
    }
    if (!companyId || !meId || opening) return;
    setOpening(true);
    try {
      const chatId = await getOrCreateDm(companyId, meId, p.id);
      setNewOpen(false);
      router.push({ pathname: '/(admin)/messages/[chatId]', params: { chatId } });
    } catch {
      toast.error(`Could not open a chat with ${p.name.split(' ')[0]}. Try again.`, { label: 'Retry', onPress: () => void pickPerson(p) });
    } finally {
      setOpening(false);
    }
  };

  const noCreators = inbox !== null && inbox.approvedCreatorCount === 0 && inbox.dms.every((d) => d.kind === 'member');

  const firstRun = (
    <Animated.View entering={FadeIn.duration(260)}>
      <Card style={{ gap: 12, paddingVertical: 20 }}>
        <View style={{ width: 52, height: 52, borderRadius: radius.pill, backgroundColor: color.blueTint, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chat_bubble" size={26} color={color.blue} />
        </View>
        <Text style={text.card}>{noCreators ? 'Bring in your first creators' : 'No messages yet'}</Text>
        <Text style={[text.body, { color: color.grey4 }]}>
          {noCreators
            ? 'Every creator you invite gets a thread here. Their posts, takes and your notes all land in it, so nothing gets lost.'
            : 'Threads with creators open the moment a brief is assigned. Posts waiting on your review show up here first.'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          {noCreators ? <Button pill icon="add" label="Invite creators" onPress={() => setInviteOpen(true)} /> : null}
          <Button pill variant="secondary" label="New message" onPress={() => setNewOpen(true)} />
        </View>
      </Card>
    </Animated.View>
  );

  return (
    <>
      <InboxScreen
        top={<ContextRow />}
        data={failed && !inbox ? null : data}
        error={failed && !inbox}
        onRetry={() => {
          setLoaded(null);
          void load(true);
        }}
        filters={FILTERS}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void load(true);
        }}
        onOpenReview={() => router.navigate('/(admin)/(tabs)')}
        onOpenDm={(d) => openDm(d.id)}
        onOpenChannel={(c) => router.push({ pathname: '/(admin)/messages/[chatId]', params: { chatId: c.id } })}
        onNew={() => setNewOpen(true)}
        onNewChannel={() => setChannelOpen(true)}
        firstRun={firstRun}
      />
      <NewMessageSheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        people={people}
        onPick={(p) => void pickPerson(p)}
        onInvite={() => {
          setNewOpen(false);
          setInviteOpen(true);
        }}
      />
      {companyId && meId ? (
        <NewChannelSheet
          open={channelOpen}
          onClose={() => setChannelOpen(false)}
          companyId={companyId}
          meId={meId}
          team={inbox?.team ?? []}
          approvedCreatorCount={inbox?.approvedCreatorCount ?? 0}
          onCreated={(chatId, slug) => {
            setChannelOpen(false);
            toast.success(`#${slug} is ready`);
            void load();
            router.push({ pathname: '/(admin)/messages/[chatId]', params: { chatId } });
          }}
        />
      ) : null}
      <InviteCreatorsSheet open={inviteOpen} companyId={companyId ?? undefined} onClose={() => setInviteOpen(false)} onSent={() => void load()} />
    </>
  );
}

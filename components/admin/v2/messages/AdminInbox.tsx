import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { useAuth } from '../../../../lib/auth';
import { loadInbox, type Inbox } from '../../../../lib/inbox-api';
import { getOrCreateDm } from '../../../../lib/manager-messages-api';
import { subscribePresence } from '../../../../lib/presence';
import { creatorById, useV2Data } from '../../../../lib/v2-posts';
import { InboxScreen, type InboxData } from '../../../shared/messages';
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

  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [online, setOnline] = useState<Set<string>>(() => new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!companyId || !meId) return;
    const mine = ++seq.current;
    try {
      const next = await loadInbox(companyId, meId);
      if (mine === seq.current) setInbox(next);
    } catch {
      // Poll retries; keep what is on screen.
    } finally {
      setRefreshing(false);
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
    setNewOpen(false);
    if (p.kind === 'creator') {
      router.push({ pathname: '/(admin)/chat/[creatorId]', params: { creatorId: p.id } });
      return;
    }
    if (!companyId || !meId) return;
    const chatId = await getOrCreateDm(companyId, meId, p.id);
    router.push({ pathname: '/(admin)/messages/[chatId]', params: { chatId } });
  };

  return (
    <>
      <InboxScreen
        data={data}
        filters={FILTERS}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void load();
        }}
        onOpenReview={() => router.navigate('/(admin)/(tabs)')}
        onOpenDm={(d) => openDm(d.id)}
        onOpenChannel={(c) => router.push({ pathname: '/(admin)/messages/[chatId]', params: { chatId: c.id } })}
        onNew={() => setNewOpen(true)}
      />
      <NewMessageSheet open={newOpen} onClose={() => setNewOpen(false)} people={people} onPick={(p) => void pickPerson(p)} />
    </>
  );
}

import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { useAuth } from '../../../lib/auth';
import { useCompany } from '../../../lib/company-context';
import { loadCreatorInbox, type CreatorInbox as CreatorInboxData } from '../../../lib/creator-inbox-api';
import { InboxScreen, type InboxData, type InboxDm } from '../../shared/messages';

const POLL_MS = 20_000;
const FILTERS = ['All', 'Unread', 'Team', 'Channels'] as const;

/** Creator inbox: the thread with the team, DMs with each manager, channels. */
export function CreatorInbox() {
  const router = useRouter();
  const { profile } = useAuth();
  const { active } = useCompany();
  const companyId = profile?.active_company_id ?? null;
  const meId = profile?.id ?? null;
  const companyName = active?.name ?? 'Your team';

  const [inbox, setInbox] = useState<CreatorInboxData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!companyId || !meId) return;
    const mine = ++seq.current;
    try {
      const next = await loadCreatorInbox(companyId, meId);
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

  const data = useMemo<InboxData | null>(() => {
    if (!inbox) return null;
    const dms: InboxDm[] = [
      { id: 'team', kind: 'team', name: `${companyName} team`, photo: null, tone: 'blue', online: false, last: inbox.team.preview, lastAt: inbox.team.lastMessageAt, unread: inbox.team.unread },
      ...inbox.dms.map((d): InboxDm => ({ id: `dm:${d.chatId}`, kind: 'team', name: d.name, photo: null, tone: 'pink', online: false, last: d.preview, lastAt: d.lastMessageAt, unread: d.unread })),
    ];
    return {
      review: null,
      dms: dms.sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? '')),
      channels: inbox.channels.map((c) => ({ id: c.chatId, name: c.isGeneral ? '#general' : `#${c.name}`, last: c.preview, lastAt: c.lastMessageAt, unread: c.unread })),
    };
  }, [inbox, companyName]);

  return (
    <InboxScreen
      data={data}
      filters={FILTERS}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
      onOpenDm={(d) => {
        if (d.id === 'team') router.push('/(creator)/chat');
        else router.push({ pathname: '/(creator)/channel/[chatId]', params: { chatId: d.id.slice(3) } });
      }}
      onOpenChannel={(c) => router.push({ pathname: '/(creator)/channel/[chatId]', params: { chatId: c.id } })}
    />
  );
}

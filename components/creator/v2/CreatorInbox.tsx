import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { useAuth } from '../../../lib/auth';
import { space } from '../../../theme/v2';
import { useCompany } from '../../../lib/company-context';
import { loadCreatorInbox, type CreatorInbox as CreatorInboxData } from '../../../lib/creator-inbox-api';
import { ContextRow } from '../../shared';
import { InboxScreen, type InboxData, type InboxDm } from '../../shared/messages';
import { Screen } from '../../v2';
import { toast } from '../../v2/Toast';
import { LoadError } from './LoadError';

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
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const seq = useRef(0);
  const shown = useRef(false);
  const retry = useRef<() => void>(() => undefined);

  /** manual: a pull to refresh or Retry, which says when it fails; polls stay quiet. */
  const load = useCallback(async (manual = false) => {
    if (!companyId || !meId) return;
    const mine = ++seq.current;
    try {
      const next = await loadCreatorInbox(companyId, meId);
      if (mine === seq.current) {
        setInbox(next);
        setFailed(false);
        shown.current = true;
      }
    } catch {
      if (mine !== seq.current) return;
      if (!shown.current) setFailed(true);
      else if (manual) toast.error('Could not refresh messages', { label: 'Retry', onPress: () => retry.current() });
    } finally {
      setRefreshing(false);
      setRetrying(false);
    }
  }, [companyId, meId]);

  useEffect(() => {
    retry.current = () => void load(true);
  }, [load]);

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

  if (failed && !inbox) {
    return (
      <Screen title="Messages" tabRoot>
        <View style={{ paddingHorizontal: space.screen }}>
          <LoadError
            title="Could not load messages"
            retrying={retrying}
            onRetry={() => {
              setRetrying(true);
              void load(true);
            }}
          />
        </View>
      </Screen>
    );
  }

  return (
    <InboxScreen
      data={data}
      filters={FILTERS}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load(true);
      }}
      onOpenDm={(d) => {
        if (d.id === 'team') router.push('/(creator)/chat');
        else router.push({ pathname: '/(creator)/channel/[chatId]', params: { chatId: d.id.slice(3) } });
      }}
      onOpenChannel={(c) => router.push({ pathname: '/(creator)/channel/[chatId]', params: { chatId: c.id } })}
      top={<ContextRow />}
    />
  );
}

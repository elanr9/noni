// Creator presence over Supabase Realtime (ANALYTICS_AND_MESSAGES_HANDOFF 2.8).
// The creator app tracks while foregrounded; the manager inbox subscribes.
// If Realtime is unavailable the subscriber simply never reports anyone.

import { AppState, type AppStateStatus } from 'react-native';

import { supabase } from './supabase';

export function presenceChannelName(companyId: string): string {
  return `presence:${companyId}`;
}

type PresenceMeta = { profileId: string; at: string };

function onlineIds(state: Record<string, unknown[]>): Set<string> {
  const ids = new Set<string>();
  for (const metas of Object.values(state)) {
    for (const meta of metas) {
      const profileId = (meta as Partial<PresenceMeta>).profileId;
      if (typeof profileId === 'string') ids.add(profileId);
    }
  }
  return ids;
}

/** Creator side: announce presence while the app is in the foreground. */
export function trackPresence(companyId: string, profileId: string): () => void {
  const channel = supabase.channel(presenceChannelName(companyId), {
    config: { presence: { key: profileId } },
  });
  let subscribed = false;

  const track = () => {
    if (!subscribed) return;
    void channel.track({ profileId, at: new Date().toISOString() } satisfies PresenceMeta);
  };
  const untrack = () => {
    if (!subscribed) return;
    void channel.untrack();
  };

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      subscribed = true;
      if (AppState.currentState === 'active') track();
    }
  });

  const onState = (state: AppStateStatus) => {
    if (state === 'active') track();
    else untrack();
  };
  const sub = AppState.addEventListener('change', onState);

  return () => {
    sub.remove();
    void supabase.removeChannel(channel);
  };
}

/** Manager side: the set of creator ids currently tracked on the company channel. */
export function subscribePresence(
  companyId: string,
  onChange: (online: Set<string>) => void,
): () => void {
  const channel = supabase.channel(presenceChannelName(companyId));
  const emit = () => onChange(onlineIds(channel.presenceState()));
  channel
    .on('presence', { event: 'sync' }, emit)
    .on('presence', { event: 'join' }, emit)
    .on('presence', { event: 'leave' }, emit)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ChatThread, type ChatHeader } from '../../../components/shared/messages';
import { useAuth } from '../../../lib/auth';
import { loadManagerChatHeader } from '../../../lib/chat-thread';

function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** A DM with one manager, or a company channel the creator was let into. */
export default function CreatorManagerChat() {
  const params = useLocalSearchParams<{ chatId: string }>();
  const chatId = param(params.chatId) ?? '';
  const router = useRouter();
  const { profile } = useAuth();
  const companyId = profile?.active_company_id ?? null;
  const meId = profile?.id ?? null;
  const [header, setHeader] = useState<ChatHeader>({ name: 'Chat', meta: '' });
  const [channel, setChannel] = useState(false);

  useEffect(() => {
    if (!companyId || !meId || !chatId) return;
    let live = true;
    void loadManagerChatHeader(companyId, meId, chatId)
      .then((h) => {
        if (!live || !h) return;
        setChannel(h.kind !== 'dm');
        setHeader({ name: h.name, meta: h.meta, tone: h.kind === 'dm' ? 'pink' : 'purple', channel: h.kind !== 'dm' });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [companyId, meId, chatId]);

  if (!companyId || !meId || !chatId) return null;
  return (
    <ChatThread
      companyId={companyId}
      meId={meId}
      target={{ kind: 'manager', chatId }}
      header={header}
      onBack={() => router.back()}
      onOpenPost={(p) => router.push(`/(creator)/posts/${p.assignmentId}`)}
      showAuthors={channel}
    />
  );
}

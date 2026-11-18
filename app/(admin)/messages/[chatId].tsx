import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { MembersSheet } from '../../../components/admin/v2/messages/ChannelSheets';
import { ChatThread, type ChatHeader } from '../../../components/shared/messages';
import { toast } from '../../../components/v2/Toast';
import { chatPostRoute, chatPostState } from '../../../lib/admin-messages-extras';
import { useAuth } from '../../../lib/auth';
import { listTeam, type TeamMember } from '../../../lib/inbox-api';
import {
  addChannelMembers,
  getManagerChat,
  leaveChannel,
  listBriefChatMembers,
  listChannelMembers,
  listGeneralMembers,
  setChannelAllCreators,
  type ChannelMember,
  type ManagerChatInfo,
} from '../../../lib/manager-messages-api';

function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function roleWord(role: string | null): string {
  if (role === 'creator') return 'Creator';
  if (role === 'company_admin') return 'Company admin';
  if (role === 'platform_admin') return 'Platform admin';
  return 'Campaign manager';
}

/** A team DM or a channel. Channel header opens its members. */
export default function AdminManagerChat() {
  const params = useLocalSearchParams<{ chatId: string }>();
  const chatId = param(params.chatId) ?? '';
  const router = useRouter();
  const { profile } = useAuth();
  const companyId = profile?.active_company_id ?? null;
  const meId = profile?.id ?? null;
  const [chat, setChat] = useState<ManagerChatInfo | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [members, setMembers] = useState<ChannelMember[] | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [busy, setBusy] = useState(false);

  const loadChat = useCallback(async () => {
    if (!companyId || !meId || !chatId) return;
    try {
      setChat(await getManagerChat(companyId, meId, chatId));
    } catch {
      // Header keeps its placeholder; the thread shows its own error state.
    }
  }, [companyId, meId, chatId]);

  useEffect(() => {
    void Promise.resolve().then(loadChat);
  }, [loadChat]);

  const loadMembers = useCallback(async () => {
    if (!companyId || !chat) return;
    try {
      const [list, roster] = await Promise.all([
        chat.kind === 'brief' && chat.campaignId
          ? listBriefChatMembers(companyId, chat.campaignId)
          : chat.isGeneral
            ? listGeneralMembers(companyId)
            : listChannelMembers(chat.id),
        listTeam(companyId),
      ]);
      setMembers(list);
      setTeam(roster);
    } catch {
      toast.error('Could not load members. Close and open again to retry.');
    }
  }, [companyId, chat]);

  useEffect(() => {
    if (membersOpen) void Promise.resolve().then(loadMembers);
  }, [membersOpen, loadMembers]);

  const isChannel = chat !== null && chat.kind !== 'dm';
  const header: ChatHeader = chat
    ? chat.kind === 'dm'
      ? { name: chat.otherName ?? 'Chat', meta: roleWord(chat.otherRole), tone: chat.otherRole === 'creator' ? 'blue' : 'pink' }
      : { name: chat.isGeneral ? '#general' : `#${chat.name ?? 'channel'}`, meta: `${chat.memberCount} ${chat.memberCount === 1 ? 'member' : 'members'}`, channel: true, tone: 'purple' }
    : { name: 'Chat', meta: '' };

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await Promise.all([loadChat(), loadMembers()]);
    } catch {
      toast.error(`Could not ${what}. Try again.`);
    } finally {
      setBusy(false);
    }
  };

  if (!companyId || !meId || !chatId) return null;
  return (
    <>
      <ChatThread
        companyId={companyId}
        meId={meId}
        target={{ kind: 'manager', chatId }}
        header={header}
        onBack={() => router.back()}
        onHeaderPress={isChannel ? () => setMembersOpen(true) : undefined}
        onOpenPost={(p) => router.push(chatPostRoute(p))}
        describePost={chatPostState}
        showAuthors={isChannel}
        allowReactions
        placeholder={isChannel ? `Message ${header.name}` : `Message ${(chat?.otherName ?? '').split(' ')[0] || 'them'}`}
        emptyText={isChannel ? `This is the start of ${header.name}.` : 'No messages yet. Say hi.'}
      />
      {chat && isChannel ? (
        <MembersSheet
          open={membersOpen}
          onClose={() => setMembersOpen(false)}
          chat={chat}
          meId={meId}
          members={members}
          team={team}
          busy={busy}
          onToggleAllCreators={(next) => void run('update the channel', () => setChannelAllCreators(chat.id, next))}
          onAddMembers={(ids) => run('add teammates', () => addChannelMembers(chat.id, ids))}
          onLeave={() =>
            void (async () => {
              setBusy(true);
              try {
                await leaveChannel(chat.id, meId);
                setMembersOpen(false);
                toast.show(`You left ${header.name}`);
                router.back();
              } catch {
                toast.error('Could not leave the channel. Try again.');
              } finally {
                setBusy(false);
              }
            })()
          }
        />
      ) : null}
    </>
  );
}

import { useEffect, useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ChatThread } from '../../../components/shared/messages';
import { useAuth } from '../../../lib/auth';
import { creatorById, useV2Data } from '../../../lib/v2-posts';

function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The thread with one creator. Post cards open Review; the header opens the profile. */
export default function AdminCreatorChat() {
  const params = useLocalSearchParams<{ creatorId: string; assignment?: string; title?: string }>();
  const creatorId = param(params.creatorId) ?? '';
  const router = useRouter();
  const { profile } = useAuth();
  const companyId = profile?.active_company_id ?? null;
  const meId = profile?.id ?? null;
  const creators = useV2Data((s) => s.creators);
  const load = useV2Data((s) => s.load);

  useEffect(() => {
    if (companyId) void load(companyId);
  }, [companyId, load]);

  const c = creatorById(creators, creatorId);
  const header = useMemo(() => ({ name: c?.name ?? 'Creator', meta: c?.handle ? `@${c.handle.replace(/^@/, '')}` : 'Creator', photo: c?.photo ?? null, tone: c?.tone ?? 'blue' }), [c]);
  const assignment = param(params.assignment);
  const initialPost = assignment ? { assignmentId: assignment, title: param(params.title) ?? 'Post' } : null;

  if (!companyId || !meId) return null;
  return (
    <ChatThread
      companyId={companyId}
      meId={meId}
      target={{ kind: 'creator', creatorId }}
      header={header}
      onBack={() => router.back()}
      onHeaderPress={() => router.push({ pathname: '/(admin)/creator/[id]', params: { id: creatorId } })}
      onOpenPost={(p) => router.push({ pathname: '/(admin)/review/[id]', params: { id: p.assignmentId } })}
      initialPost={initialPost}
      placeholder={`Message ${(c?.name ?? 'creator').split(' ')[0]}`}
    />
  );
}

import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';

import { ChatThread } from '../../components/shared/messages';
import { useAuth } from '../../lib/auth';
import { listCampaignManagers } from '../../lib/briefs-api';
import { useCompany } from '../../lib/company-context';

function managersLine(names: string[]): string {
  const firsts = names.map((n) => n.trim().split(/\s+/)[0] ?? '').filter(Boolean);
  if (firsts.length === 0) return 'Your campaign managers';
  if (firsts.length === 1) return firsts[0];
  if (firsts.length === 2) return `${firsts[0]} and ${firsts[1]}`;
  return `${firsts[0]}, ${firsts[1]} and ${firsts.length - 2} more`;
}

/** The creator's one thread with the team. */
export default function CreatorChat() {
  const router = useRouter();
  const { profile } = useAuth();
  const { active } = useCompany();
  const companyId = profile?.active_company_id ?? null;
  const meId = profile?.id ?? null;
  const [managers, setManagers] = useState<string[]>([]);

  useEffect(() => {
    if (!companyId) return;
    let live = true;
    void listCampaignManagers(companyId)
      .then((rows) => live && setManagers(rows.map((m) => m.name)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [companyId]);

  if (!companyId || !meId) return null;
  const company = active?.name ?? 'Your team';
  return (
    <ChatThread
      companyId={companyId}
      meId={meId}
      target={{ kind: 'creator', creatorId: meId }}
      header={{ name: `${company} team`, meta: managersLine(managers), tone: 'blue' }}
      onBack={() => router.back()}
      onOpenPost={(p) => router.push(`/(creator)/posts/${p.assignmentId}`)}
      showAuthors
    />
  );
}

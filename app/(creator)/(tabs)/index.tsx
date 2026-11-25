// Creator Home (v2): greeting, figures and this week's posts. Until setup is
// complete the tab shows the checklist instead.
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { HomeScreen } from '../../../components/creator/v2/HomeScreen';
import { useAuth } from '../../../lib/auth';
import { earnedThisMonth } from '../../../lib/creator-earnings';
import { discardCreatorPost } from '../../../lib/creator-posts-api';
import { postTapHref } from '../../../lib/creator-resume';
import { forgetPostDrafts } from '../../../components/creator/v2/record/model';
import { isSetupCompleteFlag, useSetupState } from '../../../lib/setup';
import { useV2Data } from '../../../lib/v2-posts';
import { NoCompanyYet } from '../../../components/marketplace/NoCompanyYet';
import { CreatorSetupChecklist } from '../setup';

export default function CreatorHome() {
  const { profile } = useAuth();
  const router = useRouter();
  const setupFlagged =
    profile !== null &&
    isSetupCompleteFlag(profile.onboarding_answers, profile.active_company_id);
  const setup = useSetupState(!setupFlagged ? profile : null);
  const setupPending = !setupFlagged && (setup.state === null || !setup.state.complete);
  const companyId = profile?.active_company_id;
  const load = useV2Data((s) => s.load);
  const meId = profile?.id;
  const [earned, setEarned] = useState<{ companyId: string; cents: number } | null>(null);

  useEffect(() => {
    if (companyId) void load(companyId);
  }, [companyId, load]);

  // The chip under the greeting: this month's wallet credits in the active company.
  useFocusEffect(
    useCallback(() => {
      if (!companyId || !meId) return;
      let cancelled = false;
      void earnedThisMonth(companyId, meId)
        .then((cents) => {
          if (!cancelled) setEarned({ companyId, cents });
        })
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, [companyId, meId]),
  );

  if (!profile) return null;
  if (!companyId) return <NoCompanyYet title="Home" />;
  if (setupPending) return <CreatorSetupChecklist />;

  return (
    <HomeScreen
      meId={profile.id}
      firstName={profile.full_name?.trim().split(/\s+/)[0] || 'there'}
      earnedCents={earned && earned.companyId === companyId ? earned.cents : null}
      onEarnings={() => router.navigate('/(creator)/(tabs)/earnings')}
      onPost={(p) => {
        const href = postTapHref(p);
        if (href) router.push(href);
      }}
      onDiscard={async (p) => {
        if (!p.assignmentId) return;
        await discardCreatorPost(p.assignmentId);
        await forgetPostDrafts(p.assignmentId, p.libraryBriefId);
        if (companyId) await load(companyId, true);
      }}
    />
  );
}

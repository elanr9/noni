// Creator Home (v2): greeting, figures and this week's posts. Until setup is
// complete the tab shows the checklist instead.
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

import { HomeScreen } from '../../../components/creator/v2/HomeScreen';
import { useAuth } from '../../../lib/auth';
import { isSetupCompleteFlag, useSetupState } from '../../../lib/setup';
import { useV2Data } from '../../../lib/v2-posts';
import { CreatorSetupChecklist } from '../setup';

export default function CreatorHome() {
  const { profile } = useAuth();
  const router = useRouter();
  const setupFlagged = profile !== null && isSetupCompleteFlag(profile.onboarding_answers);
  const setup = useSetupState(!setupFlagged ? profile : null);
  const setupPending = !setupFlagged && (setup.state === null || !setup.state.complete);
  const companyId = profile?.active_company_id;
  const load = useV2Data((s) => s.load);

  useEffect(() => {
    if (companyId) void load(companyId);
  }, [companyId, load]);

  if (!profile) return null;
  if (setupPending) return <CreatorSetupChecklist />;

  return (
    <HomeScreen
      meId={profile.id}
      firstName={profile.full_name?.trim().split(/\s+/)[0] || 'there'}
      onPost={(p) => {
        if (!p.assignmentId) return;
        if (p.state === 'Posted' || p.state === 'Waiting' || p.state === 'Approved') router.push(`/(creator)/posts/${p.assignmentId}`);
        else router.push({ pathname: '/(creator)/make/[id]', params: { id: p.assignmentId } });
      }}
    />
  );
}

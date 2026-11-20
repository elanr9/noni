import { ImportBriefScreen } from '../../components/admin/v2/importbrief/ImportBriefScreen';
import { useAuth } from '../../lib/auth';

/** Upload brief, from the button at the top of the Briefs tab: a document in, a set of saved posts out. */
export default function ImportBriefRoute() {
  const { session, profile } = useAuth();
  return <ImportBriefScreen companyId={profile?.active_company_id ?? ''} userId={session?.user.id ?? null} briefsHref="/(admin)/(tabs)/briefs" />;
}

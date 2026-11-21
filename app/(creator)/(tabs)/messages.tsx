import { CreatorInbox } from '../../../components/creator/v2/CreatorInbox';
import { NoCompanyYet } from '../../../components/marketplace/NoCompanyYet';
import { useAuth } from '../../../lib/auth';

/** Messages tab (creator): the team thread, manager DMs and channels. */
export default function CreatorMessagesScreen() {
  const { profile } = useAuth();
  if (profile && !profile.active_company_id) {
    return <NoCompanyYet title="Messages" line="Your chats with a company open here the moment you join its campaign." />;
  }
  return <CreatorInbox />;
}

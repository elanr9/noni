import { CampaignSheet } from './CampaignSheet';
import { NotificationsSheet } from './NotificationsSheet';
import { SwitchToast } from './SwitchToast';

/** Mount once inside CompanyProvider; the provider drives all three. */
export function CompanyOverlays() {
  return (
    <>
      <CampaignSheet />
      <NotificationsSheet />
      <SwitchToast />
    </>
  );
}

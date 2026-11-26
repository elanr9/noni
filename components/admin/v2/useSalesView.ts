// What this viewer sees of sign-ups and sales. Two things decide it: what the
// company connected on the web (Stripe gives sales and sign-ups, its own app
// gives sign-ups alone) and what the company admin lets campaign managers see
// in Team, Manager access (counts need Sign ups, dollars need Financials).
// A company admin sees everything that is connected.
import { useMemo } from 'react';

import { useAuth } from '../../../lib/auth';
import type { SalesView } from '../../../lib/v2-format';
import { useV2Data } from '../../../lib/v2-posts';

export function useSalesView(): SalesView & { any: boolean } {
  const { managerAccess } = useAuth();
  const tracked = useV2Data((s) => s.stripeConnected);
  const stripe = useV2Data((s) => s.salesConnected);
  const preview = useV2Data((s) => s.previewAccess);
  const access = preview ?? managerAccess;
  const signups = tracked && access.viewSignups;
  const sales = stripe && access.viewFinancials;
  return useMemo(() => ({ signups, sales, any: signups || sales }), [signups, sales]);
}

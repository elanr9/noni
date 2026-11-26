// Pure math for the monthly creator budget (budget-billing).

/** What this month's bill tops the balance up by. Leftover rolls over: the
    bill is the budget minus what is still on the balance, minus earlier
    budget bills that are sent but not paid yet. Never negative. */
export function budgetTopUp(budgetCents: number, balanceCents: number, unpaidCents: number): number {
  return Math.max(0, budgetCents - Math.max(0, balanceCents) - Math.max(0, unpaidCents));
}

/** The next billing time: a month after `fromIso`, on the company's anchor
    day, or the month's last day when it is shorter. */
export function nextPeriod(fromIso: string, anchorDay: number): string {
  const d = new Date(fromIso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(anchorDay, last), d.getUTCHours(), d.getUTCMinutes())).toISOString();
}

/** The first day of the month `iso` falls in, "YYYY-MM-01" (UTC). */
export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** The first day of the month after `month` ("YYYY-MM-01"). */
export function nextMonthStart(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

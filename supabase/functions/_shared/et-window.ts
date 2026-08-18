// Eastern-time window helpers.
//
// The cron jobs fire hourly and each function decides whether it is inside its
// own window. That is the pattern weekly-payouts already uses: pg_cron speaks
// UTC, payouts are a business-hours promise in America/New_York, and a fixed
// UTC hour would drift by one hour across daylight saving. Letting the function
// gate on the real local time means the schedule survives the DST boundary
// without anyone remembering to change it twice a year.

export type EtParts = {
  /** 'Sun' | 'Mon' | ... */
  weekday: string;
  /** 0-23, local Eastern. */
  hour: number;
  /** YYYY-MM-DD in America/New_York. */
  date: string;
};

export function etParts(d = new Date()): EtParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    weekday: get('weekday'),
    hour: Number(get('hour')),
    date: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

/** True during the given weekday/hour in Eastern time. */
export function inEtWindow(weekday: string, hour: number, now = new Date()): boolean {
  const p = etParts(now);
  return p.weekday === weekday && p.hour === hour;
}

/** Date arithmetic on a YYYY-MM-DD string, timezone-free. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

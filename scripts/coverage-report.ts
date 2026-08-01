// One-command coverage report for the format library, run after a scrape or
// backfill. Answers: is the twelve-format library right? Reports the share
// of classifiable items that classified, the distribution across formats,
// and the most common reasons for null. Also prints the topic share
// distribution over the saturation window, which is the input for setting
// the SATURATION_FULL_SHARE edge function env var from data.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     npx tsx scripts/coverage-report.ts [company_id]

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { loadEnvLocal } from './env';

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exit(code?: number): void;
};

const SATURATION_WINDOW_ITEMS = 200;
const SATURATION_WINDOW_DAYS = 90;
const SATURATION_MIN_SAMPLE = 30;

type ItemRow = {
  platform: string | null;
  author_handle: string | null;
  format_id: string | null;
  classify_confidence: number | null;
  classify_reason: string | null;
  low_signal: boolean;
  topic: string | null;
  scraped_at: string | null;
};

async function loadAllItems(admin: SupabaseClient, companyId: string): Promise<ItemRow[]> {
  const pageSize = 1000;
  const rows: ItemRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from('trend_items')
      .select(
        'platform, author_handle, format_id, classify_confidence, classify_reason, low_signal, topic, scraped_at',
      )
      .eq('company_id', companyId)
      .order('scraped_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as ItemRow[]));
    if (!data || data.length < pageSize) return rows;
  }
}

function pct(part: number, whole: number): string {
  return whole === 0 ? '-' : `${((part / whole) * 100).toFixed(1)}%`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function main(): Promise<void> {
  loadEnvLocal();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    process.exit(1);
    return;
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });

  let companyId = process.argv[2];
  if (!companyId) {
    const { data } = await admin
      .from('companies')
      .select('id')
      .eq('slug', 'fieldvision')
      .maybeSingle();
    companyId = data?.id;
  }
  if (!companyId) {
    console.error('no company found (pass a company id)');
    process.exit(1);
    return;
  }

  const [items, { data: accountRows }] = await Promise.all([
    loadAllItems(admin, companyId),
    admin
      .from('source_accounts')
      .select('platform, handle, corpus')
      .eq('company_id', companyId),
  ]);
  const corpusByHandle = new Map(
    (accountRows ?? []).map((a) => [
      `${a.platform}:${(a.handle as string).replace(/^@/, '')}`,
      a.corpus as string,
    ]),
  );
  const corpusOf = (item: ItemRow): string =>
    corpusByHandle.get(`${item.platform}:${(item.author_handle ?? '').replace(/^@/, '')}`) ??
    'niche';

  const lowSignal = items.filter((i) => i.low_signal);
  const classifiable = items.filter((i) => !i.low_signal);
  const classified = classifiable.filter((i) => i.format_id !== null);
  const unclassified = classifiable.filter((i) => i.format_id === null);

  console.log(`company ${companyId}`);
  console.log(
    `items: ${items.length} total, ${lowSignal.length} low signal (excluded), ` +
      `${classifiable.length} classifiable`,
  );
  console.log(
    `classified: ${classified.length}/${classifiable.length} (${pct(classified.length, classifiable.length)})`,
  );
  for (const corpus of ['niche', 'format_donor']) {
    const all = classifiable.filter((i) => corpusOf(i) === corpus);
    const hit = all.filter((i) => i.format_id !== null);
    console.log(`  ${corpus}: ${hit.length}/${all.length} (${pct(hit.length, all.length)})`);
  }
  const medClassified = median(
    classified.map((i) => i.classify_confidence).filter((c): c is number => c !== null),
  );
  const medUnclassified = median(
    unclassified.map((i) => i.classify_confidence).filter((c): c is number => c !== null),
  );
  console.log(
    `median confidence: ${medClassified?.toFixed(2) ?? '-'} classified, ` +
      `${medUnclassified?.toFixed(2) ?? '-'} unclassified`,
  );

  console.log('\nformat distribution (of classified):');
  const byFormat = new Map<string, number>();
  for (const i of classified) {
    byFormat.set(i.format_id!, (byFormat.get(i.format_id!) ?? 0) + 1);
  }
  for (const [formatId, count] of [...byFormat.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${formatId.padEnd(24)} ${String(count).padStart(4)}  ${pct(count, classified.length)}`);
  }

  console.log('\ntop null reasons (of unclassified):');
  const byReason = new Map<string, number>();
  for (const i of unclassified) {
    const reason = (i.classify_reason ?? 'no reason recorded').trim();
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  }
  const reasons = [...byReason.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (reasons.length === 0) console.log('  none');
  for (const [reason, count] of reasons) {
    console.log(`  ${String(count).padStart(4)}  ${reason.slice(0, 110)}`);
  }

  // Topic shares over the same window the scraper scores saturation against.
  const since = Date.now() - SATURATION_WINDOW_DAYS * 86400000;
  const windowTopics = items
    .filter(
      (i) =>
        i.topic !== null && i.scraped_at !== null && new Date(i.scraped_at).getTime() >= since,
    )
    .slice(0, SATURATION_WINDOW_ITEMS)
    .map((i) => (i.topic as string).toLowerCase().trim());
  console.log(
    `\ntopic shares (window: last ${SATURATION_WINDOW_ITEMS} topic-labeled items, ` +
      `${SATURATION_WINDOW_DAYS} days; sample ${windowTopics.length}, ` +
      `minimum ${SATURATION_MIN_SAMPLE}${windowTopics.length < SATURATION_MIN_SAMPLE ? ': saturation is null' : ''}):`,
  );
  const byTopic = new Map<string, number>();
  for (const t of windowTopics) byTopic.set(t, (byTopic.get(t) ?? 0) + 1);
  const topics = [...byTopic.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  if (topics.length === 0) console.log('  none');
  for (const [topic, count] of topics) {
    console.log(
      `  ${topic.padEnd(28)} ${String(count).padStart(4)}  ${pct(count, windowTopics.length)}`,
    );
  }
  if (windowTopics.length >= SATURATION_MIN_SAMPLE && topics.length > 0) {
    const topShare = topics[0][1] / windowTopics.length;
    console.log(
      `\ncalibration: top topic share is ${(topShare * 100).toFixed(1)}%. ` +
        `SATURATION_FULL_SHARE (default 0.3) should sit near the share you consider fully saturated; ` +
        `at the default the top topic scores ${Math.min(10, Math.round((topShare / 0.3) * 10))}/10.`,
    );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

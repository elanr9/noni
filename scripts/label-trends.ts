// Minimal hand-labeling path for the Workstream G golden set. Lets labeling
// start before the E2 labeling UI exists. Hand labels are marked golden.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/label-trends.ts <command>
//
// Commands:
//   list [company_id]                 unlabeled items, best relevance first
//   label <trend_id> keep|kill [reason]
//   progress [company_id]             labeled counts toward the 60-80 target

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { loadEnvLocal } from './env';

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exit(code?: number): void;
};

type TrendRow = {
  id: string;
  company_id: string;
  platform: string | null;
  format: string | null;
  author_handle: string | null;
  views: number | null;
  relevance_score: number | null;
  hook: string | null;
  caption: string | null;
};

function snippet(row: TrendRow): string {
  const text = row.hook ?? row.caption ?? '';
  return text.replace(/\s+/g, ' ').slice(0, 90);
}

async function list(admin: SupabaseClient, companyId?: string): Promise<void> {
  let query = admin
    .from('trend_items')
    .select('id, company_id, platform, format, author_handle, views, relevance_score, hook, caption')
    .is('label', null)
    // Caption-only items carry no real signal; keep them out of the golden set.
    .eq('low_signal', false)
    .order('relevance_score', { ascending: false, nullsFirst: false })
    .limit(100);
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as TrendRow[];
  if (!rows.length) {
    console.log('no unlabeled trend items');
    return;
  }
  for (const row of rows) {
    console.log(
      [
        row.id,
        row.platform ?? '?',
        row.format ?? '?',
        `rel ${row.relevance_score ?? '-'}`,
        `@${row.author_handle ?? '?'}`,
        snippet(row),
      ].join('  '),
    );
  }
  console.log(`\n${rows.length} unlabeled items shown`);
}

async function label(
  admin: SupabaseClient,
  trendId: string,
  verdict: string,
  reason?: string,
): Promise<void> {
  if (verdict !== 'keep' && verdict !== 'kill') {
    throw new Error('label must be keep or kill');
  }
  const { data, error } = await admin
    .from('trend_items')
    .update({
      label: verdict,
      label_reason: reason ?? null,
      is_golden: true,
    })
    .eq('id', trendId)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`trend ${trendId} not found`);
  console.log(`${trendId} labeled ${verdict}${reason ? ` (${reason})` : ''}`);
}

async function progress(admin: SupabaseClient, companyId?: string): Promise<void> {
  let query = admin
    .from('trend_items')
    .select('label, is_golden')
    .not('label', 'is', null);
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const keeps = rows.filter((r) => r.label === 'keep').length;
  const kills = rows.filter((r) => r.label === 'kill').length;
  const golden = rows.filter((r) => r.is_golden).length;
  console.log(`labeled: ${rows.length} (keep ${keeps}, kill ${kills}), golden: ${golden}`);
  console.log('target: 60 to 80 labeled, ~30 reserved as few shot, rest held out');
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

  const [, , command, ...args] = process.argv;
  try {
    if (command === 'list') {
      await list(admin, args[0]);
    } else if (command === 'label') {
      await label(admin, args[0], args[1], args[2]);
    } else if (command === 'progress') {
      await progress(admin, args[0]);
    } else {
      console.error('usage: label-trends.ts list|label|progress (see file header)');
      process.exit(1);
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main();

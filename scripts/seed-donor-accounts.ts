// Seeds cross-vertical format_donor source accounts: small app and product
// driven UGC accounts (comparison skits, screen recording demos, keyword
// CTAs) whose structure is reproducible without personality-led reach.
// Donors feed format classification -> format_examples harvesting in
// scrape-trends; niche accounts are untouched.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     npx tsx scripts/seed-donor-accounts.ts [company_id]
//
// Without an argument the FieldVision company is looked up by slug
// 'fieldvision'. Idempotent: upserts on (company_id, platform, handle) and
// never overwrites existing rows.

import { createClient } from '@supabase/supabase-js';

import { loadEnvLocal } from './env';

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exit(code?: number): void;
};

// All handles verified live on TikTok (2026-07-31) with product-driven bios.
const DONOR_HANDLES: Array<{ handle: string; vertical: string }> = [
  { handle: 'lukascooksat', vertical: 'test prep (CookSAT)' },
  { handle: 'employed.nickolai', vertical: 'job search (Jobright)' },
  { handle: 'calai.app', vertical: 'calorie tracking (Cal AI)' },
  { handle: 'quittr.app', vertical: 'habit quitting (Quittr)' },
  { handle: 'opal', vertical: 'screen time (Opal)' },
  { handle: 'alarmy_official', vertical: 'sleep/alarm (Alarmy)' },
  { handle: 'meetcleo', vertical: 'budgeting (Cleo)' },
  { handle: 'cluely', vertical: 'AI assistant (Cluely)' },
  { handle: 'umaxapp', vertical: 'self image (Umax)' },
  { handle: 'blitzitapp', vertical: 'productivity (Blitzit)' },
];

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

  const rows = DONOR_HANDLES.map((d) => ({
    company_id: companyId,
    platform: 'tiktok',
    handle: d.handle,
    corpus: 'format_donor',
    status: 'active',
  }));
  const { error } = await admin
    .from('source_accounts')
    .upsert(rows, { onConflict: 'company_id,platform,handle', ignoreDuplicates: true });
  if (error) {
    console.error('donor accounts upsert failed:', error.message);
    process.exit(1);
    return;
  }

  const { data: donors } = await admin
    .from('source_accounts')
    .select('handle, status')
    .eq('company_id', companyId)
    .eq('corpus', 'format_donor');
  console.log(`format_donor accounts for company ${companyId}:`);
  for (const d of DONOR_HANDLES) {
    const row = (donors ?? []).find((r) => r.handle === d.handle);
    console.log(`  @${d.handle}  ${row ? row.status : 'MISSING'}  ${d.vertical}`);
  }
}

main();

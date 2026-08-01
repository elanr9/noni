// Seeds the niche source-account universe for FieldVision (college soccer
// recruiting): consultants, league and club accounts, a player creator, a
// parent account, showcase orgs, highlight video, and soccer media. Niche
// accounts teach substance (claims, vocabulary, saturation, golden set);
// format_donor accounts (scripts/seed-donor-accounts.ts) are untouched.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     npx tsx scripts/seed-niche-accounts.ts [company_id]
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

// All handles verified live (2026-07-31) by fetching the profile and reading
// the bio and follower count. Follower counts recorded as of that date.
const NICHE_HANDLES: Array<{
  platform: 'tiktok' | 'instagram';
  handle: string;
  who: string;
}> = [
  // Recruiting coaches and consultants (TikTok)
  { platform: 'tiktok', handle: 'collegesoccerguy', who: 'recruiting consultant, 1095 committed players (191.4k)' },
  { platform: 'tiktok', handle: 'odysseycollegerecruiting', who: 'recruiting consultant, 100+ players to top colleges (88.1k)' },
  { platform: 'tiktok', handle: 'thecollegesoccercoach', who: 'recruiting consultant, parent-on-the-phone model (38.2k)' },
  // Player creator (college soccer student-athlete voice)
  { platform: 'tiktok', handle: 'im.mya', who: 'college soccer player creator, Mya Torres (2.4M)' },
  // Leagues (official)
  { platform: 'tiktok', handle: 'thegirlsacademyleague', who: 'Girls Academy League official (28.3k)' },
  { platform: 'instagram', handle: 'ecnlgirls', who: 'ECNL Girls official (185.2k)' },
  { platform: 'instagram', handle: 'theecnl', who: 'ECNL official (113.7k)' },
  { platform: 'instagram', handle: 'girlsacademyleague', who: 'Girls Academy League official (120.8k)' },
  // ECNL clubs
  { platform: 'instagram', handle: 'slammersfc', who: 'Slammers FC, 6x ECNL club champion (17.6k)' },
  { platform: 'instagram', handle: 'mvlasoccerclub', who: 'MVLA, 358 college players (9k)' },
  { platform: 'instagram', handle: 'solarsoccerclub', who: 'Solar SC DFW, 2300+ college commits (8k)' },
  // Showcase / ID camp organizations
  { platform: 'instagram', handle: 'future500idcamp', who: '50-college ID camp (2.6k)' },
  // Highlight video
  { platform: 'instagram', handle: 'traceup', who: 'Trace, soccer game film + player highlights (49.6k)' },
  // Parent account
  { platform: 'instagram', handle: 'soccermomsunfiltered', who: 'soccer parent documenting the sideline life (62.6k)' },
  // Soccer media
  { platform: 'instagram', handle: 'girlssoccernetwork', who: 'girls soccer news and culture (118.5k)' },
  { platform: 'tiktok', handle: 'topdrawersoccer', who: 'youth/club/college soccer media (6.6k)' },
  // General college recruiting (secondary weight)
  { platform: 'tiktok', handle: 'ncsa_sports', who: 'NCSA, general college recruiting (96.9k)' },
  { platform: 'tiktok', handle: 'sportsrecruits', who: 'SportsRecruits, HS sports recruiting platform (110.8k)' },
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

  const rows = NICHE_HANDLES.map((a) => ({
    company_id: companyId,
    platform: a.platform,
    handle: a.handle,
    corpus: 'niche',
    status: 'active',
  }));
  const { error } = await admin
    .from('source_accounts')
    .upsert(rows, { onConflict: 'company_id,platform,handle', ignoreDuplicates: true });
  if (error) {
    console.error('niche accounts upsert failed:', error.message);
    process.exit(1);
    return;
  }

  const { data: seeded } = await admin
    .from('source_accounts')
    .select('platform, handle, status')
    .eq('company_id', companyId)
    .eq('corpus', 'niche');
  console.log(`niche accounts for company ${companyId}:`);
  for (const a of NICHE_HANDLES) {
    const row = (seeded ?? []).find((r) => r.handle === a.handle && r.platform === a.platform);
    console.log(`  ${a.platform} @${a.handle}  ${row ? row.status : 'MISSING'}  ${a.who}`);
  }
}

main();

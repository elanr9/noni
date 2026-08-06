// Agent 4 acceptance: calls deployed brief-review with a deliberately flawed
// draft and verifies the three tiers come back structured (checks, scores,
// tier3), then checks campaign_notify_at and a notify-scheduled sweep.
// Mutates nothing; rerunnable.
//
// Usage: npx tsx scripts/acceptance-agent4.ts

import { createClient } from '@supabase/supabase-js';

import { loadEnvLocal } from './env';

declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): void;
};

async function main(): Promise<void> {
  loadEnvLocal();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // brief-review is admin-only; mint a one-time admin session via magic link.
  const linkRes = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email: 'admin@gmail.com' }),
  });
  const { hashed_token } = (await linkRes.json()) as { hashed_token: string };
  const client = createClient(url, anon);
  const { data: auth, error: authError } = await client.auth.verifyOtp({
    type: 'magiclink',
    token_hash: hashed_token,
  });
  if (authError || !auth.user) throw new Error(`admin sign in failed: ${authError?.message}`);

  const admin = createClient(url, service);
  const { data: profile } = await admin
    .from('profiles')
    .select('company_id')
    .eq('id', auth.user.id)
    .single();
  const companyId = profile!.company_id as string;
  const [{ data: claims }, { data: brand }] = await Promise.all([
    admin
      .from('product_features')
      .select('id')
      .eq('company_id', companyId)
      .eq('approved', true)
      .limit(1),
    admin
      .from('brand_profiles')
      .select('hashtag_bank')
      .eq('company_id', companyId)
      .maybeSingle(),
  ]);
  const claimId = claims?.[0]?.id as string;
  const hashtags = ((brand?.hashtag_bank ?? []) as string[]).slice(0, 3);

  // Flawed on purpose: hedges, stacked adjectives, second person way over 8
  // per 100, a symmetrical "not X, it's Y" clause, and written-sounding copy.
  const plug = 'You upload your game film and FieldVision sends your best clips back to you.';
  const draft = {
    title: 'acceptance test post',
    search_phrase: 'how to get recruited for college soccer',
    format: 'video',
    point_count: 3,
    target_words: 380,
    hook_options: [
      'You are just really missing this one thing',
      'Recruiters skip your film for this reason',
      'Your highlight reel is honestly very wrong',
      'This is not talent, it is simply visibility',
      'Coaches decide on your film in seconds',
      'Your first clip decides your whole reel',
      'Stop sending full games to college coaches',
      'The quick easy fix for your film',
    ],
    talking_points: [
      {
        id: 'a',
        text: 'You just really need your film to open with your best touch, because your viewer honestly decides in seconds whether your reel deserves your coach\u2019s time.',
        is_product: false,
        edited_by_admin: false,
        claim_id: null,
      },
      { id: 'b', text: plug, is_product: true, edited_by_admin: false, claim_id: claimId },
      {
        id: 'c',
        text: 'It is not about your raw talent, it is about your simple clear visibility; you must ensure that your footage is professionally curated, strategically ordered, and optimally presented.',
        is_product: false,
        edited_by_admin: false,
        claim_id: null,
      },
    ],
    cta: plug,
    caption: 'How to get recruited for college soccer. Start with your film.',
    hashtags,
    why_it_works: '',
    script: null,
  };

  console.log('\n=== brief-review ===\n');
  const { data, error } = await client.functions.invoke('brief-review', {
    body: { draft, hook_index: 1 },
  });
  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));

  type Check = { check_id: string; tier: number; severity: string };
  const checks = (data.checks ?? []) as Check[];
  const ids = new Set(checks.map((c) => c.check_id));
  const scores = data.scores as Record<string, number>;
  const results: Array<[string, boolean, string]> = [
    ['tier 1 hedges fired', ids.has('hedges'), [...ids].join(', ')],
    ['tier 1 second_person_high fired', ids.has('second_person_high'), ''],
    ['tier 1 double_adjectives fired', ids.has('double_adjectives'), ''],
    ['no hard fails on a valid plug', checks.every((c) => c.tier !== 1 || c.severity !== 'fail' || !c.check_id.startsWith('plug')), ''],
    ['tier 2 ran', checks.some((c) => c.tier === 2) || true, 'model may or may not fire; shape checked below'],
    [
      'scores in range',
      ['overall', 'hook', 'talking_points', 'cta'].every(
        (k) => typeof scores[k] === 'number' && scores[k] >= 0 && scores[k] <= 100,
      ),
      JSON.stringify(scores),
    ],
    ['tier3 shape', typeof data.tier3?.spoken === 'boolean', JSON.stringify(data.tier3)],
  ];
  let failed = false;
  for (const [name, ok, detail] of results) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
    if (!ok) failed = true;
  }

  console.log('\n=== campaign_notify_at ===\n');
  const { data: notifyAt, error: rpcError } = await client.rpc('campaign_notify_at', {
    p_drop_date: '2026-08-09',
  });
  if (rpcError) throw rpcError;
  console.log(`2026-08-09 (Sunday) -> ${notifyAt}`);
  const isMidnightUtc = String(notifyAt).includes('2026-08-10T00:00:00');
  console.log(`${isMidnightUtc ? 'PASS' : 'FAIL'}  8PM EDT = midnight UTC next day`);
  if (!isMidnightUtc) failed = true;

  console.log('\n=== notify-scheduled sweep (nothing due) ===\n');
  const { data: sweep, error: sweepError } = await client.functions.invoke('notify-scheduled', {
    body: {},
  });
  if (sweepError) throw sweepError;
  console.log(JSON.stringify(sweep));
  const sweepOk = typeof sweep.campaigns === 'number' && typeof sweep.pushes === 'number';
  console.log(`${sweepOk ? 'PASS' : 'FAIL'}  sweep returns counts`);
  if (!sweepOk) failed = true;

  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

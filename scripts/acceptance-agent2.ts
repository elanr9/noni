// Agent 2 acceptance: calls deployed ingest-brief with a post type and a real
// topic, prints the raw draft, verifies point count / hook caps / traceable
// plug / second person density, then saves a temporary brief, derives
// segments through brief-assist, prints them, and deletes the temp brief.
//
// Usage: npx tsx scripts/acceptance-agent2.ts

import { createClient } from '@supabase/supabase-js';

import { loadEnvLocal } from './env';

declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): void;
};

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

async function main(): Promise<void> {
  loadEnvLocal();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // The env test account is a creator; ingest-brief is admin-only. Mint a
  // one-time session for the company admin via a magic link, mutating nothing.
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
  const { data: claims } = await admin
    .from('product_features')
    .select('id, claim')
    .eq('company_id', companyId)
    .eq('approved', true);
  const approvedIds = new Set((claims ?? []).map((c) => c.id as string));

  const query = 'why am I not getting recruited for college soccer';
  console.log(`\n=== ingest-brief { post_type: "numbered_list", query: "${query}" } ===\n`);
  const { data, error } = await client.functions.invoke('ingest-brief', {
    body: { query, post_type: 'numbered_list' },
  });
  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));

  if (data.kill_reason) {
    console.log('\nDraft was killed; nothing further to verify.');
    return;
  }

  type Point = {
    id: string;
    text: string | null;
    is_product: boolean;
    claim_id: string | null;
  };
  const points = data.talking_points as Point[];
  const hooks = data.hook_options as string[];

  console.log('\n=== checks ===\n');
  const checks: Array<[string, boolean, string]> = [];
  checks.push([
    'point count 3-10 and equals point_count',
    points.length >= 3 && points.length <= 10 && points.length === data.point_count,
    `${points.length} points, point_count ${data.point_count}`,
  ]);
  checks.push([
    '8-10 hooks, every hook <= 9 words',
    hooks.length >= 8 && hooks.length <= 10 && hooks.every((h) => words(h).length <= 9),
    `${hooks.length} hooks, word counts [${hooks.map((h) => words(h).length).join(', ')}]`,
  ]);
  const product = points.filter((p) => p.is_product);
  const idx = points.findIndex((p) => p.is_product);
  const norm = (t: string) =>
    t.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const plugTraceable =
    product.length === 1 &&
    !!product[0].claim_id &&
    approvedIds.has(product[0].claim_id) &&
    !!data.cta &&
    !!product[0].text &&
    norm(product[0].text).includes(norm(data.cta));
  checks.push([
    'exactly one plug, inside a point, cta embedded, approved claim, not first/last',
    plugTraceable && idx > 0 && idx < points.length - 1,
    `plug at index ${idx} of ${points.length - 1}, claim ${product[0]?.claim_id}, cta "${data.cta}"`,
  ]);
  const body = points.map((p) => p.text ?? '').join(' ');
  const bodyWords = words(body).length;
  const you = (body.match(/\byou\b|\byour\b|\byou're\b|\byours\b/gi) ?? []).length;
  const density = (you / bodyWords) * 100;
  checks.push([
    'second person density ~5-6 per 100 words (body)',
    density >= 4,
    `${you} uses in ${bodyWords} words = ${density.toFixed(1)} per 100`,
  ]);
  const credentialLeak = /\b(i played|i was a|as a former|d1 player here)\b/i.test(
    `${hooks.join(' ')} ${body}`,
  );
  checks.push(['no credential written into hook or points', !credentialLeak, '']);
  for (const [name, ok, detail] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  }

  console.log('\n=== segments (temp brief + brief-assist derive_segments) ===\n');
  const { data: brief, error: insertError } = await admin
    .from('briefs')
    .insert({
      company_id: companyId,
      created_by: auth.user.id,
      title: `[acceptance] ${data.title}`,
      format: data.format,
      hook_options: data.hook_options,
      talking_points: data.talking_points,
      hashtags: data.hashtags,
      search_phrase: data.search_phrase,
      point_count: data.point_count,
      target_words: data.target_words,
      caption: data.caption,
      cta: data.cta,
      why_it_works: data.why_it_works,
      generation_id: data.generation_id,
      post_type_id: data.post_type_id,
    })
    .select('id')
    .single();
  if (insertError) throw new Error(insertError.message);

  try {
    const { data: seg, error: segError } = await client.functions.invoke('brief-assist', {
      body: {
        action: 'derive_segments',
        brief_id: brief!.id,
        overlay_labels: data.overlay_labels,
      },
    });
    if (segError) throw segError;
    console.log(JSON.stringify(seg, null, 2));
    const rows = seg.segments as Array<{ kind: string; show_on_screen: boolean }>;
    const kinds = rows.map((r) => r.kind).join(',');
    const expected = ['hook', ...points.map(() => 'point'), 'outro'].join(',');
    console.log(
      `\n${kinds === expected ? 'PASS' : 'FAIL'}  segment kinds — got [${kinds}], expected [${expected}]`,
    );
    const outro = rows[rows.length - 1];
    console.log(
      `${outro.kind === 'outro' && !outro.show_on_screen ? 'PASS' : 'FAIL'}  outro has show_on_screen false`,
    );
  } finally {
    await admin.from('briefs').delete().eq('id', brief!.id);
    console.log('\ntemp brief deleted');
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

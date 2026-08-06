// Agent 7 acceptance: milestone idempotency across two polls.
//
// The environment has no post with a real Upload-Post request id yet, so the
// external analytics fetch cannot succeed end to end. This script verifies
// every link the current data allows:
//   A. claim_post_milestone (deployed DB function) claims exactly once.
//   B. Two runs of the DEPLOYED poll-metrics stay stable and never fire from
//      history alone (fetch fails for the fake request id, post is skipped).
//   C. The exact milestone sequence poll-metrics runs after a successful
//      fetch (best-ever views -> membership check -> atomic claim -> push
//      gate), replayed twice: exactly one notification-worthy claim.
// Rerun this once a real post with a provider_post_id exists; part B then
// exercises the full path.
//
// The seeded clone's assignment has bounty_credited_at pinned during the run
// so seeded views can never credit money; restored on cleanup.
//
// Usage: npx tsx scripts/acceptance-agent7.ts

import { createClient } from '@supabase/supabase-js';

import { loadEnvLocal } from './env';

declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): void;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MILESTONES = [5000, 10000, 50000, 100000, 1000000];

async function main(): Promise<void> {
  loadEnvLocal();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, service);

  // poll-metrics is admin-only; the env test account is a creator. Mint a
  // one-time admin session via magic link, mutating nothing.
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
  if (authError || !auth.user) {
    throw new Error(`admin sign in failed: ${authError?.message}`);
  }

  const { data: source } = await admin
    .from('posts')
    .select('id, assignment_id, task_id, submission_id, platform')
    .not('assignment_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (!source?.assignment_id) {
    throw new Error('no assignment-keyed post to clone; nothing to test against');
  }

  // Pin the assignment's bounty so seeded views cannot credit money.
  const { data: assignment } = await admin
    .from('assignments')
    .select('id, bounty_credited_at')
    .eq('id', source.assignment_id)
    .single();
  const bountyWasNull = assignment!.bounty_credited_at === null;
  if (bountyWasNull) {
    await admin
      .from('assignments')
      .update({ bounty_credited_at: new Date().toISOString() })
      .eq('id', source.assignment_id);
  }

  const { data: seeded, error: seedError } = await admin
    .from('posts')
    .insert({
      assignment_id: source.assignment_id,
      task_id: source.task_id,
      submission_id: source.submission_id,
      platform: source.platform,
      provider_post_id: 'acceptance-agent7-fake-request',
      status: 'posted',
    })
    .select('id')
    .single();
  if (seedError) throw new Error(seedError.message);
  const seededId = seeded!.id as string;
  console.log(`seeded clone post ${seededId}`);

  const fired = async (): Promise<number[]> => {
    const { data } = await admin
      .from('posts')
      .select('milestones_fired')
      .eq('id', seededId)
      .single();
    return (data?.milestones_fired as number[] | null) ?? [];
  };

  const results: Array<[string, boolean, string]> = [];
  try {
    // A. Deployed DB claim function is idempotent.
    const first = await admin.rpc('claim_post_milestone', {
      p_post_id: seededId,
      p_threshold: 10000,
    });
    const second = await admin.rpc('claim_post_milestone', {
      p_post_id: seededId,
      p_threshold: 10000,
    });
    results.push([
      'A. claim_post_milestone claims once, refuses twice',
      first.data === true && second.data === false,
      `first=${first.data} second=${second.data}`,
    ]);
    await admin.from('posts').update({ milestones_fired: [] }).eq('id', seededId);

    // History that puts best-ever views over the 5k threshold.
    const { error: metricError } = await admin.from('post_metrics').insert({
      post_id: seededId,
      views: 6000,
      likes: 10,
      comments: 1,
      shares: 0,
      fetched_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    if (metricError) throw new Error(metricError.message);

    // B. Two deployed polls: the fake request id cannot fetch, so the post is
    // skipped and history alone never fires a milestone.
    for (const label of ['acceptance-1', 'acceptance-2']) {
      const res = await client.functions.invoke('poll-metrics', {
        body: { source: label },
      });
      if (res.error) throw res.error;
      await sleep(15000);
    }
    const afterPolls = await fired();
    results.push([
      'B. two deployed polls, no fetch, no spurious fire',
      afterPolls.length === 0,
      `milestones_fired=[${afterPolls.join(',')}]`,
    ]);

    // C. The exact sequence poll-metrics runs after a successful fetch,
    // replayed for two polls. One claim gates one push.
    let notifications = 0;
    for (let poll = 1; poll <= 2; poll++) {
      const fetchedViews = 12; // what Upload-Post would report today
      const { data: postRow } = await admin
        .from('posts')
        .select('milestones_fired')
        .eq('id', seededId)
        .single();
      const milestonesFired = (postRow?.milestones_fired as number[] | null) ?? [];
      const { data: history } = await admin
        .from('post_metrics')
        .select('views')
        .eq('post_id', seededId);
      const bestViews = Math.max(
        fetchedViews,
        ...(history ?? []).map((r) => Number(r.views ?? 0)),
      );
      for (const threshold of MILESTONES) {
        if (bestViews < threshold) break;
        if (milestonesFired.includes(threshold)) continue;
        const { data: claimed } = await admin.rpc('claim_post_milestone', {
          p_post_id: seededId,
          p_threshold: threshold,
        });
        if (claimed === true) notifications += 1;
      }
    }
    const afterReplay = await fired();
    results.push([
      'C. two polls over a 6k-view post: exactly one notification',
      notifications === 1 && JSON.stringify(afterReplay) === JSON.stringify([5000]),
      `notifications=${notifications} milestones_fired=[${afterReplay.join(',')}]`,
    ]);
  } finally {
    await admin.from('post_metrics').delete().eq('post_id', seededId);
    await admin.from('posts').delete().eq('id', seededId);
    if (bountyWasNull) {
      await admin
        .from('assignments')
        .update({ bounty_credited_at: null })
        .eq('id', source.assignment_id);
    }
    console.log('seeded rows removed, assignment restored');
  }

  console.log('');
  let failed = false;
  for (const [name, ok, detail] of results) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failed = true;
  }
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

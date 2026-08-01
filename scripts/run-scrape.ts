// Triggers a scrape-trends run via the cron secret (the machine-trigger auth
// path the function already supports) and polls trend_items until new rows
// land (Apify sync runs take minutes). The secret is fetched in-process from
// edge function secrets and never printed.
//
// Usage: npx tsx scripts/run-scrape.ts

import { createClient } from '@supabase/supabase-js';

import { loadEnvLocal } from './env';

declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): void;
};

const POLL_INTERVAL_MS = 20000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

async function fetchCronSecret(token: string, ref: string): Promise<string> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/secrets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`secrets fetch failed: ${res.status}`);
  const secrets = (await res.json()) as Array<{ name: string; value: string }>;
  const secret = secrets.find((s) => s.name === 'CRON_SECRET');
  if (!secret) throw new Error('CRON_SECRET not set on the project');
  return secret.value;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const url = process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !service || !token || !ref || !anon) {
    console.error('missing env: SUPABASE_URL, service key, access token, project ref, anon key');
    process.exit(1);
    return;
  }

  const cronSecret = await fetchCronSecret(token, ref);

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { count: before } = await admin
    .from('trend_items')
    .select('id', { count: 'exact', head: true });

  const res = await fetch(`${url}/functions/v1/scrape-trends`, {
    method: 'POST',
    headers: {
      // Platform JWT gate needs a valid JWT; the function's own auth is the
      // cron secret (checked first in authenticate()).
      Authorization: `Bearer ${anon}`,
      'x-cron-secret': cronSecret,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  console.log(`scrape-trends: ${res.status} ${await res.text()}`);
  if (res.status !== 202) {
    process.exit(1);
    return;
  }

  const started = Date.now();
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const { count: after } = await admin
      .from('trend_items')
      .select('id', { count: 'exact', head: true });
    const gained = (after ?? 0) - (before ?? 0);
    console.log(`+${gained} trend items after ${Math.round((Date.now() - started) / 1000)}s`);
    if (gained > 0) {
      const [{ count: claims }, { count: vocab }, { count: examples }] = await Promise.all([
        admin.from('claims').select('id', { count: 'exact', head: true }),
        admin.from('vocabulary').select('id', { count: 'exact', head: true }),
        admin.from('format_examples').select('id', { count: 'exact', head: true }),
      ]);
      const { data: classified } = await admin
        .from('trend_items')
        .select('format_id')
        .not('format_id', 'is', null);
      console.log(
        `claims: ${claims}, vocabulary: ${vocab}, format_examples: ${examples}, classified trends: ${classified?.length ?? 0}`,
      );
      return;
    }
  }
  console.log('timed out waiting for new rows; check function logs');
}

main();

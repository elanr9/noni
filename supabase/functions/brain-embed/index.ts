// Makes the vectors the company brain searches by: for passages
// (brain_chunks) and records (brain_facts) that do not have one yet.
//
// Internal. Two callers:
//   POST { company_id: string, hop?: number }   service role key (brain.ts kickEmbed, and itself)
//   POST { sweep: true }                        x-cron-secret (the noni-brain-embed-sweep job)
// Both answer 202 { started: true } at once and work after the response.
//
// Why this is its own function, and why it does so little per request. The
// edge runtime's embedder (gte-small) runs on the worker's own CPU: about
// half a second for a full passage. A worker that spends much over two
// seconds of CPU is killed (HTTP 546 WORKER_RESOURCE_LIMIT) and no try/catch
// sees it. So each request embeds EMBED_PER_REQUEST texts, saves them, and
// calls itself for the next. A kill here costs one small batch and never
// touches the request that asked for the work.
//
// The chain is best effort: a lost hand-off or a killed worker ends it. The
// sweep is what makes it certain. Every few minutes it starts a chain for
// each company that still has something waiting, so nothing stays without a
// vector for long whatever happened to the chain that was working on it.
//
// Two chains for one company can overlap (a scan and a survey answer close
// together, or a sweep while a chain is alive). Each takes its batch at
// random from what is waiting, so they mostly do different rows, and
// embedding a row twice is harmless.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { embedPending, EMBED_PER_REQUEST } from '../_shared/ai/brain.ts';
import { adminClient, handleCors, jsonResponse } from '../_shared/wp8.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

// Far more requests than one scan leaves texts, and an end to any loop.
const MAX_HOPS = 1200;
const SWEEP_COMPANIES = 20;

async function call(body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/brain-embed`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    await res.body?.cancel();
    return res.ok;
  } catch {
    return false;
  }
}

async function work(companyId: string, hop: number): Promise<void> {
  let embedded = 0;
  try {
    embedded = await embedPending(adminClient(), companyId, { limit: EMBED_PER_REQUEST, sample: true });
  } catch (err) {
    // Stop here: the sweep starts again, and search works on words meanwhile.
    console.error('brain-embed: batch failed', err instanceof Error ? err.message : err);
    return;
  }
  if (embedded <= 0 || hop >= MAX_HOPS) return;
  const next = { company_id: companyId, hop: hop + 1 };
  // One more try for a hand-off the gateway dropped; after that the sweep has it.
  if (!(await call(next))) await call(next);
}

/** Starts a chain for every company with a passage or a live record still waiting. */
async function sweep(admin: SupabaseClient): Promise<void> {
  const [{ data: chunks }, { data: facts }] = await Promise.all([
    admin.from('brain_chunks').select('company_id').is('embedding', null).limit(500),
    admin.from('brain_facts').select('company_id').is('embedding', null).in('status', ['inferred', 'confirmed']).limit(500),
  ]);
  const companies = [...new Set([...(chunks ?? []), ...(facts ?? [])].map((row) => row.company_id as string))];
  await Promise.all(companies.slice(0, SWEEP_COMPANIES).map((id) => call({ company_id: id, hop: 0 })));
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const body = ((await req.json().catch(() => null)) ?? {}) as { company_id?: string; hop?: number; sweep?: boolean };

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (body.sweep && cronSecret && req.headers.get('x-cron-secret') === cronSecret) {
    EdgeRuntime.waitUntil(sweep(adminClient()));
    return jsonResponse({ started: true }, 202);
  }

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  if (!token || token !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return jsonResponse({ error: 'forbidden' }, 403);
  if (!body.company_id) return jsonResponse({ error: 'company_id is required' }, 400);
  EdgeRuntime.waitUntil(work(body.company_id, typeof body.hop === 'number' ? body.hop : 0));
  return jsonResponse({ started: true }, 202);
});

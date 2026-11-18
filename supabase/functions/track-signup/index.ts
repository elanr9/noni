// Receives sign-up counts from a company's own app (the SQL snippet the
// company runs in its Supabase project; any backend can post the same shape).
//
// Auth: the company's write key in the x-noni-key header. No JWT.
//
// Body, either or both:
//   { "events":  [{ "at": "2026-11-18T14:03:00Z", "code": "MAYA10" }] }   one per new user
//   { "history": [{ "day": "2026-11-18", "code": "MAYA10", "count": 3 }] } one-time backfill
//
// Only a day, an optional referral code and a count are kept. Days are UTC.

import { adminClient, handleCors, jsonResponse } from '../_shared/wp8.ts';

const MAX_EVENTS = 500;
const MAX_HISTORY_ROWS = 20000;
const MAX_COUNT = 1_000_000;

type Row = { day: string; code: string; count: number };

function cleanCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase().slice(0, 64) : '';
}

function dayOf(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  // Nothing from the future (a wrong clock), nothing absurdly old.
  if (date.getTime() > Date.now() + 36 * 60 * 60 * 1000 || date.getUTCFullYear() < 2000) return null;
  return date.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405);
  try {
    const key = req.headers.get('x-noni-key')?.trim();
    if (!key || key.length < 20) return jsonResponse({ error: 'missing key' }, 401);

    const admin = adminClient();
    const { data: source, error: sourceError } = await admin
      .from('company_signup_sources')
      .select('company_id')
      .eq('token', key)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) return jsonResponse({ error: 'unknown key' }, 401);
    const companyId = source.company_id as string;

    const body = (await req.json().catch(() => null)) as
      | { events?: unknown; history?: unknown }
      | null;
    if (!body) return jsonResponse({ error: 'invalid JSON' }, 400);

    let recorded = 0;

    if (Array.isArray(body.history)) {
      const rows: Row[] = [];
      for (const raw of body.history.slice(0, MAX_HISTORY_ROWS) as Record<string, unknown>[]) {
        const day = dayOf(raw?.day);
        const count = Math.floor(Number(raw?.count));
        if (!day || !Number.isFinite(count) || count <= 0 || count > MAX_COUNT) continue;
        rows.push({ day, code: cleanCode(raw?.code), count });
      }
      const { error } = await admin.rpc('record_signups', {
        p_company: companyId,
        p_rows: rows,
        p_mode: 'history',
      });
      if (error) throw error;
      recorded += rows.reduce((n, r) => n + r.count, 0);
    }

    if (Array.isArray(body.events)) {
      const rows: Row[] = [];
      for (const raw of body.events.slice(0, MAX_EVENTS) as Record<string, unknown>[]) {
        const day = dayOf(raw?.at ?? new Date().toISOString());
        if (!day) continue;
        rows.push({ day, code: cleanCode(raw?.code), count: 1 });
      }
      if (rows.length > 0) {
        const { error } = await admin.rpc('record_signups', {
          p_company: companyId,
          p_rows: rows,
          p_mode: 'events',
        });
        if (error) throw error;
        recorded += rows.length;
      }
    }

    return jsonResponse({ ok: true, recorded });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('track-signup failed:', message);
    return jsonResponse({ error: 'could not record' }, 500);
  }
});

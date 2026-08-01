// One-shot Workstream A deployment over the Supabase Management API (HTTPS,
// avoids the blocked direct Postgres path). Reads SUPABASE_ACCESS_TOKEN and
// SUPABASE_PROJECT_REF from .env.local and never prints either.
//
// Steps: verify project -> apply migration 015 -> record migration version ->
// fetch service role key into .env.local -> regenerate lib/types.ts.
//
// Usage: npx tsx scripts/apply-inspiration-foundation.ts

import { appendFileSync, readFileSync, writeFileSync } from 'fs';

import { loadEnvLocal } from './env';

declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): void;
};

const MIGRATION_FILE =
  'supabase/migrations/20260730160000_015_inspiration_foundation.sql';
const MIGRATION_VERSION = '20260730160000';
const MIGRATION_NAME = '015_inspiration_foundation';

const API = 'https://api.supabase.com';

async function api<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

async function runSql<T>(token: string, ref: string, query: string): Promise<T> {
  return api<T>(token, 'POST', `/v1/projects/${ref}/database/query`, { query });
}

async function main(): Promise<void> {
  loadEnvLocal();
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!token || !ref) {
    console.error('SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF must be in .env.local');
    process.exit(1);
    return;
  }

  const project = await api<{ id: string; name: string; status: string }>(
    token,
    'GET',
    `/v1/projects/${ref}`,
  );
  console.log(`project: ${project.name} (${project.id}) status=${project.status}`);
  if (project.id !== ref) throw new Error('project ref mismatch, aborting');

  const applied = await runSql<Array<{ version: string }>>(
    token,
    ref,
    `select version from supabase_migrations.schema_migrations where version = '${MIGRATION_VERSION}'`,
  );
  if (applied.length > 0) {
    console.log('migration 015 already recorded, skipping apply');
  } else {
    const sql = readFileSync(MIGRATION_FILE, 'utf8');
    await runSql(token, ref, sql);
    console.log('migration 015 applied');
    await runSql(
      token,
      ref,
      `insert into supabase_migrations.schema_migrations (version, name) values ('${MIGRATION_VERSION}', '${MIGRATION_NAME}')`,
    );
    console.log('migration version recorded');
  }

  const check = await runSql<Array<{ table_name: string }>>(
    token,
    ref,
    `select table_name from information_schema.tables where table_schema = 'public' and table_name in ('formats', 'claims', 'weekly_batches', 'task_comments', 'format_stats') order by table_name`,
  );
  console.log('new tables present:', check.map((r) => r.table_name).join(', '));

  const cron = await runSql<Array<{ jobname: string; active: boolean }>>(
    token,
    ref,
    `select jobname, active from cron.job where jobname like 'noni-%' order by jobname`,
  );
  console.log('remaining noni cron jobs:', cron.map((r) => `${r.jobname}${r.active ? '' : ' (inactive)'}`).join(', ') || 'none');
  if (cron.some((r) => r.jobname === 'noni-auto-fill-daily')) {
    throw new Error('noni-auto-fill-daily still scheduled, unschedule failed');
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const keys = await api<Array<{ name: string; api_key: string }>>(
      token,
      'GET',
      `/v1/projects/${ref}/api-keys?reveal=true`,
    );
    const service = keys.find((k) => k.name === 'service_role');
    if (!service) throw new Error('service_role key not found');
    appendFileSync('.env.local', `\nSUPABASE_SERVICE_ROLE_KEY=${service.api_key}\n`);
    console.log('service role key written to .env.local');
  } else {
    console.log('service role key already in env');
  }

  const types = await api<{ types: string }>(
    token,
    'GET',
    `/v1/projects/${ref}/types/typescript?included_schemas=public`,
  );
  writeFileSync('lib/types.ts', types.types);
  console.log(`lib/types.ts regenerated (${types.types.length} chars)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

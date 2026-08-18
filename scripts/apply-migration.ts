// Applies one local migration file to the linked project over the Supabase
// Management API and records its version, then regenerates lib/types.ts.
// Reads SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF from .env.local.
//
// Usage: npx tsx scripts/apply-migration.ts supabase/migrations/<file>.sql

import { readFileSync, writeFileSync } from 'fs';

import { loadEnvLocal } from './env';

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exit(code?: number): void;
};

const API = 'https://api.supabase.com';

async function api<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF;
  const file = process.argv[2];
  if (!token || !ref || !file) {
    console.error('usage: apply-migration.ts <migration file>, with token and ref in .env.local');
    process.exit(1);
    return;
  }
  const match = file.match(/(\d{14})_(.+)\.sql$/);
  if (!match) {
    console.error('file name must look like <14 digit version>_<name>.sql');
    process.exit(1);
    return;
  }
  const [, version, name] = match;

  const runSql = <T>(query: string): Promise<T> =>
    api<T>(token, 'POST', `/v1/projects/${ref}/database/query`, { query });

  const applied = await runSql<Array<{ version: string }>>(
    `select version from supabase_migrations.schema_migrations where version = '${version}'`,
  );
  if (applied.length > 0) {
    console.log(`migration ${version} already recorded, skipping`);
  } else {
    await runSql(readFileSync(file, 'utf8'));
    await runSql(
      `insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${name}')`,
    );
    console.log(`migration ${version}_${name} applied and recorded`);
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

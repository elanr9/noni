// Resets one company's briefs, weeks, assignments, submissions and posts so it
// can start from scratch. Backs up every row it deletes as JSON under
// supabase/backups/<slug>-<date>/ first, prints row counts before and after,
// and removes storage files only when they belong to deleted submissions.
// Keeps the company, members, roster, creator accounts and library items.
//
// Usage: npx tsx scripts/reset-inkbound.ts [--dry-run]

import { existsSync, mkdirSync, writeFileSync } from 'fs';

import { loadEnvLocal } from './env';

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exit(code?: number): void;
};

const COMPANY_ID = '59f83fa9-8c5b-44aa-814e-f7cc863eac3b';
const COMPANY_SLUG = 'inkbound';
const API = 'https://api.supabase.com';

type Row = Record<string, unknown>;

async function runSql<T = Row[]>(query: string, attempt = 0): Promise<T> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF;
  const res = await fetch(`${API}/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'supabase-cli/2.75.0',
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (res.status === 429 && attempt < 5) {
    await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
    return runSql(query, attempt + 1);
  }
  if (!res.ok) throw new Error(`sql -> ${res.status}: ${text.slice(0, 600)}\n${query.slice(0, 300)}`);
  return (text ? JSON.parse(text) : []) as T;
}

// Never overwrite an earlier backup file: a rerun after a partial run would
// otherwise replace the real rows with the now empty result.
function writeBackup(path: string, rows: unknown[]): void {
  if (existsSync(path)) return;
  writeFileSync(path, JSON.stringify(rows, null, 2));
}

const C = `'${COMPANY_ID}'`;

// Each entry: table name and the where clause that scopes it to the company.
const SCOPES: [string, string][] = [
  ['briefs', `company_id = ${C}`],
  ['brief_segments', `company_id = ${C}`],
  ['brief_review_events', `brief_id in (select id from briefs where company_id = ${C})`],
  ['brief_validations', `brief_id in (select id from briefs where company_id = ${C})`],
  ['brief_ai_snapshots', `brief_id in (select id from briefs where company_id = ${C})`],
  ['brief_edit_diffs', `brief_id in (select id from briefs where company_id = ${C})`],
  ['campaigns', `company_id = ${C}`],
  ['campaign_briefs', `company_id = ${C}`],
  ['assignments', `company_id = ${C}`],
  ['submissions', `assignment_id in (select id from assignments where company_id = ${C})`],
  ['submission_segments', `company_id = ${C}`],
  ['review_events', `submission_id in (select id from submissions where assignment_id in (select id from assignments where company_id = ${C}))`],
  ['posts', `assignment_id in (select id from assignments where company_id = ${C}) or submission_id in (select id from submissions where assignment_id in (select id from assignments where company_id = ${C}))`],
  ['post_metrics', `post_id in (select id from posts where assignment_id in (select id from assignments where company_id = ${C}) or submission_id in (select id from submissions where assignment_id in (select id from assignments where company_id = ${C})))`],
  ['recording_drafts', `company_id = ${C}`],
  ['assignment_segment_edits', `company_id = ${C}`],
  ['creator_projects', `company_id = ${C}`],
  ['attribution_links', `company_id = ${C}`],
  ['manager_chats', `company_id = ${C} and campaign_id in (select id from campaigns where company_id = ${C})`],
  ['manager_messages', `chat_id in (select id from manager_chats where company_id = ${C} and campaign_id in (select id from campaigns where company_id = ${C}))`],
];

// Rows that stay but lose their pointer to deleted rows.
const NULL_OUTS: [string, string, string][] = [
  ['library_items', 'video_brief_id, carousel_brief_id, last_brief_id, post_id', `company_id = ${C} and (video_brief_id is not null or carousel_brief_id is not null or last_brief_id is not null or post_id is not null)`],
  ['messages', 'brief_id, assignment_id', `company_id = ${C} and (brief_id is not null or assignment_id is not null)`],
  ['manager_messages', 'brief_id, assignment_id', `company_id = ${C} and (brief_id is not null or assignment_id is not null)`],
  ['wallet_ledger', 'post_id', `company_id = ${C} and post_id is not null`],
  ['company_credit_ledger', 'assignment_id', `company_id = ${C} and assignment_id is not null`],
  ['content_tasks', 'campaign_id', `company_id = ${C} and campaign_id is not null`],
];

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const [table, where] of SCOPES) {
    const rows = await runSql<{ n: number }[]>(`select count(*)::int as n from ${table} where ${where}`);
    out[table] = rows[0]?.n ?? 0;
  }
  return out;
}

function printCounts(label: string, c: Record<string, number>): void {
  console.log(`\n${label}`);
  for (const [table, n] of Object.entries(c)) console.log(`  ${table.padEnd(26)} ${n}`);
}

async function removeStorageObjects(bucket: string, names: string[]): Promise<void> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  for (let i = 0; i < names.length; i += 100) {
    const batch = names.slice(i, i + 100);
    const res = await fetch(`${url}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: batch }),
    });
    if (!res.ok) throw new Error(`storage delete ${bucket} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const dryRun = process.argv.includes('--dry-run');
  if (!process.env.SUPABASE_ACCESS_TOKEN || !process.env.SUPABASE_PROJECT_REF) {
    console.error('SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF are required in .env.local');
    process.exit(1);
    return;
  }

  const company = await runSql<{ name: string; slug: string }[]>(`select name, slug from companies where id = ${C}`);
  if (company.length !== 1) throw new Error(`company ${COMPANY_ID} not found`);
  console.log(`Resetting ${company[0].name} (${COMPANY_ID})${dryRun ? ' [dry run]' : ''}`);

  const before = await counts();
  printCounts('Before', before);

  const date = new Date().toISOString().slice(0, 10);
  const dir = `supabase/backups/${COMPANY_SLUG}-${date}`;
  mkdirSync(dir, { recursive: true });

  for (const [table, where] of SCOPES) {
    const rows = await runSql(`select * from ${table} where ${where}`);
    writeBackup(`${dir}/${table}.json`, rows);
  }
  for (const [table, cols, where] of NULL_OUTS) {
    const rows = await runSql(`select id, ${cols} from ${table} where ${where}`);
    writeBackup(`${dir}/nulled-${table}.json`, rows);
  }

  // Storage: only objects under videos/<company>/<deleted assignment>/ plus any
  // path referenced by a deleted submission or submission segment.
  const assignmentIds = (await runSql<{ id: string }[]>(`select id from assignments where company_id = ${C}`)).map((r) => r.id);
  const referenced = await runSql<{ p: string }[]>(
    `select distinct unnest(array_remove(array[video_path] || coalesce(segment_paths, '{}') || coalesce(instagram_segment_paths, '{}'), null)) as p
       from submissions where assignment_id in (select id from assignments where company_id = ${C})
     union
     select distinct storage_path as p from submission_segments where company_id = ${C}`,
  );
  const prefixes = assignmentIds.map((id) => `${COMPANY_ID}/${id}/`);
  const objects = await runSql<{ bucket_id: string; name: string }[]>(
    `select bucket_id, name from storage.objects
      where name like '${COMPANY_ID}/%'
        and (${prefixes.length ? prefixes.map((p) => `name like '${p}%'`).join(' or ') : 'false'}
             or name = any(array[${referenced.map((r) => `'${r.p}'`).join(',') || "''"}]::text[]))`,
  );
  writeBackup(`${dir}/storage-objects.json`, objects);
  console.log(`\nBackup written to ${dir} (${objects.length} storage objects listed)`);

  if (dryRun) return;

  for (const [table, cols, where] of NULL_OUTS) {
    const set = cols.split(',').map((c) => `${c.trim()} = null`).join(', ');
    await runSql(`update ${table} set ${set} where ${where}`);
  }
  // Delete leaves first so FKs without cascade do not block.
  const order = [
    'post_metrics', 'posts', 'review_events', 'submission_segments',
    'recording_drafts', 'assignment_segment_edits', 'creator_projects', 'attribution_links',
  ];
  for (const table of order) {
    const where = SCOPES.find(([t]) => t === table)?.[1];
    if (where) await runSql(`delete from ${table} where ${where}`);
  }
  await runSql(`update assignments set submission_id = null where company_id = ${C}`);
  await runSql(`delete from submissions where assignment_id in (select id from assignments where company_id = ${C})`);
  await runSql(`delete from assignments where company_id = ${C}`);
  await runSql(`delete from campaign_briefs where company_id = ${C}`);
  await runSql(`delete from campaigns where company_id = ${C}`);
  await runSql(`delete from brief_validations where brief_id in (select id from briefs where company_id = ${C})`);
  await runSql(`delete from briefs where company_id = ${C}`);

  const byBucket = new Map<string, string[]>();
  for (const o of objects) byBucket.set(o.bucket_id, [...(byBucket.get(o.bucket_id) ?? []), o.name]);
  for (const [bucket, names] of byBucket) {
    await removeStorageObjects(bucket, names);
    console.log(`Removed ${names.length} objects from ${bucket}`);
  }

  printCounts('After', await counts());
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

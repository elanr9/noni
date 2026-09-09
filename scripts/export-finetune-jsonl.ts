// Exports the AI fill learning data as a supervised fine tuning dataset.
// One JSONL line per published post: the AI's version, the manager's
// published version and the structured diff. Reads SUPABASE_ACCESS_TOKEN and
// SUPABASE_PROJECT_REF from .env.local.
//
// Usage: npx tsx scripts/export-finetune-jsonl.ts [out.jsonl] [--company <id>] [--min-edit 0.05]

import { writeFileSync } from 'fs';

import { loadEnvLocal } from './env';

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exit(code?: number): void;
};

type Row = {
  id: string;
  company_id: string;
  brief_id: string;
  post_type_key: string | null;
  source_kind: string;
  edit_ratio: string | number;
  changed_fields: string[];
  diff: unknown;
  final_snapshot: unknown;
  published_at: string;
  ai_snapshot: unknown;
};

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
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
  const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'finetune.jsonl';
  const company = arg('--company');
  const minEdit = Number(arg('--min-edit') ?? '0');
  if (company && !/^[0-9a-f-]{36}$/i.test(company)) {
    console.error('--company must be a uuid');
    process.exit(1);
    return;
  }

  const query = `
    select d.id, d.company_id, d.brief_id, d.post_type_key, d.source_kind, d.edit_ratio,
           d.changed_fields, d.diff, d.final_snapshot, d.published_at,
           s.snapshot as ai_snapshot
    from public.brief_edit_diffs d
    join public.brief_ai_snapshots s on s.id = d.snapshot_id
    where d.edit_ratio >= ${Number.isFinite(minEdit) ? minEdit : 0}
    ${company ? `and d.company_id = '${company}'` : ''}
    order by d.published_at asc`;

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'supabase-cli/2.75.0',
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`query failed ${res.status}: ${await res.text()}`);
  const rows = (await res.json()) as Row[];

  const lines = rows.map((r) =>
    JSON.stringify({
      id: r.id,
      company_id: r.company_id,
      brief_id: r.brief_id,
      post_type: r.post_type_key,
      source: r.source_kind,
      published_at: r.published_at,
      edit_ratio: Number(r.edit_ratio),
      changed_fields: r.changed_fields,
      input: r.ai_snapshot,
      output: r.final_snapshot,
      diff: r.diff,
    }),
  );
  writeFileSync(out, `${lines.join('\n')}\n`);
  console.log(`${lines.length} examples written to ${out}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

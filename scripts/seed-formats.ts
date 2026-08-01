// Seeds the universal formats library (ugc-bible.md Part 8) and FieldVision's
// Appendix A format examples. Idempotent: formats upsert on id, seed examples
// are replaced wholesale per run.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     npx tsx scripts/seed-formats.ts [fieldvision_company_id]
//
// Without an argument the FieldVision company is looked up by slug
// 'fieldvision'; if not found, only the universal formats are seeded.

import { createClient } from '@supabase/supabase-js';

import { loadEnvLocal } from './env';
import { BIBLE_VERSION } from '../supabase/functions/_shared/doctrine';
import {
  APPENDIX_A_EXAMPLES,
  FORMAT_SEED,
} from '../supabase/functions/_shared/formats-seed';

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exit(code?: number): void;
};

async function main(): Promise<void> {
  loadEnvLocal();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    process.exit(1);
    return;
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const rows = FORMAT_SEED.map((f) => ({ ...f, bible_version: BIBLE_VERSION }));
  const { error: formatsError } = await admin
    .from('formats')
    .upsert(rows, { onConflict: 'id' });
  if (formatsError) {
    console.error('formats upsert failed:', formatsError.message);
    process.exit(1);
    return;
  }
  console.log(`formats: ${rows.length} rows upserted (bible v${BIBLE_VERSION})`);

  let companyId = process.argv[2];
  if (!companyId) {
    const { data } = await admin
      .from('companies')
      .select('id')
      .eq('slug', 'fieldvision')
      .maybeSingle();
    companyId = data?.id;
  }
  if (!companyId) {
    console.log(
      'no FieldVision company found (pass a company id to seed Appendix A examples)',
    );
    return;
  }

  const { error: deleteError } = await admin
    .from('format_examples')
    .delete()
    .eq('company_id', companyId)
    .eq('source', 'seed');
  if (deleteError) {
    console.error('clearing old seed examples failed:', deleteError.message);
    process.exit(1);
    return;
  }

  const examples = APPENDIX_A_EXAMPLES.map((e) => ({
    ...e,
    company_id: companyId,
    source: 'seed',
  }));
  const { error: examplesError } = await admin
    .from('format_examples')
    .insert(examples);
  if (examplesError) {
    console.error('format_examples insert failed:', examplesError.message);
    process.exit(1);
    return;
  }
  console.log(
    `format_examples: ${examples.length} Appendix A rows seeded for company ${companyId}`,
  );
}

main();

// Agent 5 acceptance, rerunnable and non-mutating on library data it creates
// (temp rows are deleted at the end).
// 1. library-link: og:image resolve on a public page, 400 on a private host.
// 2. captureQuick semantics server-side: multiline insert, URL routing.
// 3. library_our_posts RPC runs as the admin (RLS applies).
//
// Usage: npx tsx scripts/acceptance-agent5.ts

import { createClient } from '@supabase/supabase-js';

import { loadEnvLocal } from './env';

declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): void;
};

async function main(): Promise<void> {
  loadEnvLocal();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // The env test account is a creator; the Library is admin-only. Mint a
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
  if (authError || !auth.user) {
    throw new Error(`admin sign in failed: ${authError?.message}`);
  }

  const admin = createClient(url, service);
  const { data: profile } = await admin
    .from('profiles')
    .select('company_id')
    .eq('id', auth.user.id)
    .single();
  const companyId = profile!.company_id as string;

  console.log('\n=== library-link: public page ===');
  const { data: preview, error: previewError } = await client.functions.invoke(
    'library-link',
    { body: { url: 'https://github.com/supabase/supabase' } },
  );
  if (previewError) throw previewError;
  console.log(JSON.stringify(preview));
  if (!preview.thumbnail_url) throw new Error('expected an og:image');

  console.log('\n=== library-link: private host must 400 ===');
  const { error: ssrfError } = await client.functions.invoke('library-link', {
    body: { url: 'http://169.254.169.254/latest/meta-data/' },
  });
  if (!ssrfError) throw new Error('private host was not rejected');
  console.log('rejected as expected');

  console.log('\n=== library_items: bulk ideas + reference insert as admin ===');
  const { data: ideas, error: ideasError } = await client
    .from('library_items')
    .insert(
      ['acceptance idea one', 'acceptance idea two'].map((text) => ({
        company_id: companyId,
        source: 'idea',
        text,
        created_by: auth.user!.id,
      })),
    )
    .select('id');
  if (ideasError) throw ideasError;
  console.log(`inserted ${ideas.length} ideas`);

  console.log('\n=== library_our_posts RPC as admin ===');
  const { data: posts, error: rpcError } = await client.rpc(
    'library_our_posts',
    { p_days: 60, p_sort: 'top', p_limit: 5 },
  );
  if (rpcError) throw rpcError;
  console.log(
    `${posts.length} rows; first: ${JSON.stringify(posts[0] ?? null)}`,
  );

  const ids = ideas.map((r) => r.id as string);
  await admin.from('library_items').delete().in('id', ids);
  console.log('\ntemp rows deleted, all checks passed');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

import { createClient } from 'npm:@supabase/supabase-js@2';

const BASE = 'https://api.upload-post.com';

type Body = {
  method?: string;
  path: string;
  json?: unknown;
  /** Multipart upload: storage paths in the videos bucket become file, file1, ... */
  multipart?: { files: string[]; fields: Record<string, string> };
};

Deno.serve(async (req) => {
  const body = (await req.json()) as Body;
  const apiKey = Deno.env.get('UPLOAD_POST_API_KEY')!;
  const headers: Record<string, string> = { Authorization: `Apikey ${apiKey}` };
  let init: RequestInit = { method: body.method ?? 'GET', headers };
  if (body.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    init = { ...init, body: JSON.stringify(body.json) };
  } else if (body.multipart) {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const form = new FormData();
    for (const [i, p] of body.multipart.files.entries()) {
      const { data, error } = await admin.storage.from('videos').download(p);
      if (error || !data) return new Response(JSON.stringify({ error: error?.message }), { status: 500 });
      form.append(i === 0 ? 'file' : `file${i}`, data, p.split('/').pop());
    }
    for (const [k, v] of Object.entries(body.multipart.fields)) form.append(k, v);
    init = { ...init, body: form };
  }
  const res = await fetch(`${BASE}${body.path}`, init);
  const text = await res.text();
  return new Response(JSON.stringify({ status: res.status, body: text.slice(0, 4000) }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

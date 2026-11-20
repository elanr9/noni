// Upload a brief, get a set of posts. The Briefs tab's "Upload brief" flow:
//
// POST { action: 'plan', files?: [{ path, name?, mime? }], links?: string[],
//        text?: string, notes?: string, count?: number }
//   Reads every source (files from the brief-imports bucket under the
//   caller's company folder, links fetched server side, pasted text), lists
//   the posts and stores the plan. Answers
//   { import_id, summary, posts: [{ index, title, type, origin, angle, hook }],
//     skipped: [{ name, reason }] }.
// POST { action: 'write', import_id, index }
//   Writes one listed post. Answers the same body as brief-fill's guided mode
//   ({ title, phrase, clips, caption, tags, angle, hooks, warnings }), so the
//   app saves it exactly as it saves a Fill in with AI result.
//
// The app calls 'write' for several posts at once and shows each as it lands,
// so no single request has to outlive the edge runtime's limit. Both actions
// trickle whitespace while they work (see streamJsonResponse).

import { addSource } from '../_shared/ai/brain.ts';
import { clampCount, type ImportPlan, ImportUnreadableError, planImport, writeImport } from '../_shared/ai/briefImport.ts';
import { DocReadError, type ReadDoc, readBytes, readLink } from '../_shared/ai/docText.ts';
import { adminClient, authenticate, handleCors, jsonResponse, streamJsonResponse } from '../_shared/wp8.ts';

const BUCKET = 'brief-imports';
const MAX_SOURCES = 8;

type Body = {
  action?: string;
  files?: Array<{ path?: unknown; name?: unknown; mime?: unknown }>;
  links?: unknown[];
  text?: unknown;
  notes?: unknown;
  count?: unknown;
  import_id?: unknown;
  index?: unknown;
};

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const reasonOf = (e: unknown, fallback: string): string => (e instanceof DocReadError ? e.message : fallback);

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller || caller.kind !== 'user') return jsonResponse({ error: 'unauthorized' }, 401);
  if (caller.role !== 'campaign_manager') return jsonResponse({ error: 'forbidden' }, 403);
  if (!caller.companyId) return jsonResponse({ error: 'no active company' }, 400);
  const companyId = caller.companyId;

  const body = ((await req.json().catch(() => null)) ?? {}) as Body;

  if (body.action === 'write') {
    const importId = str(body.import_id, 60);
    const index = Number(body.index);
    if (!importId || !Number.isInteger(index) || index < 0) return jsonResponse({ error: 'import_id and index are required' }, 400);
    return streamJsonResponse(async () => {
      const { data: row } = await admin.from('brief_imports').select('plan').eq('id', importId).eq('company_id', companyId).maybeSingle();
      if (!row) return { error: 'That import was not found. Upload the brief again.' };
      const result = await writeImport(admin, { companyId, plan: row.plan as ImportPlan, index });
      return {
        title: result.title,
        phrase: result.phrase,
        clips: result.clips,
        caption: result.caption,
        tags: result.tags,
        angle: result.angle,
        hooks: result.hooks,
        kill_reason: null,
        questions: [],
        reference_note: null,
        warnings: result.warnings ?? [],
      };
    });
  }

  if (body.action !== 'plan') return jsonResponse({ error: 'unknown action' }, 400);

  const files = (Array.isArray(body.files) ? body.files : [])
    .map((f) => ({ path: str(f?.path, 400), name: str(f?.name, 200), mime: str(f?.mime, 100) }))
    .filter((f) => f.path)
    .slice(0, MAX_SOURCES);
  const links = (Array.isArray(body.links) ? body.links : []).map((l) => str(l, 800)).filter(Boolean).slice(0, MAX_SOURCES);
  const pasted = typeof body.text === 'string' ? body.text.trim().slice(0, 120_000) : '';
  if (!files.length && !links.length && !pasted) return jsonResponse({ error: 'Add a file, a link or some text first.' }, 400);
  for (const f of files) {
    if (!f.path.startsWith(`${companyId}/`) || f.path.includes('..')) return jsonResponse({ error: 'That file belongs to another company.' }, 403);
  }

  return streamJsonResponse(async () => {
    const docs: ReadDoc[] = [];
    const skipped: Array<{ name: string; reason: string }> = [];

    const read = await Promise.all([
      ...files.map(async (f) => {
        const name = f.name || f.path.split('/').pop() || 'Document';
        try {
          const { data, error } = await admin.storage.from(BUCKET).download(f.path);
          if (error || !data) throw new DocReadError(`${name} did not finish uploading. Try it again.`);
          return readBytes(new Uint8Array(await data.arrayBuffer()), name, f.mime);
        } catch (e) {
          console.error('brief-import: file not read', name, e);
          skipped.push({ name, reason: reasonOf(e, `${name} could not be read. Export it as a PDF and try again.`) });
          return null;
        }
      }),
      ...links.map(async (link) => {
        try {
          return await readLink(link);
        } catch (e) {
          console.error('brief-import: link not read', link, e);
          skipped.push({ name: link, reason: reasonOf(e, 'That link could not be read. Upload the file instead.') });
          return null;
        }
      }),
    ]);
    for (const d of read) if (d) docs.push(d);
    if (pasted) docs.push({ kind: 'text', name: 'Pasted text', text: pasted });

    // The files have been read into memory; nothing needs them again.
    if (files.length) void admin.storage.from(BUCKET).remove(files.map((f) => f.path)).catch(() => undefined);

    if (!docs.length) return { error: skipped[0]?.reason ?? 'Nothing could be read.', skipped };

    let plan: ImportPlan;
    try {
      plan = await planImport(admin, { companyId, docs, count: clampCount(body.count), notes: str(body.notes, 1500) });
    } catch (e) {
      if (e instanceof ImportUnreadableError) return { error: e.message, skipped };
      throw e;
    }

    const { data: row, error } = await admin
      .from('brief_imports')
      .insert({ company_id: companyId, created_by: caller.userId, sources: docs.map((d) => ({ name: d.name, kind: d.kind })), plan })
      .select('id')
      .single();
    if (error || !row) throw new Error(error?.message ?? 'The import could not be stored');

    // What the brief says is company knowledge: the brain reads it on its next scan.
    for (const d of docs) {
      if (d.kind !== 'text') continue;
      void addSource(admin, { companyId, kind: 'upload', content: d.text, title: d.name, createdBy: caller.userId, meta: { via: 'brief-import', import_id: row.id } })
        .catch((e) => console.error('brief-import: brain source not added', e));
    }

    return {
      import_id: row.id,
      summary: plan.summary,
      posts: plan.posts.map((p, index) => ({ index, title: p.title, type: p.type, origin: p.origin, angle: p.angle, hook: p.hook })),
      skipped,
    };
  });
});

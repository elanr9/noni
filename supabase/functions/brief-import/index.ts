// Upload a brief, get a set of posts. The Briefs tab's "Upload brief" flow:
//
// POST { action: 'plan', files?: [{ path, name?, mime? }], links?: string[] }
//   Answers as server sent events, so the app shows each step as it happens:
//     sources  { read: [{ name, kind }], skipped: [{ name, reason }] }
//     post     { index, title, type, origin, angle, hook, source, direction }
//              one per post, the moment it is found
//     ready    { import_id }   the rules are stored; posts can be written now
//     result   { import_id, count, skipped }
//     error    { message }     a sentence the manager can act on
//   The documents decide how many posts there are.
// POST { action: 'write', import_id, post }
//   Writes one listed post (`post` is a post event, sent back as it came).
//   Answers the same body as brief-fill's guided mode
//   ({ title, phrase, clips, caption, tags, angle, hooks, warnings }), so the
//   app saves it exactly as it saves a Fill in with AI result.
// POST { action: 'done', import_id }
//   The manager saved or left: the uploaded files are removed.
//
// The app calls 'write' for every post at once and shows each as it lands, so
// no single request has to outlive the edge runtime's limit.

import { addSource } from '../_shared/ai/brain.ts';
import { type ImportPlan, type ImportPost, type ImportRules, ImportUnreadableError, liftRules, listPosts, tidyPost, writeImport } from '../_shared/ai/briefImport.ts';
import { DocReadError, type ImageType, type ReadDoc, readBytes, readLink, toBase64 } from '../_shared/ai/docText.ts';
import { adminClient, authenticate, handleCors, jsonResponse, type SseEmit, sseResponse, streamJsonResponse, wantsSse } from '../_shared/wp8.ts';

const BUCKET = 'brief-imports';
const MAX_SOURCES = 8;
/** Files of an import nobody finished are removed the next time the company uploads. */
const STALE_MS = 6 * 60 * 60 * 1000;

type Body = {
  action?: string;
  files?: Array<{ path?: unknown; name?: unknown; mime?: unknown }>;
  links?: unknown[];
  import_id?: unknown;
  post?: unknown;
  /** Builds from before posts were streamed name the post by its place in the stored list. */
  index?: unknown;
};

/** A document as the import row keeps it, so every write can read it again. */
type StoredSource =
  | { kind: 'text'; name: string; text: string }
  | { kind: 'pdf'; name: string; path: string }
  | { kind: 'image'; name: string; path: string; mediaType: ImageType };

type Admin = ReturnType<typeof adminClient>;

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const reasonOf = (e: unknown, fallback: string): string => (e instanceof DocReadError ? e.message : fallback);

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Where each document can be read again: text in the row, files in the bucket. */
async function storeSources(admin: Admin, companyId: string, importId: string, docs: { doc: ReadDoc; path: string | null }[]): Promise<StoredSource[]> {
  return await Promise.all(docs.map(async ({ doc, path }, i): Promise<StoredSource> => {
    if (doc.kind === 'text') return { kind: 'text', name: doc.name, text: doc.text };
    let at = path;
    if (!at) {
      // A file that came from a link has no copy in the bucket yet.
      at = `${companyId}/${importId}-${i}`;
      const { error } = await admin.storage.from(BUCKET).upload(at, fromBase64(doc.base64), { contentType: doc.kind === 'pdf' ? 'application/pdf' : doc.mediaType, upsert: true });
      if (error) throw new Error(`could not keep ${doc.name}: ${error.message}`);
    }
    return doc.kind === 'pdf' ? { kind: 'pdf', name: doc.name, path: at } : { kind: 'image', name: doc.name, path: at, mediaType: doc.mediaType };
  }));
}

async function loadSources(admin: Admin, sources: StoredSource[]): Promise<ReadDoc[]> {
  const docs = await Promise.all(sources.map(async (s): Promise<ReadDoc | null> => {
    if (s.kind === 'text') return { kind: 'text', name: s.name, text: s.text };
    const { data, error } = await admin.storage.from(BUCKET).download(s.path);
    if (error || !data) {
      console.error('brief-import: stored file not read', s.path, error);
      return null;
    }
    const base64 = toBase64(new Uint8Array(await data.arrayBuffer()));
    return s.kind === 'pdf' ? { kind: 'pdf', name: s.name, base64 } : { kind: 'image', name: s.name, base64, mediaType: s.mediaType };
  }));
  return docs.filter((d): d is ReadDoc => !!d);
}

const pathsOf = (sources: unknown): string[] =>
  (Array.isArray(sources) ? sources : []).flatMap((s) => (s && typeof s.path === 'string' ? [s.path as string] : []));

/** Removes files left in the company's folder by imports nobody finished. Never throws. */
async function sweep(admin: Admin, companyId: string, keep: Set<string>): Promise<void> {
  try {
    const { data } = await admin.storage.from(BUCKET).list(companyId, { limit: 200 });
    const old = (data ?? [])
      .filter((f) => f.created_at && Date.now() - new Date(f.created_at).getTime() > STALE_MS)
      .map((f) => `${companyId}/${f.name}`)
      .filter((p) => !keep.has(p));
    if (old.length) await admin.storage.from(BUCKET).remove(old);
  } catch (e) {
    console.error('brief-import: sweep failed', e);
  }
}

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
    const sent = tidyPost(body.post as Partial<ImportPost>);
    const index = Number(body.index);
    if (!importId || (!sent && !(Number.isInteger(index) && index >= 0))) return jsonResponse({ error: 'import_id and post are required' }, 400);
    return streamJsonResponse(async () => {
      const { data: row } = await admin.from('brief_imports').select('plan, sources').eq('id', importId).eq('company_id', companyId).maybeSingle();
      if (!row) return { error: 'That upload was not found. Add the brief again.' };
      const plan = row.plan as ImportPlan;
      const docs = await loadSources(admin, (row.sources ?? []) as StoredSource[]);
      const rules: ImportRules = { product: plan.product ?? '', guidance: plan.guidance ?? '', claims: Array.isArray(plan.claims) ? plan.claims : [] };
      const post = sent ?? tidyPost(plan.posts?.[index]);
      if (!post) return { error: 'That post was not found. Add the brief again.' };
      const result = await writeImport(admin, { companyId, rules, post, docs });
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

  if (body.action === 'done') {
    const importId = str(body.import_id, 60);
    if (!importId) return jsonResponse({ error: 'import_id is required' }, 400);
    const { data: row } = await admin.from('brief_imports').select('sources').eq('id', importId).eq('company_id', companyId).maybeSingle();
    const paths = pathsOf(row?.sources).filter((p) => p.startsWith(`${companyId}/`));
    if (paths.length) await admin.storage.from(BUCKET).remove(paths).catch(() => undefined);
    return jsonResponse({ ok: true });
  }

  if (body.action !== 'plan') return jsonResponse({ error: 'unknown action' }, 400);

  const files = (Array.isArray(body.files) ? body.files : [])
    .map((f) => ({ path: str(f?.path, 400), name: str(f?.name, 200), mime: str(f?.mime, 100) }))
    .filter((f) => f.path)
    .slice(0, MAX_SOURCES);
  const links = (Array.isArray(body.links) ? body.links : []).map((l) => str(l, 800)).filter(Boolean).slice(0, MAX_SOURCES);
  if (!files.length && !links.length) return jsonResponse({ error: 'Add a file or a link first.' }, 400);
  for (const f of files) {
    if (!f.path.startsWith(`${companyId}/`) || f.path.includes('..')) return jsonResponse({ error: 'That file belongs to another company.' }, 403);
  }

  const work = async (emit: SseEmit): Promise<Record<string, unknown>> => {
    void sweep(admin, companyId, new Set(files.map((f) => f.path)));
    const skipped: Array<{ name: string; reason: string }> = [];

    const read = (await Promise.all([
      ...files.map(async (f) => {
        const name = f.name || f.path.split('/').pop() || 'Document';
        try {
          const { data, error } = await admin.storage.from(BUCKET).download(f.path);
          if (error || !data) throw new DocReadError(`${name} did not finish uploading. Try it again.`);
          return { doc: readBytes(new Uint8Array(await data.arrayBuffer()), name, f.mime), path: f.path as string | null };
        } catch (e) {
          console.error('brief-import: file not read', name, e);
          skipped.push({ name, reason: reasonOf(e, `${name} could not be read. Export it as a PDF and try again.`) });
          return null;
        }
      }),
      ...links.map(async (link) => {
        try {
          return { doc: await readLink(link), path: null as string | null };
        } catch (e) {
          console.error('brief-import: link not read', link, e);
          skipped.push({ name: link, reason: reasonOf(e, 'That link could not be read. Add the file instead.') });
          return null;
        }
      }),
    ])).filter((d): d is { doc: ReadDoc; path: string | null } => !!d);

    emit('sources', { read: read.map((r) => ({ name: r.doc.name, kind: r.doc.kind })), skipped });
    if (!read.length) throw new Error(skipped[0]?.reason ?? 'Nothing could be read.');
    const docs = read.map((r) => r.doc);
    const importId = crypto.randomUUID();

    try {
      // The posts are named and the rules lifted side by side. Posts show as
      // they are found; they can be written once the rules are stored.
      const listing = listPosts(admin, { companyId, docs, onPost: (post, index) => emit('post', { index, ...post }) });
      // Handled below; this keeps a failure here from going unhandled while the rules are still being lifted.
      listing.catch(() => undefined);
      const stored = (async () => {
        const [rules, sources] = await Promise.all([liftRules({ companyId, docs }), storeSources(admin, companyId, importId, read)]);
        const { error } = await admin
          .from('brief_imports')
          .insert({ id: importId, company_id: companyId, created_by: caller.userId, sources, plan: { ...rules, posts: [] } satisfies ImportPlan });
        if (error) throw new Error(error.message);
        emit('ready', { import_id: importId });
        return rules;
      })();
      const [posts, rules] = await Promise.all([listing, stored]);

      await admin.from('brief_imports').update({ plan: { ...rules, posts } satisfies ImportPlan }).eq('id', importId);

      // What the brief says is company knowledge: the brain reads it on its next scan.
      for (const d of docs) {
        if (d.kind !== 'text') continue;
        void addSource(admin, { companyId, kind: 'upload', content: d.text, title: d.name, createdBy: caller.userId, meta: { via: 'brief-import', import_id: importId } })
          .catch((e) => console.error('brief-import: brain source not added', e));
      }

      return { import_id: importId, count: posts.length, skipped, posts: posts.map((p, index) => ({ index, ...p })), summary: '' };
    } catch (e) {
      if (e instanceof ImportUnreadableError) throw e;
      console.error('brief-import: plan failed', e);
      throw new Error("Couldn't read that brief. Try again.");
    }
  };
  // A build from before the stream asks for one JSON body and gets the whole list at the end.
  return wantsSse(req) ? sseResponse(work) : streamJsonResponse(() => work(() => undefined));
});

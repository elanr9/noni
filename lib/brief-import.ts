/**
 * Upload a brief, get a set of saved posts. The manager adds files or links;
 * the brief-import edge function reads them and names the posts one by one as
 * it finds them (`planImport`, a stream), and every post is written at the
 * same time (`writeImportPost`). The documents decide how many posts there
 * are. A written post saves to the Briefs library exactly as a Fill in with
 * AI brief does (`importSaveInput`).
 */
import * as DocumentPicker from 'expo-document-picker';
import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { LONG_TEXT_NOTES, callAi, guidedPlanOf, type FillResponse, type GuidedPlan } from './brief-ai';
import type { SaveBriefInput } from './brief-library-api';
import { emptyGuided, newClip, uid, type BriefType, type GuidedState } from './brief-library';
import { supabase } from './supabase';

export const IMPORT_BUCKET = 'brief-imports';
export const MAX_SOURCES = 8;
/** The picker and the server both stop at this size. */
export const MAX_FILE_BYTES = 24 * 1024 * 1024;
/** Posts written at once. Each is its own request. */
export const WRITE_PARALLEL = 10;
/**
 * The first write reads the documents and leaves them cached for the others.
 * The rest start this long after it, so they read the cache instead of the files.
 */
export const WARM_MS = 2500;
const PLAN_TIMEOUT_MS = 150_000;
const WRITE_TIMEOUT_MS = 150_000;

export type ImportSource =
  | { id: string; kind: 'file'; name: string; uri: string; mime: string; size: number | null; file?: Blob }
  | { id: string; kind: 'link'; name: string; url: string };

/** A post as the server names it. Sent back as it came when the post is written. */
export type PlannedPost = { index: number; title: string; type: BriefType; origin: 'document' | 'new'; angle: string; hook: string; source?: string; direction?: string };
export type Skipped = { name: string; reason: string };
export type ImportPlanResult = { importId: string; count: number; skipped: Skipped[] };

/** What the plan reports while it runs. */
export type PlanHandlers = {
  /** The files are uploaded and the server has opened them. */
  onSources?: (skipped: Skipped[]) => void;
  /** A post was found. They arrive in order. */
  onPost?: (post: PlannedPost) => void;
  /** Posts can be written from now on. */
  onReady?: (importId: string) => void;
  signal?: AbortSignal;
};

export type WrittenPost = { index: number; type: BriefType; plan: GuidedPlan };

/** What the picker offers: documents, slides, sheets, text and pictures of pages. */
const PICK_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/rtf',
  'text/*',
  'image/jpeg',
  'image/png',
  'image/webp',
];

export function fileSizeLabel(bytes: number | null): string {
  if (!bytes) return '';
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Opens the system file picker. Returns the files picked, and the names of any that are too large. */
export async function pickImportFiles(): Promise<{ sources: ImportSource[]; tooLarge: string[] }> {
  const result = await DocumentPicker.getDocumentAsync({ type: PICK_TYPES, multiple: true, copyToCacheDirectory: true, base64: false });
  if (result.canceled || !result.assets) return { sources: [], tooLarge: [] };
  const sources: ImportSource[] = [];
  const tooLarge: string[] = [];
  for (const a of result.assets) {
    if ((a.size ?? 0) > MAX_FILE_BYTES) {
      tooLarge.push(a.name);
      continue;
    }
    sources.push({ id: uid(), kind: 'file', name: a.name, uri: a.uri, mime: a.mimeType ?? '', size: a.size ?? null, file: a.file });
  }
  return { sources, tooLarge };
}

/** A pasted address as a link source, or null when it is not one. */
export function linkSource(raw: string): ImportSource | null {
  const value = raw.trim();
  if (!value || /\s/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (!url.hostname.includes('.')) return null;
  const host = url.hostname.replace(/^www\./, '');
  const name = /google\.com$/.test(host) ? (url.pathname.includes('/spreadsheets/') ? 'Google Sheet' : url.pathname.includes('/presentation/') ? 'Google Slides' : 'Google Doc')
    : /notion\.(so|site)$/.test(host) ? 'Notion page'
    : host;
  return { id: uid(), kind: 'link', name, url: url.href };
}

const safeName = (name: string) => name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-80) || 'file';

async function uploadFile(companyId: string, src: Extract<ImportSource, { kind: 'file' }>): Promise<{ path: string; name: string; mime: string }> {
  const path = `${companyId}/${uid()}-${safeName(src.name)}`;
  // On the web the picker hands over the file itself; on a phone the bytes are read from the cached copy.
  const body = Platform.OS === 'web' ? src.file ?? (await (await fetch(src.uri)).blob()) : await new File(src.uri).arrayBuffer();
  const { error } = await supabase.storage.from(IMPORT_BUCKET).upload(path, body, { contentType: src.mime || 'application/octet-stream', upsert: false });
  if (error) throw new Error(`${src.name} did not upload. Check your connection and try again.`);
  return { path, name: src.name, mime: src.mime };
}

/** One `event:` block of a text/event-stream body, or null when it carries no data. */
export function parseSseBlock(block: string): { event: string; data: Record<string, unknown> } | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  try {
    const parsed: unknown = JSON.parse(data.join('\n'));
    return parsed && typeof parsed === 'object' ? { event, data: parsed as Record<string, unknown> } : null;
  } catch {
    return null;
  }
}

const TYPES: readonly BriefType[] = ['Talking Head', 'Long Text', 'Slideshow', 'Greenscreen'];
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

function postOf(data: Record<string, unknown>): PlannedPost | null {
  const index = Number(data.index);
  const title = text(data.title).trim();
  if (!Number.isInteger(index) || index < 0 || !title) return null;
  const type = TYPES.includes(data.type as BriefType) ? (data.type as BriefType) : 'Talking Head';
  return { index, title, type, origin: data.origin === 'new' ? 'new' : 'document', angle: text(data.angle), hook: text(data.hook), source: text(data.source), direction: text(data.direction) };
}

/**
 * Uploads the files, then has the server read everything and name the posts,
 * reporting each as it is found. Throws with a sentence the manager can act on.
 */
export async function planImport(companyId: string, sources: ImportSource[], handlers: PlanHandlers = {}): Promise<ImportPlanResult> {
  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) throw new Error('Supabase is not configured');
  const files = await Promise.all(sources.filter((s): s is Extract<ImportSource, { kind: 'file' }> => s.kind === 'file').map((s) => uploadFile(companyId, s)));
  const links = sources.flatMap((s) => (s.kind === 'link' ? [s.url] : []));
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('You are signed out');

  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), PLAN_TIMEOUT_MS);
  const onAbort = () => stop.abort();
  handlers.signal?.addEventListener('abort', onAbort);
  try {
    const doFetch = (Platform.OS === 'web' ? fetch.bind(globalThis) : expoFetch) as typeof fetch;
    const response = await doFetch(`${baseUrl}/functions/v1/brief-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', apikey: anonKey, Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: 'plan', files, links }),
      signal: stop.signal,
    });
    if (!response.ok) {
      let message = "Couldn't read that brief. Try again.";
      try {
        const json = JSON.parse(await response.text()) as { error?: unknown };
        if (typeof json.error === 'string' && response.status < 500) message = json.error;
      } catch {
        // keep the plain message
      }
      throw new Error(message);
    }

    let result: ImportPlanResult | null = null;
    let failure: string | null = null;
    const read = (block: string) => {
      const e = parseSseBlock(block);
      if (!e) return;
      if (e.event === 'sources') handlers.onSources?.(Array.isArray(e.data.skipped) ? (e.data.skipped as Skipped[]) : []);
      else if (e.event === 'post') {
        const post = postOf(e.data);
        if (post) handlers.onPost?.(post);
      } else if (e.event === 'ready') handlers.onReady?.(text(e.data.import_id));
      else if (e.event === 'result') result = { importId: text(e.data.import_id), count: Number(e.data.count) || 0, skipped: Array.isArray(e.data.skipped) ? (e.data.skipped as Skipped[]) : [] };
      else if (e.event === 'error') failure = text(e.data.message) || "Couldn't read that brief. Try again.";
    };
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
        let cut = buffer.indexOf('\n\n');
        while (cut >= 0) {
          read(buffer.slice(0, cut));
          buffer = buffer.slice(cut + 2);
          cut = buffer.indexOf('\n\n');
        }
      }
      if (buffer.trim()) read(buffer);
    } else {
      for (const block of (await response.text()).replace(/\r\n/g, '\n').split('\n\n')) read(block);
    }
    if (failure) throw new Error(failure);
    const done = result as ImportPlanResult | null;
    if (!done?.importId || !done.count) throw new Error('No posts came back from that brief. Try a different file.');
    return done;
  } catch (e) {
    if (stop.signal.aborted && !handlers.signal?.aborted) throw new Error('That took too long. Try again.');
    throw e;
  } finally {
    clearTimeout(timer);
    handlers.signal?.removeEventListener('abort', onAbort);
  }
}

/** Writes one listed post. Throws when the writer fails; the caller offers a retry. */
export async function writeImportPost(importId: string, post: PlannedPost): Promise<WrittenPost> {
  const res = await callAi<FillResponse>('brief-import', { action: 'write', import_id: importId, post }, WRITE_TIMEOUT_MS);
  const plan = guidedPlanOf(res, emptyGuided(), post.type);
  if (!plan.clips.length) throw new Error('empty plan');
  return { index: post.index, type: post.type, plan: { ...plan, title: plan.title || post.title } };
}

/** The manager saved or left: the uploaded files are removed. Never throws. */
export function finishImport(importId: string): void {
  void callAi<{ ok?: boolean; error?: string }>('brief-import', { action: 'done', import_id: importId }, 20_000).catch(() => undefined);
}

/** Runs `work` over `items`, at most `limit` at a time. Never rejects: `work` reports its own failures. */
export async function pool<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await work(item).catch(() => undefined);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
}

/** A written post as the template it becomes: what the review shows, and what the editor changes. */
export function guidedOf(post: WrittenPost): GuidedState {
  const { plan } = post;
  return { ...emptyGuided(), title: plan.title.trim(), phrase: plan.phrase, clips: plan.clips, caption: plan.caption, tags: plan.tags, angle: plan.angle, ai: plan.ai, filled: true };
}

/** A written post as the Briefs library saves it: the same shape Create writes after Fill in with AI. `edited` is the template after the manager changed it in review. */
export function importSaveInput(post: WrittenPost, id: string = uid(), edited?: GuidedState): SaveBriefInput {
  const { plan, type } = post;
  const title = (edited?.title ?? plan.title).trim();
  if (type === 'Long Text') {
    const first = (edited?.clips ?? plan.clips)[0];
    const onScreen = first?.doc?.texts[0]?.text ?? first?.onScreen ?? '';
    const lt = { title, onScreen, notes: LONG_TEXT_NOTES, doc: first?.doc ?? null, ai: plan.ai };
    return { id, type, kind: 'Guided', noTwin: true, title, notes: lt.notes, lt, clips: [newClip(lt.notes, { onScreen, doc: lt.doc })] };
  }
  const g: GuidedState = edited ?? guidedOf(post);
  const phrase = (g.phrase || g.title).trim();
  const notes = [`Search: ${phrase}`].concat(g.clips.map((c, i) => `${i === 0 ? 'Hook' : `Clip ${i}`}: ${c.text}`)).join('\n');
  return {
    id,
    type,
    kind: 'Guided',
    title,
    notes,
    link: '',
    g,
    audio: g.audio,
    caption: g.caption,
    tags: g.tags,
    clips: g.clips.map((c) => ({ ...c, green: type === 'Greenscreen' && (g.fullGreen || c.green), gs: null })),
  };
}

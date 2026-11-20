/**
 * Upload a brief, get a set of saved posts. The manager adds files, links or
 * pasted text; the brief-import edge function reads them and lists the posts
 * (`planImport`), then writes each one (`writeImportPost`, several at a time).
 * A written post saves to the Briefs library exactly as a Fill in with AI
 * brief does (`importSaveInput`).
 */
import * as DocumentPicker from 'expo-document-picker';
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
export const COUNT_OPTIONS = [6, 12, 20] as const;
/** Posts written at once. Each is one request; more than this only queues at the model. */
export const WRITE_PARALLEL = 4;
const PLAN_TIMEOUT_MS = 150_000;
const WRITE_TIMEOUT_MS = 150_000;

export type ImportSource =
  | { id: string; kind: 'file'; name: string; uri: string; mime: string; size: number | null; file?: Blob }
  | { id: string; kind: 'link'; name: string; url: string }
  | { id: string; kind: 'text'; name: string; text: string };

export type PlannedPost = { index: number; title: string; type: BriefType; origin: 'document' | 'new'; angle: string; hook: string };
export type ImportPlanResult = { importId: string; summary: string; posts: PlannedPost[]; skipped: { name: string; reason: string }[] };

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

export function textSource(text: string): ImportSource | null {
  const value = text.trim();
  if (value.length < 20) return null;
  const first = value.split('\n')[0].trim().slice(0, 40);
  return { id: uid(), kind: 'text', name: first || 'Pasted text', text: value };
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

type PlanResponse = { import_id?: string; summary?: string; posts?: PlannedPost[]; skipped?: { name: string; reason: string }[]; error?: string };

/** Uploads the files, then has the server read everything and list the posts. Throws with a sentence the manager can act on. */
export async function planImport(companyId: string, sources: ImportSource[], count: number, notes = ''): Promise<ImportPlanResult> {
  const files = await Promise.all(sources.filter((s): s is Extract<ImportSource, { kind: 'file' }> => s.kind === 'file').map((s) => uploadFile(companyId, s)));
  const links = sources.flatMap((s) => (s.kind === 'link' ? [s.url] : []));
  const text = sources.flatMap((s) => (s.kind === 'text' ? [s.text] : [])).join('\n\n');
  const res = await callAi<PlanResponse>('brief-import', { action: 'plan', files, links, text, notes, count }, PLAN_TIMEOUT_MS);
  if (!res.import_id || !res.posts?.length) throw new Error('No posts came back from that brief. Try a different file.');
  return { importId: res.import_id, summary: res.summary ?? '', posts: res.posts, skipped: res.skipped ?? [] };
}

/** Writes one listed post. Throws when the writer fails; the caller offers a retry. */
export async function writeImportPost(importId: string, post: PlannedPost): Promise<WrittenPost> {
  const res = await callAi<FillResponse>('brief-import', { action: 'write', import_id: importId, index: post.index }, WRITE_TIMEOUT_MS);
  const plan = guidedPlanOf(res, emptyGuided(), post.type);
  if (!plan.clips.length) throw new Error('empty plan');
  return { index: post.index, type: post.type, plan: { ...plan, title: plan.title || post.title } };
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

/** A written post as the Briefs library saves it: the same shape Create writes after Fill in with AI. */
export function importSaveInput(post: WrittenPost, id: string = uid()): SaveBriefInput {
  const { plan, type } = post;
  const title = plan.title.trim();
  if (type === 'Long Text') {
    const onScreen = plan.clips[0]?.onScreen ?? '';
    const lt = { title, onScreen, notes: LONG_TEXT_NOTES, doc: null, ai: plan.ai };
    return { id, type, kind: 'Guided', noTwin: true, title, notes: lt.notes, lt, clips: [newClip(lt.notes, { onScreen })] };
  }
  const g: GuidedState = { ...emptyGuided(), title, phrase: plan.phrase, clips: plan.clips, caption: plan.caption, tags: plan.tags, angle: plan.angle, ai: plan.ai, filled: true };
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

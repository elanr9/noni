/**
 * Brief library store: the campaign manager's saved templates and outlines.
 * Local first (AsyncStorage cache, instant updates), synced with the
 * `library_briefs` table when it is reachable. Saving a Guided brief also
 * saves its Outline twin (`<id>-o`) unless `noTwin`.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { outlineTwinId, type Brief, type BriefKind } from './brief-library';
import { supabase } from './supabase';
import type { Database, Json } from './types';

type Row = Database['public']['Tables']['library_briefs']['Row'];

const CACHE_KEY = (companyId: string) => `noni.library.${companyId}`;
/** A just-created brief floats to the top for this long. */
export const JUST_MADE_MS = 60_000;

export type JustMade = { ids: string[]; at: number };

export type SaveBriefInput = Partial<Brief> & { id: string; type: Brief['type']; kind: BriefKind; title: string; noTwin?: boolean };

type LibState = {
  companyId: string | null;
  briefs: Brief[];
  loaded: boolean;
  justMade: JustMade | null;
  /** The table is missing or unreachable; the library runs from the local cache. */
  offline: boolean;
  load(companyId: string): Promise<void>;
  /** Saves locally at once; `synced` resolves to null when the server has it, else an error message (the save stays queued). */
  saveBrief(input: SaveBriefInput, by: { userId: string | null; name: string }): { brief: Brief; synced: Promise<string | null> };
  /** Removes locally at once; `synced` resolves to null when the server delete went through. */
  removeBrief(id: string): { synced: Promise<string | null> };
  /** Saves or deletes made while the server was unreachable, waiting to be sent. */
  pending: string[];
  deleted: string[];
  setJustMade(ids: string[]): void;
  clearJustMade(): void;
  /** Dev preview: replace the list without touching storage. */
  seed(briefs: Brief[]): void;
};

function rowToBrief(r: Row): Brief {
  return {
    id: r.id,
    type: r.type as Brief['type'],
    kind: r.kind as BriefKind,
    title: r.title,
    notes: r.notes ?? '',
    link: r.link ?? '',
    by: 'You',
    ts: new Date(r.updated_at).getTime(),
    audio: (r.audio as Brief['audio']) ?? null,
    clips: (r.clips as Brief['clips']) ?? null,
    g: (r.g as Brief['g']) ?? null,
    lt: (r.lt as Brief['lt']) ?? null,
    from: r.from_id,
    caption: r.caption ?? '',
    tags: r.tags ?? [],
  };
}

function briefToRow(b: Brief, companyId: string, userId: string | null): Database['public']['Tables']['library_briefs']['Insert'] {
  return {
    id: b.id,
    company_id: companyId,
    kind: b.kind,
    type: b.type,
    title: b.title,
    notes: b.notes,
    link: b.link || null,
    created_by: userId,
    from_id: b.from,
    audio: b.audio as unknown as Json,
    clips: b.clips as unknown as Json,
    g: b.g as unknown as Json,
    lt: b.lt as unknown as Json,
    caption: b.caption || null,
    tags: b.tags,
    updated_at: new Date(b.ts).toISOString(),
  };
}

function upsert(list: Brief[], b: Brief): Brief[] {
  return list.some((x) => x.id === b.id) ? list.map((x) => (x.id === b.id ? { ...x, ...b } : x)) : [b, ...list];
}

let warned = false;
function warnOnce(e: unknown) {
  if (warned) return;
  warned = true;
  console.warn('library_briefs unavailable, running from the local cache', e instanceof Error ? e.message : e);
}

type Cache = { briefs: Brief[]; pending: string[]; deleted: string[] };

function persist(companyId: string | null, c: Cache) {
  if (!companyId) return;
  AsyncStorage.setItem(CACHE_KEY(companyId), JSON.stringify(c)).catch(() => undefined);
}

function readCache(raw: string | null): Cache | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    // Older caches were a bare list with no record of what was unsent: trust the server for those.
    if (Array.isArray(v)) return { briefs: v as Brief[], pending: [], deleted: [] };
    const c = v as Partial<Cache>;
    return { briefs: c.briefs ?? [], pending: c.pending ?? [], deleted: c.deleted ?? [] };
  } catch {
    return null;
  }
}

function errText(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') return (e as { message: string }).message;
  return String(e);
}

export const useLibStore = create<LibState>((set, get) => {
  const save = () => {
    const { companyId, briefs, pending, deleted } = get();
    persist(companyId, { briefs, pending, deleted });
  };
  const upsertRemote = async (rows: Brief[], companyId: string, userId: string | null): Promise<string | null> => {
    const { error } = await supabase.from('library_briefs').upsert(rows.map((b) => briefToRow(b, companyId, userId)));
    if (get().companyId !== companyId) return error ? errText(error) : null;
    const ids = rows.map((r) => r.id);
    if (error) {
      warnOnce(error);
      set({ pending: [...new Set([...get().pending, ...ids])], offline: true });
      save();
      return errText(error);
    }
    set({ pending: get().pending.filter((p) => !ids.includes(p)), offline: false });
    save();
    return null;
  };
  const deleteRemote = async (ids: string[], companyId: string): Promise<string | null> => {
    const { error } = await supabase.from('library_briefs').delete().in('id', ids);
    if (get().companyId !== companyId) return error ? errText(error) : null;
    if (error) {
      warnOnce(error);
      set({ deleted: [...new Set([...get().deleted, ...ids])], offline: true });
      save();
      return errText(error);
    }
    set({ deleted: get().deleted.filter((d) => !ids.includes(d)), offline: false });
    save();
    return null;
  };

  return {
  companyId: null,
  briefs: [],
  loaded: false,
  justMade: null,
  offline: false,
  pending: [],
  deleted: [],

  async load(companyId) {
    if (get().companyId !== companyId) set({ companyId, briefs: [], loaded: false, pending: [], deleted: [] });
    const cached = readCache(await AsyncStorage.getItem(CACHE_KEY(companyId)).catch(() => null));
    if (cached && get().companyId === companyId && !get().loaded) set({ briefs: cached.briefs, pending: cached.pending, deleted: cached.deleted });
    try {
      const { data, error } = await supabase.from('library_briefs').select('*').eq('company_id', companyId).order('updated_at', { ascending: false });
      if (error) throw error;
      if (get().companyId !== companyId) return;
      const { pending, deleted } = get();
      // The server is the truth; only saves this device made offline ride on top of it.
      const unsent = get().briefs.filter((b) => pending.includes(b.id));
      const remote = (data ?? []).map(rowToBrief).filter((r) => !deleted.includes(r.id) && !unsent.some((u) => u.id === r.id));
      const merged = [...unsent, ...remote].sort((a, b) => b.ts - a.ts);
      set({ briefs: merged, loaded: true, offline: false });
      save();
      if (unsent.length) void upsertRemote(unsent, companyId, null);
      if (deleted.length) void deleteRemote(deleted, companyId);
    } catch (e) {
      warnOnce(e);
      if (get().companyId === companyId) set({ loaded: true, offline: true });
    }
  },

  saveBrief(input, by) {
    const { companyId } = get();
    const now = Date.now();
    const prev = get().briefs.find((b) => b.id === input.id);
    const { noTwin, ...rest } = input;
    const brief: Brief = {
      notes: '',
      link: '',
      audio: null,
      clips: null,
      g: null,
      lt: null,
      from: null,
      caption: '',
      tags: [],
      ...prev,
      ...rest,
      by: by.name,
      ts: now,
    };
    let list = upsert(get().briefs, brief);
    const rows: Brief[] = [brief];
    if (brief.kind === 'Guided' && !noTwin) {
      const twin: Brief = {
        ...(get().briefs.find((b) => b.id === outlineTwinId(brief.id)) ?? brief),
        id: outlineTwinId(brief.id),
        type: brief.type,
        kind: 'Outline',
        title: brief.title,
        notes: brief.notes,
        link: brief.link,
        audio: null,
        clips: null,
        g: null,
        lt: null,
        caption: '',
        tags: [],
        from: brief.id,
        by: by.name,
        ts: now - 1,
      };
      list = upsert(list, twin);
      rows.push(twin);
    }
    const ids = rows.map((r) => r.id);
    set({ briefs: list, pending: [...new Set([...get().pending, ...ids])], deleted: get().deleted.filter((d) => !ids.includes(d)) });
    save();
    const synced = companyId ? upsertRemote(rows, companyId, by.userId) : Promise.resolve('No company selected');
    return { brief, synced };
  },

  removeBrief(id) {
    const { companyId } = get();
    // A Guided brief takes its Outline twin with it.
    const ids = get().briefs.filter((b) => b.id === id || b.from === id).map((b) => b.id);
    if (!ids.includes(id)) ids.push(id);
    set({ briefs: get().briefs.filter((b) => !ids.includes(b.id)), pending: get().pending.filter((p) => !ids.includes(p)), deleted: [...new Set([...get().deleted, ...ids])] });
    save();
    return { synced: companyId ? deleteRemote(ids, companyId) : Promise.resolve('No company selected') };
  },

  setJustMade(ids) {
    set({ justMade: { ids, at: Date.now() } });
  },
  clearJustMade() {
    set({ justMade: null });
  },
  seed(briefs) {
    set({ briefs, loaded: true, companyId: get().companyId ?? 'preview' });
  },
  };
});

export function libFind(id: string | undefined | null): Brief | undefined {
  if (!id) return undefined;
  return useLibStore.getState().briefs.find((b) => b.id === id);
}

/** The just-made highlight while it is fresh. */
export function freshJustMade(jm: JustMade | null): JustMade | null {
  return jm && Date.now() - jm.at < JUST_MADE_MS ? jm : null;
}

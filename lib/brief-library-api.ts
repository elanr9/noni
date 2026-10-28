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
  saveBrief(input: SaveBriefInput, by: { userId: string | null; name: string }): Brief;
  removeBrief(id: string): void;
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

function persist(companyId: string | null, briefs: Brief[]) {
  if (!companyId) return;
  AsyncStorage.setItem(CACHE_KEY(companyId), JSON.stringify(briefs)).catch(() => undefined);
}

export const useLibStore = create<LibState>((set, get) => ({
  companyId: null,
  briefs: [],
  loaded: false,
  justMade: null,
  offline: false,

  async load(companyId) {
    if (get().companyId !== companyId) set({ companyId, briefs: [], loaded: false });
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY(companyId));
      if (raw && get().companyId === companyId && !get().loaded) set({ briefs: JSON.parse(raw) as Brief[] });
    } catch {
      // cache is best effort
    }
    try {
      const { data, error } = await supabase.from('library_briefs').select('*').eq('company_id', companyId).order('updated_at', { ascending: false });
      if (error) throw error;
      if (get().companyId !== companyId) return;
      const remote = (data ?? []).map(rowToBrief);
      // Keep anything saved locally that the server has not seen yet.
      const local = get().briefs.filter((b) => !remote.some((r) => r.id === b.id));
      const merged = [...local, ...remote].sort((a, b) => b.ts - a.ts);
      set({ briefs: merged, loaded: true, offline: false });
      persist(companyId, merged);
      for (const b of local) {
        void supabase.from('library_briefs').upsert(briefToRow(b, companyId, null)).then(({ error: e }) => e && warnOnce(e));
      }
    } catch (e) {
      warnOnce(e);
      set({ loaded: true, offline: true });
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
    set({ briefs: list });
    persist(companyId, list);
    if (companyId) {
      void supabase
        .from('library_briefs')
        .upsert(rows.map((b) => briefToRow(b, companyId, by.userId)))
        .then(({ error }) => error && warnOnce(error));
    }
    return brief;
  },

  removeBrief(id) {
    const { companyId } = get();
    const list = get().briefs.filter((b) => b.id !== id);
    set({ briefs: list });
    persist(companyId, list);
    if (companyId) void supabase.from('library_briefs').delete().eq('id', id).then(({ error }) => error && warnOnce(error));
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
}));

export function libFind(id: string | undefined | null): Brief | undefined {
  if (!id) return undefined;
  return useLibStore.getState().briefs.find((b) => b.id === id);
}

/** The just-made highlight while it is fresh. */
export function freshJustMade(jm: JustMade | null): JustMade | null {
  return jm && Date.now() - jm.at < JUST_MADE_MS ? jm : null;
}

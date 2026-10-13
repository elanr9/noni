// Hrefs between the week, the kind picker and the brief editor. Every
// screen passes the campaign, the slot's brief id, its index and the format
// so none of them has to refetch the week to know where it is.

import type { Href } from 'expo-router';

import type { BriefKind, BriefMediaFormat } from '../../../lib/briefs-api';

export type SlotParams = {
  campaignId: string;
  briefId: string;
  slot: string;
  format: BriefMediaFormat;
  week?: string;
};

export type EditorParams = SlotParams & {
  kind?: BriefKind;
  postTypeKey?: string;
};

export function parseFormat(value: string | undefined): BriefMediaFormat {
  return value === 'reel' ? 'reel' : 'slideshow';
}

export function parseKind(value: string | undefined): BriefKind | null {
  return value === 'handheld' || value === 'story' || value === 'open' ? value : null;
}

export function parseSlot(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function kindHref(p: SlotParams): Href {
  return { pathname: '/(admin)/brief/kind', params: { ...p } } as Href;
}

export function editorHref(p: EditorParams): Href {
  const { briefId, ...rest } = p;
  return { pathname: '/(admin)/brief/[id]', params: { id: briefId, ...rest } } as Href;
}

/** Back to the week; `added` is the two digit slot label the toast names. */
export function weekHref(campaignId: string, added?: string, format?: BriefMediaFormat): Href {
  const params: Record<string, string> = { id: campaignId };
  if (added) params.added = added;
  if (format) params.format = format;
  return { pathname: '/(admin)/week/[id]', params } as Href;
}

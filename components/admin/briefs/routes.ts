// Hrefs between the week, the kind picker, the idea chat and the brief
// editor. Every screen passes the campaign, the slot's brief id, its index
// and the format so none of them has to refetch the week to know where it is.

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
  /** An idea from the idea chat: the editor writes the whole post from it on open. */
  ideaCover?: string;
  ideaSay?: string;
  ideaCount?: string;
  ideaAngle?: string;
};

/** The idea chat for a week; briefId and format when opened from one empty slot. */
export type IdeasParams = {
  campaignId: string;
  briefId?: string;
  format?: BriefMediaFormat;
  week?: string;
};

/** Reels first: a week and a brief open on reels unless the link says slideshow. */
export function parseFormat(value: string | undefined): BriefMediaFormat {
  return value === 'slideshow' ? 'slideshow' : 'reel';
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

export function ideasHref(p: IdeasParams): Href {
  const params: Record<string, string> = { campaignId: p.campaignId };
  if (p.briefId) params.briefId = p.briefId;
  if (p.format) params.format = p.format;
  if (p.week) params.week = p.week;
  return { pathname: '/(admin)/ideas/[campaignId]', params } as Href;
}

/** The Briefs tab: where every post flow lands when it is done. */
export const BRIEFS_TAB_HREF = '/(admin)/(tabs)/briefs' as Href;

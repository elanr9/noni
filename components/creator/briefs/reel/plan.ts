// The clip plan for a reel, ported from reference_ui/briefs/RLCreator.jsx
// clipPlan and PLUG. Handheld: one clip per point, plug shuffled in. Story:
// the hook clip, free clips, then the plug. Freestyle: free clips, then the
// plug. Long text: one 6 second clip with the text already on it.
import type { SlideBox, SlideRole, SlideTextStyle, WeekBrief } from '../../../../lib/briefs-api';
import { creatorSlides } from '../model';

export const LONG_TEXT_TARGET_MS = 6000;

export type ReelPlanItem = {
  id: string;
  role: SlideRole;
  /** On screen text (the point label, the long text, the plug line). */
  text: string;
  /** Teleprompter line. */
  say: string;
  /** The creator added this clip on their own (Story middle, Freestyle). */
  free: boolean;
  insetFeatureId: string | null;
  box?: SlideBox;
  insetBox?: SlideBox;
  tstyle?: SlideTextStyle;
  /** Stop recording at this length, Long text only. */
  targetMs?: number;
  /** Blocks in the studio document that belong to this item, first is the main take. */
  blockIds: string[];
};

let seq = 0;
export function nextPlanId(): string {
  seq += 1;
  return `rp${Date.now().toString(36)}${seq.toString(36)}`;
}

export function freeClipItem(): ReelPlanItem {
  return { id: nextPlanId(), role: 'point', text: '', say: '', free: true, insetFeatureId: null, blockIds: [] };
}

export function plugItem(text: string, featureId: string | null, say: string): ReelPlanItem {
  return {
    id: nextPlanId(),
    role: 'cta',
    text,
    say,
    free: false,
    insetFeatureId: featureId,
    box: { x: 0.44, y: 0.58, w: 0.66 },
    insetBox: { x: 0.44, y: 0.3, w: 0.42 },
    tstyle: { size: 0.82 },
    blockIds: [],
  };
}

export const PLUG_SAY = 'Say it while the recording plays';
export const LONG_TEXT_SAY = 'Six seconds. Look at the camera, the text does the talking.';

export function clipPlan(brief: WeekBrief): ReelPlanItem[] {
  if (brief.postTypeKey === 'long_text') {
    const cover = brief.slides.find((s) => s.role === 'cover');
    return [
      {
        id: nextPlanId(),
        role: 'cover',
        text: cover?.text || brief.title,
        say: LONG_TEXT_SAY,
        free: false,
        insetFeatureId: null,
        targetMs: LONG_TEXT_TARGET_MS,
        tstyle: { size: 0.6, align: 'left', bg: 'none' },
        box: { x: 0.5, y: 0.42, w: 0.86 },
        blockIds: [],
      },
    ];
  }
  if (brief.kind === 'handheld') {
    return creatorSlides(brief.slides).map((s) => ({
      id: s.id,
      role: s.role,
      text: s.text,
      say: s.role === 'cta' && !s.shot ? PLUG_SAY : s.shot,
      free: false,
      insetFeatureId: s.insetFeatureId,
      ...(s.box ? { box: s.box } : {}),
      ...(s.insetBox ? { insetBox: s.insetBox } : {}),
      ...(s.tstyle ? { tstyle: s.tstyle } : {}),
      blockIds: [],
    }));
  }
  if (brief.kind === 'story') {
    const cover = brief.slides.find((s) => s.role === 'cover');
    return [
      {
        id: nextPlanId(),
        role: 'cover',
        text: brief.title,
        say: cover?.shot || brief.story?.theme || brief.title,
        free: false,
        insetFeatureId: null,
        blockIds: [],
      },
    ];
  }
  return [];
}

export function isGuided(brief: WeekBrief): boolean {
  return brief.kind === 'handheld';
}

/** Every planned clip recorded, plus at least one free clip for Story and Freestyle. */
export function planReady(brief: WeekBrief, items: ReelPlanItem[]): boolean {
  const recorded = (p: ReelPlanItem) => p.blockIds.length > 0;
  const own = items.filter((p) => p.free && recorded(p)).length;
  if (brief.kind === 'handheld') return items.length > 0 && items.every(recorded);
  if (brief.kind === 'open') return own >= 1;
  const hasPlug = items.some((p) => p.role === 'cta');
  return hasPlug && items.every(recorded) && own >= 1;
}

export function prompterLabel(item: ReelPlanItem, guided: boolean): string {
  if (item.targetMs) return 'Just look at the camera';
  if (item.role === 'cover') return 'Your hook';
  if (item.role === 'cta') return 'Your plug \u00b7 say it like a tip';
  return guided ? 'Say something like' : '';
}

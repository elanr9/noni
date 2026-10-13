// Editor side shapes: a slide with a stable id for lists and animations,
// and the step ids of the stepped flow (SSFlow.jsx).

import type { BriefSlide } from '../../../../lib/briefs-api';

export type EditorSlide = BriefSlide & {
  id: number;
  /** When AI last wrote this slide, for the place in animation. */
  genAt?: number;
};

export type StepId = 'cover' | 'points' | 'cta' | 'details' | 'review';

export type SheetId = 'intro' | 'feature' | 'count' | 'fyp' | 'gap' | 'revise' | null;

export type BusyId = 'cta' | 'hook' | 'points' | 'details' | 'revise' | null;

export function stripEditorSlide(s: EditorSlide): BriefSlide {
  const out: BriefSlide = { role: s.role, text: s.text, shot: s.shot, inset_feature_id: s.inset_feature_id };
  if (s.box) out.box = s.box;
  if (s.inset_box) out.inset_box = s.inset_box;
  if (s.box_ig) out.box_ig = s.box_ig;
  if (s.inset_box_ig) out.inset_box_ig = s.inset_box_ig;
  if (s.tstyle) out.tstyle = s.tstyle;
  if (s.extras?.length) out.extras = s.extras;
  if (s.pics?.length) out.pics = s.pics;
  return out;
}

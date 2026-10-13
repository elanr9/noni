// Pure helpers for the creator side of the briefs redesign. Ported from
// reference_ui/briefs/SSCreator.jsx (creatorSlides, buildSlides, roleLabel)
// and SSShared.jsx (layoutOf). Nothing here touches the network.
import type { OverlayBox } from '../../../lib/overlay-boxes';
import type {
  BriefSlide,
  SlideBox,
  SlideExtra,
  SlidePic,
  SlideRole,
  SlideTextStyle,
  WeekBrief,
} from '../../../lib/briefs-api';
import type { PickedPhoto } from '../../../lib/submissions';
import type { TaskStatus } from '../../../lib/tasks';
import { color } from '../../../theme/tokens';

/** Home and sent screen status buckets (SSCreator CREATOR_POSTS.status). */
export type CreatorStatus = 'assigned' | 'review' | 'posted';

export function creatorStatus(status: TaskStatus | string): CreatorStatus {
  switch (status) {
    case 'assigned':
    case 'changes_requested':
      return 'assigned';
    case 'posted':
      return 'posted';
    default:
      return 'review';
  }
}

export type SlidePlatform = 'tiktok' | 'instagram';

export type CreatorSlide = {
  id: string;
  role: SlideRole;
  text: string;
  /** The creator writes this slide (Story middle, every Freestyle slide). */
  own: boolean;
  shot: string;
  insetFeatureId: string | null;
  box?: SlideBox;
  insetBox?: SlideBox;
  boxIg?: SlideBox;
  insetBoxIg?: SlideBox;
  tstyle?: SlideTextStyle;
  /** The manager's extra text boxes and photo stickers, locked on the slide. */
  extras?: SlideExtra[];
  pics?: SlidePic[];
  photo: PickedPhoto | null;
};

let seq = 0;
export function nextSlideId(): string {
  seq += 1;
  return `cs${Date.now().toString(36)}${seq.toString(36)}`;
}

function fromBrief(slide: BriefSlide, own = false): CreatorSlide {
  const out: CreatorSlide = {
    id: nextSlideId(),
    role: slide.role,
    text: slide.text,
    own,
    shot: slide.shot,
    insetFeatureId: slide.inset_feature_id,
    photo: null,
  };
  if (slide.box) out.box = slide.box;
  if (slide.inset_box) out.insetBox = slide.inset_box;
  if (slide.box_ig) out.boxIg = slide.box_ig;
  if (slide.inset_box_ig) out.insetBoxIg = slide.inset_box_ig;
  if (slide.tstyle) out.tstyle = slide.tstyle;
  if (slide.extras?.length) out.extras = slide.extras;
  if (slide.pics?.length) out.pics = slide.pics;
  return out;
}

export function ownSlide(role: SlideRole = 'point'): CreatorSlide {
  return { id: nextSlideId(), role, text: '', own: true, shot: '', insetFeatureId: null, photo: null };
}

/**
 * Per creator shuffle of a Handheld brief: points in a random order and the
 * CTA dropped in among the first three, its "Tip N" prefix renumbered.
 */
export function creatorSlides(brief: BriefSlide[]): CreatorSlide[] {
  const cover = brief.find((s) => s.role === 'cover');
  const cta = brief.find((s) => s.role === 'cta');
  const points = brief.filter((s) => s.role === 'point').map((s) => fromBrief(s));
  for (let i = points.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [points[i], points[j]] = [points[j], points[i]];
  }
  if (cta) {
    const at = 1 + Math.floor(Math.random() * Math.min(3, points.length));
    const ctaSlide = fromBrief(cta);
    ctaSlide.text = ctaSlide.text.replace(/^Tip \d+/, `Tip ${at + 1}`);
    points.splice(at, 0, ctaSlide);
  }
  return cover ? [fromBrief(cover), ...points] : points;
}

/** The slides a creator starts from, per kind (SSCreator buildSlides). */
export function buildSlides(brief: WeekBrief): CreatorSlide[] {
  if (brief.kind === 'story') {
    const min = brief.story?.min ?? 3;
    const middle = Math.max(1, min - 1);
    const cover = ownSlideWithText('cover', brief.title);
    cover.own = false;
    const cta: CreatorSlide = {
      ...ownSlide('cta'),
      own: false,
      text: brief.cta.text,
      insetFeatureId: brief.cta.featureId,
    };
    return [cover, ...Array.from({ length: middle }, () => ownSlide()), cta];
  }
  if (brief.kind === 'open') return [];
  return creatorSlides(brief.slides);
}

function ownSlideWithText(role: SlideRole, text: string): CreatorSlide {
  return { ...ownSlide(role), text };
}

/** Freestyle plug slide added before review when the creator never made one. */
export function plugSlide(text: string, featureId: string | null): CreatorSlide {
  return {
    ...ownSlide('cta'),
    own: false,
    text,
    insetFeatureId: featureId,
    box: { x: 0.44, y: 0.58, w: 0.66 },
    insetBox: { x: 0.44, y: 0.3, w: 0.42 },
    boxIg: { x: 0.5, y: 0.62, w: 0.74 },
    insetBoxIg: { x: 0.5, y: 0.38, w: 0.4 },
    tstyle: { size: 0.82 },
  };
}

export function roleLabel(slide: CreatorSlide, index: number): string {
  if (slide.role === 'cover') return 'Cover slide';
  if (slide.role === 'cta') return 'Your plug';
  if (slide.own) return `Your slide ${index + 1}`;
  return `Tip ${index}`;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Where the text and the inset sit on the slide, as frame fractions (SSShared layoutOf). */
export function layoutOf(
  slide: Pick<CreatorSlide, 'box' | 'insetBox' | 'boxIg' | 'insetBoxIg' | 'insetFeatureId'>,
  platform: SlidePlatform = 'tiktok',
): { text: SlideBox; inset: SlideBox } {
  const hasInset = slide.insetFeatureId !== null;
  if (platform === 'instagram') {
    const inset =
      slide.insetBoxIg ??
      (slide.insetBox ? { ...slide.insetBox, y: clamp(slide.insetBox.y, 0.26, 0.74) } : { x: 0.5, y: 0.4, w: 0.56 });
    const text =
      slide.boxIg ??
      (slide.box
        ? { ...slide.box, y: clamp(slide.box.y, 0.22, 0.78) }
        : hasInset
          ? { x: 0.5, y: 0.66, w: 0.66 }
          : { x: 0.5, y: 0.5, w: 0.66 });
    return { text, inset };
  }
  const inset = slide.insetBox ?? { x: 0.5, y: 0.32, w: 0.56 };
  const text = slide.box ?? (hasInset ? { x: 0.5, y: 0.6, w: 0.66 } : { x: 0.5, y: 0.45, w: 0.66 });
  return { text, inset };
}

/** Prototype text is 0.072 of the frame width times tstyle.size. */
export const SLIDE_TEXT_SIZE = 0.072;

/** The slide text, plus the manager's extras, as the OverlayBoxes SlideStage draws and the render bakes. */
export function slideBoxes(slide: CreatorSlide, platform: SlidePlatform = 'tiktok'): OverlayBox[] {
  const out: OverlayBox[] = [];
  if (slide.text.trim()) {
    const L = layoutOf(slide, platform);
    out.push({
      id: `${slide.id}-main`,
      text: slide.text,
      color: color.white,
      bg: true,
      size: SLIDE_TEXT_SIZE * (slide.tstyle?.size ?? 1),
      x: L.text.x,
      y: L.text.y,
      width: L.text.w,
    });
  }
  for (const e of slide.extras ?? []) {
    if (!e.text.trim()) continue;
    out.push({
      id: `${slide.id}-x-${e.id}`,
      text: e.text,
      color: color.white,
      bg: true,
      size: SLIDE_TEXT_SIZE * (e.tstyle?.size ?? 1),
      x: e.box.x,
      y: e.box.y,
      width: e.box.w,
    });
  }
  return out;
}

/** Sticker sources the app can show directly; storage paths need a signed URL the lane does not have. */
export function picUri(src: string): string | null {
  return /^(https?:|file:|ph:|assets-library:)/.test(src) ? src : null;
}

export function patchSlideBox(slide: CreatorSlide, platform: SlidePlatform, x: number, y: number): CreatorSlide {
  const L = layoutOf(slide, platform);
  const next = { ...L.text, x, y };
  return platform === 'instagram' ? { ...slide, boxIg: next } : { ...slide, box: next };
}

export function patchSlideInset(slide: CreatorSlide, platform: SlidePlatform, x: number, y: number): CreatorSlide {
  const L = layoutOf(slide, platform);
  const next = { ...L.inset, x, y };
  return platform === 'instagram' ? { ...slide, insetBoxIg: next } : { ...slide, insetBox: next };
}

export function hashtagList(text: string): string[] {
  return text
    .split(/\s+/)
    .map((t) => t.replace(/^#/, ''))
    .filter(Boolean);
}

/** Caption and hashtag halves of a stored caption ("text #a #b"). */
export function splitCaption(caption: string): { text: string; tags: string } {
  const [text, ...rest] = caption.split(' #');
  return { text: text ?? '', tags: rest.length ? `#${rest.join(' #')}` : '' };
}

/** Feature tone key from a library title (ss-data library ids). */
export function featureToneKey(
  title: string,
  isGeneral: boolean,
): 'general' | 'bestfit' | 'hl' | 'reply' | 'search' | 'inbox' | 'sent' | 'school' {
  if (isGeneral) return 'general';
  const t = title.toLowerCase();
  if (/hl|highlight|video|film/.test(t)) return 'hl';
  if (/reply|respond|message/.test(t)) return 'reply';
  if (/search|school-search|find/.test(t)) return 'search';
  if (/inbox/.test(t)) return 'inbox';
  if (/sent|campaign|email/.test(t)) return 'sent';
  if (/solo|school|program/.test(t)) return 'school';
  if (/fit|plan/.test(t)) return 'bestfit';
  return 'general';
}

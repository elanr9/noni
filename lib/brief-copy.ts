// Verbatim copy for the briefs redesign, from
// claude_code_handoff/reference_ui/briefs/ss-data.js.txt. UI reads strings
// from here; nothing in this file touches the network.

import type { BriefKind, BriefMediaFormat, CtaPlacement, MustHave } from './briefs-api';

export type KindCopy = {
  name: string;
  line: string;
  creatorCta: string;
};

export const KIND_ORDER: BriefKind[] = ['handheld', 'story', 'open'];

export const KINDS_SLIDESHOW: Record<BriefKind, KindCopy> = {
  handheld: {
    name: 'Handheld',
    line: 'You write every slide. The creator adds photos.',
    creatorCta: 'Add your photos',
  },
  story: {
    name: 'Story',
    line: 'You set the title and CTA. The creator picks the text and images.',
    creatorCta: 'Tell your story',
  },
  open: {
    name: 'Freestyle',
    line: 'No instructions. The creator makes whatever they want.',
    creatorCta: 'Make it',
  },
};

export const KINDS_REEL: Record<BriefKind, KindCopy> = {
  handheld: {
    name: 'Handheld',
    line: 'You write the hook and every point. The creator records.',
    creatorCta: 'Record it',
  },
  story: {
    name: 'Story',
    line: 'You set the hook and CTA. The creator fills the middle.',
    creatorCta: 'Tell your story',
  },
  open: {
    name: 'Freestyle',
    line: 'No instructions. The creator makes whatever they want.',
    creatorCta: 'Make it',
  },
};

export function kindsFor(format: BriefMediaFormat): Record<BriefKind, KindCopy> {
  return format === 'reel' ? KINDS_REEL : KINDS_SLIDESHOW;
}

export type PostTypeCopy = {
  /** Prototype id, stable across companies. */
  id: string;
  /** post_types.key for the company row. */
  key: string;
  format: BriefMediaFormat;
  name: string;
  line: string;
  about: string;
  example: string;
  slides: string[];
  minPoints: number;
  maxPoints: number;
  clipStructure: 'hook_points_outro' | 'single_clip' | 'slide_per_point';
};

export const POST_TYPES_SLIDESHOW: PostTypeCopy[] = [
  {
    id: 'howto',
    key: 'how_to',
    format: 'slideshow',
    name: 'How to',
    line: 'Cover, 3 to 7 slides, close',
    about: 'Slideshow with clean hook on how to do X.\nEx: "How to meal prep a week of lunches"',
    example: 'How to meal prep a week of lunches',
    slides: ['Pick 3 recipes', 'Shop once on Sunday', 'Cook in two batches', 'Portion into 5 boxes'],
    minPoints: 3,
    maxPoints: 7,
    clipStructure: 'slide_per_point',
  },
  {
    id: 'tips',
    key: 'numbered_tips',
    format: 'slideshow',
    name: 'Numbered tips',
    line: 'Cover, 3 to 10 slides, close',
    about: 'Slideshow with a number in the hook and one tip a slide.\nEx: "5 tips for better phone photos"',
    example: '5 tips for better phone photos',
    slides: ['Clean the lens', 'Shoot near a window', 'Tap to focus', 'Turn off the flash', 'Hold it at eye level'],
    minPoints: 3,
    maxPoints: 10,
    clipStructure: 'slide_per_point',
  },
  {
    id: 'start',
    key: 'getting_started',
    format: 'slideshow',
    name: 'Getting started',
    line: 'Cover, 3 to 7 slides, close',
    about: 'Slideshow for someone starting from zero, first steps in order.\nEx: "Starting to run with zero fitness"',
    example: 'Starting to run with zero fitness',
    slides: ['Walk 20 minutes a day', 'Run 1 minute, walk 2', 'Add one run a week'],
    minPoints: 3,
    maxPoints: 7,
    clipStructure: 'slide_per_point',
  },
  {
    id: 'myths',
    key: 'myths',
    format: 'slideshow',
    name: 'Myths',
    line: 'Cover, 3 to 6 slides, close',
    about: 'Slideshow that calls out one myth a slide, then the truth.\nEx: "4 budgeting myths that cost you money"',
    example: '4 budgeting myths that cost you money',
    slides: ['You need a big salary', 'Coffee is the problem', 'A budget means no fun'],
    minPoints: 3,
    maxPoints: 6,
    clipStructure: 'slide_per_point',
  },
];

export const POST_TYPES_REEL: PostTypeCopy[] = [
  {
    id: 'talking',
    key: 'talking_head',
    format: 'reel',
    name: 'Talking head',
    line: 'Hook, 3 to 6 points, close',
    about: 'One person to camera. Credential first, then the hook, then the points.\nEx: "What I check before signing any lease"',
    example: 'What I check before signing any lease',
    slides: ['The water pressure', 'What utilities really cost', 'The move out rules'],
    minPoints: 3,
    maxPoints: 6,
    clipStructure: 'hook_points_outro',
  },
  {
    id: 'tips',
    key: 'numbered_list',
    format: 'reel',
    name: 'Numbered list',
    line: 'Hook, 3 to 8 points, close',
    about: 'A number in the hook, one point a clip.\nEx: "5 tips for better phone photos"',
    example: '5 tips for better phone photos',
    slides: ['Clean the lens', 'Shoot near a window', 'Tap to focus', 'No flash'],
    minPoints: 3,
    maxPoints: 8,
    clipStructure: 'hook_points_outro',
  },
  {
    id: 'howto',
    key: 'how_to_reel',
    format: 'reel',
    name: 'How to',
    line: 'Hook, 3 to 6 steps, close',
    about: 'Steps in order, each one shown on camera.\nEx: "How to email a landlord"',
    example: 'How to email a landlord',
    slides: ['Subject line they open', 'First line: who you are', 'Attach what they need', 'Ask one question'],
    minPoints: 3,
    maxPoints: 6,
    clipStructure: 'hook_points_outro',
  },
  {
    id: 'explainer',
    key: 'explainer',
    format: 'reel',
    name: 'Explainer',
    line: 'Hook, 2 to 5 beats, close',
    about: 'One idea explained start to finish, with B roll.\nEx: "Why landlords ignore your emails"',
    example: 'Why landlords ignore your emails',
    slides: ['They get 50 a day', 'Yours has no details', 'Yours has no question'],
    minPoints: 2,
    maxPoints: 5,
    clipStructure: 'hook_points_outro',
  },
  {
    id: 'storytime',
    key: 'storytime',
    format: 'reel',
    name: 'Storytime',
    line: 'Hook, the story, close',
    about: 'First person, past tense. The turn in the story is the plug.\nEx: "How I paid off my first credit card"',
    example: 'How I paid off my first credit card',
    slides: ['Where it started', 'The setback', 'The turn', 'Where I am now'],
    minPoints: 2,
    maxPoints: 6,
    clipStructure: 'hook_points_outro',
  },
  {
    id: 'green',
    key: 'green_screen_react',
    format: 'reel',
    name: 'Green screen react',
    line: 'Hook, 2 to 5 reacts, close',
    about: 'A screenshot or clip behind the creator. They react to it.\nEx: "Reacting to a reply I got"',
    example: 'Reacting to a real reply I got',
    slides: ['What they said', 'What it really means', 'What to send back'],
    minPoints: 2,
    maxPoints: 5,
    clipStructure: 'hook_points_outro',
  },
  {
    id: 'longtext',
    key: 'long_text',
    format: 'reel',
    name: 'Long text',
    line: 'One clip, one long text',
    about: 'A 6 second clip with a long text on it, longer than the clip, so it gets rewatched.\nEx: "Things nobody tells you about moving out"',
    example: 'Things nobody tells you about moving out',
    slides: [],
    minPoints: 1,
    maxPoints: 1,
    clipStructure: 'single_clip',
  },
];

export function postTypesFor(format: BriefMediaFormat): PostTypeCopy[] {
  return format === 'reel' ? POST_TYPES_REEL : POST_TYPES_SLIDESHOW;
}

export function postTypeByKey(key: string | null | undefined): PostTypeCopy | null {
  if (!key) return null;
  return [...POST_TYPES_SLIDESHOW, ...POST_TYPES_REEL].find((t) => t.key === key) ?? null;
}

export const FORMAT_LABEL: Record<BriefMediaFormat, string> = {
  slideshow: 'Slideshow',
  reel: 'Reel',
};

export const FORMAT_LABEL_PLURAL: Record<BriefMediaFormat, string> = {
  slideshow: 'Slideshows',
  reel: 'Reels',
};

export const ROLE_LABEL = { cover: 'Cover', point: 'Point', cta: 'CTA' } as const;

export type CtaPlaceOption<K extends string> = { key: K; label: string; line: string };

/**
 * CTA position sheet rows, the same three for Story and Handheld: locked
 * right after the hook, locked at the very end, or the creator decides.
 */
export function ctaPlaceOptions(reel: boolean, story: boolean): CtaPlaceOption<CtaPlacement>[] {
  const unit = reel ? 'clips' : 'slides';
  const one = reel ? 'point' : 'slide';
  const post = reel ? 'reel' : 'post';
  return [
    {
      key: 'after_hook',
      label: 'Right after the hook',
      line: story ? `Every creator says the CTA first, then tells it their way in their own ${unit}.` : `The CTA is ${one} 1, right after the cover, for every creator.`,
    },
    {
      key: 'end',
      label: 'At the very end',
      line: story ? `Every creator tells it their way first. The CTA closes the ${post}.` : `The CTA is the last ${one} and closes the ${post} for every creator.`,
    },
    {
      key: 'any',
      label: 'Creator decides',
      line: story ? `It starts at the end and each creator moves it where it fits their ${post}.` : 'It starts where it sits in your deck and each creator moves it where it fits.',
    },
  ];
}

/** Short footer pill label for the current CTA position. */
export function ctaPosLabel(place: CtaPlacement): string {
  return place === 'after_hook' ? 'CTA after hook' : place === 'end' ? 'CTA at end' : 'CTA: creator picks';
}

/** Must-have toggles for a Freestyle brief: "Mention <company> once" and a screenshot. */
export function defaultMustHaves(companyName: string): MustHave[] {
  return [
    { id: 'plug', label: `Mention ${companyName} once`, on: true },
    { id: 'shot', label: 'One product screenshot', on: false },
  ];
}

/** Two digit slot label: 1 -> "01". */
export function slotLabel(index: number): string {
  return String(index + 1).padStart(2, '0');
}

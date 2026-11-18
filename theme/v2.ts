import type { TextStyle, ViewStyle } from 'react-native';
import { Easing } from 'react-native-reanimated';

/**
 * Noni v2 tokens, from design_handoff_v2_review (README §1, reference/tokens.css).
 * v2 screens read only this file. theme/tokens.ts stays for v1 screens until each is rebuilt.
 */

export const color = {
  bg: '#F2F3F5', card: '#FFFFFF',
  ink: '#111114', grey4: '#6B6B76', grey3: '#AEAEB7', grey2: '#E4E4E9', grey1: '#F2F3F5',
  blue: '#1BA6EE', blueDeep: '#0A7FC2', blueTint: '#E3F4FD',
  green: '#1F9D5B', greenTint: '#E2F5EA',
  amber: '#D97E0B', amberTint: '#FDF1DC',
  purple: '#7C5CE6', purpleTint: '#EEE9FB',
  pink: '#E0457B', pinkTint: '#FCE7EF',
  white: '#FFFFFF',
  scrim: 'rgba(17,17,20,0.4)',
  /** Create sheet scrim, a touch deeper than scrim. */
  scrimDeep: 'rgba(16,24,40,0.45)',
  /** Seg track. */
  segTrack: '#E6E7EB',
  /** Selected Seg count badge. */
  segBadgeOn: 'rgba(255,255,255,0.25)',
  tabActive: '#0A4DA3',
  tabInactive: '#8E8E99',
} as const;

/**
 * Dark editor palette: camera, story, slideshow and reel editors draw white
 * and black at fixed alphas over video and photos. `wNN` is white at NN%,
 * `kNN` black at NN%. Swatch values are stored on posts, so never change them.
 */
export const editor = {
  white: '#FFFFFF',
  black: '#000000',
  /** Editor sheets and the script field. */
  sheet: '#17171C',
  field: '#26262D',
  /** Empty slide and frame: a gradient from panelTop down to panel. */
  panel: '#1A1A1F',
  panelTop: '#2B2B31',
  /** Recorded clip tile with no frame yet. */
  tile: '#222222',
  /** Record button and the TikTok follow plus. */
  tiktok: '#FE2C55',
  /** Green screen placeholder gradient, blue to this. */
  greenScreenDeep: '#0A4DA3',
  /** Frosted bar behind the script card. */
  glass: 'rgba(20,20,24,0.55)',
  clear: 'rgba(0,0,0,0)',
  w95: 'rgba(255,255,255,0.95)', w92: 'rgba(255,255,255,0.92)', w90: 'rgba(255,255,255,0.9)', w85: 'rgba(255,255,255,0.85)',
  w75: 'rgba(255,255,255,0.75)', w70: 'rgba(255,255,255,0.7)', w60: 'rgba(255,255,255,0.6)', w55: 'rgba(255,255,255,0.55)',
  w45: 'rgba(255,255,255,0.45)', w40: 'rgba(255,255,255,0.4)', w28: 'rgba(255,255,255,0.28)', w25: 'rgba(255,255,255,0.25)',
  w22: 'rgba(255,255,255,0.22)', w20: 'rgba(255,255,255,0.2)', w18: 'rgba(255,255,255,0.18)', w16: 'rgba(255,255,255,0.16)',
  w14: 'rgba(255,255,255,0.14)', w12: 'rgba(255,255,255,0.12)', w08: 'rgba(255,255,255,0.08)', w05: 'rgba(255,255,255,0.05)',
  k75: 'rgba(0,0,0,0.75)', k70: 'rgba(0,0,0,0.7)', k60: 'rgba(0,0,0,0.6)', k55: 'rgba(0,0,0,0.55)', k50: 'rgba(0,0,0,0.5)',
  k45: 'rgba(0,0,0,0.45)', k40: 'rgba(0,0,0,0.4)', k35: 'rgba(0,0,0,0.35)', k30: 'rgba(0,0,0,0.3)', k20: 'rgba(0,0,0,0.2)',
  /** Story text colors, in picker order. Stored on the post as is. */
  swatch: ['#FFFFFF', '#0B0B0C', '#1BA6EE', '#2BBF7A', '#FFD60A', '#FF8A00', '#FE2C55', '#FF2D78', '#7E3BFF'],
  /** Video editor and studio chrome: the deep stage behind clips, raised rows on it, and its scrim. */
  deep: '#0B0F14',
  deepRaised: '#151D26',
  deepA55: 'rgba(11,15,20,0.55)',
  /** Raised controls on the editor (tool discs, sheet rows) and the frosted variant. */
  control: '#1C1C1E',
  controlGlass: 'rgba(30,30,32,0.96)',
  stage: '#111111',
  /** Clip with no frames yet on the editor timeline. */
  frameEmpty: '#2A2F36',
  k72: 'rgba(0,0,0,0.72)',
  w50: 'rgba(255,255,255,0.5)',
  tiktokA75: 'rgba(254,44,85,0.75)',
  /** Overlay lane tints: text overlays and image overlays. */
  laneText: '#1E88F5',
  laneImage: '#8A4DFF',
} as const;

/** Names for the stored overlay text colors (TextColorPicker). Keys are stored on posts as is. */
export const editorTextColorNames: Record<string, string> = {
  '#FFFFFF': 'White',
  '#000000': 'Black',
  '#FE2C55': 'Red',
  '#FF7A1A': 'Orange',
  '#FFD23F': 'Yellow',
  '#25D366': 'Green',
  '#1E88F5': 'Blue',
  '#8A4DFF': 'Purple',
  '#EB4C89': 'Pink',
};

/** Type scale for the dark video editor and studio chrome (denser than the v2 text roles). */
export const editorType = {
  size: { card: 18, body: 16, bodySm: 15, meta: 14, chip: 13, label: 12, micro11: 11, micro: 10 },
  weight: { medium: '500', semibold: '600', bold: '700', heavy: '800' },
  leading: { body: 1.5 },
  tracking: { label: 0.7 },
} as const;

/** Blue is the brand and primary action, green is live and earning, amber is waiting or changes requested, purple is slideshows, grey is open or neutral. */
export const tone = {
  blue: { fg: color.blue, tint: color.blueTint, text: color.blueDeep },
  green: { fg: color.green, tint: color.greenTint, text: color.green },
  amber: { fg: color.amber, tint: color.amberTint, text: color.amber },
  purple: { fg: color.purple, tint: color.purpleTint, text: color.purple },
  pink: { fg: color.pink, tint: color.pinkTint, text: color.pink },
  grey: { fg: color.grey4, tint: color.grey1, text: color.grey4 },
} as const;
export type Tone = keyof typeof tone;

export const stateTone = { Posted: 'green', Approved: 'green', Waiting: 'amber', 'Changes requested': 'amber', Recording: 'blue', Open: 'grey' } as const satisfies Record<string, Tone>;
export const formatTone = { Reel: 'blue', Slideshow: 'purple' } as const satisfies Record<string, Tone>;

/** Gradient seeds by post type, for thumbnails with no extracted frame. */
export const typeGradient: Record<string, readonly [string, string]> = {
  'Numbered list': ['#4FB8F5', '#7C5CE6'], 'Talking head': ['#F6A23B', '#E0457B'], 'How to': ['#2BBF7A', '#1BA6EE'], Explainer: ['#8E6CF0', '#1BA6EE'], Storytime: ['#F06292', '#F6A23B'],
  'Numbered tips': ['#26C6DA', '#1BA6EE'], Myths: ['#EF5350', '#7C5CE6'], 'Green screen react': ['#43A047', '#C0CA33'], 'Long text': ['#546E7A', '#1BA6EE'], Anything: ['#90A4AE', '#4FB8F5'],
};

/** System font: SF Pro Text on iOS, system sans elsewhere. */
export const text: Record<'title' | 'card' | 'row' | 'body' | 'meta', TextStyle> = {
  title: { fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.6, color: color.ink },
  card: { fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.2, color: color.ink },
  row: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: color.ink },
  body: { fontSize: 15, lineHeight: 20, fontWeight: '400', color: color.ink },
  meta: { fontSize: 13, lineHeight: 18, fontWeight: '400', color: color.grey4 },
};

export const num: Record<'lg' | 'sm', TextStyle> = {
  lg: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.5, color: color.ink, fontVariant: ['tabular-nums'] },
  sm: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: color.ink, fontVariant: ['tabular-nums'] },
};

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, screen: 20, cardGap: 12 } as const;

export const radius = { card: 16, thumb: 10, pill: 999, option: 14, sheet: 20, sheetLg: 24 } as const;

/** Exact CSS shadows; RN renders boxShadow strings natively on the new architecture. */
export const shadow = {
  card: { boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 6px 16px rgba(16,24,40,0.06)' },
  float: { boxShadow: '0 8px 24px rgba(16,24,40,0.14)' },
  /** Selected pill or chip. */
  glow: { boxShadow: '0 2px 6px rgba(27,166,238,0.35)' },
  create: { boxShadow: '0 4px 12px rgba(16,24,40,0.14)' },
  /** Incoming pushed screen, cast onto the screen beneath. */
  pushEdge: { boxShadow: '-8px 0 24px rgba(16,24,40,0.12)' },
  /** Hairline above a pinned footer. */
  footer: { boxShadow: '0 -1px 0 #E4E4E9' },
  /** Tinted icon disc on a brief card. */
  disc: { boxShadow: '0 6px 16px rgba(16,24,40,0.14)' },
  /** Blue earnings hero. */
  blueHero: { boxShadow: '0 8px 24px rgba(27,166,238,0.35)' },
} as const satisfies Record<string, ViewStyle>;

export const motion = {
  press: 90,
  push: 240,
  sheet: 320,
  shimmer: 1200,
  pressScale: 0.97,
  ease: Easing.bezier(0.22, 0.61, 0.36, 1),
  sheetEase: Easing.bezier(0.2, 0.8, 0.2, 1),
  /** In-screen content change: fade and lift in. */
  tabIn: 260,
  tabInShort: 220,
  tabEase: Easing.bezier(0.2, 0.8, 0.2, 1),
  /** Sliding indicators under tabs and inside pill tracks. */
  underline: 280,
  pill: 300,
  /** Option card selection and the check pop. */
  spring: Easing.bezier(0.34, 1.56, 0.64, 1),
} as const;

export const screenTransition = {
  push: 'slide_from_right',
  modal: 'slide_from_bottom',
  fade: 'fade',
  tab: 'none',
} as const;

export const control = { button: 52, pill: 36, row: 56, tapMin: 44, seg: 36, chip: 26, chipSmall: 22 } as const;

/** Briefs area: template frames, AI placeholder gradients, celebration confetti and the AI button glow. */
export const briefs = {
  /** Text on screen editor backdrop. */
  editorBg: '#0F0F12',
  /** Gradient placeholders for product overlays and green screen frames, top then bottom. */
  grads: {
    logo: ['#1BA6EE', '#0A4DA3'],
    app: ['#2BBF7A', '#1BA6EE'],
    pass: ['#F6A23B', '#E0457B'],
    sprint: ['#8E6CF0', '#1BA6EE'],
    product: ['#26C6DA', '#1BA6EE'],
    tripod: ['#F06292', '#F6A23B'],
  },
  confetti: ['#FFFFFF', '#FFD60A', '#2BBF7A', '#FF2D78', '#7E3BFF'],
  /** Fill in with AI, enabled. */
  aiGlow: '0 6px 16px rgba(27,166,238,0.35)',
  /** A lifted clip tile while dragging. */
  liftShadow: '0 18px 40px rgba(16,24,40,0.28)',
  addGlow: '0 6px 14px rgba(27,166,238,0.3)',
  discShadow: '0 16px 40px rgba(0,0,0,0.18)',
} as const;

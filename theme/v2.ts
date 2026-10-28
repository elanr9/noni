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
  /** Seg track. */
  segTrack: '#E6E7EB',
  /** Selected Seg count badge. */
  segBadgeOn: 'rgba(255,255,255,0.25)',
  tabActive: '#0A4DA3',
  tabInactive: '#8E8E99',
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
  tab: 'none',
} as const;

export const control = { button: 52, pill: 36, row: 56, tapMin: 44, seg: 36, chip: 26, chipSmall: 22 } as const;

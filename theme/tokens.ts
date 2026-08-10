import { Easing, type ViewStyle } from 'react-native';

/** 1:1 port of design_handoff_creator_app/README.md §2 (tokens/*.css). */

export const color = {
  // Brand blue — 200/300 are the tint, 500 is the action colour
  blue50: '#F2F9FE',
  blue100: '#E7F4FD',
  blue200: '#A7D3F7',
  blue300: '#8EC9F5',
  blue400: '#4FBAF2',
  blue500: '#4FBAF2',
  blue600: '#0F8FD1',
  blue700: '#0B76AD',

  // Neutrals
  white: '#FFFFFF',
  offWhite: '#F7FAFD',
  fillQuiet: '#F1F3F5',
  line: '#E6EEF6',
  lineStrong: '#D6E3EF',
  slate300: '#B4BFCB',
  slate400: '#8E9AA6',
  slate500: '#6B7A8C',
  ink: '#0F1720',
  ink800: '#151D26',
  ink900: '#0B0F14',

  // Status
  amber: '#E08A16',
  amberSoft: '#FDF2DF',
  green: '#1F8F5F',
  greenSoft: '#E4F5EC',
  danger: '#D93A3A',
  dangerSoft: '#FCEBEB',

  // Semantic aliases
  surface: '#FFFFFF',
  surfaceSunken: '#F7FAFD',
  surfaceCard: '#FFFFFF',
  surfaceQuiet: '#F1F3F5',
  surfaceBrandSoft: '#E7F4FD',
  surfaceDark: '#0B0F14',
  textStrong: '#0F1720',
  textBody: '#0F1720',
  textMuted: '#6B7A8C',
  textSubtle: '#8E9AA6',
  textOnDark: '#FFFFFF',
  textOnAccent: '#FFFFFF',
  textBrand: '#0F8FD1',
  accent: '#4FBAF2',
  accentHover: '#8EC9F5',
  accentPress: '#0F8FD1',
  accentTint: '#8EC9F5',
  border: '#E6EEF6',
  borderStrong: '#D6E3EF',
  borderAccent: '#4FBAF2',
  statusTodoFg: '#0B76AD',
  statusTodoBg: '#E7F4FD',
  statusProgressFg: '#0B76AD',
  statusProgressBg: '#E7F4FD',
  statusPendingFg: '#E08A16',
  statusPendingBg: '#FDF2DF',
  statusDoneFg: '#1F8F5F',
  statusDoneBg: '#E4F5EC',
  scrim: 'rgba(0,0,0,0.45)',
  scrimStrong: 'rgba(0,0,0,0.6)',
  sheetScrim: 'rgba(11,15,20,0.5)',
  glass: 'rgba(255,255,255,0.82)',

  // Media-overlay whites (admin README §5 — chips, scrub, dots on ink-900 media)
  whiteA92: 'rgba(255,255,255,0.92)',
  whiteA90: 'rgba(255,255,255,0.90)',
  whiteA75: 'rgba(255,255,255,0.75)',
  whiteA60: 'rgba(255,255,255,0.60)',
  whiteA45: 'rgba(255,255,255,0.45)',
  whiteA28: 'rgba(255,255,255,0.28)',
  whiteA16: 'rgba(255,255,255,0.16)',
} as const;

/**
 * Admin handoff §1 — one tint per post type so a lane reads by colour
 * before it reads by word. Keys match public.post_types.key.
 */
export const postTypeTone = {
  numbered_list: { bg: '#E3F2FD', fg: '#0E6BA8' },
  numbered_tips: { bg: '#E3F2FD', fg: '#0E6BA8' },
  talking_head: { bg: '#ECE7FB', fg: '#5B44B4' },
  explainer: { bg: '#DFF3EE', fg: '#0E6E5C' },
  contrast: { bg: '#FDEEDC', fg: '#95560C' },
  getting_started: { bg: '#FDEEDC', fg: '#95560C' },
  replay_bait: { bg: '#FBE7EF', fg: '#A03A67' },
  how_to: { bg: '#E7EAFB', fg: '#3B4EA0' },
} as const;

export type PostTypeKey = keyof typeof postTypeTone;

export const type = {
  size: {
    hero: 44,
    titleXl: 34,
    title: 30,
    titleSm: 26,
    cardLg: 20,
    card: 18,
    action: 17,
    body: 16,
    bodySm: 15,
    meta: 14,
    chip: 13,
    label: 12,
    micro11: 11,
    micro: 10,
  },
  // Unitless multipliers — multiply by font size for RN lineHeight
  leading: {
    tight: 1.05,
    title: 1.12,
    snug: 1.35,
    body: 1.5,
  },
  tracking: {
    hero: -1.2,
    title: -0.5,
    flat: 0,
    label: 0.7,
  },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    heavy: '800',
  },
  /** iOS uses SF Pro; web handoff substitutes Figtree / Nunito. */
  font: {
    ui: 'System',
    display: 'System',
    rounded: 'System',
  },
} as const;

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 14,
  5: 16,
  6: 18,
  7: 20,
  8: 24,
  9: 28,
  10: 32,
  11: 40,
  gutter: 24,
  /** Admin handoff §1 — admin surfaces are dense lists, gutter is 20. */
  gutterAdmin: 20,
  cardPad: 18,
  stackGap: 12,
  sectionGap: 28,
  tapMin: 44,
  tapPrimary: 60,
  shutter: 84,
} as const;

export const radius = {
  sm: 12,
  cell: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  pill: 999,
} as const;

/** Admin handoff §1 radii: sm inner blocks, md fields, lg cards, xl media, 2xl sheets. */
export const radiusAdmin = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  pill: 999,
} as const;

export const borderWidth = {
  hair: 1,
  field: 1.5,
  select: 2,
} as const;

// RN approximations of the CSS shadows, keyed on each shadow's dominant layer.
export const shadow: Record<
  'shadowCard' | 'shadowRaised' | 'shadowFloat' | 'shadowMedia' | 'shadowAccent',
  ViewStyle
> = {
  // 0 1px 2px rgba(15,23,32,0.04), 0 6px 16px rgba(15,23,32,0.05)
  shadowCard: {
    shadowColor: '#0F1720',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 8,
    shadowOpacity: 0.05,
    elevation: 2,
  },
  // 0 2px 6px rgba(15,23,32,0.06), 0 12px 28px rgba(15,23,32,0.08)
  shadowRaised: {
    shadowColor: '#0F1720',
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 14,
    shadowOpacity: 0.08,
    elevation: 4,
  },
  // 0 6px 24px rgba(15,23,32,0.14)
  shadowFloat: {
    shadowColor: '#0F1720',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    shadowOpacity: 0.14,
    elevation: 8,
  },
  // 0 4px 18px rgba(15,23,32,0.10)
  shadowMedia: {
    shadowColor: '#0F1720',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 9,
    shadowOpacity: 0.1,
    elevation: 5,
  },
  // 0 12px 24px -12px rgba(79,186,242,.85)
  shadowAccent: {
    shadowColor: '#4FBAF2',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 10,
    shadowOpacity: 0.28,
    elevation: 6,
  },
};

// ring-focus: 0 0 0 3px rgba(79,186,242,0.30) — RN has no outline, so a 3px border recipe.
export const ringFocus: ViewStyle = {
  borderWidth: 3,
  borderColor: 'rgba(79,186,242,0.30)',
};

export const motion = {
  instant: 90,
  fast: 160,
  base: 240,
  slow: 420,
  stream: 1600,
  shimmer: 1400,
  pressScale: 0.97,
  easeOut: Easing.bezier(0.22, 0.61, 0.36, 1),
  easeInOut: Easing.bezier(0.4, 0, 0.2, 1),
  /** Design token includes overshoot; product rule is no bounce — prefer easeOut in UI. */
  easeSpring: Easing.bezier(0.34, 1.32, 0.64, 1),
} as const;

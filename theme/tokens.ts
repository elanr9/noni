import { Easing, type ViewStyle } from 'react-native';

/** 1:1 port of design_handoff_creator_app/README.md §2 (tokens/*.css). */

export const color = {
  // Brand blue — 200/300 are the tint, 500 is the action colour
  blue50: '#F2F9FE',
  blue100: '#E7F4FD',
  blue200: '#A7D3F7',
  blue300: '#8EC9F5',
  blue400: '#4FBAF2',
  blue500: '#1BA6EE',
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
  accent: '#1BA6EE',
  accentHover: '#4FBAF2',
  accentPress: '#0F8FD1',
  accentTint: '#8EC9F5',
  border: '#E6EEF6',
  borderStrong: '#D6E3EF',
  borderAccent: '#1BA6EE',
  statusTodoFg: '#0B76AD',
  statusTodoBg: '#E7F4FD',
  statusPendingFg: '#E08A16',
  statusPendingBg: '#FDF2DF',
  statusDoneFg: '#1F8F5F',
  statusDoneBg: '#E4F5EC',
  scrim: 'rgba(0,0,0,0.45)',
  scrimStrong: 'rgba(0,0,0,0.6)',
  sheetScrim: 'rgba(11,15,20,0.5)',
  glass: 'rgba(255,255,255,0.82)',
} as const;

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
    semibold: '600',
    bold: '700',
    heavy: '800',
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
  // 0 8px 20px rgba(27,166,238,0.28)
  shadowAccent: {
    shadowColor: '#1BA6EE',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 10,
    shadowOpacity: 0.28,
    elevation: 6,
  },
};

// ring-focus: 0 0 0 3px rgba(27,166,238,0.30) — RN has no outline, so a 3px border recipe.
export const ringFocus: ViewStyle = {
  borderWidth: 3,
  borderColor: 'rgba(27,166,238,0.30)',
};

export const motion = {
  instant: 90,
  fast: 160,
  base: 240,
  slow: 420,
  shimmer: 1400,
  pressScale: 0.97,
  easeOut: Easing.bezier(0.22, 0.61, 0.36, 1),
} as const;

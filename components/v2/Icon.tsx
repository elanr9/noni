import { Text, type StyleProp, type TextStyle } from 'react-native';

import { color as palette } from '../../theme/v2';

/**
 * Material Symbols Rounded, filled (FILL 1, GRAD 0, opsz 24). RN cannot set variable font axes,
 * so two static instances are bundled: wght 500 (default) and 700 (emphasis).
 * Glyphs render by codepoint; add names from the Material Symbols Rounded codepoints file.
 */
export const ICON_FONT = {
  500: 'MaterialSymbolsRounded-Filled-500',
  700: 'MaterialSymbolsRounded-Filled-700',
} as const;

export const ICON_FONT_FILES = {
  [ICON_FONT[500]]: require('../../assets/fonts/MaterialSymbolsRounded-Filled-500.ttf'),
  [ICON_FONT[700]]: require('../../assets/fonts/MaterialSymbolsRounded-Filled-700.ttf'),
};

const CODEPOINTS = {
  add: 0xe145,
  add_comment: 0xe266,
  arrow_forward: 0xe5c8,
  arrow_upward: 0xe5d8,
  auto_awesome: 0xe65f,
  auto_stories: 0xe666,
  bar_chart: 0xe26b,
  bolt: 0xea0b,
  bookmark: 0xe8e7,
  calendar_month: 0xebcc,
  cameraswitch: 0xefeb,
  chat_bubble: 0xe0cb,
  check: 0xe668,
  chevron_left: 0xe5cb,
  chevron_right: 0xe5cc,
  close: 0xe5cd,
  closed_caption: 0xe996,
  content_cut: 0xe14e,
  delete: 0xe92e,
  edit: 0xf097,
  edit_note: 0xe745,
  expand_less: 0xe5ce,
  expand_more: 0xe5cf,
  fast_forward: 0xe01f,
  favorite: 0xe87e,
  filter_alt: 0xef4f,
  format_align_center: 0xe234,
  format_align_left: 0xe236,
  format_align_right: 0xe237,
  format_list_bulleted: 0xe241,
  format_list_numbered: 0xe242,
  format_shapes: 0xe25e,
  help: 0xe8fd,
  home: 0xe9b2,
  inbox: 0xe156,
  keyboard_arrow_down: 0xe313,
  keyboard_arrow_up: 0xe316,
  layers: 0xe53b,
  lightbulb: 0xe90f,
  link: 0xe250,
  link_off: 0xe16f,
  list_alt: 0xe0ee,
  mode_comment: 0xe253,
  movie: 0xe404,
  music_note: 0xe405,
  music_off: 0xe440,
  north_west: 0xf1e2,
  notes: 0xe26c,
  open_in_new: 0xe89e,
  paid: 0xf041,
  palette: 0xe40a,
  pause: 0xe034,
  payments: 0xef63,
  person: 0xf0d3,
  photo_library: 0xe413,
  play_arrow: 0xe037,
  play_circle: 0xe1c4,
  preview: 0xf1c5,
  push_pin: 0xf10d,
  query_stats: 0xe4fc,
  record_voice_over: 0xe91f,
  redo: 0xe15a,
  replay: 0xe042,
  reply: 0xe15e,
  rocket_launch: 0xeb9b,
  schedule: 0xefd6,
  school: 0xe80c,
  search: 0xef7a,
  segment: 0xe94b,
  send: 0xe163,
  settings: 0xe8b8,
  speed: 0xe9e4,
  star: 0xf09a,
  storefront: 0xea12,
  subject: 0xe8d2,
  subtitles: 0xe048,
  swap_horiz: 0xe8d4,
  text_fields: 0xe262,
  tips_and_updates: 0xe79a,
  tune: 0xe429,
  undo: 0xe166,
  videocam: 0xe04b,
  volume_up: 0xe050,
  wallpaper: 0xe1bc,
} as const;

export type IconName = keyof typeof CODEPOINTS;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  weight?: 500 | 700;
  style?: StyleProp<TextStyle>;
}

export function Icon({ name, size = 24, color = palette.ink, weight = 500, style }: IconProps) {
  return (
    <Text
      accessible={false}
      allowFontScaling={false}
      style={[
        {
          fontFamily: ICON_FONT[weight],
          fontSize: size,
          lineHeight: size,
          width: size,
          height: size,
          color,
          textAlign: 'center',
          includeFontPadding: false,
        },
        style,
      ]}
    >
      {String.fromCodePoint(CODEPOINTS[name])}
    </Text>
  );
}

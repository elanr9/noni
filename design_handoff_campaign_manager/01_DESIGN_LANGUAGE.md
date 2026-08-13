# Design language

Mirror these values into `theme/tokens.ts`. The CSS sources in `tokens/` are canonical.

## Color
Brand: baby blue is the brand tint (logo, progress fills, selected states, soft surfaces); the saturated 500 is the action color. Baby blue never carries white text.
- blue-50 #F2F9FE, blue-100 #E7F4FD, blue-200 #A7D3F7, blue-300 #8EC9F5 (logo/brand tint), blue-400 #4FBAF2, blue-500 #1BA6EE (primary actions), blue-600 #0F8FD1, blue-700 #0B76AD (text on blue-100)
- Neutrals: white #FFFFFF, off-white #F7FAFD (screen background), fill-quiet #F1F3F5, line #E6EEF6, line-strong #D6E3EF, slate-300 #B4BFCB, slate-400 #8E9AA6, slate-500 #6B7A8C, ink #0F1720
- Status: amber #E08A16 on #FDF2DF, green #1F8F5F on #E4F5EC, danger #D93A3A on #FCEBEB
- Money is always green #1F8F5F. Selected/active chips: blue-500 background with white text (see format chips), or blue-100 background with blue-700 text for quieter selections.

## Type
On device use the system stack: SF Pro (UI + display) and SF Pro Rounded (wordmark, playful accents). The web reference substitutes Figtree and Nunito.
- Hero 44, title-xl 34, title 30, title-sm 26, card-lg 20, card 18, action 17, body 16, body-sm 15, meta 14, chip 13, label 12
- Weights: 400/500/600/700/800. Section labels: 700 12px, uppercase, letter-spacing 0.7px, slate-500.
- Titles use tight negative tracking (-0.3 to -1.2px at hero sizes).

## Shape and spacing
- Screen gutter: 20px. Card padding 12 to 14px.
- Radii: sm 10, md 14, lg 18, xl 22, pill 999. Cards are white, 1px line border, soft card shadow.
- 9:16 media thumbs: 44x58 or 46x62, radius 9, light blue gradient placeholder with a small white play disc (video) or images glyph (slideshow), duration badge bottom-right (dark pill, white 9px text).

## Recurring patterns (build once in components/admin/shared, reuse everywhere)
- **Segmented control**: pill row, active segment white with card shadow, counts inline.
- **TypeChip**: small status pill. Tones: brand (blue-100/blue-700), good (green-soft/green), warn (amber-soft/amber), quiet (fill-quiet/slate-500).
- **ActionBar**: fixed footer over a fade-up gradient, two buttons: ghost/outline left (30 to 47% width), primary right. Primary with count: "Send back · N".
- **Sheet**: bottom sheet with title, subtitle, scrollable body, sticky footer buttons.
- **Checkbox reason row**: full-width button, radius 10, fill-quiet default; selected: blue-100 background, blue-700 text, 18px rounded-square check in blue-500 with white check icon. Multi-select.
- **Note block**: blue-50 rounded block with message-circle icon, 600 13px ink text, x to remove.
- **Confirmation takeover**: full screen white, 68px icon disc (green-soft/blue-100/amber-soft), 700 26px title, one slate-500 paragraph, primary button.
- **Stat pill**: off-white pill, bold ink value + 600 11.5px slate-500 unit, e.g. "$238 /day avg".
- **Selected format chip**: blue-500 fill, white text, slight scale up (1.04) with a fast ease-out transition; unselected fill-quiet with slate-500.

## Motion
Durations: instant 80ms, fast 160ms, medium 240ms. Ease-out for state changes. Keep animation small: color/scale transitions on selection, sheet slide-ups, nothing decorative.

## Brand
The logo is a solid rocket in blue-300 pointing to the top right with a white window cutout (assets/noni-logo.svg). App icon: assets/app-icon-1024.png (white background, no alpha, no rounded corners; Apple masks it). Wordmark: "noni" lowercase, SF Pro Rounded Bold, ink.

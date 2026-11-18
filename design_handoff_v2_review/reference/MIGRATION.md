# Migrating theme/tokens.ts to v2

Replace `theme/tokens.ts` with `redesigns/v2-admin/theme/tokens.ts.txt` (drop the `.txt`; it only exists so the design-system bundler skips the file). Then fix the imports below. Expect every screen to break at compile time; that is the point. Each break is a place the old system leaked.

## Removed exports and what replaces them

| Old | New |
|---|---|
| `color.blue50 … blue700`, `accent*`, `surfaceBrandSoft`, `textBrand`, `borderAccent` | `color.blue` for fills, `color.blueDeep` for text on `color.blueTint`. Blue is used often: active tab, badges, progress, primary buttons, selected chips. |
| `color.ink`, `ink800`, `ink900`, `textStrong`, `textBody` | `color.ink` |
| `color.slate500`, `textMuted` | `color.grey4` |
| `color.slate400`, `slate300`, `textSubtle` | `color.grey3` |
| `color.line`, `lineStrong`, `border`, `borderStrong` | `color.grey2` |
| `color.offWhite`, `fillQuiet`, `surfaceSunken`, `surfaceQuiet` | `color.bg` for the screen, `color.grey1` for fills inside cards. |
| `color.amber*`, `green*`, `danger*`, `status*Fg/Bg` | `tone.green` (live, earning), `tone.amber` (waiting, changes), `tone.purple` (slideshows), `tone.blue` (recording, brand). Each has `fg`, `tint`, `text`. Map states through `stateTone`. |
| `postTypeTone`, `briefTone` | `typeGradient` seeds thumbnails. Format colour comes from `formatTone`. Keep `briefTone.canvas`, `textSwatches`, `confetti` only inside the slide editor. |
| `type.size.*` (14 sizes) | `text.title` 32, `text.card` 20, `text.row` 17, `text.body` 15, `text.meta` 13. Nothing else. |
| `type.weight.heavy` (800), `medium` (500) | Gone. 700 titles, 600 rows and numbers, 400 body and meta. |
| `space[4]` 14, `space[6]` 18, `space[7]` 20, `space[9]` 28, `space[11]` 40, `cardPad`, `sectionGap`, `gutter`, `gutterAdmin` | `space[1..8]` = 4, 8, 12, 16, 24, 32. `space.screen` = 20 for horizontal screen padding only. Card padding 16, section gap 24. |
| `radius.*` (7 values), `radiusAdmin.*` | `radius.card` 16, `radius.thumb` 10, `radius.pill` 999. |
| `shadow.shadowCard`, `shadowRaised`, `shadowMedia`, `shadowAccent` | `shadow.card` on every card, `shadow.float` for sheets and the Create button. |
| `ringFocus` | Gone on native. |
| `borderWidth.field` 1.5, `select` 2 | Gone. Selection is a blue fill or a blue tint with a 2px inset ring. |
| `motion.fast`, `base`, `slow`, `stream`, `shimmer`, `easeInOut`, `easeSpring` | `motion.press` 90, `motion.push` 240. One easing. |
| `screenTransition.fade`, `tab: 'fade'` | `tab: 'none'`. Never fade. |

## Component changes implied by the tokens

- `TabBar`: flush to the bottom, white, hairline on top, no blur. Five items: Review, Briefs, Create, Messages, Analytics. Active tab is `blue`, filled icon. Create is a 60px `blue` circle raised 30px above the bar with a 5px white ring and `shadow.float`, label "Create" under it, and routes straight to the new brief screen.
- `Icon`: Material Symbols Rounded, FILL 1, wght 500. Replace the Lucide set.
- `Avatar`: photo, round, 2px white gap then a 4 to 5px ring in the creator's tone. Optional count badge bottom right in the same tone.
- `PushHeader`: back chevron and a 17 semibold title. Header actions are blue words.
- `Segmented`: pill group on `#E6E7EB`, sliding `blue` indicator, white text when selected, counts in tinted badges.
- `Card`: white, `radius.card`, `shadow.card`, padding 16, 12 between cards. Tappable cards scale to 0.97 with `Haptics.impactAsync(Light)`. Rows live inside cards with a `grey1` hairline.
- `Button`: height 52, `blue` fill, white 17 bold, pill, full width. Secondary is `blueTint` with `blueDeep` text. Request changes is `amberTint` with `amber` text.
- `TypeChip`, `StatusChip`: one `Chip` with a `tone`: tint background, 13 bold tone text, height 26.
- `Thumb`: extracted frame first; else `typeGradient` blurred with the title in white; else the post type icon on the tint. Slideshows fan the first three slides.
- `SkeletonCard`: white cards at the exact card height, opacity pulse.
- `EmptyState`: one centred `text.body` line in `grey4` inside a card.
- Bell and tab badges: `blue` pill with white 12 bold count.

## Copy

- Every number gets a `meta` label directly under or beside it.
- Sentences, not product nouns. "Fabrizio sent 3 posts" not "3 submissions pending".
- Empty states are one grey line: "Nothing to review."
- Status lines on creator cards are in colour: amber for waiting, green for all posted.

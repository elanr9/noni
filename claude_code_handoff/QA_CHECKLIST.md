# QA checklist

## Visual
- [ ] Side by side with screenshot at 390x844: spacing, radii, type sizes, weights match
- [ ] Colors come from the theme module only
- [ ] No white text on tint #8EC9F5
- [ ] Real thumbnails and profile photos load; fallbacks only when missing
- [ ] Fixed-height cards in scrolling queues

## Copy
- [ ] No em or en dashes anywhere in UI (grep for — and –)
- [ ] No helper sentences or footnotes
- [ ] Sentence case, no emoji, "to make" never "to shoot"
- [ ] Strings match the prototype verbatim

## States
- [ ] Loading, empty, error, and offline for every list
- [ ] Reel and Slideshow both handled on every media surface
- [ ] Multi-campaign: switching company refreshes every tab; strip and tab dot update

## Interaction
- [ ] Hit targets at least 44pt
- [ ] Sheets drag to dismiss; keyboard never covers inputs
- [ ] Animations match prototype durations; no jank on a mid-range Android

## Code
- [ ] Typecheck, lint, tests pass
- [ ] No duplicated primitives; dead screens removed
- [ ] Migrations are new files and reversible

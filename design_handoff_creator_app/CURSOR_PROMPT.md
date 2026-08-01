# Cursor master prompt — Noni creator app

Paste everything below into Cursor.

---

You are implementing an existing, finished design. **Do not redesign, simplify, reinterpret, or "improve" anything.** The goal is pixel-accurate reproduction.

## Before you touch any file

1. Inspect this repository first. Identify the framework, routing, styling approach, component conventions, state management, and any existing design tokens or UI primitives. Report what you found in one short summary before writing code.
2. Read `design_handoff_creator_app/README.md` end to end. It is the spec: exact colors, type, spacing, radii, shadows, motion, component geometry, states, interactions, and mock data.
3. Read the reference implementation at the project root: `components/`, `tokens/`, `styles.css`, `assets/`, and `ui_kits/creator-app/` (open `ui_kits/creator-app/index.html` and `all-screens.html` to see it running). These are HTML/React prototypes that render the real design at a fixed 390×844 phone frame. They are references, **not** code to paste — reimplement them using this repo's stack and patterns.
4. Look at `design_handoff_creator_app/screenshots/` (22 PNGs, one per screen/state, rendered at 0.58 scale — divide measured pixels by 0.58 for design px).

## Hard rules

- **Preserve the existing stack and all working functionality.** Do not add Tailwind, shadcn, a component kit, a chart library, an animation library, or a new router. If you believe a dependency is genuinely required, stop and ask.
- **Use the supplied tokens verbatim.** Every hex, px, weight, radius, shadow, duration, and easing is in README §2. No rounding, no renaming, no "close enough" values.
- **Use the supplied assets.** `assets/logo.svg` for the mark; Lucide for icons with the exact names in §1.4. Do not substitute generic icons or draw new ones.
- **Do not invent missing details.** If a state, string, measurement, or behavior is not specified, stop and ask me. Do not fill gaps with generic UI.
- **Copy is final.** Reproduce every string exactly, including empty states and button labels. Sentence case. No emoji anywhere.
- **Respect the no-scroll rule.** Home (Calendar), Analytics, Profile, and Task detail must fit the viewport without scrolling; the hero card's frame absorbs leftover height via `flex:1`. Only feeds and busy day lists scroll.

## How to work

Implement in small, verifiable stages, in this order, and stop after each for my review:

1. Tokens ported into the repo's theme layer.
2. Primitives: Button, Icon, StatusChip, EmptyState, TabBar.
3. MediaCard (hero + tile + fill) — the highest-risk component.
4. 4-tab shell + the two pushed screens (task, record), tab bar hidden on both.
5. Home / Calendar: greeting, WeekStrip, PostPager, PostCard, all three status footers.
6. Home / Inspiration + SwapSheet.
7. Posts: month grid, day list, list view + sort dropdown, PostRow with the earnings line.
8. Analytics: metric dropdown, hand-drawn SVG area chart, mini stats, split bar.
9. Profile.
10. Task detail + Record (teleprompter timing exactly as specified).
11. Loading / empty / unlinked states for every screen.

At the end of every stage:
- Render the screen at exactly **390×844**.
- Put it side by side with the matching `screenshots/*.png`.
- Overlay the two at 50% opacity and correct every difference in spacing, sizing, typography, color, radius, shadow, and alignment **before** telling me the stage is done.
- Run the checklist for that screen in README §8 and report pass/fail per line.

## Details that are easy to get wrong — verify each explicitly

- Buttons are `#1BA6EE`; baby blue `#8EC9F5` is a tint only and never carries white text.
- Creator cards say only **"Reel"** or **"Slideshow"**.
- The hero card title sits inside the frame on a gradient scrim, inset `right:76`, clamped to 2 lines.
- Pager dot color comes from post status: green posted, amber in review, blue to do.
- The tab bar floats (`left:16 right:16 bottom:22`) with an 18px backdrop blur — it is not flush.
- The area chart is hand-written SVG (README §6.5) with a clip-path reveal over 420ms — no chart library.
- SVG gradients on straight strokes need `gradientUnits="userSpaceOnUse"` or the strokes vanish (§6.4).
- Motion: 240ms surfaces, 160ms color, 90ms `scale(0.97)` press, 420ms chart draw, 1400ms skeleton shimmer, easing `cubic-bezier(0.22,0.61,0.36,1)`.

## When you must stop and ask

Real post thumbnails, official TikTok/Instagram marks, licensed fonts, the real payout model behind the "$X · N views to $Y" line, real analytics endpoints and metric definitions, error/offline states, and any tablet or desktop layout. None of these are specified — ask instead of inventing.

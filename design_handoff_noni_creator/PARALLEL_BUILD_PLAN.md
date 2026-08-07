# Parallel build plan for Cursor

Do **not** one-shot this. The board has fourteen screens across five feature areas that share a small set of primitives. One agent trying to write it all in a single pass will re-derive the primitives per screen, drift from the tokens, and produce merge conflicts across navigation files.

Run it in three waves. Wave 1 is one agent working alone. Waves 2 and 3 are parallel agents, each owning its own directory and its own branch.

---

## Wave 1 - foundation (ONE agent, no parallelism)

Nobody else starts until this merges. Everything downstream imports from it.

**Owns:** `theme/`, `components/ui/`, `components/layout/`

1. `theme/tokens.ts` - every value from `tokens/*.css` as typed constants: colors, type scale, spacing, radii, shadows, motion durations and easings.
2. Primitives, each with the states shown on the board:
   - `Button` - variants primary / secondary / tint / outline / ghost / danger, sizes lg 60 / md 48 / sm 40, block, icon and iconRight, disabled at 35% opacity, press scales to 0.97.
   - `Icon` - Lucide wrapper, currentColor, sizes 11 to 36.
   - `StatusChip` - assigned, recorded, submitted, changes_requested, approved, posted; 6px dot plus label; optional label override.
   - `OptionCard`, `TextField`, `ProgressBar` (bar and dots), `InfoBlock`, `StatCard`, `EmptyState`.
   - `MediaCard` - hero and tile variants, 9:16 frame, format pill, time pill, play affordance, content-type tag slot.
   - `TabBar` - floating, blurred, badge support, locked/disabled mode for the setup gate.
   - `Screen` - 24px gutter, safe areas, and the pinned-bottom-CTA slot every screen uses.
3. Storybook-style demo route rendering every primitive in every state.

**Definition of done:** no screen code exists yet, and no downstream agent needs to write a new primitive.

---

## Wave 2 - four agents in parallel

Each agent owns a directory and touches nothing outside it plus the route registration for its own screens. All four branch off the merged Wave 1.

### Agent A - onboarding and setup gate
Screens 1a, 1b, the remaining onboarding questions, 1c.
- Owns `app/(onboarding)/`.
- Builds the shared onboarding shell first (back + progress + question + pinned CTA), then one file per question.
- Apple and Google auth only. The gate hides Home, Posts and Analytics until account approved, both socials linked and bank connected.
- Setup checklist row states: To do / In review / Sent back with reason / Done.

### Agent B - Home and post detail
Screens 1d, 1g, 1h.
- Owns `app/(creator)/home/` and `app/(creator)/post/`.
- Home is one hero card and one CTA. Do not add cards or stat strips.
- Post detail branches on format: Reel gets clip breakdown and "Record"; Slideshow gets slide copy and "Add pictures".
- Example playback opens in an in-app browser.

### Agent C - Posts, Analytics, and the posted post view
Screens 2a, 2b, 2c, 2f.
- Owns `app/(creator)/posts/` and `app/(creator)/analytics/`.
- Grid tiles are 9:16 with a status dot, format glyph and view count. Tapping opens 2f.
- Analytics segmented control filters the list; tapping a stat card switches the chart metric.
- 2f shows earnings progress toward the bounty and the views still needed.

### Agent D - Profile, balance, messages
Screens 2d, 2e, plus the chat thread.
- Owns `app/(creator)/profile/`, `app/(creator)/balance/`, `app/(creator)/messages/`.
- Balance uses Stripe Connect; cash out is a confirm sheet then a success state.
- Messages is one thread with admins, pinned cards for posts in Changes requested that deep-link to the post.

---

## Wave 3 - two agents in parallel, after Wave 2 merges

### Agent E - capture
Screens 1e, 1f, and the slideshow upload flow.
- Owns `app/(creator)/record/` and `app/(creator)/upload/`.
- Capture viewport is a true 9:16 area with controls below it, not a full-bleed 390x844 preview.
- Clip-by-clip stepper: countdown, record, review, Retake or Keep. Progress persists so a creator can leave and resume mid-post.
- Every clip exposes its own example video, always visible, never behind a menu.
- Changes requested shows structured notes per clip and only reshoots the flagged clips.

### Agent F - states and polish
Every screen's loading, empty, error, success and in-review state, plus the three signature motions: onboarding progress fill, the earnings estimate count-up, and the keep-clip confirmation.
- Owns `components/states/` and adds state branches inside existing screens. Coordinate: this agent edits other agents' files, so it merges last.

---

## Rules for every agent

1. Read `README.md` and open `Noni Creator App.dc.html` in a browser before writing code. Work from the rendered frames, not from a description.
2. Never hardcode a color, size, radius or duration. Import from `theme/tokens`.
3. Never build a new primitive. If something is missing, stop and file it against Wave 1 rather than writing a local copy.
4. Stay inside your directory. Route registration is the only shared file you touch, and you append to it.
5. Copy is final. Do not rewrite UI strings, and do not introduce em dashes, en dashes or emoji.
6. One PR per screen, with a screenshot at 390x844 next to the reference frame.
7. If a layout does not fit 390x844, cut content and flag it. Do not shrink type below 14px.

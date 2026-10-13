# Noni build rules (from design handoff)

## Design source
- Handoff lives in `design/handoff/`. Read `design/handoff/00_START_HERE.md` and the phase's bundle before writing code.
- Prototype files under `reference_ui/` are .txt JSX. Read them for exact values. Never import or copy them as runtime code. Rebuild in React Native (Expo) or the web stack using this repo's primitives.

## Tokens (never hardcode outside the token file)
- primary #1BA6EE, tint #8EC9F5 (never white text on tint), off-white #F7FAFD, ink #0F1720
- Fonts, radii, shadows, spacing: copy from `design/handoff/bundles/*/tokens` into one theme module. Every screen imports from it.

## Copy rules (hard)
- Never use em dashes or en dashes in UI copy. Use a period, comma, colon, or "to".
- No helper sentences, footnotes, or hints in UI. Labels, counts and one-line states only.
- Sentence case. No emoji. Say "to make", never "to shoot".
- Use the copy in the prototype verbatim.

## UI rules
- Real media everywhere: post thumbnails (Reel first frame, slideshow slide 1) and real profile photos. Gradients and initials are fallbacks only.
- Fixed-height cards in every scrolling queue.
- Both formats, Reel and Slideshow, on every media surface.
- Hit targets at least 44pt.
- Reuse shared primitives (cards, chips, sheets, buttons, tab bar). If a primitive is missing, add it to the shared folder, not inline.

## Working rules
- Plan first, then build. Keep the existing data layer in `lib/`; extend APIs rather than rewrite them.
- Schema changes go in a new Supabase migration, never edit old ones.
- One phase per branch. Run typecheck and tests before declaring done.
- When a design detail is ambiguous, match the prototype screenshot and note it in the PR description. Do not invent new UI.

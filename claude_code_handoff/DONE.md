# Done: briefs redesign (slideshow and reel)

Branch `briefs-redesign`. Lanes `briefs-manager` and `briefs-creator` are merged in. Checks on the merged branch: `npx tsc --noEmit` clean, `npx eslint` clean on every new or changed file, `npx vitest run lib` 31 passed (the two `supabase/functions/_shared/*.test.ts` Deno files fail under vitest on `main` too, jsr import). Typed routes regenerated (`.expo/types/router.d.ts`).

## What shipped

- DB: migration `117_brief_slides_kind_features` (briefs.kind, slides, story, open, cta_feature_id, status, creator_note; product_features.clip_url, screenshot_url, is_general). Inkbound reset with a JSON backup in `supabase/backups/inkbound-2026-10-13/` (git ignored); week 2 seeded (`scripts/seed-inkbound-briefs.ts`).
- API: `lib/briefs-api.ts` "Briefs redesign" section, `lib/library-api.ts` features, `lib/brief-copy.ts` verbatim copy, `lib/submissions.ts` `submitProject` caption and hashtags.
- Shared: `components/shared/briefs/*`, `theme/tokens.ts` `briefTone`, new `Icon` names, `expo-linear-gradient`.
- Manager: `app/(admin)/week/[id].tsx` (week, counters, slots, publish footer), `app/(admin)/brief/kind.tsx`, `app/(admin)/brief/[id].tsx`, `components/admin/briefs/**` (canvas, text toolbar, safe zones, sheets, details, review, reel script).
- Creator: `app/(creator)/(tabs)/index.tsx` (home with 1 left and All done), `app/(creator)/make/**` (start, slideshow pick, edit, caption, review, record, reel editor, sent), `components/creator/briefs/**`.

## Loop test

Ran at the data level against the live project, not on a device (no Xcode or simulator on this machine, and `expo-linear-gradient` is a new native dependency so the installed app needs a new build before the JS can run on a phone).

1. Manager: week 2 has slideshow 01 (handheld, Numbered tips), reel 01 (handheld, Numbered list) and reel 02 (story, Talking head) with `status = 'ready'` and `reviewed_at` set, which is what `week-plan` and `publish-campaign` treat as complete.
2. Publish: assignments written for today for the three Inkbound creators with approved accounts (3 each), campaign marked published.
3. Creator: `listCreatorBriefsForDay` select shape returns the three briefs with kind, format, post type, 7 or 2 slides and the CTA feature id.
4. Review: the creator flows submit through `submitProject` / `createAssignmentSubmission`, the same path the existing review queue already reads; no code in `app/(admin)/review` changed.

The device pass (manager fills one slot of each kind for both formats, creator makes and sends each, manager sees them in Review) still needs a build and a phone. Run it after `eas build` and report differences with the fix prompt in `00_START_HERE.md`.

## Could not match, and why

- Fonts: prototype uses Figtree, Nunito, Courier New and Snell Roundhand; the app uses System for UI and display (repo convention, no font bundle in the handoff).
- Manager Story: the prototype shell routes Story through the canvas (Cover, CTA, Details, Review) and never renders its `StoryEditor` with beats, so beats are not editable by the manager (`story.beats = []`, min and max from the count sheet). Creators write their beats.
- Manager Freestyle: the prototype saves Freestyle from the kind picker with no prompt or must-have UI; `open` is saved with `defaultMustHaves(company)` and an empty prompt.
- Revise with AI opens from a sparkles tool on slides with text; the prototype defines the sheet without a trigger.
- Generate with AI for the CTA uses the matched feature's plug line shaped by post type; `brief-assist` has no CTA action yet (requested in PROGRESS.md).
- Library feature screenshots are null until a manager uploads one; toned placeholder cards show meanwhile. Reel Shot badge is always `0:07` (no clip length column).
- Canvas supports one text box and one inset per slide; `extras` and `pics` round trip through save and render on the creator side but are not drawn or edited on the manager canvas.
- Week screen: lane switcher, type filter and the done-week post list from the old grid are gone (not in the prototype); publishing stays through the existing `WeekFooter` to `week-plan`.
- Creator: camera roll grid is the system picker (multi select); creator text style sheet (fonts, swatches, bg) not built, slide text is the single white box with `tstyle.size` honored; FYP handle is `@firstname`; reel editor text track sits above the ruler too; prompter uses `BeatPrompter` sizes; review `Clip i of n` follows thumb taps; zoom pills replaced by pinch.
- Creator search phrase from the caption step has no destination (`assignments` has caption only).
- Freestyle `Ask for anything` field omitted (no `brief-assist` `ask` action); hook and line suggestions come from `assistRegenerateField`.
- CTA feature screenshot shows on the creator canvas and review but is not baked into the posted slide (`edit-document` has no inset field; requested).
- Em and en dash grep: UI strings are clean; the one en dash metric placeholder in `app/(admin)/creator/post/[assignmentId].tsx` now shows `0`.

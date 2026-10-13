# Build the new slideshow and reel briefs

This plan covers the redesigned briefs flow for slideshows and reels, on both the campaign manager side and the creator side. You run 8 short Claude Code sessions in order. Paste one prompt per session.

## Before you start (you do this, 2 minutes)
1. Copy this whole folder into the `noni` repo as `design/handoff/`.
2. Copy `CLAUDE.md` from this folder to the repo root. If the repo already has one, paste this one's contents at the bottom of it.
3. Open `Briefs Prototype.html` in your browser. It works offline. Click through it so you know what "done" looks like.
4. In the terminal: `cd noni`, `git checkout -b briefs-redesign`, then `claude`.

## How every session goes
1. Type `/clear`.
2. Press Shift+Tab twice for plan mode. Paste the prompt.
3. Read the plan it gives you. If it looks right, say "go".
4. When it's done, open the app on your phone (`npx expo start`) and compare with the matching screenshot in `screenshots/`.
5. If something is off, paste the fix prompt at the bottom of this file.
6. Commit: `git add -A && git commit -m "briefs: step N"`.

## What's in the folder
- `Briefs Prototype.html` is the clickable design.
- `screenshots/` holds the starting screen for every toggle in the prototype.
- `reference_ui/briefs/` is the prototype code, with exact sizes, colors and copy.
- `03_BRIEFS_SLIDESHOW_REEL.md` is the written spec.
- `CLAUDE.md` holds the rules Claude Code follows every time.
- `QA_CHECKLIST.md` is the final check.

---

## Session 1: Look before building (no code)
```
Read CLAUDE.md, design/handoff/03_BRIEFS_SLIDESHOW_REEL.md, every file in design/handoff/reference_ui/briefs/, and look at every image in design/handoff/screenshots/.
Then explore app/(admin), app/(creator), components/, lib/briefs-api.ts, lib/tasks-api.ts, lib/library-api.ts, modules/video-editor, components/Teleprompter.tsx, components/SlideStage.tsx and supabase/.
Write design/handoff/AUDIT.md with:
1. Which current files handle the manager week plan, brief editing, creator home, slideshow making, reel recording and editing.
2. For each designed screen: reuse, rewrite or new, and the file it will live in.
3. The exact database changes needed for the brief data model in the spec (smallest migration).
4. Anything the design needs that the backend does not have yet.
Do not change any code.
```

## Session 2: Database and API
```
Read CLAUDE.md, design/handoff/AUDIT.md and the data model in design/handoff/03_BRIEFS_SLIDESHOW_REEL.md.
Write the new Supabase migration from AUDIT.md (new file only). Extend lib/briefs-api.ts and lib/library-api.ts with typed functions to: list a week's slots per format, create and update a brief (format, kind, post type, slides, caption, search term, CTA feature, story settings, freestyle settings), add a brief to the week, list library features, and fetch a creator's briefs for today. Seed the Inkbound sample data from reference_ui/briefs/ss-data.js.txt for local testing. Add tests for the API functions. Run typecheck and tests.
```

## Session 3: Manager week and kind picker
```
Read CLAUDE.md, design/handoff/AUDIT.md, reference_ui/briefs/SSShared.jsx.txt and SSManager.jsx.txt (WeekScreen, KindScreen and everything they use), and screenshots manager-slideshow-1-week.png, manager-slideshow-2-kind.png, manager-reel-1-week.png, manager-reel-2-kind.png.
Build in React Native with this repo's primitives:
1. Week screen: header with week number, dates and the chat button; the Reels and Slideshows counters that also switch format; numbered slots (filled card with kind and post type chips, dashed empty slot with plus).
2. Tapping an empty slot opens the kind picker (Handheld, Story, Freestyle with their one-line descriptions), then the post type list for that format.
Wire it to the API from session 2. Match the screenshots exactly and copy every string verbatim.
```

## Session 4: Manager slideshow editor
```
Read CLAUDE.md, reference_ui/briefs/SSCanvas.jsx.txt, SSFlow.jsx.txt, SSFreestyle.jsx.txt, SSShared.jsx.txt, ss-data.js.txt, and screenshots manager-slideshow-3-handheld.png, manager-slideshow-4-story.png, manager-slideshow-5-freestyle.png. Open design/handoff/Briefs Prototype.html in the browser (Manager, Slideshow) for the full flow.
Build the slideshow brief editor, where the post itself is the form, in this order and commit after each:
1. Full-screen post preview with For you header, swipeable slides, side rail and dots. Solid slides belong to the manager, dashed ones to the creator.
2. Tap to edit text on a slide, text styles (swatches, fonts, size), and the platform safe-zone overlay.
3. Bottom step strip (Cover, Slides, and the rest) with the Add to week button.
4. Sheets: media and shot direction, slide count, CTA with the Library feature picker and screenshot inset.
5. Story settings (theme, beats, min and max) and Freestyle (prompt, must-have toggles, AI hook and line suggestions).
6. Review step, then Add to week saves the brief and goes back to the week with the slot filled.
Reuse components/SlideStage.tsx if it fits. Animations use Reanimated with the prototype's durations.
```

## Session 5: Manager reel editor
```
Read CLAUDE.md, reference_ui/briefs/SSManager.jsx.txt and SSFlow.jsx.txt (reel paths), ss-data.js.txt (reel, kindsReel, postTypes.reel, longtext), and screenshots manager-reel-3-handheld.png, manager-reel-4-story.png, manager-reel-5-freestyle.png. Use the prototype (Manager, Reel) for the full flow.
Build the reel brief editor on the same shell as session 4: the Watch and Script toggle, clip counter, hook and points with the say line under each, the CTA clip with its Library feature, the Long text post type, the step strip (Hook, Points and the rest) and Add to week. Story and Freestyle for reels reuse the session 4 sheets with the reel copy.
```

## Session 6: Creator home and making a slideshow
```
Read CLAUDE.md, reference_ui/briefs/SSCreator.jsx.txt and SSShared.jsx.txt, and screenshots creator-1-home-slideshows.png, creator-4-one-left.png, creator-5-all-done.png. Use the prototype (Creator) for the full flow.
Build:
1. Creator home: company pill, welcome line, day strip, today's main card with format, kind and post type chips and the big Create button, plus the Also today list with the count of what's left to make. Include the 1 left and All done states.
2. The slideshow making flow for each kind: manager text is locked, the creator fills the dashed slides with photos from the camera roll and can crop them. For Story they also write their beats; for Freestyle, everything.
3. The sent screen, then back to home with the next task.
Submit through the existing submissions API so it lands in the manager's Review queue.
```

## Session 7: Creator reel recording and editor
```
Read CLAUDE.md, reference_ui/briefs/RLCreator.jsx.txt and RLEditor.jsx.txt, and screenshots creator-2-home-reels.png and creator-3-reel-editor.png. Use the prototype (Creator, Reels and Reel editor).
Build:
1. The record screen: teleprompter showing the hook and each point's say line, one clip per point plus the plug clip, the tools (flip, timer, grid), and retake.
2. The reel editor: preview with text overlays, play and time, undo and swap, a timeline with the text track and clip track, trim and reorder, and the text toolbar.
3. Send, using the same sent screen as session 6.
Reuse components/Teleprompter.tsx, modules/video-editor, modules/clip-joiner and lib/recording-drafts.ts. Keep the drafts working offline.
```

## Session 8: Full test and polish
```
Read CLAUDE.md and design/handoff/QA_CHECKLIST.md.
Run the full loop on a device: the manager fills one slot of each kind for both formats and adds them to the week, the creator sees them on home, makes each one and sends it, and the manager sees them in Review. Fix everything that breaks.
Then go through every screenshot in design/handoff/screenshots/, compare it with the app, and fix every difference in spacing, type, color, copy and states. Grep the UI for em and en dashes and remove them. Run typecheck, lint and tests. Write design/handoff/DONE.md listing anything you could not match and why.
```

---

## Fix prompt (use any time)
```
This screen does not match design/handoff/screenshots/<file>.png. List every difference (spacing, sizes, colors, copy, states, animation), then fix them all. Check reference_ui/briefs/ for exact values.
```

## After the briefs ship
The rest of the designs (multi-campaign switcher, other manager tabs, settings, web console, ops, pricing, landing) are planned in `01_MASTER_PLAN.md`, with prompts in `PROMPTS.md`.

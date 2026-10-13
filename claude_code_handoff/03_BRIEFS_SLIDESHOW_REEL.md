# Briefs: slideshow and reel

Live prototype: `redesigns/slideshow-briefs/index.html` in the design system project. Toggles: Manager or Creator, Slideshow or Reel, start screen (Week, Kind, Handheld, Story, Freestyle), creator scenarios (Slideshows, Reels, Reel editor, 1 left, All done).
Source: `reference_ui/briefs/*.txt`. Sample data and exact copy: `ss-data.js.txt`.

## Core idea
The post is the form. The manager edits a live preview of the actual post. Solid slides are the manager's, dashed slides are the creator's. Empty slots open a picker for the kind.

## Concepts
- Week: numbered week with date range, slots per format (prototype: 7 slideshow, 14 reel). Filled slot shows title, kind, post type, count. Empty slot is tappable.
- Format: slideshow or reel.
- Kind (who writes what):
  - Handheld: manager writes every slide or point. Creator adds photos (slideshow) or records (reel).
  - Story: manager sets title or hook and CTA. Creator fills the middle within min to max beats.
  - Freestyle: prompt plus must-haves toggles (mention the brand once, one product screenshot). Creator makes anything.
- Post type: per format list in `postTypes` (slideshow: How to, Numbered tips, Getting started, Myths; reel: Talking head, Numbered list, How to, Explainer, Storytime, Green screen react, Long text). Each has a structure line, about, example.
- Slide or point: role (cover, point, cta), text, shot direction, optional inset (a Library feature screenshot), text box position and style.
- Library feature: title, description, plug line (CTA), clip length, screenshot. The CTA slide picks one feature; General is the fallback.
- Caption and search term per brief.

## Manager screens (P5)
1. Week: slot grid, progress (videos done of total), legend for kinds.
2. Kind: three kinds with their one line each, then post type picker with example.
3. Canvas (slideshow): swipeable deck, tap text to edit, platform ghost overlay (Instagram and TikTok safe zones, blocked areas), text style (swatches, fonts, size), crop, media sheet for shots, CTA slide with feature inset sheet, slide count sheet.
4. Reel script: hook line plus "say" line per point, CTA with feature clip, step strip on top.
5. Story: theme, beats, min and max, CTA.
6. Freestyle: prompt, must-haves, AI sheet with hook and line suggestions.
7. Review: FYP style preview of the final post, tabs, back. Send to creators.
Revise chips on canvas (e.g. "Make the cover stop the scroll") call the existing AI endpoint.

## Creator screens (P6)
1. Home: today's slideshows and reels, states for "1 left" and "All done".
2. Slideshow handheld: slides with manager text locked, dashed slots for photos, add from camera roll, crop.
3. Reel record: teleprompter of the hook and points, tools (flip, timer, grid), clip per point, plug clip.
4. Reel editor: timeline (px per second scale), trim, reorder, text toolbar.
5. Sent: confirmation, next task.

## Data model (extend `lib/briefs-api.ts`, do not replace)
```
brief { id, company_id, week_id, slot_index, format: 'slideshow'|'reel', kind: 'handheld'|'story'|'open',
  post_type, title, caption, search_term,
  slides: [{ role: 'cover'|'point'|'cta', text, shot, say?, inset_feature_id?, box?: {x,y,w}, tstyle? }],
  story?: { theme, beats: string[], min, max }, open?: { prompt, must: [{id,label,on}] },
  cta: { text, feature_id }, status }
library_feature { id, company_id, title, description, cta, clip_url?, screenshot_url, is_general }
```
P0 must diff this against the current schema and propose the smallest migration.

## Animations
Keyframes in the prototype index.html (screen in, toast in, place, pulse, ring, bounce in). Use Reanimated with the same durations and easing tokens.

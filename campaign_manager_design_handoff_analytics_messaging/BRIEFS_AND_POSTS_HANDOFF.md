# BRIEFS AND POST CREATION: complete handoff

For Cursor. Everything a campaign manager does to plan a week and make posts in the Inkbound admin app, in one file, final. Parts: 1 Briefs tab and weeks, 2 Week setup and the empty week, 3 Making posts from the Library, 4 The post editor (one form), 5 Generation rules (Fill with AI, kill reasons, what the creator receives), 6 Data, 7 QA. Read the whole file before touching code.

Ground rules
- Company is Inkbound (inkbound.ai). All briefs and weeks were wiped; exactly one empty draft week exists. A brief week is seven days that START WHEN ITS FIRST POST GOES LIVE, not on a planned date. Until then the week is a draft with no dates; day chips and "Day N of 7" appear only after the first post is live.
- Reference code is browser React saved as .jsx.txt in reference_ui/. Read it as JSX for layout, spacing, copy and behaviour; translate to React Native; never copy DOM.
- Design language: 01_DESIGN_LANGUAGE.md and theme/tokens.ts. Token colors only. Copy verbatim. Never an em dash or an en dash; use a period, comma, colon or "to".
- Hit targets 44px (the tiny toggles noted in Part 4 are the only exception at 30 to 36px, always inside a 44px tall row). Text never below 11px. Every async surface has a skeleton and an empty state.
- Reference files: reference_ui/BriefsScreen.jsx.txt and FirstWeek.jsx.txt (Part 1), WeekSetupScreen.jsx.txt (Part 2), LibraryV2.jsx.txt (Part 3), PostEditorV2.jsx.txt plus EditorSheets.jsx.txt for the OverlayEditor (Part 4). Live designs: ui_kits/admin-app/index.html (Briefs tab), library.html, post-editor.html.
- Related handoffs that touch the same data: REVIEW_HANDOFF.md (what happens after a creator submits), tasks/round2-agent-E-library-media.md (the Media library the editor picks from), tasks/agent-3-music-approval.md (the song links the editor collects).

---

## Part 1: Briefs tab and weeks

### Base spec (round 1, still valid)
Reference: reference_ui/BriefsScreen.jsx.txt. Touch: app/(admin)/(tabs)/calendar.tsx (or the briefs tab), app/(admin)/week/[id].tsx, components/admin/CalendarView.tsx.

### Spec
- Invariant: a week is fully planned before it starts. The list shows ONE "Next week" card (brand chip, "Not planned yet. Opens Sunday, tap to start it.") and completed weeks below. Never an incomplete current week.
- Current week chip: green (good tone) "Day N of 7", N computed from today within the week range. Past weeks: quiet "Done". Same status text in the calendar stepper and week detail meta ("· day N of 7").
- Week cards: title + range; two lane progress bars (video 20/20, slideshow 10/10); stat pill row: "$X /day avg", "XK views/day", "X.X posts/day" (average per creator per day), then flex spacer, then "N creators" (600 10.5px slate-400) on the right.
- Calendar view: week stepper with chevrons, two lane summary cards.
- Week detail: next week → planning entry; done weeks → lanes summary + posts made.
- Data: wire to lib/briefs-api.ts and lib/analytics-api.ts; the per-week aggregates ($/day, views/day, posts/day per creator, creator count) may need new API fields.

### Acceptance
- No live-incomplete state exists; day chip correct for today; pills and creator count on every non-next card.


### Round 2 changes to the Briefs tab
- The week model changed: a week has no planned dates. Cards read "Week 1 · Draft" until the first post is live, then "Week 1 · Day N of 7" (green) for the live week and "Week 1 · Done" for past ones. Remove "Opens Sunday" and any planned-date copy. The next week card reads "Not started. Fill it and the week begins with the first live post."
- Fresh accounts (the current state): one empty draft week already exists, so there is no first-run "Start week 1" card. Briefs opens on the week list with that single draft week; tapping it opens the empty grid (Part 2).
- Post rows in an opened week keep four states: empty, partial, complete, killed (with the kill reason inline, amber). Tapping any row opens the post editor (Part 4) on that slot.
- The Messages button top right on every Briefs surface opens the Messages tab (round2-agent-A). Per-brief group chats from the earlier round are replaced by the post threads described in round2-agent-B.

### Reference: Briefs tab update (round 1.5)
Still the source for the week list card anatomy, past week archive, day detail and the OverlayEditor. Where it conflicts with round 2 above or Part 4 below, round 2 wins (dates, messaging, and the seven-step editor are superseded).

### What changed, in one paragraph
The Briefs tab is a list of week cards: Next week always on top, past weeks below it, newest to oldest. New accounts get a first-run screen with one action, Start week 1. Past weeks open into a browsable archive with days and per-post sales. A messages button sits top right on every Briefs surface and opens Slack-style messaging: one group chat per brief plus manager DMs, with voice notes, uploads, replies and forwards. In the post editor, each talking point can carry a screenshot or screen recording (with green screen placement) and story-style overlay text, edited in a full-screen composer.

### 1. Briefs tab (`FirstWeek.jsx.txt` + `BriefsScreen.jsx.txt`)

**First run (no week yet).** Header + one card: layout-list icon in a blue circle, title `Start your first brief!`, primary button `Start week 1` into week setup. Nothing else on the screen.

**Week list.** One card per week:
- Top card is always the next week: label, range, `Next week` chip (blue tint), copy `Not planned yet. Opens Sunday, tap to start it.`
- Past weeks below, most recent first. Status dot before the range: orange = in progress (current week only; a past week is never in progress), green = complete. Complete cards show stat pills instead of lane counts: `52K views/day`, `$1,240 sales`, `30 posts`. Manager avatar stack top right. Whole card opens the week.

**Opened live week** (`BriefsScreen.jsx.txt`, pass `sel`): lane cards (Videos n/20, Slideshows n/10), then type chips, then the 30 rows. Type chips are now FILTER BUTTONS (`SplitHeader`): tap to show only that type, tap again to clear; each chip shows `done/total` in amber while short, green with a check icon at target; active chip gets blue border + blue-50 fill. Filter resets on lane switch.

**Opened past week** (`PastBriefScreen`): stat cards (Views/day, Sales in green, Posts), a horizontally scrolling day-chip row (weekday, date, `N posts` — each opens the day), an All/Videos/Slideshows segmented filter, then every post: thumb, title, creator, format, day, views, sales. Footnote: sales render only when sales tracking is on in Settings.

**Day detail** (`BriefDayScreen`): header `Tuesday, Aug 18` + `Week 1 · 5 posts · $212 in sales`; one row per post with creator avatar, thumb, title, views, sales.

### 2. Messaging (`Chat.jsx.txt` + `MsgButton` in `AdminShared.jsx.txt`)

**Entry.** `MsgButton` (38px white circle, message-circle icon, blue unread badge) sits in the header of EVERY Briefs screen: first run, week list, opened week (push header), empty state, calendar. It opens Messages.

**Messages home.** Two sections: `Brief chats` (one group chat per brief, blue rounded-square layout-list avatar, preview + time + unread pill) and `Direct messages` (one row per manager). No explainer copy between sections.

**Chat screens** (`ChatScreen`): push header with participants, scrolling bubbles, pinned composer (attach button, text pill with mic inside, blue send). Bubble vocabulary, all in `ChatBubble`:
- replies: quoted block (accent bar, sender name, one-line snippet) above the message
- forwards: `share-2` icon + `Forwarded from …` label; can embed a `PostRef` card (video icon, `Post 12 · Numbered list`, chevron) that deep-links to the post
- voice notes: play circle + waveform bars + duration
- uploads: image thumbs with optional caption
- reactions: small white pills under the bubble (heart icon + count)
Own messages are blue, right-aligned; others white, left, with avatar. Group chat = every manager on the account; DMs are one to one. Same components in both.

### 3. Post editor, talking points (`PostEditorSteps.jsx.txt`, `EditorSheets.jsx.txt`)

Each point card stacks:
1. Media row: filled state (thumb + name + clip/slide picker) or dashed `Add screenshot or recording` → camera roll sheet (`ShotPickerSheet`).
2. Green screen row (when the point is a green screen clip and has media): green tint chip `Green screen · fills the background` + placement button (`Top right` etc.) → opens the media composer.
3. Text row: dashed `Add text`, or a black preview strip showing the styled text pill + its position; tap → text composer.

**Full-screen composer** (`OverlayEditor`, one component, two modes) — story-style, like composing a reel; opens on the actual post format (clip for videos, slide for slideshows):
- Chrome: X top left, `Done` pill top right, tool rail down the RIGHT side (42px circles, dark scrim `rgba(16,22,29,0.45)` + blur so they read over light media).
- Text mode: media dimmed behind; a live textbox is ALREADY active in the center (text + caret) the moment it opens; rail = text size (Aa), background-behind-text toggle (A chip), AI rewrite, delete; color swatch row along the bottom (white, ink, blue, green, amber — white ring on the active one). Background on = colored pill with contrasting text; off = colored text with drop shadow.
- Media mode: screenshot/recording rendered at its placement over the creator silhouette; rail = swap media, green screen toggle (green when on), add text, remove; bottom chips `Full / Top left / Top right / Center` (default Top left).

### 4. Week setup (`WeekSetupScreen.jsx.txt`)
Takes a `title` prop (`Week 1 · Aug 17 to 23` on first run). The step-0 subtitle, the stamped-rows info box, and the pool-not-a-lock footnote were removed by design review; do not reintroduce them.

### 5. Collaboration model
All campaign managers on an account see the same weeks and briefs and can fill any row. Manager avatars stack on active week cards. Messaging (section 2) is the coordination surface; presence copy is out of scope for v1.

### 6. Acceptance checklist
- New account: Briefs shows first run; Start week 1 runs week setup titled Week 1 and lands on the empty grid.
- Week list: next week always first; past weeks show green dot + stat pills; only the current week may show orange.
- Type chips filter rows and show amber `n/m` or green `m/m` + check.
- Messages button on every Briefs screen; per-brief group chat + DMs; replies, forwards, voice notes, uploads, reactions all render.
- Talking point: add screenshot or recording; green screen points get placement; add text opens the composer with the textbox already active.
- Sales figures appear only when the account's sales tracking setting is on.


---

## Part 2: Week setup and the empty week

Reference: reference_ui/WeekSetupScreen.jsx.txt (targets and type split), BriefsScreen.jsx.txt (the opened week).
- Week setup sets two lane targets (videos, slideshows) and the type split per lane. It no longer asks for dates. Title "Week 1". The step-0 subtitle, stamped-rows box and pool footnote stay removed.
- The opened empty week shows lane cards (Videos 0/N, Slideshows 0/N), the type chips as filters, and N empty rows, each with its type chip and "Empty" state. Tapping a row opens the editor on that slot with the type preselected (so the Kind of post sheet does not appear; it appears only when the slot has no type).
- "Next empty slot" (used by Make post in Part 3) = the lowest numbered row in the current week with state empty. If none, the Library toast "This week is full. Add a slot in Briefs." fires and nothing else happens. Adding a slot is the existing "+ slot" affordance in the opened week.
- The week starts when its first post is live: on the first post_live event for a brief in the week, set week.started_at and compute day chips from it. Nothing else changes state.

---

## Part 3: Making posts from the Library

Reference: reference_ui/LibraryV2.jsx.txt (TypeSheet, make, MadeMeta, KillNote). Full lane specs in tasks/round2-agent-D, E, F.
- Every Idea, Reference and one of Our posts has a Make button (Again once used; Remake for our posts).
- Ideas and References open the "Make a post" sheet: subtitle "From {source}. Goes into Week 1, slot {k} of {n}." with one row per post type (PostTypeChip left, Reel | Slideshow | 7 sec right). Picking a type shows a spinner on that row and blocks closing until done. Our posts skip the sheet because the type is known.
- Generation fills the next empty slot from the source and then opens the post editor (Part 4) on that slot, already filled. This is the ONE path where the editor opens non-empty.
- Refused generation: the sheet closes, the item stays, and a KillNote appears under it: amber-soft row, circle-alert, "Not made. {kill reason}", x to dismiss. Count never increments.
- Success: increment made, set madeOn and the slot label, move ideas and references to their Used sub-tab, and store the link so "Used 1x · Sep 4 · Week 1 · slot 3" opens that post.

---

## Part 4: The post editor, one form

Reference: reference_ui/PostEditorV2.jsx.txt (PostEditor2, ClipScreen, HookScreen, Toggle, FormGroup, FormRow, FormText). Live design: ui_kits/admin-app/post-editor.html.
Touch: app/(admin)/post/[id].tsx (rewrite), components/admin/editor/ (new: FormGroup, FormRow, FormText, Toggle, ClipScreen, HookScreen), lib/briefs-api.ts (song fields), post editor media sheet (Agent E's Media library source). Delete the step components and StepDots once wired.

### Shape
One scrolling form. Nothing is a step. The post opens COMPLETELY EMPTY: every box shows its placeholder, every clip row reads "Nothing written yet". The manager types whatever they know (a title, a phrase, one clip) and then taps Fill with AI, which writes the rest around what they typed. Anything that needs room (a clip, the hook, the kind of post) opens a clean screen or sheet for just that and comes straight back. Nothing generates on open.

Header: PushHeader "Post {nn}", meta "{Type} · Reel|Slideshow · Week 1, slot {n}", trailing PostTypeChip (tap opens the Kind of post sheet).
Footer ActionBar: left outline sparkles button (44%) reads "Fill with AI" when the post is fully empty and "Finish with AI" once anything has been typed; "Filling" while busy. Right: "Save post" (primary, check).

### Fill with AI sheet
Tapping Fill with AI opens a sheet, never fills directly.
Title "Fill with AI", no subtitle. The sheet opens tall (94% of the screen) so it reads like the Library itself: browse, pick, come back.
Segmented row: Ideas {n} / References {n} / Our posts {n} (unused ideas and references only; all of our posts).
Above the list, per lane:
- Ideas: a text box "Or type your own idea" (zap icon, blue ring when typing, x to clear). Typing clears any picked row; Fill from this then uses the typed idea as the source and also saves it to Library Ideas as Used.
- References: a "Paste a new link" row with a primary Paste button (same clipboard flow and validation as the Library References lane). The pasted link appears at the top of the list, selected, resolving its title, and is saved to Library References as well. One card of rows: for ideas a zap icon and the idea text (2-line clamp) with sub "Unused idea"; for references a 32x42 thumb, title, sub "@handle · TikTok|Instagram"; for our posts the thumb, title, sub "{creator} · {views} views". A chevron-down and a 22px radio on the right; one pick at a time.
Rows expand: tapping the row (not the radio) opens it in place with a 160ms fade: the thumb grows to 54x72, the title unclamps to 6 lines, then a short line about what the fill does with this source ("The fill reads its transcript and caption and writes a fresh post in the same shape." for references; "The fill ports this brief: same structure, new phrasing and new hook." plus creator, type, format and date for our posts; "Saved as an idea. The fill turns it into a title, a hook and the clips." for ideas), then two sm buttons: "Open on TikTok|Instagram" / "Open the live post" (tint, arrow-right; opens the source in the browser; none for ideas) and "Use this" (secondary; reads "Selected" outline once picked). Only one row is expanded at a time; expanding does not select.
Footer: left outline button reads "From scratch" when nothing is written or "From what I wrote" when something is; right primary "Fill from this" (sparkles) disabled until a source is picked or an own idea is typed.
Fill rule: every field the manager typed is kept verbatim and passed to the generator as constraints; only empty fields are written. Source = the idea text, the reference URL (fetched transcript and caption), or the existing post's brief. The sheet closes, the footer button reads "Filling", and all fields populate together. Making from an idea or reference marks it Used in the Library (agent-F flow) once the post is saved.

Full green screen (reels only) lives in the CLIPS group label row, on the right after the "{filled} of {total} written" meta: the words "Full green screen" (700 11px, green when on) and a tiny 30x18 toggle (green fill when on). Nothing else, no row of its own. When on, every clip's segment.layout is green_screen, the per-clip Green screen toggle reads "Green screen · whole post" and is locked on, and each clip's On screen canvas asks for a background. Maps to brief.full_green_screen (new boolean); turning it off restores each clip's own layout.

Groups, in order (label 700 12px uppercase slate-500 with an optional right meta, then one white card):
1. TITLE: big auto-growing text box (700 19px display), placeholder "Untitled post".
2. SEARCH PHRASE: single line with a search icon, placeholder "What people type into TikTok".
3. CLIPS (reels) or SLIDES (slideshows). Reels open with ONE row, "Hook", and no clips; the Hook row opens ClipScreen in its hook variant (see below), which has the same On screen tools as every clip; slideshows open with one empty "Slide 1". Clips are named "Clip 1", "Clip 2", ... in order (never Point n). Row: label with a "Plug" brand chip on the plug clip and a small images icon when a screenshot is attached, sub line = the text or "Nothing written yet" ("Nine words that stop the scroll" on an empty hook, "Empty slide" for slides), an 8px dot (green written, line-strong empty), a 32px x on every clip row (not the hook; not the last remaining slide) that removes it, chevron. Last row: "+ Add clip" / "+ Add slide" (700 14px blue-700 with a 24px blue-100 plus disc) appends an empty one. No written count in the label row. Renumber on add and remove. The note format sent to creators still uses Hook / Point n / Outro labels: map Clip n to Point n and the last clip to Outro when serialising, so the creator app keeps parsing (see round2-agent-C Data contract). Fill with AI adds clips when the list is empty (count from the post type) and fills empty ones otherwise.
4. CAPTION: auto-growing text box (placeholder "First sentence carries the search phrase"). Hashtags are ALWAYS automatic and are the ONE thing filled in the moment a post opens (from the company hashtag bank plus the post type), before the manager types anything: no chips, no add or remove. Under the caption a single line of the tags in blue-700 (600 13px), read only. Right meta with a sparkles icon: "{n} hashtags, auto". Fill with AI may refresh them against the finished caption.
5. SONG: row with music icon, "Add a song after posting", sub "Slideshows only. Videos keep their own sound." and a 44x26 Toggle. When on, sub reads "The creator gets both links once it is live" and two rows appear (fade in): "TikTok sound" and "Instagram audio", each with a sub line showing the pasted link (blue-700) or "No link yet", and a sm tint "Paste" button that reads the clipboard (expo-clipboard). Accept only tiktok.com or instagram.com URLs; otherwise toast "Copy a TikTok or Instagram link first". Once pasted the button becomes a 36px x button to clear. These two links are what the creator gets after the post goes live (see agent-3 music flow). The toggle is off and hidden for reels unless product decides otherwise; default off for slideshows.

### Post families
Three families, one editor. The Kind of post sheet lists every type with its family on the right:
- Reel (video): Hook plus clips. All types in VIDEO_TYPES.
- 7 second text (new type key text7, family video, label "7 second text", hint "One clip, one line of text, seven seconds"): ONE clip only. The Clips group is labelled CLIP with the meta "7 seconds, one take", the single row is "The clip" (sub "The one line on screen"), no Add clip, no remove, no Full green screen toggle, no Song group. The clip's text IS the on-screen text: ClipScreen shows a TEXT ON SCREEN group (placeholder "The line that sits on the clip for seven seconds") and the canvas mirrors it live as the burned-in text; no Hint | Script switch, no plug. The creator records one 7 second take with the text shown; Inkbound burns the text in. Header meta reads "{Type} · 7 seconds · Week 1, slot {n}".
- Slideshow (photo_carousel): slides. All types in SLIDE_TYPES.

### What to record (optional, every family)
Directly under TITLE. Collapsed by default as a blue-700 text button "+ Add what to record". Tapping it opens a group WHAT TO RECORD with right meta "Optional" and an x that removes it; auto-growing text box, placeholder for 7 second text "e.g. Record yourself juggling a soccer ball for 7 seconds", otherwise "What the creator needs to understand before they record". This is plain instruction copy for the creator: it is shown at the top of the post in the creator app before they record, and inside the ClipScreen of a 7 second text post as a blue-50 note (video icon) above the text box. Maps to brief.record_instructions (new nullable text). Not spoken, not on screen, not part of the script sent to the teleprompter.

### Filling: the loading experience (build this exactly)
Filling must never feel stuck. The generator streams field by field and the form shows each field arriving in reading order. Never show a full-screen spinner or block the form.
1. Tap Fill from this. The sheet closes (240ms). Clip rows appear immediately if the list was empty (count from the type), all reading "Nothing written yet".
2. The footer's left button becomes "Stop" (ghost, 30%). The right button becomes a progress pill (48px, blue-100 track, blue-200 fill that widens as fields land, 500ms ease-out) with a spinner and the current stage label in blue-700: "Writing the title", "Finding the search phrase", "Writing the hook", "Writing clip {i} of {n}", "Writing the caption". When done the pill reads "Done" with a check for 1.2s, then the normal footer returns.
3. Every field that is still pending shows, in its group label row, a pulsing blue "Writing" tag (sparkles icon, 1.2s opacity pulse), and in place of its text a shimmer: 1 to 2 rounded lines in blue-100 to blue-50 with a 1.4s sweep (title 16px tall, others 11px). Clip rows show a shimmer line as their sub text and the clip currently being written swaps its dot for a small spinner.
4. When a field arrives its text fades in over 320ms and the shimmer disappears. The dot on a clip row turns green with a 240ms transition. Fields the manager typed never shimmer and never change.
5. Order is fixed: title, search phrase, hook, clips in order, caption. Hashtags are already present.
6. Stop cancels the stream and keeps everything that has landed; nothing is rolled back. Errors surface as a toast "Could not finish. What landed is saved." and the footer returns to Finish with AI.
7. Timing: use real streaming from the generator (SSE or chunked function response, one event per field). If the backend cannot stream yet, fake the cadence client side from the single response (700ms first field, then 650ms apart) so the experience is identical; swap to real events without changing the UI.
8. The form stays fully scrollable and editable while filling. Typing into a pending field claims it: it stops shimmering and the generator's value for that field is discarded when it arrives.

### Kind of post sheet
Opening an EMPTY post shows this sheet first, before anything else; it cannot be dismissed without a pick (no close button, scrim does nothing) and the pick is written to the brief right away. Later it opens from the type chip in the header and can be closed. Title "Kind of post", no subtitle. One card of rows: PostTypeChip label, hint as sub line, blue check on the current one. Picking re-derives the clip rows (keep written text where slots still exist).

### ClipScreen (one clip or slide)
PushHeader title = clip label ("Clip 3" or "Hook"), meta "The first thing they hear" on the hook, "Carries the plug" on the plug clip, "One screen" for slides, else "One thought per clip". Trailing: two 36px white round buttons, chevron-left and chevron-right, to step to the previous or next clip (disabled at the ends).
Body, top to bottom, gap 16:
1. Plug row (clips only, not slides): one line, no card. zap icon (blue-600 when on, slate-400 off), "Plug" (700 13px) with a suffix " · this clip mentions Inkbound" when on or " · another clip has it" (slate-400) when another clip holds it, and a SMALL 36x22 toggle on the right. One plug per post: when another clip has it the toggle is disabled at 40% opacity; turn that one off first. Maps to requires_plug / the plug point.
2. TALKING POINT group. On the hook this group is labelled HOOK, the text box placeholder is "Nine words maximum", the right side shows "{n} of 9 words" (danger above 9) and a small blue-100 pill "{n} options" (sparkles) that pushes HookScreen; picking an option there writes the hook and returns to this clip screen. There is no Hint | Script switch on the hook. On every other clip: right of the label a tiny segmented pair "Hint | Script" (24px tall, white selected with card shadow). Script = the creator reads it word for word from the teleprompter; Hint = a cue they say their way (maps to point.script boolean as today). Auto-growing text box, 3 rows min. Placeholder Script: "Read word for word from the teleprompter"; Hint: "A cue. The creator says it their way."; slides: label "TEXT ON THE SLIDE", placeholder "One line the reader can take in at a glance".
3. ON SCREEN group. Right of the label: "Green screen" (700 12px, green when on) with a small 36x22 toggle (clips only). Maps to segment.layout = 'green_screen' | 'standard'.
   Card content (padding 10): a FULL-WIDTH canvas, aspect 9:13, radius 14, media shadow, showing exactly what the clip looks like (no creator silhouette or person icon), then one row of two pill buttons under it (44px tall, fill-quiet, 700 13.5px, equal width) plus a 44px trash button when anything is on screen.
   - Canvas, standard: the clip's first frame when a take exists, otherwise the post's cover tone; an attached screenshot or recording as an inset (default top right, 50% wide, 32% tall, radius 10, play disc on recordings) at the position set in the editor; text boxes at their positions (800 22px display, white, shadow). Empty: centered video icon + "Just the creator talking" in white 75%. Tapping the canvas opens the OverlayEditor (media mode when media exists, else text mode). A small "Tap to edit" glass pill sits bottom right when anything is on screen.
   - Canvas, green screen: the picked image fills the frame, text on top. Empty: light blue placeholder with images icon + "Pick a background".
   - Buttons: standard "Add media" (images icon; once attached shows the media title with a video icon for recordings and opens the OverlayEditor in media mode) + "Add text" (Aa; once texts exist reads "{n} texts"). Green screen: "Background" (green-soft with the title once picked) + "Add text". Trash clears media and texts.
   - OverlayEditor is the existing story-style full-screen editor (components/admin/editor/OverlayEditor.tsx): drag to move, pinch to resize, text with color and background pill, position presets for media, green screen button on the rail. Keep it; only its entry points change.
4. No helper paragraph.
Footer: "Remove" (ghost, danger red, 30%; hidden on the hook and on the last remaining slide) + "Done" (primary). Remove deletes the clip and returns to the form.

### MediaPickSheet
Title "Add to screen". Segmented "Media | Camera roll". Media = the company library (Agent E) with titles under each tile, screenshots and recordings together, recordings with a play disc and duration. Camera roll = expo-image-picker grid. Tap picks and closes.

### HookScreen (reached from the hook's ClipScreen)
Must fit one screen with NO scrolling on an iPhone SE. PushHeader "Hook options", meta "Best scored first. Tap one and you are back in the clip." One card with at most FIVE option rows (best scored first; the generator returns more but only five show): hook text (600 14.5px), sub "{n} words" plus " · best scored" on the first, a 22px radio. Tapping an option picks it and returns immediately, no confirm. Below: group "OR WRITE YOUR OWN" with a single auto-growing text box (placeholder "Your hook") and right meta "{n} of 9 words" (danger above 9). The footer "Use this hook" appears only while own text exists (disabled above 9 words).

### Data
Same brief fields as today: title, search_phrase, hook, script (points), cta, caption, hashtags[], post_type_id, brief_segments (overlay_text, show_on_screen, screenshot fields, layout). New on the brief: song_enabled boolean, tiktok_sound_url, instagram_audio_url, full_green_screen boolean, record_instructions text, and a post_types row for text7 (family video, one segment). Point rows carry script boolean (Hint | Script) and is_plug (one true per brief, enforced in the API). Save writes everything in one call; the row in Briefs stays "partial" until every clip has text.

### Transitions
Every screen change animates: the form, ClipScreen, HookScreen and the return trip slide up 20px and fade in over 320ms with an ease-out curve (the same "push" motion the rest of the admin app uses); sheets rise 240ms with the scrim fading. Toggles and segmented switches animate 160ms. Nothing ever snaps.

### States
Open: always empty (see Shape). Filling: see "Filling: the loading experience". Saved: return to Briefs.

### Acceptance
- No step indicator, no Next/Back. The whole post is visible on one scroll.
- Clip rows open ClipScreen; prev/next work; edits persist when returning.
- Song toggle reveals two paste rows; Paste reads the clipboard and validates; links persist to the brief and reach the creator after posting.
- Screenshot picker uses Media library titles.
- The editor opens empty every time; Fill with AI opens the source sheet; filling keeps every typed field and writes only the empty ones; HookScreen never scrolls; copy verbatim; no em or en dashes.

---

## Part 5: Generation rules

Fill with AI and Make post call the same generator with the same contract.
Inputs: post_type_id, family (video | text7 | photo_carousel), source (idea text | reference URL with fetched transcript and caption | an existing brief to port | null), constraints = every field the manager already typed (title, search_phrase, hook, any clip texts by index, caption, record_instructions), company context (Features with approved claims, Brain, hashtag bank), and the week's remaining type needs.
Rules the generator must obey:
1. Typed fields are kept verbatim. Only empty fields are written. Typed clip texts keep their index; the generator writes the empty indices and adds clips only when the list is empty (count from the post type).
2. Exactly one plug per reel, inside a clip, traceable to an approved claim in Features. If the manager already marked a plug clip, the plug goes there. If no approved claim covers the post, refuse with a kill reason ("No approved claim covers {topic}"). 7 second text and slideshows without a plug type have no plug.
3. Hook 9 words or fewer; return up to 10 options best first (HookScreen shows five). Search phrase is a real search query; the caption's first sentence carries it. Hashtags come from the bank plus the type and are always written (they are also prefilled on open before any generation).
4. text7: one clip, one line of on-screen text under 12 words, no script, no hook options list needed (the line is the hook).
5. Never write record_instructions unless asked; it is the manager's voice to the creator.
6. Return a structured result (fields plus segments) or a kill reason. Never partial writes on failure.
What the creator receives on assignment: title, record_instructions (shown first), the ordered segments with text, script flag (Hint | Script), plug flag, on-screen text and its position, screenshot or recording reference and layout (standard | green_screen), caption preview, and for slideshows the song flag with both links delivered after posting (agent-3 flow). The note format for sent-back reviews stays Hook / Point n / Outro labels (REVIEW_HANDOFF.md).

---

## Part 6: Data

briefs: title, search_phrase, hook, script (points with text, script boolean, is_plug), cta, caption, hashtags[], post_type_id, family, record_instructions, song_enabled, tiktok_sound_url, instagram_audio_url, full_green_screen, state (empty | partial | complete | killed), kill_reason, made_from ({ kind: idea | reference | post, id }).
brief_segments: slot_index, kind (hook | point | outro | slide | text7), overlay_text, show_on_screen, screenshot_url, screenshot_x, screenshot_y, screenshot_width, layout (standard | green_screen), text boxes with position and style from the OverlayEditor.
post_types: add text7 (family video, segments 1, label "7 second text").
weeks: no planned dates; started_at set on first post_live; targets per lane; slot count.
library: ideas and references gain made_count, made_on, last_brief_id; media as in round2-agent-E.
API: one saveBrief call writes everything; enforce one is_plug per brief server side; generate() returns { brief, segments } | { kill_reason }.

---

## Part 7: QA
- [ ] Briefs shows one draft week with no dates; "Day N of 7" appears only after the first post is live.
- [ ] Opening an empty slot with a type shows the empty editor; opening a slot with no type shows Kind of post first and it cannot be dismissed without a pick.
- [ ] Hashtags are filled on open; nothing else is.
- [ ] Typing a title then Finish with AI keeps the title and writes the rest; Fill from an idea, a reference, a pasted link, an own idea and one of our posts all work; refused generations show the kill reason and write nothing.
- [ ] Reel: Hook plus Add clip; Clip n naming; x removes; one plug only; per-clip Hint | Script; Green screen per clip and Full green screen on the group row; canvas shows media and text; Add media offers Media and Camera roll; OverlayEditor opens in the right mode.
- [ ] 7 second text: one clip, the text mirrors onto the canvas, What to record shows in the clip screen and in the creator app.
- [ ] Slideshow: Slide n rows, Song toggle, both links paste and validate, creator gets them after posting.
- [ ] Filling streams field by field with shimmer, Writing tags, a progress pill and Stop; typed fields never change; no full-screen spinner anywhere.
- [ ] Every screen change animates; nothing snaps; HookScreen never scrolls.
- [ ] grep the diff for "—" and "–": zero hits. Lint and typecheck clean. Old step components deleted.

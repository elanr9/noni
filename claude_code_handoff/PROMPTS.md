# Prompts

Paste one per session. Start each session with `/clear`. Plan mode first.

## P0: Audit and plan
```
Read design/handoff/00_START_HERE.md, CLAUDE.md, 01_MASTER_PLAN.md, 02_SCREEN_MAP.md and 03_BRIEFS_SLIDESHOW_REEL.md. Then explore app/, components/, lib/ and supabase/.
Produce design/handoff/AUDIT.md with:
1. For every row in 02_SCREEN_MAP.md: the real current route and component files, or "missing".
2. Existing shared primitives and which design primitive each maps to; gaps.
3. Schema diff for the briefs data model and the multi-campaign model; smallest migrations needed.
4. Risks and anything the designs need that the backend lacks.
5. Corrected phase plan if the code changes the order.
Do not write app code in this session.
```

## P1: Tokens and primitives
```
Follow CLAUDE.md. Read design/handoff/bundles/design_handoff_admin_app/CURSOR_PROMPT.md and STAGE_PROMPTS.md (stage 1 only), README.md, and design/handoff/AUDIT.md.
Build one theme module from the tokens, then the shared primitives (cards, chips, buttons, sheets, tab bar, segmented, avatar with photo fallback, thumbnail with Reel and Slideshow support). Replace hardcoded values across the app with tokens. Add a kitchen-sink screen showing every primitive. Branch design/p1-primitives.
```

## P2: Multi-campaign
```
Follow CLAUDE.md. Read design/handoff/bundles/design_handoff_multi_campaign/00_START_HERE.md, CURSOR_PROMPTS.md and tasks/ in order, plus reference_ui. Run the backend prompt first, then each task in order. Use P1 primitives. Branch design/p2-multi-campaign.
```

## P3: Creator app
```
Follow CLAUDE.md. Read design/handoff/bundles/design_handoff_creator_app/README.md and CURSOR_PROMPT.md, and the screenshots. Rebuild the creator tabs and flows per 02_SCREEN_MAP.md (creator rows except briefs). Keep lib/ data calls. Match screenshots exactly. Branch design/p3-creator.
```

## P4: Campaign manager core
```
Follow CLAUDE.md. Read design/handoff/bundles/design_handoff_campaign_manager/00_START_HERE.md, 01_DESIGN_LANGUAGE.md, 02_SCREEN_MAP.md, REVIEW_HANDOFF.md, ANALYTICS_AND_MESSAGES_HANDOFF.md and tasks/. Build Review, Library, Messages, Analytics, Creators, week setup. Skip the Briefs tab (that is P5). Branch design/p4-manager.
```

## P5: Briefs, manager side
```
Follow CLAUDE.md. Read design/handoff/03_BRIEFS_SLIDESHOW_REEL.md and every file in design/handoff/reference_ui/briefs/ (SSShared, SSManager, SSCanvas, SSFlow, SSFreestyle, ss-data). Apply the migration from AUDIT.md. Build the manager screens 1 to 7 in order, committing after each. The canvas is the hardest piece: build the deck, text editing and platform ghost first, then style, media and CTA sheets. Copy all strings verbatim from ss-data. Branch design/p5-briefs-manager.
```

## P6: Briefs, creator side
```
Follow CLAUDE.md. Read 03_BRIEFS_SLIDESHOW_REEL.md (creator section) and reference_ui/briefs SSCreator, RLCreator, RLEditor. Build home states, slideshow photos, reel record with teleprompter, reel editor, sent. Reuse components/Teleprompter.tsx, modules/video-editor and modules/clip-joiner where they fit. Branch design/p6-briefs-creator.
```

## P7: Settings
```
Follow CLAUDE.md. Read the design project's redesigns/admin/SettingsRedesign.jsx (copy it into design/handoff/reference_ui/settings/ as .txt first). Build switch accounts card and sheet, managers pane, Brand Brain pane in the manager settings tab. Branch design/p7-settings.
```

## P8 to P10: Web (run in noni-web)
```
Follow CLAUDE.md. Read design/handoff/bundles/<bundle>/README.md and its source files. Build per 02_SCREEN_MAP.md web rows for this bundle only. Open the bundle's HTML in a browser to compare. Branch design/p<N>-<name>.
```
Bundles in order: design_handoff_admin_app_web, design_handoff_ops_console, design_handoff_pricing_plans, design_handoff_landing_page. Logo and app icon (design_handoff_logo) go in both repos.

## Fix loop (any phase)
```
Compare <screen> against design/handoff/bundles/<bundle>/screenshots/<file>. List every difference in spacing, type, color, copy and states, then fix them all. Run QA_CHECKLIST.md for this screen.
```

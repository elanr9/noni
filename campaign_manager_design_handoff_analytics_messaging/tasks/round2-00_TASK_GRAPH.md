# Round 2 task graph (Inkbound)

Context for every agent: the company is now Inkbound (inkbound.ai). All briefs and weeks were wiped; there is one empty draft week. A brief week is seven days that start when its first post goes live, not on a planned date. Copy in the reference files is verbatim; never use em dashes or en dashes.

Wave 1 (parallel, disjoint files):
- round2-agent-A-navigation-messages-tab.md (tab bar, Messages inbox, channels, Creators moved to Analytics)
- round2-agent-B-threads-and-post-threads.md (creator thread, team DM, post thread, post cards)
- round2-agent-C-review-one-screen.md (review screen and request changes, reel and slideshow)
- round2-agent-D-library-ideas-references.md (Library shell, lane order, Ideas, References)
- round2-agent-E-library-media.md (Media lane, titles, name sheet, preview, editor source)
- round2-agent-F-library-our-posts-and-make.md (Our posts lane, filter sheet, Make post flow shared by all lanes)
- round2-agent-G-post-editor-one-form.md (post editor as one form, clip and hook screens, song links)

Dependencies:
- B depends on A for the Messages tab route only; build the screens behind stub routes and wire when A lands.
- C is standalone. Its Sent back state links to the post thread from B; use a no-op until B lands.
- D, E, F share app/(admin)/(tabs)/library.tsx. D owns the shell (lane switcher, pinned header). E and F build their lanes as components under components/admin/library/ and export one component each; D mounts them. Agree on the props in the spec below before starting.

Reference files (browser React, read as JSX, do not copy DOM verbatim):
- reference_ui/AdminMessages.jsx.txt (A, B)
- reference_ui/ReviewV2.jsx.txt (C), plus PlatformPreview and ApprovedOverlay in reference_ui/ReviewDetailScreen.jsx.txt
- reference_ui/LibraryV2.jsx.txt (D, E, F)
- reference_ui/PostEditorV2.jsx.txt (G)
- reference_ui/AdminApp.jsx.txt (routing), reference_ui/AdminShared.jsx.txt (shared primitives), reference_ui/AnalyticsScreens.jsx.txt (Creators button)

Wave 2: QA agent runs QA_CHECKLIST.md plus the acceptance lists in each round 2 task.

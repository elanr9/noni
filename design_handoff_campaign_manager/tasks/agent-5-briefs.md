# Agent 5: Briefs

Reference: reference_ui/BriefsScreen.jsx.txt. Touch: app/(admin)/(tabs)/calendar.tsx (or the briefs tab), app/(admin)/week/[id].tsx, components/admin/CalendarView.tsx.

## Spec
- Invariant: a week is fully planned before it starts. The list shows ONE "Next week" card (brand chip, "Not planned yet. Opens Sunday, tap to start it.") and completed weeks below. Never an incomplete current week.
- Current week chip: green (good tone) "Day N of 7", N computed from today within the week range. Past weeks: quiet "Done". Same status text in the calendar stepper and week detail meta ("· day N of 7").
- Week cards: title + range; two lane progress bars (video 20/20, slideshow 10/10); stat pill row: "$X /day avg", "XK views/day", "X.X posts/day" (average per creator per day), then flex spacer, then "N creators" (600 10.5px slate-400) on the right.
- Calendar view: week stepper with chevrons, two lane summary cards.
- Week detail: next week → planning entry; done weeks → lanes summary + posts made.
- Data: wire to lib/briefs-api.ts and lib/analytics-api.ts; the per-week aggregates ($/day, views/day, posts/day per creator, creator count) may need new API fields.

## Acceptance
- No live-incomplete state exists; day chip correct for today; pills and creator count on every non-next card.

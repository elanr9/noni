# HANDOFF_CONTRACT — Noni admin app (Queue · Review · Calendar)

Frozen after preflight. Source of authority: `design_handoff_admin_app/README.md` (visuals, copy) and the existing repo (architecture). Decisions locked by the design owner: Queue = **1a row list**, Review = **1f pinned player + Script/Caption/Thread tabs**. 1b and 1e are not built. Approve = `blue-500` primary; Request changes = outline; red only for Remove from calendar and errors.

## 0. Stack (verified)

- Expo SDK 54, `expo-router` ~6 (file routes in `app/`), React Native 0.81, React 19, TypeScript 5.9 strict. No state library; screens fetch via async functions in `lib/*` with `useState`/`useEffect`.
- Supabase (`lib/supabase.ts`) is the only data layer. Video playback: `expo-video`. Icons: `lucide-react-native` wrapped by `components/ui/Icon`. Blur: `expo-blur`.
- Navigation registration: route groups. Creator tabs = `app/(creator)/(tabs)/_layout.tsx` using `<Tabs tabBar={(p) => <TabBar {...p} />}>`. Admin today = plain `<Stack>` in `app/(admin)/_layout.tsx` (no tab bar yet). Params via dynamic segments (`review/[id]`). Sheets today = RN `Modal` + animated scrim/panel (precedent: `components/creator/SwapSheet.tsx`).
- Theme: `theme/tokens.ts` already mirrors the same token set 1:1 (colors, type, space, radius, borderWidth, shadows, motion incl. 240/160/90/1400ms and `Easing.bezier(0.22,0.61,0.36,1)`). **Extend this file; no second theme module.**

## 1. Token map (design token → repo symbol)

All README §1 colours already exist verbatim in `theme/tokens.ts` `color`:
`blue-50..700 → color.blue50..blue700` · `white/off-white/fill-quiet → color.white/offWhite/fillQuiet` · `line/line-strong → color.line/lineStrong` · `slate-300/400/500 → color.slate300/400/500` · `ink/ink-800/ink-900 → color.ink/ink800/ink900` · `amber/amber-soft → color.amber/amberSoft` · `green/green-soft → color.green/greenSoft` · `danger/danger-soft → color.danger/dangerSoft` · `scrim/scrim-strong/glass → color.scrim/scrimStrong/glass`. Action colour = `color.blue500` (alias `color.accent`).

Type: `hero/title-xl/title-sm/card-lg/card/action/body/body-sm/meta/chip/label → type.size.*` (same names, camelCase). Weights `type.weight.regular/semibold/bold/heavy`. Tracking `type.tracking.hero/title/label`.

Shadows: `shadow-card/raised/media/float/accent → shadow.shadowCard/shadowRaised/shadowMedia/shadowFloat/shadowAccent`. Motion: `90/160/240/420/1400 → motion.instant/fast/base/slow/shimmer`, press scale `motion.pressScale`, easing `motion.easeOut`.

Radii: `field 12 → radius.sm` · `card 18 → radius.lg` · `media 20 → radius.xl` · `sheet 24 → radius['2xl']` · `pill → radius.pill`.

**Gaps to add in Stage F1 (only additions, no new hex values):** `radius.cell = 14`, `type.size.micro = 10` (11 where the spec says 11), `ring-focus` constant (`0 0 0 3px rgba(27,166,238,0.30)` as an RN border/shadow recipe).

## 2. Component map (README component → repo component)

| README | Repo | Props today | Stage F1 delta |
|---|---|---|---|
| `Button` | `components/ui/Button.tsx` | `{ children, variant?: 'primary'\|'secondary'\|'tint'\|'outline'\|'ghost'\|'danger'\|'approve', size?: 'lg'(60)\|'md'(48)\|'sm'(40), block?, icon?, iconRight?, disabled?, onPress?, style? }` | none — sizes/variants match; footer flex via `style`. Green `approve` variant stays unused |
| `Icon` | `components/ui/Icon.tsx` | `{ name: IconName, size, color, strokeWidth? = 2 }` | add `plus`, `arrow-right` to `ICONS` (all other required names exist) |
| `StatusChip` | `components/StatusChip.tsx` | `{ status: TaskStatus, label?: string }` — label override covers "Resubmitted" | add `numberOfLines={1}` (nowrap). Note: it renders a leading dot; see open question 6 |
| `InfoBlock` | **does not exist** | — | new primitive: 12/800/+0.7 uppercase label + 16/1.5 body |
| `EmptyState` | `components/ui/EmptyState.tsx` | `{ icon?, title, body, actionLabel?, onAction?, compact?, style? }` — 72 circle blue-100, 30 glyph blue-500 | none |
| `TabBar` | `components/ui/TabBar.tsx` | `BottomTabBarProps`; reads `tabBarBadge`; glass + blur + float shadow | items are a hardcoded creator map; needs the 5 admin items (inbox/calendar-days/trending-up/chart-column/settings). Bottom offset is 22, spec says 24 — open question 5 |
| `Wordmark` | `components/ui/Wordmark.tsx` | `{ size?: number = 19 }` | README calls for `size=20 capsule`; no capsule variant exists — open question 4 |
| `SegmentedTabs` | `components/ui/Segmented.tsx` | `{ options: string[], value: number, onChange(index) }` — 4 pad fill-quiet track, active white + shadow-card, 13/700 | reuse as-is |
| `SkeletonBlock` | `components/ui/Skeleton.tsx` | `SkeletonLine { height?, width?, radius?, style? }`, `SkeletonCard { height?, radius?, style? }` — 1400ms shimmer | reuse as-is |
| press feedback | `components/ui/PressableScale.tsx` | `PressableProps` — 0.97 / 90ms | reuse everywhere |
| `FormatPill` | **new** | — | 5/9 pad pill, compact 3/7 variant |
| `MediaFallback` | **new** | — | 9:16 quiet fill + glyph + length label |
| `SheetShell` | **new** | — | generic bottom sheet extracted from the `SwapSheet` Modal pattern (scrim, 24 top radius, grabber, 240ms) |
| `CalendarCell` | **new** (Stage 4) | — | per README §6 |
| thread bubbles | `components/ReviewThread.tssx` exists (`{ events: ReviewEvent[], onSendComment, composerEnabled? }`) | restyle/extend for 1h spec, do not fork | Stage 3 |

## 3. New files, per stage

- **F1** — edit `theme/tokens.ts`, `components/ui/Icon.tsx`, `components/StatusChip.tsx`; create `components/ui/FormatPill.tsx`, `components/ui/MediaFallback.tsx`, `components/ui/SheetShell.tsx`, `components/ui/InfoBlock.tsx`, `app/(admin)/kitchen-sink.tsx` (scratch, removed at the end).
- **F2** — create `app/(admin)/(tabs)/_layout.tsx` (Tabs + admin TabBar items + Queue badge) and move the five tab screens into it: `index.tsx` (Queue), `calendar.tsx`, `trends.tsx`, `analytics.tsx`, `settings.tsx` (last three = placeholder only); edit `app/(admin)/_layout.tsx` (Stack keeps `review/[id]`, `brain`, sheets pushed without tab bar); create `lib/admin-mock.ts` + `lib/admin-review-types.ts` (type contract below). Mirrors the `(creator)/(tabs)` pattern — the only structural move, required for the floating tab bar.
- **Stage 2 (Queue 1a)** — `components/admin/QueueRow.tsx`, `components/admin/QueueSkeletonRow.tsx`; edit `app/(admin)/(tabs)/index.tsx`.
- **Stage 3 (Review 1f)** — edit `app/(admin)/review/[id].tsx`; create `components/admin/PinnedPlayer.tsx`, `components/admin/ScriptLineList.tsx`, `components/admin/RequestChangesSheet.tsx`, `app/(admin)/review/confirmation.tsx` (approved / note-sent).
- **Stage 4 (Calendar)** — edit `app/(admin)/(tabs)/calendar.tsx`; create `components/admin/CalendarCell.tsx`, `components/admin/TaskEditSheet.tsx`, `components/admin/GenerateSheet.tsx`.
- **Stage 5 (Behaviour)** — edits only, no new files.

## 4. Type contract (shared by every stage)

```ts
// lib/tasks.ts (existing — do not change)
type TaskStatus = 'assigned' | 'recorded' | 'submitted' | 'changes_requested' | 'approved' | 'posted';
type ContentTask = Database['public']['Tables']['content_tasks']['Row'] & { status: TaskStatus };
// transitions ONLY via lib/tasks.ts assertTransition / lib/tasks-api.ts transitionTask
// admin review action via lib/admin-api.ts reviewTask({ task, submissionId, reviewerId, action, note })

// lib/admin-api.ts (existing)
type Submission = { id; task_id; creator_id; video_path; duration_seconds; version; created_at };
type QueueItem = ContentTask & { profiles: Pick<Profile, 'id' | 'full_name'> | null };

// lib/review-events.ts (existing) — README "ReviewThreadEntry"
type ReviewEvent = { id; submission_id; author_id; action: 'approved' | 'changes_requested' | 'comment'; note; created_at; profiles };

// lib/admin-review-types.ts (new, F2)
type ContentFormat = 'video' | 'photo_carousel';       // displayed as "Reel" | "Slideshow"
type Creator = { id: string; name: string; initial: string };
type ScriptLine = { at: number; text: string };        // 1f script list; mock only for now
```

Status display mapping: `submitted` → "In review"; "Resubmitted" = `submitted` with `submissions.version > 1` (StatusChip `label` override). CalendarCell pills map `assigned`→To do, `recorded`→Recorded, `submitted`→In review, `approved`→Approved, `posted`→Posted.

## 5. Data contract

`lib/admin-mock.ts`, typed against §4. Seeded verbatim from README §8: creators Fabri/Mara/Deniz/Tolu/Rhea, handle `@fieldvision.ai`, the five queue rows (titles, formats, lengths, ages, statuses) exactly as tabled, plus the §5.2 Mara script lines and §5.4 thread copy. Exports: `MOCK_CREATORS`, `MOCK_QUEUE`, `MOCK_COPY` (hooks/captions per task), `WEEK_LIGHT`, `WEEK_HEAVY`. Stages 2–4 bind screens to this module only (data in as props/hooks behind the §4 types, no direct Supabase). Stage 5 swaps the source to `listQueue` / `latestSubmission` / `reviewTask` / `listTaskReviewEvents` with no change to screen components; the mock stays for the kitchen sink and empty/loading/error states. **Still blocked:** the promised `design_handoff_admin_app/admin-mock-data.ts` is not in the repo, so `MOCK_COPY`, `WEEK_LIGHT`, `WEEK_HEAVY` ship typed but empty (TODO-marked) until it lands — see open question 1.

## 6. Open questions — answered by the design owner (2026-07-31), frozen again

1. **Mock content.** Copy `design_handoff_admin_app/admin-mock-data.ts` into `lib/admin-mock.ts`, adapt types to §4, strings final. **REOPENED: that file is not in the repo.** Until it lands, `MOCK_COPY` / `WEEK_LIGHT` / `WEEK_HEAVY` are typed but empty; nothing gets invented.
2. **Mock vs live.** Stages 2–4 build against `lib/admin-mock.ts`; screens take data as props/hooks behind the §4 types and never touch Supabase directly. Stage 5 swaps in `listQueue` / `latestSubmission` / `reviewTask` / `listTaskReviewEvents` with no screen-component changes; mock stays for kitchen sink and empty/loading/error states.
3. **Script timestamps.** Mock-only. `ScriptLine[]` is the interface; a task with no timings renders the same list as plain paragraphs, no highlight, no seek. No transcription path.
4. **Wordmark capsule.** Not a background pill: BubbleMark glyph left of the "noni" lettering at `size × 1.55`, gap `size × 0.26` — exactly what the existing `Wordmark` renders. No change needed.
5. **Tab bar offset.** Keep the shared component at `bottom: 22`. Do not touch the creator app. Spec will be corrected.
6. **StatusChip dot.** Keep it; the queue row shows the chip exactly as the system component ships.
7. **Approve-failure toast.** Copy: "Couldn't approve. Check your connection and try again." Row restores in place; toast sits above the tab bar, 4s, `danger-soft` fill with `danger` text, no action button.
8. **Remove from calendar.** Native alert. Title "Remove this task?" · body "It disappears from Fabri's queue. Generating again may bring back something similar." · buttons "Cancel" and "Remove" (destructive).
9. **Brand Brain.** Stays a non-tab pushed route, untouched this build.
10. **Device frame.** Real safe area only. Never build the drawn 390×844 frame or fake status bar; "54 top" means content starts below the status bar via safe-area inset.

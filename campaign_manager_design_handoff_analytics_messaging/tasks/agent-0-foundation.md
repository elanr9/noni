# Agent 0: Foundation (blocks all other agents)

## Scope
Tokens and shared primitives. Touch: theme/tokens.ts, components/admin/shared/, components/ui/.

## Do
1. Sync theme/tokens.ts with tokens/*.css from this handoff (colors, sizes, radii, durations). Add any missing keys; do not rename existing ones without updating call sites.
2. Build or align these primitives to reference_ui/AdminShared.jsx.txt and 01_DESIGN_LANGUAGE.md:
   - Card, SectionLabel, TypeChip (brand/good/warn/quiet), Segmented (with counts), ActionBar, Sheet (title/subtitle/body/footer), PushHeader, SkeletonLine/SkeletonCard, EmptyState, Avatar, Thumb (9:16 media placeholder with play disc, images glyph, duration badge)
   - CheckboxReasonRow (multi-select reason button per the design language)
   - NoteBlock (blue-50, message-circle icon, removable)
   - ConfirmationTakeover (icon disc, title, paragraph, primary button)
   - StatPill (off-white pill, bold value + unit)
3. Export all from components/admin/shared/index.

## Acceptance
- Kitchen-sink screen (app/(admin)/kitchen-sink.tsx) renders every primitive in all tones/states with no visual drift from the reference.

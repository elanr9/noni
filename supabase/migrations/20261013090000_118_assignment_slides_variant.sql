-- Per-creator slide wording. Briefs built in the slide editor keep their
-- on-screen text in briefs.slides, and every creator on the roster was
-- posting it word for word, which TikTok reads as a coordinated network.
-- vary-copy now writes this creator's own wording of each slide here, aligned
-- to briefs.slides by index ({ "text": string } or null to keep the brief's).
-- The creator app applies it when it loads the brief; the meaning, numbering
-- and product line stay the same.
alter table public.assignments add column if not exists slides_variant jsonb;

comment on column public.assignments.slides_variant is
  'This creator''s own wording of briefs.slides, by index (vary-copy). Null entries, or a null column, fall back to the brief.';

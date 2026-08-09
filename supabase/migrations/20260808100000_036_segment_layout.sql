-- Per-segment recording layout, set by the admin while building the brief.
-- 'standard': creator fills the frame, screenshot floats as a card.
-- 'green_screen': the screenshot fills the frame and the creator floats in a
-- circle bubble, TikTok green screen style. The record screen mirrors the
-- layout live and the edit pass composites the final video the same way.

alter table public.brief_segments
  add column layout text not null default 'standard'
    check (layout in ('standard', 'green_screen'));

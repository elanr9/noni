-- On-screen text style for the whole brief, picked by the admin.
-- 'boxes': stacked solid rounded boxes, red heading and white body (InShot).
-- 'bubble': bold pink text with a white outline (TikTok bubble text).
-- 'clean': plain white text with a soft shadow (TikTok classic caption).
-- The record screen previews the style live and the render pass burns it in.

alter table public.briefs
  add column text_style text not null default 'boxes'
    check (text_style in ('boxes', 'bubble', 'clean'));

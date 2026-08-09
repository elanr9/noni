-- Replaces the fixed text_style presets with an admin-configured overlay:
-- on/off plus a style config (box, outline, or plain, with text and accent
-- colors) edited in the post editor. accent_color is the box fill in box
-- mode and the outline color in outline mode.

alter table public.briefs drop column text_style;

alter table public.briefs
  add column text_overlay jsonb not null default
    '{"enabled": true, "mode": "box", "text_color": "#FFFFFF", "accent_color": "#F23030"}'::jsonb;

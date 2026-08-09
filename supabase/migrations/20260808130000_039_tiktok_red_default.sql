-- Align the default text box color with TikTok's official palette red so
-- burned-in captions read as native TikTok text.

alter table public.briefs
  alter column text_overlay set default
    '{"enabled": true, "mode": "box", "text_color": "#FFFFFF", "accent_color": "#EA403F"}'::jsonb;

update public.briefs
  set text_overlay = jsonb_set(text_overlay, '{accent_color}', '"#EA403F"')
  where text_overlay->>'accent_color' = '#F23030';

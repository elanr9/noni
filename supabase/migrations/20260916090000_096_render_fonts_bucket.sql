-- Public bucket for the static TikTok Sans instances the Creatomate render
-- loads by URL (assets/fonts in the repo). Read only for everyone; uploads go
-- through the service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('render-fonts', 'render-fonts', true, 5242880, array['font/ttf', 'application/octet-stream'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

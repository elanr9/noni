-- Upload-Post replaces Ayrshare. Rename provider id column; seed FieldVision profile.

alter table public.posts rename column ayrshare_post_id to provider_post_id;

update public.companies
set settings = coalesce(settings, '{}'::jsonb) || '{"upload_post_profile":"fieldvision"}'::jsonb
where slug = 'fieldvision';

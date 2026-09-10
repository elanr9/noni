-- Creator Messages tab. Chat media moves to one folder per chat
-- (company/chat_id/file) so anyone who can access the chat can read and
-- write its attachments. Managers keep the company-wide policies from 064.

create or replace function public.chat_media_chat_id(object_name text)
returns uuid
language sql
immutable
as $$
  select case
    when (storage.foldername(object_name))[2]
         ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (storage.foldername(object_name))[2]::uuid
    else null
  end
$$;

drop policy if exists "chat members read chat media" on storage.objects;
create policy "chat members read chat media" on storage.objects for select
  using (
    bucket_id = 'manager-chat'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.chat_media_chat_id(name) is not null
    and public.can_access_manager_chat(public.chat_media_chat_id(name))
  );

drop policy if exists "chat members write chat media" on storage.objects;
create policy "chat members write chat media" on storage.objects for insert
  with check (
    bucket_id = 'manager-chat'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.chat_media_chat_id(name) is not null
    and public.can_access_manager_chat(public.chat_media_chat_id(name))
  );

-- iOS library videos arrive as video/quicktime; the bucket only listed mp4.
update storage.buckets
set allowed_mime_types = array_append(allowed_mime_types, 'video/quicktime')
where id = 'manager-chat' and not ('video/quicktime' = any(allowed_mime_types));

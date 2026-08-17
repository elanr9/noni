-- Re-attaching a screenshot to a clip failed with "new row violates
-- row-level security policy": removing a screenshot only nulls
-- brief_segments.screenshot_url, the storage object stays, so the next
-- attach upserts over it. brief-assets had insert/select/delete policies
-- but no update policy, and storage upserts need update on the existing row.

create policy "admins update brief assets" on storage.objects for update
  using (
    bucket_id = 'brief-assets'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.is_admin()
  )
  with check (
    bucket_id = 'brief-assets'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and public.is_admin()
  );

-- Accepting an invite on the web failed with "unknown": migration 095 revoked
-- apply_invite_membership from public, and the service role only ever held it
-- through public, so the invite function could no longer call it.
grant execute on function public.apply_invite_membership(uuid, uuid) to service_role;

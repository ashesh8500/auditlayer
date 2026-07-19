-- Close the legacy Instagram connection policy that was accidentally granted to
-- PUBLIC, and keep OAuth credentials server-only. The service_role bypasses RLS,
-- but an explicit policy documents the trusted write boundary.

drop policy if exists "Service role can manage connections" on public.instagram_connections;
drop policy if exists "Users can view own connections" on public.instagram_connections;

drop policy if exists instagram_connections_owner_read on public.instagram_connections;
create policy instagram_connections_owner_read
  on public.instagram_connections
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists instagram_connections_service_role_all on public.instagram_connections;
create policy instagram_connections_service_role_all
  on public.instagram_connections
  for all
  to service_role
  using (true)
  with check (true);

-- A row-level policy cannot hide token columns. Remove the broad table grant and
-- expose only the connection-health fields the authenticated portal may read.
revoke all on table public.instagram_connections from anon, authenticated;
grant select (
  id,
  user_id,
  ig_user_id,
  ig_username,
  long_lived_expires_at,
  account_type,
  followers_count,
  media_count,
  is_active,
  created_at,
  updated_at,
  last_refreshed_at
) on table public.instagram_connections to authenticated;
grant all on table public.instagram_connections to service_role;

-- Stored signed URLs outlive the request that created them and violate the
-- report-path contract. Existing artifacts remain available through their
-- private storage paths and same-origin web proxies.
update public.audits
set report_url = null,
    pdf_url = null
where report_url is not null
   or pdf_url is not null;

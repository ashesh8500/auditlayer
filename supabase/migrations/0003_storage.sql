-- AuditLayer Storage buckets + access policies.
-- Authoritative contract: docs/architecture-contract.md
-- Idempotent: safe to re-run.
--
-- Object path convention (enforced by the worker / server actions):
--   reports/<audit_id>/<filename>.html
--   pdfs/<audit_id>/<filename>.pdf
-- The first path segment is the owning audit id, used for ownership checks.

-- ---------------------------------------------------------------------------
-- Private buckets.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', false, 10485760, array['text/html'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pdfs', 'pdfs', false, 26214400, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Object access policies.
-- The worker uploads with the service_role key (bypasses RLS). Browser clients
-- get read access to their own audit's objects; admins get full access.
-- ---------------------------------------------------------------------------
drop policy if exists "reports owner read" on storage.objects;
create policy "reports owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'reports'
    and public.owns_audit(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "pdfs owner read" on storage.objects;
create policy "pdfs owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pdfs'
    and public.owns_audit(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "reports admin all" on storage.objects;
create policy "reports admin all" on storage.objects
  for all to authenticated
  using (bucket_id = 'reports' and public.is_admin())
  with check (bucket_id = 'reports' and public.is_admin());

drop policy if exists "pdfs admin all" on storage.objects;
create policy "pdfs admin all" on storage.objects
  for all to authenticated
  using (bucket_id = 'pdfs' and public.is_admin())
  with check (bucket_id = 'pdfs' and public.is_admin());

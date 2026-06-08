-- AuditLayer seed data.
-- Run automatically by `supabase db reset` (local) and applied to remote when
-- documented. Idempotent.

-- Single-row admin configuration for the Hermes worker (id is fixed to 1).
insert into public.app_settings (id)
values (1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Promoting a founder to admin (Ashesh + Narin).
--
-- Profiles are auto-created on first sign-in (see handle_new_user trigger), so
-- the founders must sign in once before being promoted. After they have signed
-- in, run (in the Supabase SQL editor or via psql with the service role):
--
--   update public.profiles
--   set role = 'admin'
--   where email in ('ashesh@asheshkaji.com', 'narin@auditlayer.com');
--
-- Replace the emails with the actual founder login emails. Admin status is
-- enforced by the public.is_admin() helper used in every admin RLS policy.
-- ---------------------------------------------------------------------------

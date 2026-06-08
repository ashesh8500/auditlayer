-- AuditLayer profiles column hardening.
-- Authoritative contract: docs/architecture-contract.md (Security notes).
-- Idempotent: safe to re-run.
--
-- The RLS policy `profiles_update_own` permits a user to UPDATE their own row.
-- On its own that would let a user escalate `role` or grant themselves a paid
-- `plan`/`subscription_status`. We add Postgres COLUMN-LEVEL privileges so the
-- browser (`authenticated`/`anon` roles) may only ever update `full_name`.
--
-- Plan, subscription_status, stripe_* and current_period_end are written ONLY
-- by the Stripe webhook via the service-role client; `role` and
-- `onboarding_status` are written ONLY by admins via the service-role client.
-- `service_role` bypasses these grants entirely, so the worker, webhook, and
-- trusted server actions are unaffected.

-- Remove the broad UPDATE privilege Supabase grants by default...
revoke update on public.profiles from authenticated;
revoke update on public.profiles from anon;

-- ...then re-grant UPDATE on the single user-safe column.
grant update (full_name) on public.profiles to authenticated;

-- SELECT/INSERT behaviour is unchanged; the new-user trigger and RLS policies
-- continue to govern row visibility.

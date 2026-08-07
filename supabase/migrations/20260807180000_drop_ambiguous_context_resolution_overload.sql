begin;

-- 20260807120000 introduced the confirmation-aware four-argument function
-- with a default for its final argument. PostgreSQL retained the earlier
-- three-argument overload, making ordinary three-argument calls ambiguous.
-- Remove only the obsolete overload; the four-argument function remains
-- callable with either three or four arguments because of its default.
drop function if exists public.resolve_context_update_proposal(uuid, text, uuid);

revoke all on function public.resolve_context_update_proposal(uuid, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.resolve_context_update_proposal(uuid, text, uuid, boolean)
  to service_role;

comment on function public.resolve_context_update_proposal(uuid, text, uuid, boolean) is
  'Atomically accepts or rejects a Living Brief context proposal. The confirmation argument defaults to false; protected fields require explicit confirmation.';

commit;

-- RLS policies for wellness_benchmarks and peer_graph, plus the
-- get_benchmarks(niche, bracket) RPC for worker/portal lookups.
--
-- Idempotent: safe to re-run.

-- ============================================================================
-- RLS: wellness_benchmarks
-- ============================================================================
alter table public.wellness_benchmarks enable row level security;

-- Remove the earlier broad-read policy if this migration is re-applied.
drop policy if exists wellness_benchmarks_select_all on public.wellness_benchmarks;

drop policy if exists wellness_benchmarks_admin_all on public.wellness_benchmarks;
create policy wellness_benchmarks_admin_all on public.wellness_benchmarks
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- RLS: peer_graph
-- ============================================================================
alter table public.peer_graph enable row level security;

-- Remove the earlier broad-read policy if this migration is re-applied.
drop policy if exists peer_graph_select_all on public.peer_graph;

drop policy if exists peer_graph_admin_all on public.peer_graph;
create policy peer_graph_admin_all on public.peer_graph
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- get_benchmarks(niche text, bracket text)
--   Returns wellness_benchmarks rows with their associated peer_graph entries
--   as a nested JSON array. Used by the worker for MOAT scoring lookups.
-- ============================================================================
drop function if exists public.get_benchmarks(text, text);

create or replace function public.get_benchmarks(
  p_niche   text,
  p_bracket text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'benchmark', to_jsonb(wb.*),
    'peers', (
      select coalesce(jsonb_agg(to_jsonb(pg.*) order by pg.avg_likes desc), '[]'::jsonb)
      from public.peer_graph pg
      where pg.benchmarks_id = wb.id
    )
  )
  into result
  from public.wellness_benchmarks wb
  where wb.niche = p_niche
    and wb.followers_bracket = p_bracket;

  return result;
end;
$$;

comment on function public.get_benchmarks(text, text) is
  'Returns the wellness benchmark + nested peer array for a given niche and follower bracket.';

revoke all on function public.get_benchmarks(text, text) from public, anon, authenticated;
grant execute on function public.get_benchmarks(text, text) to service_role;

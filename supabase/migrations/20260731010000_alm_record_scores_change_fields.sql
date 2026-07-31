-- Release integration: persist score continuity fields emitted by the runtime
-- ledger writer (previous_value, change_kind). Additive; safe if columns exist.

create or replace function public.record_scores(
  p_scores jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _s jsonb;
  _change_kind text;
begin
  for _s in select * from jsonb_array_elements(p_scores) loop
    _change_kind := nullif(_s->>'change_kind', '');
    if _change_kind is not null
       and _change_kind not in ('evidence', 'brief_lens', 'methodology', 'prior_correction') then
      raise exception 'invalid change_kind: %', _change_kind
        using errcode = '22023';
    end if;

    insert into public.scores (
      intelligence_run_id,
      dimension,
      value,
      previous_value,
      evidence_ids,
      methodology_version,
      change_kind
    ) values (
      (_s->>'run_id')::uuid,
      _s->>'dimension',
      case when _s->>'value' is null then null
           else (_s->>'value')::numeric end,
      case when _s->>'previous_value' is null then null
           else (_s->>'previous_value')::numeric end,
      coalesce(_s->'evidence_ids', '[]'::jsonb),
      _s->>'methodology_version',
      _change_kind
    );
  end loop;
end;
$$;

revoke all on function public.record_scores(jsonb)
  from public, anon, authenticated;
grant execute on function public.record_scores(jsonb)
  to service_role;

comment on function public.record_scores(jsonb) is
  'Bulk insert scores for an intelligence run. Accepts run_id, dimension, value, previous_value, evidence_ids, methodology_version, change_kind.';

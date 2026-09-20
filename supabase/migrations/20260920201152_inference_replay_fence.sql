begin;
-- Admission fence, not another billing ledger. Even a known completed paid
-- attempt cannot be automatically regenerated. Reconciliation is explicit.
create table public.audit_inference_fences (
 audit_id uuid primary key references public.audits(id) on delete cascade,
 run_id uuid not null references public.report_generation_runs(id),
 created_at timestamptz not null default now()
);
alter table public.audit_inference_fences enable row level security;
revoke all on public.audit_inference_fences from public,anon,authenticated,service_role;
grant select on public.audit_inference_fences to service_role;
insert into public.audit_inference_fences(audit_id,run_id)
 select distinct on (audit_id) audit_id,id from public.report_generation_runs
 where audit_id is not null and jsonb_array_length(coalesce(stage_timings->'_inference','[]'::jsonb))>0
 order by audit_id,created_at,id;

alter table public.report_generation_runs
 add column refinement_id uuid unique references public.refinements(id) on delete cascade;

create function public.fence_report_inference() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_run uuid; a public.audits; q public.commercial_quotes; calls jsonb; c jsonb; liability numeric:=0;
begin
 calls:=coalesce(new.stage_timings->'_inference','[]'::jsonb);
 if tg_op='UPDATE' and jsonb_array_length(coalesce(old.stage_timings->'_inference','[]'::jsonb))>0
   and jsonb_array_length(calls)=0 then raise exception 'inference_receipt_history_required'; end if;
 if new.refinement_id is not null then
   if new.audit_id is not null then raise exception 'invalid_refinement_run'; end if;
   if jsonb_array_length(calls)>1 then raise exception 'refinement_call_bound'; end if;
   if exists(select 1 from jsonb_array_elements(calls) x where x->>'status'='reserved') then
     perform 1 from public.refinements where id=new.refinement_id and status='running'
       and claimed_by=new.worker_id and lease_expires_at>clock_timestamp() for update;
     if not found then raise exception 'refinement_claim_required'; end if;
     if tg_op='UPDATE' and jsonb_array_length(coalesce(old.stage_timings->'_inference','[]'::jsonb))>0
       and old.stage_timings->'_inference'->0->>'attempt_id' is distinct from calls->0->>'attempt_id' then
       raise exception 'inference_reconciliation_required'; end if;
   end if;
   return new;
 end if;
 if new.audit_id is null or jsonb_array_length(calls)=0 then return new; end if;
 select * into a from public.audits where id=new.audit_id for update;
 insert into public.audit_inference_fences(audit_id,run_id) values(new.audit_id,new.id) on conflict do nothing;
 select run_id into owner_run from public.audit_inference_fences where audit_id=new.audit_id;
 if owner_run is distinct from new.id then raise exception 'inference_reconciliation_required'; end if;
 -- Final telemetry may arrive after artifact finalization. New reservations may
 -- only be made by the current running claim, and never replace prior IDs.
 if tg_op='UPDATE' and exists (
   select 1 from jsonb_array_elements(coalesce(old.stage_timings->'_inference','[]'::jsonb)) prior
   where not exists(select 1 from jsonb_array_elements(calls) current_call
     where current_call->>'attempt_id'=prior->>'attempt_id'
       and current_call->'reserved_usd'=prior->'reserved_usd')) then
   raise exception 'inference_receipt_history_required';
 end if;
 if exists(select 1 from jsonb_array_elements(calls) x where x->>'status'='reserved')
   and (a.status<>'running' or a.claimed_by is distinct from new.worker_id) then
   raise exception 'inference_claim_required';
 end if;
 select * into q from public.commercial_quotes where audit_id=a.id;
 if found then
   if q.claimed_at is null or q.worker_id is distinct from new.worker_id
     or new.model is distinct from q.runtime->>'model'
     or jsonb_array_length(calls)>(q.runtime->>'max_calls')::int then
     raise exception 'commercial_inference_bound';
   end if;
   for c in select value from jsonb_array_elements(calls) loop
     if not(c ?& array['input_bound','output_bound','reserved_usd'])
       or c->>'input_bound' is null or c->>'output_bound' is null or c->>'reserved_usd' is null
       or (c->>'input_bound')::int not between 1 and (q.runtime->>'max_input_tokens')::int
       or (c->>'output_bound')::int not between 1 and (q.runtime->>'max_output_tokens')::int
       or (c->>'reserved_usd')::numeric <= 0
       or abs((c->>'reserved_usd')::numeric * 1000000 -
          ((c->>'input_bound')::numeric*(q.runtime->>'input_microusd_per_mtok')::numeric+
           (c->>'output_bound')::numeric*(q.runtime->>'output_microusd_per_mtok')::numeric)/1000000)>0.000001 then
       raise exception 'commercial_inference_bound';
     end if;
     liability:=liability+(c->>'reserved_usd')::numeric*1000000;
   end loop;
   if liability > q.upstream_microusd-(q.runtime->>'research_microusd')::bigint then
     raise exception 'commercial_inference_budget';
   end if;
 end if;
 return new;
end $$;
create trigger report_inference_fence before insert or update of stage_timings on public.report_generation_runs
 for each row execute function public.fence_report_inference();
revoke all on function public.fence_report_inference() from public,anon,authenticated,service_role;

-- Guard the existing reapers and all other requeue paths at the row boundary.
-- Untouched legacy jobs keep their original retry policy. Commercial jobs never
-- auto-replay, including expired/unclaimed quotes requiring release reconciliation.
create function public.prevent_paid_audit_replay() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.status is distinct from old.status and new.status in ('queued','running','failed')
   and (exists(select 1 from public.audit_inference_fences where audit_id=new.id)
        or (new.status<>'running' and exists(select 1 from public.commercial_quotes where audit_id=new.id))) then
   if new.status='running' then raise exception 'inference_reconciliation_required'; end if;
   new.status:='blocked';
   new.admin_notes:=concat_ws(E'\n',nullif(new.admin_notes,''),'Paid attempt held: explicit reconciliation required; no automatic replay.');
   insert into public.audit_events(audit_id,actor,event_type,phase,detail)
     values(new.id,'worker','inference_reconciliation_required','failed','Paid attempt held for explicit reconciliation. No automatic replay.');
 end if;
 return new;
end $$;
create trigger paid_audit_replay before update of status on public.audits
 for each row execute function public.prevent_paid_audit_replay();
revoke all on function public.prevent_paid_audit_replay() from public,anon,authenticated,service_role;
update public.audits set status='blocked',admin_notes=concat_ws(E'\n',nullif(admin_notes,''),'Existing inference receipt: explicit reconciliation required.')
 where status in ('queued','failed') and exists(select 1 from public.audit_inference_fences f where f.audit_id=audits.id);
commit;

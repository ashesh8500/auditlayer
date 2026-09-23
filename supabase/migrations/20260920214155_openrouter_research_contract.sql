begin;
-- Opt-in NEW quote contract only. No seeded catalog, flags, or qualification.
alter table public.commercial_runtime_catalog add column research_policy jsonb;
alter table public.commercial_runtime_catalog add constraint fixed_exa_research_policy check (
 research_policy is null or (
 research_policy = jsonb_build_object('version','openrouter-exa-fast-v1',
  'context_tokens',1310720,'output_tokens',256,'search_fee_microusd',7000,
  'reservation_microusd',190573,
  'aggregate_token_cap',1310976+(max_input_tokens+max_output_tokens)*max_calls)
 and input_microusd_per_mtok=140000 and output_microusd_per_mtok=280000
 and research_microusd=0 and max_input_tokens<=32000 and max_output_tokens<=32000));
-- Preserve byte-for-byte JSON meaning of older quotes, including signatures.
create function public.commercial_runtime_snapshot(r public.commercial_runtime_catalog)
returns jsonb language sql immutable set search_path=pg_catalog,public as $$
 select case when r.research_policy is null then to_jsonb(r)-'research_policy' else to_jsonb(r) end
$$;
revoke all on function public.commercial_runtime_snapshot(public.commercial_runtime_catalog) from public,anon,authenticated,service_role;
create or replace function public.commercial_quote(p jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare o uuid:=(p->>'owner_id')::uuid;r public.commercial_runtime_catalog;q public.commercial_quotes;up bigint;ch public.subject_channels;
begin
 perform 1 from public.profiles where id=o for update;
 if not found then raise exception 'owner_missing'; end if;
 select * into r from public.commercial_runtime_catalog where id='auto' and qualified_until>clock_timestamp();
 if not found then raise exception 'model_unqualified'; end if;
 if not exists(select 1 from public.subjects s join public.living_brief_versions b on b.subject_id=s.id where s.id=(p->>'subject_id')::uuid and s.user_id=o and b.id=(p->>'brief_id')::uuid and b.confirmed) then raise exception 'confirmed_brief_required'; end if;
 select * into ch from public.subject_channels where id=(p->>'channel_id')::uuid and subject_id=(p->>'subject_id')::uuid and managed;
 if not found then raise exception 'channel_not_owned'; end if;
 p:=(p-'handle'-'platform')||jsonb_build_object('handle',ch.locator,'platform',ch.channel_type);
 if not exists(select 1 from public.workspace_credit_cycles where owner_id=o and commercial_plan is not null and public.commercial_cycle_active(id)) then raise exception 'enrollment_required'; end if;
 if coalesce(p->>'report_type','')<>'standard' or coalesce(p->>'platform','') not in ('instagram','youtube','tiktok','x','linkedin','website') or length(coalesce(p->>'handle','')) not between 1 and 200 or length(coalesce(p->>'goal','')) not between 1 and 200 then raise exception 'invalid_report_request'; end if;
 up:=ceil((r.max_input_tokens::numeric*r.input_microusd_per_mtok+r.max_output_tokens::numeric*r.output_microusd_per_mtok)/1000000)*r.max_calls+r.research_microusd+coalesce((r.research_policy->>'reservation_microusd')::bigint,0);
 if up<=0 or up*3>(public.commercial_policy()->>'run_ceiling_microusd')::bigint then raise exception 'runtime_budget_unqualified'; end if;
 insert into public.commercial_quotes(owner_id,subject_id,brief_id,request,runtime,retail_microusd,upstream_microusd,expires_at)
 values(o,(p->>'subject_id')::uuid,(p->>'brief_id')::uuid,p,public.commercial_runtime_snapshot(r),up*3,up,least(clock_timestamp()+interval '10 minutes',r.qualified_until)) returning * into q;
 return to_jsonb(q);
end $$;
create or replace function public.commercial_submit(p jsonb) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare q public.commercial_quotes;o uuid:=(p->>'owner_id')::uuid;a uuid;runtime jsonb;pr public.profiles;
begin
 select * into pr from public.profiles where id=o for update;
 if not found then raise exception 'owner_missing'; end if;
 select * into q from public.commercial_quotes where id=(p->>'quote_id')::uuid and owner_id=o for update;
 if not found then raise exception 'quote_not_owned'; end if;
 if p->'consent' is distinct from 'true'::jsonb then raise exception 'explicit_consent_required'; end if;
 -- Committed retry wins over mutable qualification, allowance and brief state.
 if q.audit_id is not null then return q.audit_id; end if;
 if q.expires_at<=clock_timestamp() then raise exception 'quote_expired'; end if;
 select public.commercial_runtime_snapshot(r) into runtime from public.commercial_runtime_catalog r where id='auto' and qualified_until>clock_timestamp();
 if runtime is distinct from q.runtime then raise exception 'runtime_requote_required'; end if;
 if not exists(select 1 from public.living_brief_versions where id=q.brief_id and subject_id=q.subject_id and confirmed) then raise exception 'confirmed_brief_required'; end if;
 perform 1 from public.subject_channels where id=(q.request->>'channel_id')::uuid and subject_id=q.subject_id and managed and locator=q.request->>'handle' and channel_type=q.request->>'platform' for share;
 if not found then raise exception 'channel_requote_required'; end if;
 if pr.stripe_subscription_id is null then perform public.commercial_free_grant(jsonb_build_object('owner_id',o)); end if;
 perform public.workspace_credit_reserve(jsonb_build_object('owner_id',o,'reservation_id',q.id,'run_intent_id',q.id,'quote_expires_at',q.expires_at,'subject_id',q.subject_id,'quote_id',q.id,'model_id',q.runtime->>'model','rate_version',q.runtime->>'rate_version','context_version',q.brief_id,'intent_fingerprint',encode(sha256(convert_to(q.request::text||q.runtime::text,'UTF8')),'hex'),'retail_microusd',q.retail_microusd,'upstream_microusd',q.upstream_microusd,'recurring',false));
 insert into public.audits(user_id,brief_version_id,handle,platform,goal,report_type,status,context)
 values(o,q.brief_id,q.request->>'handle',q.request->>'platform',q.request->>'goal','standard','queued','Commercial quote '||q.id::text) returning id into a;
 with batch as (insert into public.audit_batches(user_id,subject_id,idempotency_key) values(o,q.subject_id,'commercial:'||q.id::text) returning id)
 insert into public.batch_audits(batch_id,audit_id) select id,a from batch;
 insert into public.audit_events(audit_id,actor,event_type,phase,detail) values(a,'client','audit_submitted','intake','Commercial quote accepted; credits reserved.');
 update public.commercial_quotes set audit_id=a,consented_at=clock_timestamp() where id=q.id;
 return a;
end $$;
-- Minimal ordinary-worker bridge. Claim AFTER canonical audit claim and BEFORE
-- research/inference; the caller must enforce every returned runtime bound.
create or replace function public.commercial_execution_claim(p jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare q public.commercial_quotes;a public.audits;r public.workspace_credit_reservations;runtime jsonb;
begin
 select * into a from public.audits where id=(p->>'audit_id')::uuid;
 perform 1 from public.profiles where id=a.user_id for update;
 select * into q from public.commercial_quotes where audit_id=a.id for update;
 if not found then return null; end if;
 if a.status<>'running' or a.claimed_by is distinct from p->>'worker_id' or coalesce(p->>'worker_id','')='' then raise exception 'worker_claim_required'; end if;
 if q.claimed_at is not null then raise exception 'commercial_attempt_already_claimed'; end if;
 select * into r from public.workspace_credit_reservations where id=q.id;
 select public.commercial_runtime_snapshot(c) into runtime from public.commercial_runtime_catalog c where id='auto' and qualified_until>clock_timestamp();
 if r.state<>'held' or q.expires_at<=clock_timestamp() or not public.commercial_cycle_active(r.cycle_id) or runtime is distinct from q.runtime or q.runtime->>'model' is distinct from p->>'model' then raise exception 'commercial_execution_expired'; end if;
 update public.commercial_quotes set claimed_at=clock_timestamp(),worker_id=p->>'worker_id' where id=q.id;
 return q.runtime||jsonb_build_object('reservation_id',q.id,'retail_microusd',q.retail_microusd,'upstream_microusd',q.upstream_microusd,'brief_id',q.brief_id);
end $$;
create or replace function public.fence_report_inference() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_run uuid; a public.audits; q public.commercial_quotes; calls jsonb; c jsonb; liability numeric:=0; research_calls int:=0; report_calls int:=0; total_tokens bigint:=0; rp jsonb; expected numeric;
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
 if found and q.runtime->'research_policy' is not null then
   rp:=q.runtime->'research_policy';
   if q.claimed_at is null or q.worker_id is distinct from new.worker_id
     or new.model is distinct from q.runtime->>'model' or jsonb_array_length(calls)>3 then
     raise exception 'commercial_inference_bound';
   end if;
   if tg_op='UPDATE' and exists (
     select 1 from jsonb_array_elements(coalesce(old.stage_timings->'_inference','[]'::jsonb)) prior
     join jsonb_array_elements(calls) current_call on current_call->>'attempt_id'=prior->>'attempt_id'
     where (current_call - array['status','customer_charge_usd','cost_usd','cost_source','tokens_in','tokens_out',
       'usage_status','latency_ms','response_model','response_id','upstream_provider','search_cost_usd',
       'inference_cost_usd','search_cost_source']) is distinct from
       (prior - array['status','customer_charge_usd','cost_usd','cost_source','tokens_in','tokens_out',
       'usage_status','latency_ms','response_model','response_id','upstream_provider','search_cost_usd',
       'inference_cost_usd','search_cost_source'])) then
     raise exception 'inference_receipt_history_required';
   end if;
   if (select count(distinct x->>'attempt_id') from jsonb_array_elements(calls) x) <> jsonb_array_length(calls) then
     raise exception 'commercial_inference_bound';
   end if;
   for c in select value from jsonb_array_elements(calls) loop
     if not(c ?& array['input_bound','output_bound','reserved_usd','stage'])
       or c->>'input_bound' is null or c->>'output_bound' is null or c->>'reserved_usd' is null then
       raise exception 'commercial_inference_bound';
     end if;
     expected:=((c->>'input_bound')::numeric*(q.runtime->>'input_microusd_per_mtok')::numeric+
                (c->>'output_bound')::numeric*(q.runtime->>'output_microusd_per_mtok')::numeric)/1000000;
     if c->>'stage'='research' then
       research_calls:=research_calls+1;
       if research_calls>1 or report_calls>0 or c->>'research_version' is distinct from rp->>'version'
         or c->>'search_engine' is distinct from 'exa' or c->>'search_mode' is distinct from 'fast'
         or c->'max_results' is distinct from '3'::jsonb
         or c->'input_bound' is distinct from rp->'context_tokens'
         or c->'output_bound' is distinct from rp->'output_tokens'
         or c->'search_fee_bound_usd' is distinct from '0.007'::jsonb then
         raise exception 'commercial_research_bound';
       end if;
       expected:=expected+(rp->>'search_fee_microusd')::numeric;
     elsif c->>'stage' in ('analysis','correction') then
       report_calls:=report_calls+1;
       if report_calls>(q.runtime->>'max_calls')::int
         or c->>'stage' is distinct from (case when report_calls=1 then 'analysis' else 'correction' end)
         or (c->>'input_bound')::int not between 1 and (q.runtime->>'max_input_tokens')::int
         or (c->>'output_bound')::int not between 1 and (q.runtime->>'max_output_tokens')::int then
         raise exception 'commercial_inference_bound';
       end if;
     else raise exception 'commercial_inference_bound'; end if;
     if (c->>'reserved_usd')::numeric<=0 or (c->>'reserved_usd') in ('NaN','Infinity','-Infinity')
       or abs((c->>'reserved_usd')::numeric*1000000-expected)>0.000001 then
       raise exception 'commercial_inference_bound';
     end if;
     total_tokens:=total_tokens+(c->>'input_bound')::bigint+(c->>'output_bound')::bigint;
     liability:=liability+(c->>'reserved_usd')::numeric*1000000;
   end loop;
   if liability>q.upstream_microusd or total_tokens>(rp->>'aggregate_token_cap')::bigint then
     raise exception 'commercial_inference_budget';
   end if;
 elsif found then
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
commit;

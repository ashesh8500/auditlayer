begin;
-- No seeded rates or success flag: qualification is an operator-owned release
-- artifact. A candidate/model listing alone MUST NOT insert this row.
create table public.commercial_runtime_catalog (
 id text primary key check(id='auto'), provider text not null default 'openrouter' check(provider='openrouter'),
 model text not null check(model='deepseek/deepseek-v4-flash-0731'),
 data_route text not null default 'https://openrouter.ai/api/v1' check(data_route='https://openrouter.ai/api/v1'),
 rate_version text not null check(length(rate_version)>0),
 input_microusd_per_mtok bigint not null check(input_microusd_per_mtok>0), output_microusd_per_mtok bigint not null check(output_microusd_per_mtok>0),
 max_input_tokens integer not null check(max_input_tokens between 1 and 200000),max_output_tokens integer not null check(max_output_tokens between 1 and 64000),
 max_calls integer not null check(max_calls between 1 and 2),research_microusd bigint not null check(research_microusd>=0),
 qualification_ref text not null check(length(qualification_ref)>0),qualified_until timestamptz not null
);
alter table public.commercial_runtime_catalog enable row level security;
revoke all on public.commercial_runtime_catalog from public,anon,authenticated,service_role;
grant select on public.commercial_runtime_catalog to service_role;
create table public.commercial_quotes (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles(id),subject_id uuid not null references public.subjects(id),brief_id uuid not null references public.living_brief_versions(id),
 request jsonb not null,runtime jsonb not null,retail_microusd bigint not null,upstream_microusd bigint not null,expires_at timestamptz not null,
 audit_id uuid unique references public.audits(id),consented_at timestamptz,claimed_at timestamptz,worker_id text,
 created_at timestamptz not null default now()
);
alter table public.commercial_quotes enable row level security;
revoke all on public.commercial_quotes from public,anon,authenticated,service_role;
grant select on public.commercial_quotes to authenticated,service_role;
create policy owner_read on public.commercial_quotes for select to authenticated using(owner_id=(select auth.uid()));
create function public.commercial_quote(p jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
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
 up:=ceil((r.max_input_tokens::numeric*r.input_microusd_per_mtok+r.max_output_tokens::numeric*r.output_microusd_per_mtok)/1000000)*r.max_calls+r.research_microusd;
 if up<=0 or up*3>(public.commercial_policy()->>'run_ceiling_microusd')::bigint then raise exception 'runtime_budget_unqualified'; end if;
 insert into public.commercial_quotes(owner_id,subject_id,brief_id,request,runtime,retail_microusd,upstream_microusd,expires_at)
 values(o,(p->>'subject_id')::uuid,(p->>'brief_id')::uuid,p,to_jsonb(r),up*3,up,least(clock_timestamp()+interval '10 minutes',r.qualified_until)) returning * into q;
 return to_jsonb(q);
end $$;
create function public.commercial_submit(p jsonb) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
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
 select to_jsonb(r) into runtime from public.commercial_runtime_catalog r where id='auto' and qualified_until>clock_timestamp();
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
create function public.commercial_execution_claim(p jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare q public.commercial_quotes;a public.audits;r public.workspace_credit_reservations;runtime jsonb;
begin
 select * into a from public.audits where id=(p->>'audit_id')::uuid;
 perform 1 from public.profiles where id=a.user_id for update;
 select * into q from public.commercial_quotes where audit_id=a.id for update;
 if not found then return null; end if;
 if a.status<>'running' or a.claimed_by is distinct from p->>'worker_id' or coalesce(p->>'worker_id','')='' then raise exception 'worker_claim_required'; end if;
 if q.claimed_at is not null then raise exception 'commercial_attempt_already_claimed'; end if;
 select * into r from public.workspace_credit_reservations where id=q.id;
 select to_jsonb(c) into runtime from public.commercial_runtime_catalog c where id='auto' and qualified_until>clock_timestamp();
 if r.state<>'held' or q.expires_at<=clock_timestamp() or not public.commercial_cycle_active(r.cycle_id) or runtime is distinct from q.runtime or q.runtime->>'model' is distinct from p->>'model' then raise exception 'commercial_execution_expired'; end if;
 update public.commercial_quotes set claimed_at=clock_timestamp(),worker_id=p->>'worker_id' where id=q.id;
 return q.runtime||jsonb_build_object('reservation_id',q.id,'retail_microusd',q.retail_microusd,'upstream_microusd',q.upstream_microusd,'brief_id',q.brief_id);
end $$;
create function public.commercial_execution_finish(p jsonb) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare q public.commercial_quotes;a public.audits;
begin
 select * into a from public.audits where id=(p->>'audit_id')::uuid;
 perform 1 from public.profiles where id=a.user_id for update;
 select * into q from public.commercial_quotes where audit_id=a.id;
 if not found or q.worker_id is distinct from p->>'worker_id' or q.claimed_at is null then raise exception 'worker_claim_required'; end if;
 if p->>'outcome'='success' and (a.status<>'ready' or a.report_path is null or not exists(select 1 from public.audit_report_versions where audit_id=a.id and report_path=a.report_path)) then raise exception 'immutable_artifact_required'; end if;
 return public.workspace_credit_finish((p-'audit_id'-'worker_id')||jsonb_build_object('owner_id',q.owner_id,'reservation_id',q.id,'successful_path_id',case when p->>'outcome'='success' then a.report_path else null end));
end $$;
revoke all on function public.commercial_quote(jsonb),public.commercial_submit(jsonb),public.commercial_execution_claim(jsonb),public.commercial_execution_finish(jsonb) from public,anon,authenticated;
grant execute on function public.commercial_quote(jsonb),public.commercial_submit(jsonb),public.commercial_execution_claim(jsonb),public.commercial_execution_finish(jsonb) to service_role;
commit;

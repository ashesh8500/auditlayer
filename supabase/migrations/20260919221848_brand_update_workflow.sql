-- One bounded brand update, not a generic workflow engine. Internal RPC adapters.
create table public.brand_workflows (
 id uuid primary key, owner_id uuid not null references profiles(id), subject_id uuid not null references subjects(id),
 current_version_id uuid not null, status text not null default 'draft' check(status in ('draft','active','paused','cancelled')),
 pause_reason text, next_at timestamptz, created_at timestamptz not null default now()
);
create table public.brand_workflow_versions (
 id uuid primary key, workflow_id uuid not null references brand_workflows(id), owner_id uuid not null references profiles(id),
 objective text not null check(length(objective) between 1 and 2000), timezone text not null,
 local_time time not null, weekday int check(weekday between 0 and 6),
 model jsonb not null, rate_card_version text not null check(length(rate_card_version)>0),
 method_version text not null check(length(method_version)>0), allowed_tools jsonb not null check(jsonb_typeof(allowed_tools)='array'),
 customer_max_microusd bigint not null check(customer_max_microusd between 1 and 15000000),
 upstream_max_microusd bigint not null check(upstream_max_microusd between 1 and 60000000),
 recipients uuid[] not null, review_before_send boolean not null default true check(review_before_send),
 input jsonb not null, created_at timestamptz not null default now()
);
create table public.brand_workflow_grants (
 workflow_id uuid not null references brand_workflows(id), version_id uuid not null references brand_workflow_versions(id),
 owner_id uuid not null references profiles(id), kind text not null check(kind in ('run','schedule','delivery')),
 recipient_id uuid not null references profiles(id), granted boolean not null, updated_at timestamptz not null default now(),
 primary key(workflow_id,version_id,kind,recipient_id)
);
create function public.brand_workflow_immutable() returns trigger language plpgsql set search_path=public as $$
begin raise exception 'workflow_version_immutable'; end $$;
create trigger immutable_brand_workflow_version before update or delete on brand_workflow_versions for each row execute function brand_workflow_immutable();

create function public.brand_workflow_save(p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare u uuid := (p->>'owner_id')::uuid; w uuid := (p->>'workflow_id')::uuid; v uuid := (p->>'version_id')::uuid; old brand_workflows; prior jsonb; recipients uuid[];
begin
 perform 1 from profiles where id=u for update;
 if not exists(select 1 from subjects where id=(p->>'subject_id')::uuid and user_id=u) then raise exception 'subject_not_owned'; end if;
 select * into old from brand_workflows where id=w;
 if found and (old.owner_id<>u or old.subject_id<>(p->>'subject_id')::uuid or old.status='cancelled') then raise exception 'workflow_not_owned_or_cancelled'; end if;
 select input into prior from brand_workflow_versions where id=v;
 if found then
   if prior<>p then raise exception 'workflow_version_immutable'; end if;
   return w;
 end if;
 if not exists(select 1 from pg_timezone_names where name=p->>'timezone') then raise exception 'invalid_timezone'; end if;
 if (p->>'local_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'invalid_local_time'; end if;
 if jsonb_typeof(p->'model')<>'object' or not(p->'model' ?& array['provider','model','model_version','data_route']) then raise exception 'model_pin_required'; end if;
 select array_agg(value::uuid) into recipients from jsonb_array_elements_text(p->'recipients');
 if coalesce(cardinality(recipients),0) not between 1 and 10 or exists(select 1 from unnest(recipients) r where not exists(select 1 from profiles where id=r)) then raise exception 'recipient_account_required'; end if;
 insert into brand_workflows(id,owner_id,subject_id,current_version_id) values(w,u,(p->>'subject_id')::uuid,v)
 on conflict(id) do update set current_version_id=v,status='draft',pause_reason=null,next_at=null;
 insert into brand_workflow_versions(id,workflow_id,owner_id,objective,timezone,local_time,weekday,model,rate_card_version,method_version,allowed_tools,customer_max_microusd,upstream_max_microusd,recipients,input)
 values(v,w,u,p->>'objective',p->>'timezone',(p->>'local_time')::time,(p->>'weekday')::int,p->'model',p->>'rate_card_version',p->>'method_version',p->'allowed_tools',(p->>'customer_max_microusd')::bigint,(p->>'upstream_max_microusd')::bigint,recipients,p);
 return w;
end $$;

alter table brand_workflows enable row level security;
alter table brand_workflow_versions enable row level security;
alter table brand_workflow_grants enable row level security;
create policy brand_workflows_owner on brand_workflows for select to authenticated using(owner_id=auth.uid());
create policy brand_workflow_versions_owner on brand_workflow_versions for select to authenticated using(owner_id=auth.uid());
create policy brand_workflow_grants_owner on brand_workflow_grants for select to authenticated using(owner_id=auth.uid());
revoke all on brand_workflows,brand_workflow_versions,brand_workflow_grants from public,anon,authenticated,service_role;
grant select on brand_workflows,brand_workflow_versions,brand_workflow_grants to authenticated,service_role;
revoke all on function brand_workflow_save(jsonb),brand_workflow_immutable() from public,anon,authenticated;
grant execute on function brand_workflow_save(jsonb) to service_role;

-- Evaluate at most eight local dates. Round-trip rejects gaps; min UTC resolves
-- overlaps once. A passed first fold never admits the second fold.
create function public.brand_workflow_next(tz text, wall time, dow int, after_at timestamptz)
returns timestamptz language sql stable set search_path=public as $$
 with days as (select (after_at at time zone tz)::date+n as d from generate_series(0,8) n),
 candidates as (
 select d,(select min(t) from generate_series(((d+wall) at time zone tz)-interval '3 hours',((d+wall) at time zone tz)+interval '3 hours',interval '1 minute') t
 where t at time zone tz=d+wall) as instant
 from days where dow is null or extract(dow from d)=dow)
 select min(instant) from candidates where instant>after_at
$$;

create function public.brand_workflow_grant(p jsonb) returns boolean language plpgsql security definer set search_path=public as $$
declare w brand_workflows; v brand_workflow_versions; u uuid:=(p->>'owner_id')::uuid; r uuid:=(p->>'recipient_id')::uuid; k text:=p->>'kind';
begin
 perform 1 from profiles where id=u for update;
 select * into w from brand_workflows where id=(p->>'workflow_id')::uuid and owner_id=u;
 if not found or w.current_version_id<>(p->>'version_id')::uuid or w.status='cancelled' then raise exception 'workflow_not_owned_or_stale'; end if;
 select * into v from brand_workflow_versions where id=w.current_version_id;
 if (k in ('run','schedule') and r<>u) or (k='delivery' and not(r=any(v.recipients))) or k not in ('run','schedule','delivery') then raise exception 'invalid_grant'; end if;
 insert into brand_workflow_grants(workflow_id,version_id,owner_id,kind,recipient_id,granted)
 values(w.id,v.id,u,k,r,(p->>'granted')::boolean)
 on conflict(workflow_id,version_id,kind,recipient_id) do update set granted=excluded.granted,updated_at=clock_timestamp();
 if not (p->>'granted')::boolean then update brand_workflows set status='paused',pause_reason='permission_revoked',next_at=null where id=w.id; end if;
 return (p->>'granted')::boolean;
end $$;

create function public.brand_workflow_control(p jsonb) returns text language plpgsql security definer set search_path=public as $$
declare w brand_workflows; v brand_workflow_versions; u uuid:=(p->>'owner_id')::uuid; cmd text:=p->>'command';
begin
 perform 1 from profiles where id=u for update;
 select * into w from brand_workflows where id=(p->>'workflow_id')::uuid and owner_id=u;
 if not found or w.current_version_id<>(p->>'version_id')::uuid then raise exception 'workflow_not_owned_or_stale'; end if;
 if w.status='cancelled' then return 'cancelled'; end if;
 if cmd='activate' then
   if (select count(*) from brand_workflow_grants where workflow_id=w.id and version_id=w.current_version_id and recipient_id=u and kind in ('run','schedule') and granted)<>2 then raise exception 'permission_required'; end if;
   select * into v from brand_workflow_versions where id=w.current_version_id;
   update brand_workflows set status='active',pause_reason=null,next_at=brand_workflow_next(v.timezone,v.local_time,v.weekday,clock_timestamp()) where id=w.id;
 elsif cmd in ('pause','cancel') then
   update brand_workflows set status=case cmd when 'pause' then 'paused' else 'cancelled' end,pause_reason='owner_'||cmd,next_at=null where id=w.id;
 else raise exception 'invalid_command'; end if;
 return (select status from brand_workflows where id=w.id);
end $$;
revoke all on function brand_workflow_next(text,time,int,timestamptz),brand_workflow_grant(jsonb),brand_workflow_control(jsonb) from public,anon,authenticated;
grant execute on function brand_workflow_next(text,time,int,timestamptz),brand_workflow_grant(jsonb),brand_workflow_control(jsonb) to service_role;

create table public.brand_workflow_occurrences (
 id uuid primary key default gen_random_uuid(), workflow_id uuid not null references brand_workflows(id),
 version_id uuid not null references brand_workflow_versions(id), owner_id uuid not null references profiles(id),
 subject_id uuid not null references subjects(id), context_version_id uuid not null references living_brief_versions(id),
 scheduled_at timestamptz not null, state text not null default 'awaiting_admission' check(state in ('awaiting_admission','queued','review','failed')),
 audit_id uuid references audits(id), intelligence_run_id uuid references intelligence_runs(id), reservation_id uuid,
 created_at timestamptz not null default clock_timestamp(), unique(workflow_id,version_id,scheduled_at)
);
alter table brand_workflow_occurrences enable row level security;
create policy brand_workflow_occurrences_owner on brand_workflow_occurrences for select to authenticated using(owner_id=auth.uid());
revoke all on brand_workflow_occurrences from public,anon,authenticated,service_role;
grant select on brand_workflow_occurrences to authenticated,service_role;

create function public.brand_workflow_assert_dispatch(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare o brand_workflow_occurrences; w brand_workflows; u uuid:=(p->>'owner_id')::uuid;
begin
 perform 1 from profiles where id=u for update;
 select * into o from brand_workflow_occurrences where id=(p->>'occurrence_id')::uuid and owner_id=u;
 if not found then raise exception 'workflow_permission_denied'; end if;
 select * into w from brand_workflows where id=o.workflow_id;
 if w.owner_id<>u or w.status<>'active' or w.current_version_id<>o.version_id
 or not exists(select 1 from subjects where id=o.subject_id and user_id=u)
 or not exists(select 1 from living_brief_versions where id=o.context_version_id and subject_id=o.subject_id and confirmed)
 or (select count(*) from brand_workflow_grants where workflow_id=w.id and version_id=o.version_id and recipient_id=u and kind in ('run','schedule') and granted)<>2 then raise exception 'workflow_permission_denied'; end if;
 return to_jsonb(o);
end $$;

create function public.brand_workflow_tick(p jsonb) returns int language plpgsql security definer set search_path=public as $$
declare candidate record; w brand_workflows; v brand_workflow_versions; ctx uuid; occurrence uuid; admitted jsonb; n int:=0; reason text;
begin
 -- No supplied clock and no historical loop: max ten current occurrences per tick.
 for candidate in select id,owner_id from brand_workflows where status='active' and next_at<=clock_timestamp() order by owner_id,id limit least(greatest(coalesce((p->>'limit')::int,10),1),10) loop
   perform 1 from profiles where id=candidate.owner_id for update;
   select * into w from brand_workflows where id=candidate.id and status='active' and next_at<=clock_timestamp();
   if not found then continue; end if;
   select * into v from brand_workflow_versions where id=w.current_version_id;
   if w.next_at<clock_timestamp()-interval '5 minutes' then
     update brand_workflows set next_at=brand_workflow_next(v.timezone,v.local_time,v.weekday,clock_timestamp()) where id=w.id;
     continue;
   end if;
   select id into ctx from living_brief_versions where subject_id=w.subject_id and confirmed order by version desc limit 1;
   if ctx is null then update brand_workflows set status='paused',pause_reason='confirmed_context_required',next_at=null where id=w.id; continue; end if;
   insert into brand_workflow_occurrences(workflow_id,version_id,owner_id,subject_id,context_version_id,scheduled_at)
   values(w.id,v.id,w.owner_id,w.subject_id,ctx,w.next_at) on conflict(workflow_id,version_id,scheduled_at) do nothing returning id into occurrence;
   update brand_workflows set next_at=brand_workflow_next(v.timezone,v.local_time,v.weekday,clock_timestamp()) where id=w.id;
   if occurrence is null then continue; end if;
   n:=n+1;
   begin
     perform brand_workflow_assert_dispatch(jsonb_build_object('owner_id',w.owner_id,'occurrence_id',occurrence));
     if to_regprocedure('public.brand_workflow_queue_occurrence(jsonb)') is null then raise exception 'execution_unavailable'; end if;
     -- Canonical enqueue+quote+reservation authority owns this port. Never
     -- emulate it with ledger-only reserve or a legacy entitlement submission.
     execute 'select public.brand_workflow_queue_occurrence($1)' into admitted using jsonb_build_object('occurrence_id',occurrence);
     if admitted->>'audit_id' is null or admitted->>'intelligence_run_id' is null or admitted->>'reservation_id' is null then raise exception 'execution_unavailable'; end if;
     update brand_workflow_occurrences set audit_id=(admitted->>'audit_id')::uuid,intelligence_run_id=(admitted->>'intelligence_run_id')::uuid,reservation_id=(admitted->>'reservation_id')::uuid,state='queued' where id=occurrence;
   exception when others then
     reason:=case when sqlerrm like '%insufficient_credit%' then 'insufficient_credit' when sqlerrm like '%model_unavailable%' then 'model_unavailable' when sqlerrm like '%permission_denied%' then 'permission_revoked' else 'execution_unavailable' end;
     update brand_workflows set status='paused',pause_reason=reason,next_at=null where id=w.id;
   end;
 end loop;
 return n;
end $$;
revoke all on function brand_workflow_assert_dispatch(jsonb),brand_workflow_tick(jsonb) from public,anon,authenticated;
grant execute on function brand_workflow_assert_dispatch(jsonb),brand_workflow_tick(jsonb) to service_role;

create table public.brand_workflow_reviews (
 occurrence_id uuid primary key references brand_workflow_occurrences(id), owner_id uuid not null references profiles(id),
 artifact_version_id uuid not null references audit_report_versions(id), created_at timestamptz not null default clock_timestamp()
);
create table public.brand_workflow_outbox (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references profiles(id),
 occurrence_id uuid not null references brand_workflow_reviews(occurrence_id), artifact_version_id uuid not null references audit_report_versions(id),
 recipient_id uuid not null references profiles(id), channel text not null default 'email' check(channel='email'),
 status text not null default 'queued' check(status in ('queued','dispatching','reconciling','sent')),
 provider_receipt text, approved_at timestamptz not null default clock_timestamp(), dispatched_at timestamptz, sent_at timestamptz,
 unique(occurrence_id,artifact_version_id,recipient_id,channel)
);
create trigger immutable_brand_workflow_review before update or delete on brand_workflow_reviews for each row execute function brand_workflow_immutable();
alter table brand_workflow_reviews enable row level security;
alter table brand_workflow_outbox enable row level security;
create policy brand_workflow_reviews_owner on brand_workflow_reviews for select to authenticated using(owner_id=auth.uid());
create policy brand_workflow_outbox_owner on brand_workflow_outbox for select to authenticated using(owner_id=auth.uid());
revoke all on brand_workflow_reviews,brand_workflow_outbox from public,anon,authenticated,service_role;
grant select on brand_workflow_reviews,brand_workflow_outbox to authenticated,service_role;

create function public.brand_workflow_collect_reviews(p jsonb) returns int language plpgsql security definer set search_path=public as $$
declare candidate record; o brand_workflow_occurrences; artifact uuid; n int:=0;
begin
 for candidate in select id,owner_id from brand_workflow_occurrences where state='queued' order by owner_id,id limit least(greatest(coalesce((p->>'limit')::int,10),1),10) loop
   perform 1 from profiles where id=candidate.owner_id for update;
   select * into o from brand_workflow_occurrences where id=candidate.id and state='queued';
   if not found then continue; end if;
   -- Only an immutable artifact of THIS occurrence's canonical completed run.
   select av.id into artifact from audit_report_versions av join intelligence_runs ir on ir.id=av.intelligence_run_id
   join living_brief_versions b on b.id=o.context_version_id join audits a on a.id=av.audit_id
   where av.audit_id=o.audit_id and av.intelligence_run_id=o.intelligence_run_id and ir.status='completed'
   and ir.subject_id=o.subject_id and ir.brief_version=b.version and a.user_id=o.owner_id
   order by av.version limit 1;
   if artifact is null then continue; end if;
   insert into brand_workflow_reviews(occurrence_id,owner_id,artifact_version_id) values(o.id,o.owner_id,artifact) on conflict do nothing;
   update brand_workflow_occurrences set state='review' where id=o.id;
   n:=n+1;
 end loop;
 return n;
end $$;

create function public.brand_workflow_approve(p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare o brand_workflow_occurrences; v brand_workflow_versions; r uuid; recipients uuid[]; artifact uuid; u uuid:=(p->>'owner_id')::uuid;
begin
 perform brand_workflow_assert_dispatch(jsonb_build_object('owner_id',u,'occurrence_id',p->>'occurrence_id'));
 select * into o from brand_workflow_occurrences where id=(p->>'occurrence_id')::uuid;
 select artifact_version_id into artifact from brand_workflow_reviews where occurrence_id=o.id;
 if artifact is null or artifact<>(p->>'artifact_version_id')::uuid then raise exception 'artifact_mismatch'; end if;
 select * into v from brand_workflow_versions where id=o.version_id;
 select array_agg(value::uuid order by value::uuid) into recipients from jsonb_array_elements_text(p->'recipients');
 if recipients is distinct from (select array_agg(x order by x) from unnest(v.recipients) x) then raise exception 'recipient_mismatch'; end if;
 foreach r in array recipients loop
   if not exists(select 1 from brand_workflow_grants where workflow_id=o.workflow_id and version_id=o.version_id and kind='delivery' and recipient_id=r and granted) then raise exception 'delivery_permission_denied'; end if;
   insert into brand_workflow_outbox(owner_id,occurrence_id,artifact_version_id,recipient_id) values(u,o.id,artifact,r) on conflict do nothing;
 end loop;
 return o.id;
end $$;

-- This is the last authorization barrier before the provider boundary. A lost
-- response is NOT a reusable lease. Pause/revoke serializes on the same profile.
create function public.brand_workflow_send_claim(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare d brand_workflow_outbox; o brand_workflow_occurrences; email text;
begin
 select * into d from brand_workflow_outbox where id=(p->>'delivery_id')::uuid;
 if not found then raise exception 'delivery_permission_denied'; end if;
 perform brand_workflow_assert_dispatch(jsonb_build_object('owner_id',d.owner_id,'occurrence_id',d.occurrence_id));
 select * into d from brand_workflow_outbox where id=d.id for update;
 select * into o from brand_workflow_occurrences where id=d.occurrence_id;
 if not exists(select 1 from brand_workflow_grants where workflow_id=o.workflow_id and version_id=o.version_id and recipient_id=d.recipient_id and kind='delivery' and granted)
 or not exists(select 1 from brand_workflow_reviews where occurrence_id=o.id and artifact_version_id=d.artifact_version_id) then raise exception 'delivery_permission_denied'; end if;
 if d.status<>'queued' then raise exception 'already_dispatched'; end if;
 select users.email into email from auth.users where id=d.recipient_id;
 if email is null then raise exception 'delivery_permission_denied'; end if;
 update brand_workflow_outbox set status='dispatching',dispatched_at=clock_timestamp() where id=d.id;
 return jsonb_build_object('delivery_id',d.id,'recipient_id',d.recipient_id,'recipient_email',email,'artifact_version_id',d.artifact_version_id,'idempotency_key',d.id::text);
end $$;

create function public.brand_workflow_send_result(p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare d brand_workflow_outbox; outcome text:=p->>'status'; receipt text:=p->>'provider_receipt';
begin
 select * into d from brand_workflow_outbox where id=(p->>'delivery_id')::uuid;
 if not found then raise exception 'delivery_missing'; end if;
 perform 1 from profiles where id=d.owner_id for update;
 select * into d from brand_workflow_outbox where id=d.id for update;
 if d.status='sent' then
   if outcome<>'sent' or receipt is distinct from d.provider_receipt then raise exception 'receipt_mismatch'; end if;
   return d.id;
 end if;
 if d.status not in ('dispatching','reconciling') or outcome not in ('sent','reconciling') or (outcome='sent' and coalesce(length(receipt),0)=0) or (outcome='reconciling' and receipt is not null) then raise exception 'invalid_delivery_result'; end if;
 update brand_workflow_outbox set status=outcome,provider_receipt=receipt,sent_at=case when outcome='sent' then clock_timestamp() end where id=d.id;
 return d.id;
end $$;

create function public.brand_workflow_artifact_access(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare d brand_workflow_outbox; o brand_workflow_occurrences; result jsonb;
begin
 select * into d from brand_workflow_outbox where id=(p->>'delivery_id')::uuid and recipient_id=(p->>'viewer_id')::uuid;
 if not found then raise exception 'artifact_permission_denied'; end if;
 perform brand_workflow_assert_dispatch(jsonb_build_object('owner_id',d.owner_id,'occurrence_id',d.occurrence_id));
 select * into o from brand_workflow_occurrences where id=d.occurrence_id;
 if not exists(select 1 from brand_workflow_grants where workflow_id=o.workflow_id and version_id=o.version_id and kind='delivery' and recipient_id=d.recipient_id and granted) then raise exception 'artifact_permission_denied'; end if;
 select jsonb_build_object('report_path',av.report_path,'audit_id',av.audit_id,'version',av.version,'artifact_version_id',av.id) into result
 from audit_report_versions av where av.id=d.artifact_version_id and av.audit_id=o.audit_id and av.intelligence_run_id=o.intelligence_run_id;
 if result is null then raise exception 'artifact_permission_denied'; end if;
 return result;
end $$;
revoke all on function brand_workflow_collect_reviews(jsonb),brand_workflow_approve(jsonb),brand_workflow_send_claim(jsonb),brand_workflow_send_result(jsonb),brand_workflow_artifact_access(jsonb) from public,anon,authenticated;
grant execute on function brand_workflow_collect_reviews(jsonb),brand_workflow_approve(jsonb),brand_workflow_send_claim(jsonb),brand_workflow_send_result(jsonb),brand_workflow_artifact_access(jsonb) to service_role;

create function public.brand_workflow_resource(p jsonb) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('ownerId',p->>'owner_id','fetchedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'workflows',coalesce((select jsonb_agg(jsonb_build_object(
 'id',w.id,'subject_id',w.subject_id,'version_id',v.id,'objective',v.objective,'timezone',v.timezone,'local_time',to_char(v.local_time,'HH24:MI'),
 'weekday',v.weekday,'status',w.status,'pause_reason',w.pause_reason,'next_at',case when w.next_at is null then null else to_char(w.next_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end,
 'model',v.model,'rate_card_version',v.rate_card_version,'method_version',v.method_version,'allowed_tools',v.allowed_tools,
 'customer_max',jsonb_build_object('currency','USD','microusd',v.customer_max_microusd),'upstream_max',jsonb_build_object('currency','USD','microusd',v.upstream_max_microusd),
 'recipients',to_jsonb(v.recipients),
 'run_granted',exists(select 1 from brand_workflow_grants g where g.workflow_id=w.id and g.version_id=v.id and g.kind='run' and g.recipient_id=w.owner_id and g.granted),
 'schedule_granted',exists(select 1 from brand_workflow_grants g where g.workflow_id=w.id and g.version_id=v.id and g.kind='schedule' and g.recipient_id=w.owner_id and g.granted),
 'delivery_granted',coalesce((select jsonb_agg(g.recipient_id order by g.recipient_id) from brand_workflow_grants g where g.workflow_id=w.id and g.version_id=v.id and g.kind='delivery' and g.granted),'[]'::jsonb),
 'occurrences',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'version_id',o.version_id,'context_version_id',o.context_version_id,
 'scheduled_at',to_char(o.scheduled_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'state',o.state,'audit_id',o.audit_id,'artifact_version_id',r.artifact_version_id,
 'deliveries',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'recipient_id',d.recipient_id,'artifact_version_id',d.artifact_version_id,'status',d.status,'sent_at',case when d.sent_at is null then null else to_char(d.sent_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end) order by d.id) from brand_workflow_outbox d where d.occurrence_id=o.id),'[]'::jsonb)) order by o.scheduled_at desc)
 from (select * from brand_workflow_occurrences where workflow_id=w.id order by scheduled_at desc limit 30) o left join brand_workflow_reviews r on r.occurrence_id=o.id),'[]'::jsonb)
 ) order by w.created_at desc) from brand_workflows w join brand_workflow_versions v on v.id=w.current_version_id where w.owner_id=(p->>'owner_id')::uuid
 and exists(select 1 from subjects s where s.id=w.subject_id and s.user_id=w.owner_id)), '[]'::jsonb))
$$;
revoke all on function brand_workflow_resource(jsonb) from public,anon,authenticated;
grant execute on function brand_workflow_resource(jsonb) to service_role;

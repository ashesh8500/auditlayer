-- Additive dispatch authority. Legacy queues and entitlements are untouched.
begin;
create table public.workspace_executions (
 reservation_id uuid primary key references public.workspace_credit_reservations(id),
 owner_id uuid not null references public.profiles(id),
 audit_id uuid not null unique references public.audits(id),
 intelligence_run_id uuid not null unique references public.intelligence_runs(id),
 attempt_id uuid not null unique,
 intent jsonb not null, admission jsonb not null, expected jsonb not null,
 worker_id text not null, lease_expires_at timestamptz not null,
 revoked_at timestamptz, dispatched_at timestamptz,
 receipt jsonb, terminal_payload jsonb,
 artifact_version_id uuid references public.audit_report_versions(id),
 unique(owner_id, intent)
);
alter table public.workspace_executions enable row level security;
revoke all on public.workspace_executions from public,anon,authenticated,service_role;
grant select on public.workspace_executions to service_role;
-- No customer SELECT: admission contains private execution metadata. Project receipts separately.

create function public.workspace_execution_admit(p jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare i jsonb:=p->'intent'; q jsonb:=i->'quote'; refs jsonb:=q->'refs'; ex jsonb:=p->'expected';
 o uuid:=(refs->>'owner_id')::uuid; rid uuid:=(p->>'reservation_id')::uuid;
 prev public.workspace_executions; reserve jsonb; projected jsonb;
begin
 perform 1 from public.profiles where id=o for update;
 if not found then raise exception 'owner_missing'; end if;
 select * into prev from public.workspace_executions where reservation_id=rid;
 if found then
  if prev.admission is distinct from p then raise exception 'admission_mismatch'; end if;
  return rid;
 end if;
 if i->>'trigger'='schedule' then
  -- The durable occurrence row plus the workflow lane's own live grant check is
  -- the schedule authority. A direct RPC caller cannot fabricate either.
  if coalesce(i->>'schedule_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or to_regprocedure('public.brand_workflow_assert_dispatch(jsonb)') is null then raise exception 'schedule_authority_denied'; end if;
  perform public.brand_workflow_assert_dispatch(jsonb_build_object('owner_id',o,'occurrence_id',i->>'schedule_id'));
  if not exists(select 1 from public.brand_workflow_occurrences oc where oc.id=(i->>'schedule_id')::uuid
   and oc.owner_id=o and oc.workflow_id=(refs->>'workflow_id')::uuid and oc.version_id=(refs->>'workflow_version_id')::uuid
   and oc.subject_id=(refs->>'subject_id')::uuid and oc.context_version_id=(refs->>'context_version_id')::uuid
   and oc.state='awaiting_admission' and oc.reservation_id is null) then raise exception 'schedule_authority_denied'; end if;
 elsif i->>'trigger' is distinct from 'manual' or i->'schedule_id' is distinct from 'null'::jsonb then raise exception 'execution_policy_denied'; end if;
 if refs->>'policy_version' is distinct from 'P-01.v1' or refs->>'contract_version' is distinct from 'workspace.v1'
 or i->'consent' is distinct from '{"model_data_route":true,"customer_max":true}'::jsonb
 or coalesce(p->>'worker_id','')='' or coalesce((p->>'lease_seconds')::integer,0) not between 1 and 300
 or q->'customer_max'->>'currency' is distinct from 'USD' or q->'upstream_max'->>'currency' is distinct from 'USD'
 then raise exception 'execution_policy_denied'; end if;
 if not exists(select 1 from public.subjects where id=(refs->>'subject_id')::uuid and user_id=o)
 or not exists(select 1 from public.audits where id=(p->>'audit_id')::uuid and user_id=o and status='running' and claimed_by=p->>'worker_id')
 or not exists(select 1 from public.living_brief_versions b join public.intelligence_runs r on r.subject_id=b.subject_id and r.brief_version=b.version
  where b.id=(refs->>'context_version_id')::uuid and b.subject_id=(refs->>'subject_id')::uuid and b.confirmed and r.id=(p->>'intelligence_run_id')::uuid and r.status='running')
 then raise exception 'execution_context_denied'; end if;
 projected:=jsonb_build_object('owner_id',o,'subject_id',refs->>'subject_id','intent_id',i->>'id',
 'request_fingerprint',substring(q->>'input_fingerprint' from 8),'provider',q->'model'->>'provider','model',q->'model'->>'model',
 'model_version',q->'model'->>'model_version','data_route',q->'model'->>'data_route','rate_card_version',q->>'rate_card_version',
 'upstream_max_microusd',q->'upstream_max'->'microusd','customer_max_microusd',q->'customer_max'->'microusd');
 if ex is distinct from projected or coalesce(q->>'input_fingerprint','') !~ '^sha256:[0-9a-f]{64}$' then raise exception 'execution_pin_mismatch'; end if;
 reserve:=jsonb_build_object('owner_id',o,'reservation_id',rid,'run_intent_id',i->>'id','subject_id',refs->>'subject_id',
 'quote_id',q->>'id','quote_expires_at',q->>'expires_at','model_id',(q->'model')::text,'rate_version',q->>'rate_card_version',
 'context_version',refs->>'context_version_id','intent_fingerprint',ex->>'request_fingerprint',
 'retail_microusd',q->'customer_max'->'microusd','upstream_microusd',q->'upstream_max'->'microusd','recurring',false);
 perform public.workspace_credit_reserve(reserve);
 insert into public.workspace_executions(reservation_id,owner_id,audit_id,intelligence_run_id,attempt_id,intent,admission,expected,worker_id,lease_expires_at)
 values(rid,o,(p->>'audit_id')::uuid,(p->>'intelligence_run_id')::uuid,(p->>'attempt_id')::uuid,i,p,ex,p->>'worker_id',clock_timestamp()+make_interval(secs=>(p->>'lease_seconds')::integer));
 return rid;
end $$;

create function public.workspace_execution_dispatch(p jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.workspace_executions; r public.workspace_credit_reservations; refs jsonb;
begin
 select * into e from public.workspace_executions where reservation_id=(p->>'reservation_id')::uuid;
 if not found then raise exception 'execution_missing'; end if;
 perform 1 from public.profiles where id=e.owner_id for update;
 select * into e from public.workspace_executions where reservation_id=e.reservation_id for update;
 if e.dispatched_at is not null then raise exception 'dispatch_consumed'; end if;
 if e.revoked_at is not null or e.lease_expires_at<=clock_timestamp() or e.worker_id is distinct from p->>'worker_id'
 or e.attempt_id is distinct from (p->>'attempt_id')::uuid or e.expected is distinct from p->'expected' then raise exception 'dispatch_denied'; end if;
 refs:=e.intent->'quote'->'refs';
 if refs->>'policy_version' is distinct from 'P-01.v1'
 or not exists(select 1 from public.subjects where id=(refs->>'subject_id')::uuid and user_id=e.owner_id)
 or not exists(select 1 from public.audits where id=e.audit_id and user_id=e.owner_id and status='running' and claimed_by=e.worker_id)
 or not exists(select 1 from public.living_brief_versions b join public.intelligence_runs ir on ir.subject_id=b.subject_id and ir.brief_version=b.version
 where b.id=(refs->>'context_version_id')::uuid and b.confirmed and b.subject_id=(refs->>'subject_id')::uuid and ir.id=e.intelligence_run_id and ir.status='running')
 then raise exception 'dispatch_context_denied'; end if;
 if e.intent->>'trigger'='schedule' then
  -- Live, not stored, grant authority: revocation pauses repeated work.
  if to_regprocedure('public.brand_workflow_assert_dispatch(jsonb)') is null then raise exception 'dispatch_context_denied'; end if;
  perform public.brand_workflow_assert_dispatch(jsonb_build_object('owner_id',e.owner_id,'occurrence_id',e.intent->>'schedule_id'));
 end if;
 select * into r from public.workspace_credit_reservations where id=e.reservation_id;
 -- Idempotent ledger readmission proves held state, quote/cycle/lot expiry and cancellation.
 perform public.workspace_credit_reserve(r.intent);
 update public.workspace_executions set dispatched_at=clock_timestamp() where reservation_id=e.reservation_id;
 return e.expected || jsonb_build_object('receipt_id',e.attempt_id);
end $$;

revoke all on function public.workspace_execution_admit(jsonb),public.workspace_execution_dispatch(jsonb) from public,anon,authenticated;
grant execute on function public.workspace_execution_admit(jsonb),public.workspace_execution_dispatch(jsonb) to service_role;
create unique index workspace_execution_receipt_once on public.workspace_executions((receipt->>'id')) where receipt is not null;

create function public.workspace_execution_revoke(p jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare rid uuid:=(p->>'reservation_id')::uuid; o uuid:=(p->>'owner_id')::uuid;
begin
 perform 1 from public.profiles where id=o for update;
 update public.workspace_executions set revoked_at=coalesce(revoked_at,clock_timestamp()) where reservation_id=rid and owner_id=o;
 if not found then raise exception 'execution_missing'; end if;
 return rid;
end $$;

create function public.workspace_execution_finish(p jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.workspace_executions; u jsonb:=p->'receipt'; q jsonb;
 artifact uuid:=(p->>'artifact_version_id')::uuid; debit bigint; upstream bigint; success_cost bigint; absorbed bigint; k text; outcome text;
begin
 select * into e from public.workspace_executions where reservation_id=(p->>'reservation_id')::uuid;
 if not found then raise exception 'execution_missing'; end if;
 perform 1 from public.profiles where id=e.owner_id for update;
 select * into e from public.workspace_executions where reservation_id=e.reservation_id for update;
 if e.terminal_payload is not null then
  if e.terminal_payload is distinct from p then raise exception 'receipt_mismatch'; end if;
  return e.reservation_id;
 end if;
 q:=e.intent->'quote';
 if e.dispatched_at is null then raise exception 'not_dispatched'; end if;
 if not (u ?& array['id','run_intent_id','reservation_id','refs','model','rate_card_version','measurement','status','input_tokens','cache_read_tokens','cache_write_tokens','output_tokens','tool_calls','customer_charge','successful_path_upstream_cost','absorbed_retry_upstream_cost','total_upstream_cost','settled_at'])
 or u->>'run_intent_id' is distinct from e.intent->>'id' or u->>'reservation_id' is distinct from e.reservation_id::text
 or u->'refs' is distinct from q->'refs' or u->'model' is distinct from q->'model' or u->'rate_card_version' is distinct from q->'rate_card_version'
 or u->>'id' is null or (u->>'id')::uuid is null then raise exception 'receipt_pin_mismatch'; end if;
 debit:=(u->'customer_charge'->>'microusd')::bigint;
 if u->'customer_charge'->>'currency' is distinct from 'USD' or debit is null or debit<0 then raise exception 'receipt_charge_denied'; end if;
 if artifact is not null and not exists(select 1 from public.audit_report_versions where id=artifact and audit_id=e.audit_id and intelligence_run_id=e.intelligence_run_id)
 then raise exception 'artifact_link_denied'; end if;
 if u->>'measurement' in ('unknown','estimated') then
  if u->>'status' is distinct from 'pending_reconciliation' or debit<>0 or u->'settled_at' is distinct from 'null'::jsonb then raise exception 'pending_receipt_denied'; end if;
  if u->>'measurement'='unknown' then
   foreach k in array array['input_tokens','cache_read_tokens','cache_write_tokens','output_tokens','tool_calls','successful_path_upstream_cost','absorbed_retry_upstream_cost','total_upstream_cost'] loop
    if u->k is distinct from 'null'::jsonb then raise exception 'unknown_receipt_denied'; end if;
   end loop;
  end if;
  upstream:=null; outcome:='released';
 elsif u->>'measurement'='actual' then
  foreach k in array array['input_tokens','cache_read_tokens','cache_write_tokens','output_tokens','tool_calls'] loop
   if jsonb_typeof(u->k) is distinct from 'number' or (u->>k)::numeric<>trunc((u->>k)::numeric) or (u->>k)::numeric not between 0 and 9007199254740991 then raise exception 'receipt_usage_denied'; end if;
  end loop;
  foreach k in array array['successful_path_upstream_cost','absorbed_retry_upstream_cost','total_upstream_cost'] loop
   if u->k->>'currency' is distinct from 'USD' or jsonb_typeof(u->k->'microusd') is distinct from 'number' or (u->k->>'microusd')::numeric<>trunc((u->k->>'microusd')::numeric) or (u->k->>'microusd')::numeric not between 0 and 9007199254740991 then raise exception 'receipt_cost_denied'; end if;
  end loop;
  upstream:=(u->'total_upstream_cost'->>'microusd')::bigint;
  success_cost:=(u->'successful_path_upstream_cost'->>'microusd')::bigint;
  absorbed:=(u->'absorbed_retry_upstream_cost'->>'microusd')::bigint;
  if upstream<>success_cost+absorbed or u->>'settled_at' is null then raise exception 'receipt_cost_denied'; end if;
  if u->>'status'='succeeded' then
   if artifact is null then raise exception 'artifact_link_denied'; end if;
   outcome:='success';
  elsif u->>'status'='failed' and debit=0 and artifact is null then outcome:='failure';
  else raise exception 'receipt_outcome_denied'; end if;
 else raise exception 'receipt_measurement_denied'; end if;
 perform public.workspace_credit_finish(jsonb_build_object('owner_id',e.owner_id,'reservation_id',e.reservation_id,'outcome',outcome,
 'customer_debit_microusd',debit,'actual_upstream_microusd',upstream,'receipt_id',u->>'id','successful_path_id',artifact));
 update public.workspace_executions set receipt=u,terminal_payload=p,artifact_version_id=artifact where reservation_id=e.reservation_id;
 return e.reservation_id;
end $$;
revoke all on function public.workspace_execution_finish(jsonb),public.workspace_execution_revoke(jsonb) from public,anon,authenticated;
grant execute on function public.workspace_execution_finish(jsonb),public.workspace_execution_revoke(jsonb) to service_role;
alter table public.workspace_executions add column publication_payload jsonb;
create function public.workspace_execution_publish(p jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.workspace_executions; a public.audits; v integer; artifact uuid;
begin
 select * into e from public.workspace_executions where reservation_id=(p->>'reservation_id')::uuid;
 if not found then raise exception 'execution_missing'; end if;
 perform 1 from public.profiles where id=e.owner_id for update;
 select * into e from public.workspace_executions where reservation_id=e.reservation_id for update;
 if e.publication_payload is not null then
  if e.publication_payload is distinct from p then raise exception 'publication_mismatch'; end if;
  return e.artifact_version_id;
 end if;
 if e.dispatched_at is null or e.terminal_payload is not null then raise exception 'publication_denied'; end if;
 if p->>'delivery_status'='needs_review' and (p->'receipt'->'customer_charge'->>'microusd')::bigint<>0 then raise exception 'review_not_billable'; end if;
 select * into a from public.audits where id=e.audit_id for update;
 if a.user_id is distinct from e.owner_id then raise exception 'publication_owner_denied'; end if;
 update public.intelligence_runs set status='completed', updated_at=clock_timestamp(),
 stage_state=stage_state || jsonb_build_object('workspace_usage_receipt',p->'receipt') where id=e.intelligence_run_id;
 if a.report_path is null then
  v:=public.finalize_initial_report(e.audit_id,p->>'delivery_status',p->>'report_path',p->>'prompt_version','master-skeleton-v1',p->>'agent_bundle_version',e.intelligence_run_id);
 else
  v:=public.finalize_regenerated_report(e.audit_id,p->>'delivery_status',p->>'report_path',p->>'prompt_version','master-skeleton-v1',p->>'agent_bundle_version',e.intelligence_run_id);
 end if;
 select id into strict artifact from public.audit_report_versions where audit_id=e.audit_id and version=v;
 perform public.workspace_execution_finish(jsonb_build_object('reservation_id',e.reservation_id,'receipt',p->'receipt','artifact_version_id',artifact));
 update public.workspace_executions set publication_payload=p where reservation_id=e.reservation_id;
 return artifact;
end $$;
revoke all on function public.workspace_execution_publish(jsonb) from public,anon,authenticated;
grant execute on function public.workspace_execution_publish(jsonb) to service_role;
commit;

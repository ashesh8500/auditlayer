-- Disposable fixture only: run in an empty, isolated PostgreSQL database.
create role anon;
create role authenticated;
create role service_role;
create table public.audits(id uuid primary key,user_id uuid,status text,report_path text,report_version integer,created_at timestamptz default now(),updated_at timestamptz,prompt_version text,template_version text,agent_bundle_version text);
create table public.refinements(id uuid primary key default gen_random_uuid(),audit_id uuid,user_id uuid,section text,instruction text,status text,error text default '',created_at timestamptz default now(),updated_at timestamptz default now(),claimed_at timestamptz,claimed_by text);
create table public.audit_events(audit_id uuid,actor text,event_type text,phase text,detail text);
create table public.audit_report_versions(audit_id uuid,version integer,report_path text,prompt_version text,template_version text,agent_bundle_version text,intelligence_run_id uuid,change_type text,changed_section text,change_summary text,actor text,source_refinement_id uuid unique);
create table public.intelligence_runs(id uuid,status text,subject_id uuid);
create table public.batch_audits(audit_id uuid,batch_id uuid);
create table public.audit_batches(id uuid,subject_id uuid);

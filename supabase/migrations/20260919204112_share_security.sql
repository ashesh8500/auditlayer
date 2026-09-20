-- Capability metadata is private; anonymous visitors use server-only token lookups.
-- Additive hardening: existing public/email modes are never changed.
begin;
drop trigger if exists set_share_links_updated_at on public.share_links;
-- 0006 installed an updated_at trigger on a table without that column.
drop policy if exists share_links_public_read on public.share_links;
drop policy if exists share_links_select_own on public.share_links;
drop policy if exists share_links_insert_own on public.share_links;
drop policy if exists share_links_delete_own on public.share_links;
drop policy if exists share_links_admin_all on public.share_links;

revoke all on public.share_links from public, anon, authenticated;
grant select (id,audit_id,token,mode,email,verified_at,created_by,created_at,expires_at,revoked_at,view_count)
  on public.share_links to authenticated;
grant insert (audit_id,token,mode,email,created_by,expires_at) on public.share_links to authenticated;
grant update (revoked_at) on public.share_links to authenticated;
grant all on public.share_links to service_role;

create policy share_links_owner_read on public.share_links for select to authenticated
using (public.is_admin() or exists (select 1 from public.audits a where a.id=audit_id and a.user_id=(select auth.uid())));
create policy share_links_owner_insert on public.share_links for insert to authenticated
with check (created_by=(select auth.uid()) and
  exists (select 1 from public.audits a where a.id=audit_id and (a.user_id=(select auth.uid()) or public.is_admin()) and a.status='ready' and a.report_path is not null)
  and (mode='public' or (mode='email' and email is not null and length(trim(email)) between 3 and 254)));
create policy share_links_owner_revoke on public.share_links for update to authenticated
using (public.is_admin() or exists (select 1 from public.audits a where a.id=audit_id and a.user_id=(select auth.uid())))
with check (revoked_at is not null and (public.is_admin() or exists (select 1 from public.audits a where a.id=audit_id and a.user_id=(select auth.uid()))));

-- Quarantine foreign-audit capabilities minted through the former insert policy.
update public.share_links s set revoked_at=coalesce(s.revoked_at,now())
where not exists (select 1 from public.audits a where a.id=s.audit_id and a.user_id=s.created_by)
  and not exists (select 1 from public.profiles p where p.id=s.created_by and p.role='admin');
-- Old codes and global verification are not sessions. Require new verification.
update public.share_links set verification_code=null, verification_code_expires=null;

alter table public.share_links add column if not exists verification_attempts integer not null default 0;
alter table public.share_links add column if not exists verification_sent_at timestamptz;
alter table public.share_links add column if not exists verification_window_at timestamptz;
alter table public.share_links add column if not exists verification_send_count integer not null default 0;

create table public.share_sessions (
  session_hash text primary key check (session_hash ~ '^[a-f0-9]{64}$'),
  share_link_id uuid not null references public.share_links(id) on delete cascade,
  email text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.share_sessions enable row level security;
revoke all on public.share_sessions from public, anon, authenticated;
grant all on public.share_sessions to service_role;
create index share_sessions_link_idx on public.share_sessions(share_link_id);

-- All challenge state transitions serialize on the link row. No public RPC grants.
-- reserve counts attempted deliveries (including failures); activate only after Resend accepts.
create function public.share_email_challenge(p_action text,p_token text,p_email text,p_hash text,p_session_hash text default null)
returns text language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.share_links%rowtype; t timestamptz:=clock_timestamp();
begin
  select * into s from public.share_links where token=p_token for update;
  if not found or s.mode<>'email' or s.revoked_at is not null or (s.expires_at is not null and s.expires_at<=t)
    or not exists(select 1 from public.audits a where a.id=s.audit_id and a.status='ready' and a.report_path is not null)
    then return 'unavailable'; end if;
  if s.email is null or lower(trim(s.email))<>p_email then return 'invalid'; end if;
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then return 'invalid'; end if;
  if p_action='reserve' then
    if s.verification_sent_at>t-interval '60 seconds' then return 'limited'; end if;
    if s.verification_window_at>t-interval '1 hour' and s.verification_send_count>=5 then return 'limited'; end if;
    update public.share_links set verification_code=p_hash,verification_code_expires=null,verification_attempts=0,
      verification_sent_at=t,
      verification_window_at=case when verification_window_at>t-interval '1 hour' then verification_window_at else t end,
      verification_send_count=case when verification_window_at>t-interval '1 hour' then verification_send_count+1 else 1 end
      where id=s.id;
    return 'reserved';
  elsif p_action='activate' then
    if s.verification_code is distinct from p_hash or s.verification_sent_at<t-interval '1 minute' then return 'invalid'; end if;
    update public.share_links set verification_code_expires=t+interval '10 minutes' where id=s.id;
    return 'sent';
  elsif p_action='verify' then
    if s.verification_code_expires is null or s.verification_code_expires<=t or s.verification_code is null then return 'invalid'; end if;
    if s.verification_attempts>=5 then return 'limited'; end if;
    update public.share_links set verification_attempts=verification_attempts+1 where id=s.id;
    if s.verification_code<>p_hash or p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$' then return 'invalid'; end if;
    insert into public.share_sessions(session_hash,share_link_id,email,expires_at)
      values(p_session_hash,s.id,lower(trim(s.email)),least(t+interval '24 hours',coalesce(s.expires_at,t+interval '24 hours')));
    update public.share_links set verified_at=t,verification_code=null,verification_code_expires=null where id=s.id;
    delete from public.share_sessions where share_link_id=s.id and expires_at<=t;
    return 'verified';
  end if;
  return 'invalid';
end $$;

create function public.share_session_valid(p_token text,p_session_hash text)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.share_sessions ss join public.share_links s on s.id=ss.share_link_id
 join public.audits a on a.id=s.audit_id
 where s.token=p_token and ss.session_hash=p_session_hash and ss.expires_at>now()
 and s.mode='email' and ss.email=lower(trim(s.email)) and s.revoked_at is null
 and (s.expires_at is null or s.expires_at>now()) and a.status='ready' and a.report_path is not null);
$$;
revoke all on function public.share_email_challenge(text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.share_session_valid(text,text) from public,anon,authenticated;
grant execute on function public.share_email_challenge(text,text,text,text,text) to service_role;
grant execute on function public.share_session_valid(text,text) to service_role;
-- Retire public legacy security-definer oracle/counter access.
revoke all on function public.is_share_link_valid(text) from public,anon,authenticated;
revoke all on function public.increment_share_view(text) from public,anon,authenticated;
grant execute on function public.is_share_link_valid(text),public.increment_share_view(text) to service_role;
commit;

-- Setup is NOT report admission. No allowance, gift, wallet or audit writes.
-- Keep a tenant-local immutable command receipt, including after subject deletion,
-- so a stale retry cannot recreate a deliberately removed brand.
create table public.commercial_brand_setups (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  request jsonb not null,
  subject_id uuid not null,
  channel_id uuid not null,
  brief_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(owner_id, request_id)
);
alter table public.commercial_brand_setups enable row level security;
revoke all on public.commercial_brand_setups from public, anon, authenticated, service_role;
grant select on public.commercial_brand_setups to authenticated, service_role;
create policy owner_read on public.commercial_brand_setups for select to authenticated
  using(owner_id=(select auth.uid()));

-- The only authenticated wrapper around service-only kernel creation helpers.
-- Owner identity comes from the session, NEVER from caller JSON or admin status.
create function public.commercial_brand_setup(p jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  o uuid := auth.uid(); k uuid; s uuid; c uuid; b uuid;
  prior public.commercial_brand_setups;
  field text;
begin
  if o is null then raise exception 'authentication_required'; end if;
  perform 1 from public.profiles where id=o for update;
  if not found then raise exception 'authentication_required'; end if;
  if jsonb_typeof(p) is distinct from 'object'
    or p - array['request_id','name','subject_type','platform','locator','identity','audience','goal','confirmed','managed'] <> '{}'::jsonb
    or p->'confirmed' is distinct from 'true'::jsonb
    or p->'managed' is distinct from 'true'::jsonb then
    raise exception 'invalid_setup';
  end if;
  foreach field in array array['request_id','name','subject_type','platform','locator','identity','audience','goal'] loop
    if jsonb_typeof(p->field) is distinct from 'string' then raise exception 'invalid_setup'; end if;
  end loop;
  if p->>'request_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or length(btrim(p->>'name')) not between 1 and 120
    or p->>'subject_type' not in ('person','creator','brand','organization','project')
    or p->>'platform' not in ('instagram','youtube','tiktok','x','linkedin','website')
    or length(p->>'locator') not between 1 and 200
    or length(btrim(p->>'identity')) not between 8 and 2000
    or length(btrim(p->>'audience')) not between 1 and 2000
    or length(btrim(p->>'goal')) not between 1 and 200 then
    raise exception 'invalid_setup';
  end if;
  -- Accept canonical locators only. The web adapter normalizes input; direct RPC
  -- callers cannot smuggle arbitrary URLs into social handle identity.
  if p->>'platform'='website' then
    if p->>'locator' !~ '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}(/[^[:space:]?#]*)?$'
      or p->>'locator' ~ '[[:cntrl:]]' then raise exception 'invalid_setup'; end if;
  elsif p->>'locator' !~ '^[a-z0-9_][a-z0-9_.-]{0,99}$' then
    raise exception 'invalid_setup';
  end if;
  k := (p->>'request_id')::uuid;
  select * into prior from public.commercial_brand_setups where owner_id=o and request_id=k;
  if found then
    if prior.request is distinct from p then raise exception 'setup_request_conflict'; end if;
    -- Customer owner scope remains mandatory even when auth.uid is an admin.
    if not exists(select 1 from public.subjects where id=prior.subject_id and user_id=o)
      or not exists(select 1 from public.subject_channels where id=prior.channel_id and subject_id=prior.subject_id)
      or not exists(select 1 from public.living_brief_versions where id=prior.brief_id and subject_id=prior.subject_id) then
      raise exception 'setup_no_longer_available';
    end if;
    return jsonb_build_object('subject_id',prior.subject_id,'channel_id',prior.channel_id,'brief_id',prior.brief_id);
  end if;
  -- Concurrent fresh keys for the same channel must not create duplicate brands.
  -- The owner profile lock serializes this check with every setup command.
  if exists(select 1 from public.subject_channels ch join public.subjects su on su.id=ch.subject_id
    where su.user_id=o and ch.channel_type=p->>'platform' and lower(ltrim(ch.locator,'@'))=p->>'locator') then
    raise exception 'channel_already_configured';
  end if;
  s := public.create_subject(o,btrim(p->>'name'),p->>'subject_type');
  c := public.link_subject_channel(s,p->>'platform',p->>'locator',true,null);
  b := public.record_living_brief_version(s,1,'1.0',
    jsonb_build_object('summary',btrim(p->>'identity')),
    jsonb_build_object('summary',btrim(p->>'audience')),'{}'::jsonb,'[]'::jsonb,
    jsonb_build_array(btrim(p->>'goal')),'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,o,true);
  insert into public.commercial_brand_setups(owner_id,request_id,request,subject_id,channel_id,brief_id)
    values(o,k,p,s,c,b);
  return jsonb_build_object('subject_id',s,'channel_id',c,'brief_id',b);
end $$;
revoke all on function public.commercial_brand_setup(jsonb) from public,anon,service_role;
grant execute on function public.commercial_brand_setup(jsonb) to authenticated;

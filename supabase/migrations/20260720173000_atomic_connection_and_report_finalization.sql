-- Make Instagram connection persistence and report-version finalization atomic.
-- Service-role callers perform one transactional RPC instead of multi-step writes.

alter table public.audit_report_versions
  add column if not exists source_refinement_id uuid
    references public.refinements (id) on delete set null;

create unique index if not exists audit_report_versions_source_refinement_uidx
  on public.audit_report_versions (source_refinement_id)
  where source_refinement_id is not null;

create or replace function public.persist_instagram_connection(
  p_user_id uuid,
  p_ig_user_id text,
  p_ig_username text,
  p_long_lived_token text,
  p_long_lived_expires_at timestamptz,
  p_account_type text,
  p_followers_count bigint,
  p_media_count bigint
)
returns table(connection_id uuid, account_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection_id uuid;
  v_account_id uuid;
  v_handle text := lower(trim(leading '@' from p_ig_username));
begin
  if p_user_id is null or trim(coalesce(p_ig_user_id, '')) = '' or v_handle = '' then
    raise exception 'invalid_instagram_connection';
  end if;

  insert into public.instagram_connections (
    user_id,
    ig_user_id,
    ig_username,
    long_lived_token,
    long_lived_expires_at,
    account_type,
    followers_count,
    media_count,
    is_active,
    last_refreshed_at,
    updated_at
  ) values (
    p_user_id,
    p_ig_user_id,
    v_handle,
    p_long_lived_token,
    p_long_lived_expires_at,
    p_account_type,
    p_followers_count,
    p_media_count,
    true,
    now(),
    now()
  )
  on conflict (user_id, ig_user_id) do update set
    ig_username = excluded.ig_username,
    long_lived_token = excluded.long_lived_token,
    long_lived_expires_at = excluded.long_lived_expires_at,
    account_type = excluded.account_type,
    followers_count = excluded.followers_count,
    media_count = excluded.media_count,
    is_active = true,
    last_refreshed_at = now(),
    updated_at = now()
  returning id into v_connection_id;

  select id
    into v_account_id
    from public.accounts
   where user_id = p_user_id
     and ig_connection_id = v_connection_id
   for update;

  if v_account_id is not null then
    update public.accounts
       set handle = v_handle,
           platform = 'instagram',
           ownership_status = 'connected',
           updated_at = now()
     where id = v_account_id;
  else
    insert into public.accounts (
      user_id,
      handle,
      platform,
      ownership_status,
      ig_connection_id
    ) values (
      p_user_id,
      v_handle,
      'instagram',
      'connected',
      v_connection_id
    )
    on conflict (user_id, handle, platform) do update set
      ownership_status = 'connected',
      ig_connection_id = excluded.ig_connection_id,
      updated_at = now()
    returning id into v_account_id;
  end if;

  return query select v_connection_id, v_account_id;
end;
$$;

revoke all on function public.persist_instagram_connection(
  uuid, text, text, text, timestamptz, text, bigint, bigint
) from public, anon, authenticated;
grant execute on function public.persist_instagram_connection(
  uuid, text, text, text, timestamptz, text, bigint, bigint
) to service_role;

create or replace function public.disconnect_instagram_connection(
  p_user_id uuid,
  p_connection_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_found boolean;
begin
  select true
    into v_found
    from public.instagram_connections
   where id = p_connection_id
     and user_id = p_user_id
   for update;

  if not coalesce(v_found, false) then
    raise exception 'instagram_connection_not_found';
  end if;

  delete from public.accounts
   where user_id = p_user_id
     and ig_connection_id = p_connection_id;

  delete from public.instagram_connections
   where id = p_connection_id
     and user_id = p_user_id;
end;
$$;

revoke all on function public.disconnect_instagram_connection(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.disconnect_instagram_connection(uuid, uuid)
  to service_role;

create or replace function public.finalize_initial_report(
  p_audit_id uuid,
  p_delivery_status text,
  p_report_path text,
  p_prompt_version text,
  p_template_version text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_path text;
begin
  if p_delivery_status not in ('ready', 'needs_review') then
    raise exception 'invalid_delivery_status';
  end if;
  if trim(coalesce(p_report_path, '')) = '' then
    raise exception 'report_path_required';
  end if;

  perform 1 from public.audits where id = p_audit_id for update;
  if not found then
    raise exception 'audit_not_found';
  end if;

  select report_path
    into v_existing_path
    from public.audit_report_versions
   where audit_id = p_audit_id and version = 1;

  if v_existing_path is not null and v_existing_path <> p_report_path then
    raise exception 'initial_report_already_finalized';
  end if;

  if v_existing_path is null then
    insert into public.audit_report_versions (
      audit_id,
      version,
      report_path,
      prompt_version,
      template_version,
      change_type,
      change_summary,
      actor
    ) values (
      p_audit_id,
      1,
      p_report_path,
      p_prompt_version,
      p_template_version,
      'generation',
      'Initial generated report',
      'worker'
    );
  end if;

  update public.audits
     set status = p_delivery_status,
         report_path = p_report_path,
         report_version = 1,
         prompt_version = p_prompt_version,
         template_version = p_template_version,
         updated_at = now()
   where id = p_audit_id;

  return 1;
end;
$$;

revoke all on function public.finalize_initial_report(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_initial_report(uuid, text, text, text, text)
  to service_role;

create or replace function public.finalize_refinement_report(
  p_audit_id uuid,
  p_refinement_id uuid,
  p_report_path text,
  p_prompt_version text,
  p_template_version text,
  p_changed_section text,
  p_change_summary text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
  v_refinement_audit_id uuid;
  v_final_path text := p_report_path;
begin
  if trim(coalesce(p_report_path, '')) = '' then
    raise exception 'report_path_required';
  end if;

  perform 1 from public.audits where id = p_audit_id for update;
  if not found then
    raise exception 'audit_not_found';
  end if;

  select audit_id
    into v_refinement_audit_id
    from public.refinements
   where id = p_refinement_id
   for update;
  if v_refinement_audit_id is distinct from p_audit_id then
    raise exception 'refinement_audit_mismatch';
  end if;

  select version, report_path
    into v_version, v_final_path
    from public.audit_report_versions
   where source_refinement_id = p_refinement_id;

  if v_version is null then
    select coalesce(max(version), 0) + 1
      into v_version
      from public.audit_report_versions
     where audit_id = p_audit_id;

    insert into public.audit_report_versions (
      audit_id,
      version,
      report_path,
      prompt_version,
      template_version,
      change_type,
      changed_section,
      change_summary,
      actor,
      source_refinement_id
    ) values (
      p_audit_id,
      v_version,
      p_report_path,
      p_prompt_version,
      p_template_version,
      'refinement',
      nullif(p_changed_section, ''),
      left(coalesce(p_change_summary, ''), 500),
      'worker',
      p_refinement_id
    );
  end if;

  update public.audits
     set report_path = v_final_path,
         report_version = v_version,
         prompt_version = p_prompt_version,
         template_version = p_template_version,
         updated_at = now()
   where id = p_audit_id;

  update public.refinements
     set status = 'done',
         error = '',
         updated_at = now()
   where id = p_refinement_id;

  return v_version;
end;
$$;

revoke all on function public.finalize_refinement_report(
  uuid, uuid, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.finalize_refinement_report(
  uuid, uuid, text, text, text, text, text
) to service_role;

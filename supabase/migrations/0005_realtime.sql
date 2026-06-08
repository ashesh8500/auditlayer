-- Enable Supabase Realtime for live audit timeline (idempotent).

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'audit_events'
  ) then
    alter publication supabase_realtime add table public.audit_events;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'audits'
  ) then
    alter publication supabase_realtime add table public.audits;
  end if;
end $$;

-- Only for a disposable vanilla PostgreSQL test container, never hosted Supabase.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema extensions;
create schema storage;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz, is_anonymous boolean default false);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),current_user) $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key,name text,bucket_id text);
create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
create publication supabase_realtime;
grant usage on schema public,auth to anon,authenticated,service_role;
grant execute on all functions in schema auth to anon,authenticated,service_role;

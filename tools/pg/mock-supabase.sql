-- 로컬 Postgres에서 Supabase 흉내를 내는 최소 스키마 (시험 전용, 운영 DB에 실행 금지)
-- auth.users / auth.uid() / storage.objects / storage.foldername / supabase_realtime publication
-- 역할은 클러스터 전체에 하나만 있으므로 이미 있으면 건너뛴다.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema if not exists auth;
create schema if not exists storage;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  email_confirmed_at timestamptz default now(),
  created_at timestamptz default now()
);

-- 요청한 사용자 = request.jwt.claim.sub 설정값 (시험에서 set_config로 바꿔 가며 사용)
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner_id text default auth.uid()::text
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

do $$ begin
  create publication supabase_realtime;
exception when duplicate_object then null; end $$;

grant usage on schema public, auth, storage to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
grant all on storage.objects to authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;

-- =====================================================================
-- DX 협력사 허브 · Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에 전체를 붙여 넣고 Run 하세요. (1회)
-- 다시 실행해도 안전하도록 작성했습니다.
-- =====================================================================

-- 초대 코드 생성 (헷갈리는 글자 0/O, 1/I/L 제외한 6자리)
create or replace function public.new_invite_code() returns text
language plpgsql volatile as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  h text := replace(gen_random_uuid()::text, '-', '');
  out text := '';
begin
  for i in 0..5 loop
    out := out || substr(alphabet, (('x' || substr(h, i*2 + 1, 2))::bit(8)::int % length(alphabet)) + 1, 1);
  end loop;
  return out;
end $$;

-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------
create table if not exists public.companies (
  id          text primary key check (id ~ '^[a-z0-9_-]+$'),
  name        text not null,
  sort        int  not null default 0,
  kind        text not null default 'partner' constraint companies_kind_check check (kind in ('partner','internal')),
  created_at  timestamptz not null default now()
);

-- 사이트를 쓸 수 있는 사람 목록 (DX팀이 앱의 '사용자 관리'에서 관리)
create table if not exists public.allowed_emails (
  email       text primary key check (email = lower(email)),
  name        text not null default '',
  role        text not null check (role in ('admin','partner','viewer')),
  company_id  text references public.companies(id) on delete set null,
  invite_code text default public.new_invite_code(),
  created_at  timestamptz not null default now(),
  constraint partner_needs_company check (role <> 'partner' or company_id is not null)
);

-- 로그인한 사용자 (auth.users 가입 시 자동 생성)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  name        text not null default '',
  role        text not null default 'pending' check (role in ('admin','partner','viewer','pending')),
  company_id  text references public.companies(id) on delete set null,
  avatar_path text,
  linked      boolean not null default false,  -- 초대 코드 또는 관리자 승인으로 등록 사용자와 연결됨
  created_at  timestamptz not null default now()
);

-- 휴가 등록용 협력사 팀원 명단 (로그인 계정과 별개)
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  company_id  text not null references public.companies(id) on delete restrict,
  title       text not null default '',
  photo_path  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.notices (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(trim(title)) > 0),
  body        text not null default '',
  category    text not null default 'notice' check (category in ('notice','must','schedule','guide')),
  pinned      boolean not null default false,
  attachments jsonb not null default '[]'::jsonb,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.vacations (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id) on delete cascade,
  company_id  text not null references public.companies(id),
  type        text not null check (type in ('annual','am','pm','quarter','sick','comp','family','etc')),
  start_date  date not null,
  end_date    date not null,
  memo        text not null default '',
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint vacation_range check (end_date >= start_date)
);

-- 월별 AX 실적: 협력사 팀원 × 월 1건 (id = '<팀원id>_<YYYY-MM>')
-- member_id 가 비어 있는 행은 개인별 내역이 없는 회사 단위 기록 (기존 현황판 이관분, id = '<그룹id>_<YYYY-MM>')
create table if not exists public.ax_reports (
  id           text primary key,
  company_id   text not null references public.companies(id),
  member_id    uuid references public.members(id) on delete restrict,
  month        text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ai_image     int  not null check (ai_image >= 0),
  ai_work      int  check (ai_work >= 0),
  total        int  not null check (total >= 0),
  note         text not null default '',
  attachments  jsonb not null default '[]'::jsonb,
  submitted_by uuid default auth.uid() references public.profiles(id) on delete set null,
  submitted_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  constraint ax_ai_le_total check (ai_image <= total),
  constraint ax_id_format check (id = coalesce(member_id::text, company_id) || '_' || month)
);

-- DX팀 검토 결과. reviewed_at 이 submitted_at 보다 늦으면 그 상태가 유효,
-- 협력사가 다시 제출하면 자동으로 '검토 대기'로 돌아갑니다.
create table if not exists public.ax_reviews (
  report_id   text primary key references public.ax_reports(id) on delete cascade on update cascade,
  status      text not null check (status in ('approved','revise')),
  comment     text not null default '',
  reviewed_by uuid default auth.uid() references public.profiles(id) on delete set null,
  reviewed_at timestamptz not null default now()
);

-- 이전 버전에서 업그레이드할 때를 위한 컬럼 추가 (새로 설치할 땐 아무 일도 안 함)
alter table public.companies add column if not exists kind text not null default 'partner';
do $$ begin
  alter table public.companies add constraint companies_kind_check check (kind in ('partner','internal'));
exception when duplicate_object then null; end $$;
alter table public.profiles add column if not exists avatar_path text;
alter table public.allowed_emails add column if not exists invite_code text default public.new_invite_code();
update public.allowed_emails set invite_code = public.new_invite_code() where invite_code is null;
alter table public.profiles add column if not exists linked boolean not null default false;
-- 이미 권한이 붙어 있던 계정은 정상 연결된 것으로 표시
update public.profiles set linked = true where role <> 'pending' and not linked;

alter table public.members  add column if not exists photo_path text;
alter table public.ax_reports add column if not exists member_id uuid references public.members(id) on delete restrict;
alter table public.ax_reports drop constraint if exists ax_unique_month;
alter table public.ax_reports drop constraint if exists ax_id_format;
alter table public.ax_reports add constraint ax_id_format check (id = coalesce(member_id::text, company_id) || '_' || month);
create index if not exists ax_reports_member_idx on public.ax_reports (member_id);

-- 팀원 파트: AI 이미지 제작 실적은 디자인 파트만 대상
alter table public.members add column if not exists part text not null default 'design';
do $$ begin
  alter table public.members add constraint members_part_check check (part in ('design','publishing','etc'));
exception when duplicate_object then null; end $$;

-- 자유 형식 AX 실적 (디자인/퍼블리싱/공통 파트별 활용 사례·노하우·산출물 등)
create table if not exists public.ax_posts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(trim(title)) > 0),
  summary     text not null default '',
  body        text not null default '',
  part        text not null default 'design' check (part in ('design','publishing','common')),
  company_id  text references public.companies(id) on delete set null,
  status      text not null default 'idea' check (status in ('idea','test','doing','done')),
  usable      boolean not null default false,
  tools       text[] not null default '{}',
  category    text not null default 'case' check (category in ('case','knowhow','output','study','guide','meeting')),
  priority    text not null default 'normal' check (priority in ('core','high','normal')),
  start_date  date,
  end_date    date,
  attachments jsonb not null default '[]'::jsonb,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint ax_posts_range check (start_date is null or end_date is null or end_date >= start_date)
);
create index if not exists ax_posts_updated_idx on public.ax_posts (updated_at desc);

create index if not exists vacations_dates_idx on public.vacations (start_date, end_date);
create index if not exists ax_reports_month_idx on public.ax_reports (month);

-- ---------------------------------------------------------------------
-- 2. 권한 헬퍼 (RLS 안에서 profiles 를 다시 RLS 없이 읽기 위해 security definer)
-- ---------------------------------------------------------------------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'anon')
$$;

create or replace function public.my_company() returns text
language sql stable security definer set search_path = public as $$
  select company_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'admin'
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() in ('admin','partner','viewer')
$$;

-- 작성 권한: DX 관리자(admin)와 작성자(partner)는 소속과 관계없이 모든 그룹의
-- 팀원·휴가·AX 실적을 작성할 수 있음 (공지·검토·그룹·사용자 관리는 admin 전용)
create or replace function public.can_write_company(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() in ('admin','partner')
$$;

-- 본인 프로필 사진 지정 (profiles 는 관리자만 수정 가능하므로 이 함수로만 바꿈)
create or replace function public.set_my_avatar(p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_path is not null and p_path not like 'avatars/users/' || auth.uid()::text || '/%' then
    raise exception 'invalid avatar path';
  end if;
  update public.profiles set avatar_path = p_path where id = auth.uid();
end $$;
grant execute on function public.set_my_avatar(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. 트리거
-- ---------------------------------------------------------------------
-- 가입 처리
--  · 초대 코드를 넣고 가입: 사용자 관리에 등록된 이메일 + 코드 일치일 때만 계정 생성 (틀리면 가입 자체를 막음)
--  · 코드 없이 생긴 계정(대시보드에서 만든 계정 등): '승인 대기' → 관리자가 사용자 관리에서 승인
--  · 단, 아직 관리자가 한 명도 연결되지 않았을 때 등록된 관리자 이메일은 바로 연결 (첫 설치용)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a public.allowed_emails%rowtype;
  has_code boolean := coalesce(new.raw_user_meta_data ? 'invite_code', false);
  code text := upper(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
  ok boolean := false;
begin
  select * into a from public.allowed_emails where email = lower(new.email);
  if has_code then
    if a.email is null or a.invite_code is null or code <> upper(a.invite_code) then
      raise exception 'invalid_invite_code';
    end if;
    ok := true;
  elsif a.email is not null and a.role = 'admin'
        and not exists (select 1 from public.profiles where role = 'admin' and linked) then
    ok := true;
  end if;
  insert into public.profiles (id, email, name, role, company_id, linked)
  values (new.id, lower(new.email),
          case when ok then coalesce(a.name, '') else '' end,
          case when ok then a.role else 'pending' end,
          case when ok then a.company_id else null end,
          ok)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 사용자 관리에서 수정·삭제하면 연결된 계정에 바로 반영 (연결 안 된 계정은 건드리지 않음)
create or replace function public.sync_allowed_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    update public.profiles set role = 'pending', company_id = null, linked = false where email = old.email;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.email <> new.email then
    update public.profiles set role = 'pending', company_id = null, linked = false where email = old.email;
  end if;
  update public.profiles
     set role = new.role,
         company_id = new.company_id,
         name = case when new.name <> '' then new.name else name end
   where email = new.email and linked;
  return new;
end $$;

drop trigger if exists allowed_emails_sync on public.allowed_emails;
create trigger allowed_emails_sync after insert or update or delete on public.allowed_emails
  for each row execute function public.sync_allowed_email();

-- 관리자 승인: 코드 없이 생긴 계정을 등록된 사용자로 연결
create or replace function public.approve_user(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.allowed_emails%rowtype;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select * into a from public.allowed_emails where email = lower(trim(p_email));
  if a.email is null then raise exception 'not registered'; end if;
  update public.profiles
     set linked = true, role = a.role, company_id = a.company_id,
         name = case when a.name <> '' then a.name else name end
   where email = a.email;
end $$;
grant execute on function public.approve_user(text) to authenticated;

-- 공지: 작성자·작성일 보존, 수정일 갱신
create or replace function public.notice_fill() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists notices_fill on public.notices;
create trigger notices_fill before insert or update on public.notices
  for each row execute function public.notice_fill();

-- 휴가: 협력사는 팀원에서 자동으로 채움 (다른 회사 팀원으로 위장 불가)
create or replace function public.vacation_fill() returns trigger
language plpgsql as $$
begin
  new.company_id := (select m.company_id from public.members m where m.id = new.member_id);
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists vacations_fill on public.vacations;
create trigger vacations_fill before insert or update on public.vacations
  for each row execute function public.vacation_fill();

-- AX 실적: 소속은 팀원에서 자동으로 채우고 id 자동 계산, 제출자·제출 시각은 서버가 기록
create or replace function public.ax_fill() returns trigger
language plpgsql as $$
begin
  if new.member_id is not null then
    new.company_id := (select m.company_id from public.members m where m.id = new.member_id);
  end if;
  new.id := coalesce(new.member_id::text, new.company_id) || '_' || new.month;
  if auth.uid() is not null then
    new.submitted_by := auth.uid();
    new.submitted_at := now();
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists ax_reports_fill on public.ax_reports;
create trigger ax_reports_fill before insert or update on public.ax_reports
  for each row execute function public.ax_fill();

-- 검토: 검토자·검토 시각은 서버가 기록
create or replace function public.review_fill() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists ax_reviews_fill on public.ax_reviews;
create trigger ax_reviews_fill before insert or update on public.ax_reviews
  for each row execute function public.review_fill();

create or replace function public.post_fill() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.company_id := coalesce(new.company_id, public.my_company());
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  if not new.status = 'done' then new.usable := false; end if;
  return new;
end $$;
drop trigger if exists ax_posts_fill on public.ax_posts;
create trigger ax_posts_fill before insert or update on public.ax_posts
  for each row execute function public.post_fill();

-- ---------------------------------------------------------------------
-- 4. RLS (행 단위 권한)
-- ---------------------------------------------------------------------
alter table public.companies      enable row level security;
alter table public.allowed_emails enable row level security;
alter table public.profiles       enable row level security;
alter table public.members        enable row level security;
alter table public.notices        enable row level security;
alter table public.vacations      enable row level security;
alter table public.ax_reports     enable row level security;
alter table public.ax_reviews     enable row level security;

-- (재실행 대비: 각 정책을 지우고 다시 만듭니다)
drop policy if exists companies_read   on public.companies;
drop policy if exists companies_admin  on public.companies;
create policy companies_read  on public.companies for select to authenticated using (public.is_member());
create policy companies_admin on public.companies for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists allowed_admin on public.allowed_emails;
create policy allowed_admin on public.allowed_emails for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists profiles_read  on public.profiles;
drop policy if exists profiles_admin on public.profiles;
create policy profiles_read  on public.profiles for select to authenticated using (public.is_member() or id = auth.uid());
create policy profiles_admin on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists members_read   on public.members;
drop policy if exists members_insert on public.members;
drop policy if exists members_update on public.members;
drop policy if exists members_delete on public.members;
create policy members_read   on public.members for select to authenticated using (public.is_member());
create policy members_insert on public.members for insert to authenticated with check (public.can_write_company(company_id));
create policy members_update on public.members for update to authenticated using (public.can_write_company(company_id)) with check (public.can_write_company(company_id));
create policy members_delete on public.members for delete to authenticated using (public.can_write_company(company_id));

drop policy if exists notices_read  on public.notices;
drop policy if exists notices_admin on public.notices;
create policy notices_read  on public.notices for select to authenticated using (public.is_member());
create policy notices_admin on public.notices for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists vacations_read   on public.vacations;
drop policy if exists vacations_insert on public.vacations;
drop policy if exists vacations_update on public.vacations;
drop policy if exists vacations_delete on public.vacations;
create policy vacations_read   on public.vacations for select to authenticated using (public.is_member());
create policy vacations_insert on public.vacations for insert to authenticated with check (public.can_write_company(company_id));
create policy vacations_update on public.vacations for update to authenticated using (public.can_write_company(company_id)) with check (public.can_write_company(company_id));
create policy vacations_delete on public.vacations for delete to authenticated using (public.can_write_company(company_id));

drop policy if exists ax_read   on public.ax_reports;
drop policy if exists ax_insert on public.ax_reports;
drop policy if exists ax_update on public.ax_reports;
drop policy if exists ax_delete on public.ax_reports;
create policy ax_read   on public.ax_reports for select to authenticated using (public.is_member());
create policy ax_insert on public.ax_reports for insert to authenticated with check (public.can_write_company(company_id));
create policy ax_update on public.ax_reports for update to authenticated using (public.can_write_company(company_id)) with check (public.can_write_company(company_id));
create policy ax_delete on public.ax_reports for delete to authenticated using (public.is_admin());

drop policy if exists reviews_read  on public.ax_reviews;
drop policy if exists reviews_admin on public.ax_reviews;
create policy reviews_read  on public.ax_reviews for select to authenticated using (public.is_member());
create policy reviews_admin on public.ax_reviews for all    to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.ax_posts enable row level security;
drop policy if exists posts_read   on public.ax_posts;
drop policy if exists posts_insert on public.ax_posts;
drop policy if exists posts_update on public.ax_posts;
drop policy if exists posts_delete on public.ax_posts;
create policy posts_read   on public.ax_posts for select to authenticated using (public.is_member());
create policy posts_insert on public.ax_posts for insert to authenticated with check (public.my_role() in ('admin','partner'));
create policy posts_update on public.ax_posts for update to authenticated
  using (public.is_admin() or (public.my_role() = 'partner' and created_by = auth.uid()))
  with check (public.is_admin() or (public.my_role() = 'partner' and created_by = auth.uid()));
create policy posts_delete on public.ax_posts for delete to authenticated
  using (public.is_admin() or (public.my_role() = 'partner' and created_by = auth.uid()));

-- ---------------------------------------------------------------------
-- 5. 첨부파일 저장소 (비공개 버킷, 파일당 50MB)
--    경로 규칙: notices/...                 DX 관리자만
--              ax/... , posts/...           작성자 + DX 관리자 (AI 이미지 증빙, AX 실적 첨부)
--              avatars/users/<내 id>/...   본인 프로필 사진
--              avatars/members/...         작성자 + DX 관리자 (팀원 명단 사진)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists hub_files_read   on storage.objects;
drop policy if exists hub_files_upload on storage.objects;
drop policy if exists hub_files_delete on storage.objects;

create policy hub_files_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.is_member());

create policy hub_files_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments' and (
      public.is_admin()
      or (public.my_role() = 'partner'
          and (storage.foldername(name))[1] in ('ax','avatars','posts')
          and coalesce((storage.foldername(name))[2], '') <> 'users')
      or (public.is_member()
          and (storage.foldername(name))[1] = 'avatars'
          and (storage.foldername(name))[2] = 'users'
          and (storage.foldername(name))[3] = (select auth.uid())::text)
    )
  );

create policy hub_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (public.is_admin() or owner_id = (select auth.uid())::text));

-- ---------------------------------------------------------------------
-- 6. 실시간 반영 (다른 사람이 저장하면 화면이 자동 갱신)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['companies','profiles','members','notices','vacations','ax_reports','ax_reviews','ax_posts'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

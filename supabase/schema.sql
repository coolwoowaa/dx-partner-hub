-- =====================================================================
-- DX 협력사 허브 · Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에 전체를 붙여 넣고 Run 하세요. (1회)
-- 다시 실행해도 안전하도록 작성했습니다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------
create table if not exists public.companies (
  id          text primary key check (id ~ '^[a-z0-9_-]+$'),
  name        text not null,
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);

-- 사이트를 쓸 수 있는 사람 목록 (DX팀이 앱의 '사용자 관리'에서 관리)
create table if not exists public.allowed_emails (
  email       text primary key check (email = lower(email)),
  name        text not null default '',
  role        text not null check (role in ('admin','partner','viewer')),
  company_id  text references public.companies(id) on delete set null,
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
  created_at  timestamptz not null default now()
);

-- 휴가 등록용 협력사 팀원 명단 (로그인 계정과 별개)
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  company_id  text not null references public.companies(id) on delete restrict,
  title       text not null default '',
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

-- 월별 AX 실적 (협력사 × 월 1건, id = '<협력사id>_<YYYY-MM>')
create table if not exists public.ax_reports (
  id           text primary key,
  company_id   text not null references public.companies(id),
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
  constraint ax_id_format check (id = company_id || '_' || month),
  constraint ax_unique_month unique (company_id, month)
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

-- DX팀(admin)은 전부, 협력사(partner)는 자기 회사 데이터만 쓸 수 있음
create or replace function public.can_write_company(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'admin'
      or (public.my_role() = 'partner' and public.my_company() = c)
$$;

-- ---------------------------------------------------------------------
-- 3. 트리거
-- ---------------------------------------------------------------------
-- 가입 시 allowed_emails 를 보고 역할 부여 (목록에 없으면 pending = 아무것도 못 봄)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.allowed_emails%rowtype;
begin
  select * into a from public.allowed_emails where email = lower(new.email);
  insert into public.profiles (id, email, name, role, company_id)
  values (new.id, lower(new.email), coalesce(a.name, ''), coalesce(a.role, 'pending'), a.company_id)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 사용자 관리에서 추가·수정·삭제하면 이미 가입한 계정에도 바로 반영
create or replace function public.sync_allowed_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    update public.profiles set role = 'pending', company_id = null where email = old.email;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.email <> new.email then
    update public.profiles set role = 'pending', company_id = null where email = old.email;
  end if;
  update public.profiles
     set role = new.role,
         company_id = new.company_id,
         name = case when new.name <> '' then new.name else name end
   where email = new.email;
  return new;
end $$;

drop trigger if exists allowed_emails_sync on public.allowed_emails;
create trigger allowed_emails_sync after insert or update or delete on public.allowed_emails
  for each row execute function public.sync_allowed_email();

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

-- AX 실적: id 자동 계산, 제출자·제출 시각은 서버가 기록
create or replace function public.ax_fill() returns trigger
language plpgsql as $$
begin
  new.id := new.company_id || '_' || new.month;
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

-- ---------------------------------------------------------------------
-- 5. 첨부파일 저장소 (비공개 버킷, 파일당 50MB)
--    경로 규칙: notices/... (DX팀만), ax/<협력사id>/... (해당 협력사 + DX팀)
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
          and (storage.foldername(name))[1] = 'ax'
          and (storage.foldername(name))[2] = public.my_company())
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
  foreach t in array array['companies','profiles','members','notices','vacations','ax_reports','ax_reviews'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

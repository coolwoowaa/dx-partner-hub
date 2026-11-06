-- =====================================================================
-- 지금 한 번만 실행하세요: 업그레이드 002 + 003 + 004 합본
-- (정규직 팀·프로필 사진 / 공지 외 작성 권한 개방 / AX 개인별 실적)
-- Supabase → SQL Editor → + → Create a new snippet → 전체 붙여넣기 → Run
-- 이미 일부를 실행했어도, 여러 번 실행해도 안전합니다.
-- =====================================================================

-- ===== upgrade-002-team-avatars.sql =====
-- =====================================================================
-- 업그레이드 002 · 정규직 팀(내부 그룹) + 프로필 사진
-- 이미 schema.sql 을 실행한 프로젝트에서 SQL Editor 에 붙여 넣고 Run 하세요. (1회, 재실행 안전)
-- =====================================================================

-- 그룹 종류: partner = 협력사, internal = 정규직 팀 (AX 실적 표에서는 빠지고 휴가·팀원에는 포함)
alter table public.companies add column if not exists kind text not null default 'partner';
do $$ begin
  alter table public.companies add constraint companies_kind_check check (kind in ('partner','internal'));
exception when duplicate_object then null; end $$;

-- 프로필 사진 경로
alter table public.profiles add column if not exists avatar_path text;
alter table public.members  add column if not exists photo_path text;

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

-- 사진 업로드 권한 추가
drop policy if exists hub_files_upload on storage.objects;
create policy hub_files_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments' and (
      public.is_admin()
      or (public.my_role() = 'partner'
          and (storage.foldername(name))[1] = 'ax'
          and (storage.foldername(name))[2] = public.my_company())
      or (public.is_member()
          and (storage.foldername(name))[1] = 'avatars'
          and (storage.foldername(name))[2] = 'users'
          and (storage.foldername(name))[3] = (select auth.uid())::text)
      or ((storage.foldername(name))[1] = 'avatars'
          and (storage.foldername(name))[2] = 'members'
          and public.can_write_company((storage.foldername(name))[3]))
    )
  );

-- 정규직 팀 그룹 (이름은 사이트의 '협력사 · 팀원'에서 바꿀 수 있습니다)
insert into public.companies (id, name, sort, kind)
values ('dx', 'DX디자인팀', 0, 'internal')
on conflict (id) do update set kind = 'internal';

-- ===== upgrade-003-open-write.sql =====
-- =====================================================================
-- 업그레이드 003 · 공지사항을 뺀 모든 작성 권한을 작성자 전원에게 개방
-- 팀원·휴가·AX 실적·첨부·팀원 사진을 소속과 관계없이 작성자(partner) 누구나 작성할 수 있게 됩니다.
-- 공지 작성, 실적 검토(확인 완료/보완 요청), 실적 삭제, 그룹·사용자 관리는 DX 관리자 전용으로 유지.
-- SQL Editor 에 붙여 넣고 Run 하세요. (1회, 재실행 안전)
-- =====================================================================

create or replace function public.can_write_company(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() in ('admin','partner')
$$;

drop policy if exists hub_files_upload on storage.objects;
create policy hub_files_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments' and (
      public.is_admin()
      or (public.my_role() = 'partner'
          and (storage.foldername(name))[1] in ('ax','avatars')
          and coalesce((storage.foldername(name))[2], '') <> 'users')
      or (public.is_member()
          and (storage.foldername(name))[1] = 'avatars'
          and (storage.foldername(name))[2] = 'users'
          and (storage.foldername(name))[3] = (select auth.uid())::text)
    )
  );

-- ===== upgrade-004-ax-per-member.sql =====
-- =====================================================================
-- 업그레이드 004 · AX 실적을 협력사 팀원 개인별로 제출
-- 실적 한 건 = 협력사 팀원 × 월. 기존 4~10월 회사 단위 기록은 '회사 단위(이관)'으로 남아 합계에 포함됩니다.
-- SQL Editor 에 붙여 넣고 Run 하세요. (1회, 재실행 안전)
-- =====================================================================

alter table public.ax_reports add column if not exists member_id uuid references public.members(id) on delete restrict;
alter table public.ax_reports drop constraint if exists ax_unique_month;
alter table public.ax_reports drop constraint if exists ax_id_format;
alter table public.ax_reports add constraint ax_id_format check (id = coalesce(member_id::text, company_id) || '_' || month);
create index if not exists ax_reports_member_idx on public.ax_reports (member_id);

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

-- ===== 확인 =====
select
  (select count(*) from public.companies where kind = 'internal') as 정규직팀,
  (select count(*) from public.companies where kind = 'partner')  as 협력사,
  (select count(*) from public.ax_reports)                         as 실적기록;

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

select id, name, kind, sort from public.companies order by sort;

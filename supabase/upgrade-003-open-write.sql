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

select 'ok' as upgrade_003;

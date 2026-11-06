-- =====================================================================
-- 업그레이드 006 · 초대 코드로 본인이 비밀번호 만들기
-- 관리자는 사이트 '사용자 관리'에 이메일만 등록 → 초대 코드를 개별 전달 → 본인이 로그인 화면에서 비밀번호 생성
-- Supabase → SQL Editor → + → Create a new snippet → 전체 붙여넣기 → Run (재실행 안전)
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

alter table public.allowed_emails add column if not exists invite_code text default public.new_invite_code();
update public.allowed_emails set invite_code = public.new_invite_code() where invite_code is null;
alter table public.profiles add column if not exists linked boolean not null default false;
-- 이미 권한이 붙어 있던 계정은 정상 연결된 것으로 표시
update public.profiles set linked = true where role <> 'pending' and not linked;

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

-- ===== 확인 =====
select
  (select count(*) from public.allowed_emails where invite_code is not null) as 초대코드_발급,
  (select count(*) from public.profiles where linked) as 연결된_계정,
  'ok' as 결과;

-- =====================================================================
-- 업그레이드 008 · 사이트 안 알림 (읽음 시각을 계정별로 저장)
-- Supabase → SQL Editor → + → Create a new snippet → 전체 붙여넣기 → Run (재실행 안전)
--   · 알림 내용(새 댓글·보완 요청·새 공지)은 기존 데이터에서 계산하므로 따로 저장하지 않습니다.
--   · 이 표에는 "알림을 마지막으로 확인한 시각"만 저장합니다. 그래서 PC에서 확인하면 휴대폰에서도 읽음으로 보입니다.
--   · 본인 것만 읽고 쓸 수 있습니다(관리자도 다른 사람 것은 볼 수 없음).
-- =====================================================================

create table if not exists public.user_state (
  user_id        uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  alerts_seen_at timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 계정과 확인 시각은 서버가 채운다 (다른 사람 것으로 저장하거나 시각을 임의로 넣을 수 없음)
create or replace function public.user_state_fill() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := coalesce(auth.uid(), new.user_id);
  else
    new.user_id := old.user_id;
  end if;
  new.alerts_seen_at := now();
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists user_state_fill on public.user_state;
create trigger user_state_fill before insert or update on public.user_state
  for each row execute function public.user_state_fill();

alter table public.user_state enable row level security;
drop policy if exists user_state_read   on public.user_state;
drop policy if exists user_state_insert on public.user_state;
drop policy if exists user_state_update on public.user_state;
create policy user_state_read   on public.user_state for select to authenticated using (user_id = auth.uid());
create policy user_state_insert on public.user_state for insert to authenticated
  with check (user_id = auth.uid() and public.is_member());
create policy user_state_update on public.user_state for update to authenticated
  using (user_id = auth.uid() and public.is_member())
  with check (user_id = auth.uid() and public.is_member());

do $$ begin
  alter publication supabase_realtime add table public.user_state;
exception when duplicate_object then null; end $$;

-- ===== 확인 =====
select
  (select count(*) from public.user_state) as 알림_확인_기록,
  'ok' as 결과;

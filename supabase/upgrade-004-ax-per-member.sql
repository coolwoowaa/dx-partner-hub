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

select count(*) filter (where member_id is null) as company_rows,
       count(*) filter (where member_id is not null) as member_rows
from public.ax_reports;

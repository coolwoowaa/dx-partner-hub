-- =====================================================================
-- 업그레이드 005 · 자유 형식 AX 실적 게시판 + 팀원 파트(디자인/퍼블리싱)
-- Supabase → SQL Editor → + → Create a new snippet → 전체 붙여넣기 → Run (재실행 안전)
-- =====================================================================

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

drop policy if exists hub_files_upload on storage.objects;
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

do $$ begin
  alter publication supabase_realtime add table public.ax_posts;
exception when duplicate_object then null; end $$;

-- ===== 확인 =====
select
  (select count(*) from public.ax_posts) as ax_실적글,
  (select count(*) from public.members where part = 'design') as 디자인_팀원,
  'ok' as 결과;

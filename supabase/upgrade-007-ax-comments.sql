-- =====================================================================
-- 업그레이드 007 · AX 실적 글 댓글
-- Supabase → SQL Editor → + → Create a new snippet → 전체 붙여넣기 → Run (재실행 안전)
--   · 관리자·작성자(팀원/협력사)는 댓글을 달 수 있고, 열람 전용 계정은 읽기만 합니다.
--   · 댓글 수정은 본인만, 삭제는 본인 또는 DX 관리자만 할 수 있습니다.
--   · 글을 지우면 그 글의 댓글도 함께 지워집니다.
-- =====================================================================

create table if not exists public.ax_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.ax_posts(id) on delete cascade,
  body        text not null check (length(trim(body)) between 1 and 2000),
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists ax_comments_post_idx on public.ax_comments (post_id, created_at);

-- 작성자·작성 시각은 서버가 채운다. 수정할 때 글 번호·작성자·작성 시각은 바꿀 수 없다.
create or replace function public.comment_fill() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.post_id    := old.post_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.body := trim(new.body);
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists ax_comments_fill on public.ax_comments;
create trigger ax_comments_fill before insert or update on public.ax_comments
  for each row execute function public.comment_fill();

alter table public.ax_comments enable row level security;
drop policy if exists comments_read   on public.ax_comments;
drop policy if exists comments_insert on public.ax_comments;
drop policy if exists comments_update on public.ax_comments;
drop policy if exists comments_delete on public.ax_comments;
create policy comments_read   on public.ax_comments for select to authenticated using (public.is_member());
create policy comments_insert on public.ax_comments for insert to authenticated
  with check (public.my_role() in ('admin','partner'));
create policy comments_update on public.ax_comments for update to authenticated
  using (public.my_role() in ('admin','partner') and created_by = auth.uid())
  with check (public.my_role() in ('admin','partner') and created_by = auth.uid());
create policy comments_delete on public.ax_comments for delete to authenticated
  using (public.is_admin() or (public.my_role() = 'partner' and created_by = auth.uid()));

do $$ begin
  alter publication supabase_realtime add table public.ax_comments;
exception when duplicate_object then null; end $$;

-- ===== 확인 =====
select
  (select count(*) from public.ax_posts) as ax_실적글,
  (select count(*) from public.ax_comments) as 댓글,
  'ok' as 결과;

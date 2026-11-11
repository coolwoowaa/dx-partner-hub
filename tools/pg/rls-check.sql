-- 권한·가입 규칙 점검 (run-sql-test.sh 가 schema.sql + seed.sql 다음에 실행)
-- 결과는 맨 끝 표에서 PASS / FAIL 로 확인한다. 하나라도 FAIL이면 규칙이 깨진 것.
set client_min_messages = warning;
\set ON_ERROR_STOP 0
\o /dev/null

create temp table r (n serial, name text, ok boolean, detail text);
grant all on r to authenticated;
grant all on sequence r_n_seq to authenticated;

create function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u, ''), false); end $$;

-- should_pass = true  → 오류 없이 실행되고 (min_rows 이상) 행이 바뀌거나 나와야 통과
-- should_pass = false → 오류가 나거나 0행이어야 통과 (RLS가 막으면 보통 0행)
create function pg_temp.expect(name text, q text, should_pass boolean, min_rows int default 1) returns void
language plpgsql as $$
declare n int;
begin
  begin
    execute q; get diagnostics n = row_count;
    if should_pass then insert into r(name, ok, detail) values (name, n >= min_rows, 'rows=' || n);
    else insert into r(name, ok, detail) values (name, n = 0, 'rows=' || n || ' (막혀야 함)'); end if;
  exception when others then
    insert into r(name, ok, detail) values (name, not should_pass, sqlerrm);
  end;
end $$;

-- ---------- 준비 (postgres 권한) ----------
insert into public.allowed_emails (email, name, role, company_id) values
  ('p1@test.kr', '디지털 작성자', 'partner', 'tribe'),
  ('t1@test.kr', '정규직 작성자', 'partner', 'dx'),
  ('v1@test.kr', '열람자', 'viewer', null)
on conflict (email) do nothing;
update public.allowed_emails set invite_code = 'TEST22' where email = 'p1@test.kr';
update public.allowed_emails set invite_code = 'TEST33' where email = 't1@test.kr';
update public.allowed_emails set invite_code = 'TEST44' where email = 'v1@test.kr';

-- 가입: 첫 관리자(코드 없이 대시보드 생성) / 코드 가입 / 틀린 코드 / 미등록+코드 / 미등록
select pg_temp.expect('가입: 첫 관리자는 코드 없이도 연결', $q$insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'admin@test.kr')$q$, true);
select pg_temp.expect('가입: 맞는 코드(소문자·공백 허용)', $q$insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000b1', 'P1@test.kr', '{"invite_code":" test22 "}')$q$, true);
select pg_temp.expect('가입: 정규직 코드 가입', $q$insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000d1', 't1@test.kr', '{"invite_code":"TEST33"}')$q$, true);
select pg_temp.expect('가입: 열람자 코드 가입', $q$insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000c1', 'v1@test.kr', '{"invite_code":"TEST44"}')$q$, true);
select pg_temp.expect('가입: 틀린 코드는 차단', $q$insert into auth.users (email, raw_user_meta_data) values ('v1@test.kr', '{"invite_code":"ZZZZZZ"}')$q$, false);
select pg_temp.expect('가입: 미등록 이메일+코드는 차단', $q$insert into auth.users (email, raw_user_meta_data) values ('nobody@test.kr', '{"invite_code":"TEST22"}')$q$, false);
select pg_temp.expect('가입: 미등록 이메일(코드 없음)은 대기로 생성', $q$insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'walkin@test.kr')$q$, true);
select pg_temp.expect('가입: 관리자가 맞게 연결됨', $q$select 1 from public.profiles where email='admin@test.kr' and role='admin' and linked$q$, true);
select pg_temp.expect('가입: 작성자 역할·소속 부여', $q$select 1 from public.profiles where email='p1@test.kr' and role='partner' and company_id='tribe' and linked$q$, true);
select pg_temp.expect('가입: 미등록은 pending', $q$select 1 from public.profiles where email='walkin@test.kr' and role='pending' and not linked$q$, true);

insert into public.members (id, name, company_id, part) values ('11111111-1111-1111-1111-111111111111', '시험 디자이너', 'corp', 'design') on conflict do nothing;
insert into public.ax_posts (id, title, created_by) values ('22222222-2222-2222-2222-222222222222', '관리자 글', '00000000-0000-0000-0000-0000000000a1') on conflict do nothing;

set role authenticated;

-- ---------- 미등록(pending) ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.expect('미등록: 실적 안 보임', 'select * from public.ax_reports', false);
select pg_temp.expect('미등록: 본인 프로필만 보임', 'select * from public.profiles', true);
select pg_temp.expect('미등록: 팀원 추가 불가', $q$insert into public.members (name, company_id) values ('x','tribe')$q$, false);

-- ---------- 작성자(디지털 소속) ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.expect('작성자: 실적 열람', 'select * from public.ax_reports', true);
select pg_temp.expect('작성자: 자기 소속 팀원 추가', $q$insert into public.members (name, company_id) values ('디지털 팀원','tribe')$q$, true);
select pg_temp.expect('작성자: 다른 소속 팀원도 추가(개방)', $q$insert into public.members (name, company_id) values ('기업 팀원','corp')$q$, true);
select pg_temp.expect('작성자: 휴가 등록(소속은 팀원에서 자동)', $q$insert into public.vacations (member_id, company_id, type, start_date, end_date) values ('11111111-1111-1111-1111-111111111111','tribe','annual','2026-11-16','2026-11-16')$q$, true);
select pg_temp.expect('작성자: 휴가 소속 위장 불가', $q$select 1 from public.vacations where member_id='11111111-1111-1111-1111-111111111111' and company_id='corp'$q$, true);
select pg_temp.expect('작성자: AI 이미지 개인 실적 제출', $q$insert into public.ax_reports (id, member_id, company_id, month, ai_image, total) values ('11111111-1111-1111-1111-111111111111_2026-11','11111111-1111-1111-1111-111111111111','tribe','2026-11',3,9)$q$, true);
select pg_temp.expect('작성자: AI 이미지 > 전체 불가', $q$insert into public.ax_reports (id, member_id, company_id, month, ai_image, total) values ('11111111-1111-1111-1111-111111111111_2026-12','11111111-1111-1111-1111-111111111111','corp','2026-12',9,3)$q$, false);
select pg_temp.expect('작성자: 실적 검토 불가', $q$insert into public.ax_reviews (report_id, status) values ('11111111-1111-1111-1111-111111111111_2026-11','approved')$q$, false);
select pg_temp.expect('작성자: 실적 삭제 불가', $q$delete from public.ax_reports where id like '11111111%'$q$, false);
select pg_temp.expect('작성자: 공지 작성 불가', $q$insert into public.notices (title) values ('공지')$q$, false);
select pg_temp.expect('작성자: 그룹 추가 불가', $q$insert into public.companies (id, name) values ('zz','해킹')$q$, false);
select pg_temp.expect('작성자: 사용자 목록 안 보임', 'select * from public.allowed_emails', false);
select pg_temp.expect('작성자: 본인 권한 올리기 불가', $q$update public.profiles set role='admin' where id=auth.uid()$q$, false);
select pg_temp.expect('작성자: AX 글 작성', $q$insert into public.ax_posts (title, part, status, usable) values ('작성자 글','publishing','doing',true)$q$, true);
select pg_temp.expect('작성자: 진행 중 글은 활용 가능 표시 안 됨', $q$select 1 from public.ax_posts where title='작성자 글' and not usable and created_by=auth.uid()$q$, true);
select pg_temp.expect('작성자: 남의 AX 글 수정 불가', $q$update public.ax_posts set title='바꿈' where id='22222222-2222-2222-2222-222222222222'$q$, false);
select pg_temp.expect('작성자: 남의 AX 글 삭제 불가', $q$delete from public.ax_posts where id='22222222-2222-2222-2222-222222222222'$q$, false);
select pg_temp.expect('작성자: 첨부 업로드 posts/', $q$insert into storage.objects (bucket_id, name) values ('attachments','posts/2026-11/a.pdf')$q$, true);
select pg_temp.expect('작성자: 첨부 업로드 ax/', $q$insert into storage.objects (bucket_id, name) values ('attachments','ax/corp/2026-11/a.png')$q$, true);
select pg_temp.expect('작성자: 공지 첨부 업로드 불가', $q$insert into storage.objects (bucket_id, name) values ('attachments','notices/a.pdf')$q$, false);
select pg_temp.expect('작성자: 남의 프로필 사진 경로 불가', $q$insert into storage.objects (bucket_id, name) values ('attachments','avatars/users/00000000-0000-0000-0000-0000000000a1/x.jpg')$q$, false);
select pg_temp.expect('작성자: 본인 프로필 사진 지정', $q$select public.set_my_avatar('avatars/users/00000000-0000-0000-0000-0000000000b1/me.jpg')$q$, true);
select pg_temp.expect('작성자: 승인 기능 사용 불가', $q$select public.approve_user('walkin@test.kr')$q$, false);

-- ---------- 열람자 ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect('열람자: 실적 열람', 'select * from public.ax_reports', true);
select pg_temp.expect('열람자: 팀원 추가 불가', $q$insert into public.members (name, company_id) values ('x','tribe')$q$, false);
select pg_temp.expect('열람자: AX 글 작성 불가', $q$insert into public.ax_posts (title) values ('x')$q$, false);
select pg_temp.expect('열람자: 첨부 업로드 불가', $q$insert into storage.objects (bucket_id, name) values ('attachments','posts/x.pdf')$q$, false);

-- ---------- 관리자 ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect('관리자: 공지 작성', $q$insert into public.notices (title) values ('관리자 공지')$q$, true);
select pg_temp.expect('관리자: 실적 검토', $q$insert into public.ax_reviews (report_id, status, comment) values ('11111111-1111-1111-1111-111111111111_2026-11','revise','증빙 누락')$q$, true);
select pg_temp.expect('관리자: 남의 AX 글 수정', $q$update public.ax_posts set priority='core' where title='작성자 글'$q$, true);
select pg_temp.expect('관리자: 사용자 목록 열람', 'select * from public.allowed_emails', true);

reset role;
-- 미등록 계정은 관리자 이름 수정만으로 권한이 붙지 않아야 함 (명시적 승인 필요)
insert into public.allowed_emails (email, role, company_id) values ('walkin@test.kr', 'partner', 'corp') on conflict do nothing;
select pg_temp.expect('승인 전: 등록만으로 권한 안 붙음', $q$select 1 from public.profiles where email='walkin@test.kr' and role='pending'$q$, true);
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect('관리자: 대기 계정 승인', $q$select public.approve_user('walkin@test.kr')$q$, true);
reset role;
select pg_temp.expect('승인 후: 작성자로 연결', $q$select 1 from public.profiles where email='walkin@test.kr' and role='partner' and linked$q$, true);
select pg_temp.expect('접근 해제: 다시 pending', $q$delete from public.allowed_emails where email='walkin@test.kr'$q$, true);
select pg_temp.expect('접근 해제 반영', $q$select 1 from public.profiles where email='walkin@test.kr' and role='pending' and not linked$q$, true);

\o
\echo
\echo ===== 권한 점검 결과 =====
select n as "#", case when ok then 'PASS' else 'FAIL' end as 결과, name as 항목, detail as 상세 from r order by n;
select count(*) filter (where ok) as pass, count(*) filter (where not ok) as fail from r;

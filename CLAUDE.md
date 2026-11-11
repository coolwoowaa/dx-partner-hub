# 디지털/기업 허브 — 프로젝트 지침

DX디자인팀(정규직)과 협력사(디지털, 기업)가 함께 쓰는 업무 사이트.
공지사항, 휴가 일정, AX 실적(자유 형식), AI 이미지 제작 실적(디자인 파트)을 한곳에서 관리한다.

- 사이트: https://dx-partner-hub.vercel.app
- 저장소: https://github.com/coolwoowaa/dx-partner-hub (`main` push → Vercel 자동 배포)
- Supabase: 서울 리전 프로젝트 `dnjghugybinpfsdftbcc` (Free 플랜)
- 문서화(Figma): 2026 AX과제 파일 `9nE2ISfzQLGHe7LPbvchWA` › 페이지 「디지털/기업 협력사 팀원 허브 사이트」(3180:4), 섹션 3182:7

## 1. 소통 방식

- 요청자는 DX디자인팀 PL(사이트 관리자, 디자이너). 개발자가 아니다. **한국어로, 쉬운 말로** 답한다.
- Supabase·Vercel·GitHub 화면에서 할 일은 **메뉴 경로를 단계별로**(예: Authentication → Sign In / Providers → Email) 적고, 끝에 "이렇게 나오면 성공"을 붙인다.
- SQL을 실행하게 할 때는 GitHub 파일 링크 + "SQL Editor → + → Create a new snippet → 붙여넣기 → Run" 순서를 안내하고, 경고(destructive operation)가 왜 뜨는지 한 줄로 설명한다.
- 선택지가 있으면 추천안을 먼저 말하고 이유를 짧게 단다. 결과 보고에는 **확인한 것 / 확인 못 한 것**을 구분한다.
- 이 작업 환경에서는 `*.supabase.co`, `*.vercel.app`에 접속할 수 없다(프록시 403). 실서비스 동작은 직접 확인했다고 말하지 말고, 사용자에게 확인을 요청한다.

## 2. 구조

빌드 없는 정적 사이트. 프레임워크·번들러 없음.

| 파일 | 역할 |
|---|---|
| `index.html` | 화면 틀, 전체 CSS(디자인 토큰 포함), 사이드바 메뉴, 업무관리 바로가기 배너 |
| `app.js` | 모든 동작. 라우팅(`#home` 등 해시), 렌더 함수 `v*()`, 모달 폼, Supabase 연동 |
| `config.js` | Supabase URL + **publishable(anon) 키만**. `EMAIL_LINK` 스위치 |
| `vendor/supabase-2.117.3.js` | supabase-js UMD 빌드를 저장소에 포함(사내망 CDN 차단 대비) |
| `supabase/schema.sql` | 전체 스키마(새 설치용). 재실행 안전하게 유지 |
| `supabase/seed.sql` | 그룹 3개, 첫 관리자, 2026년 4~10월 AI 이미지 이관 실적 |
| `supabase/upgrade-00N-*.sql` | 이미 운영 중인 DB에 적용하는 변경분. 현재 006까지 적용됨 |
| `vercel.json` / `.vercelignore` | 보안 헤더, 검색 노출 차단 / 배포 제외 목록 |
| `tools/` | 시험 도구(로컬 DB 권한 점검, 가짜 Supabase 화면 점검, Figma 캡처). 배포 제외 |

화면(라우트): `home`(대시보드) · `notice` · `leave`(휴가) · `ax`(AX 실적 게시판) · `aiimg`(AI 이미지 제작) · `team`(협력사·팀원) · `users`(사용자 관리, 관리자) · `account`(내 계정)

## 3. 데이터와 권한

테이블: `companies`(그룹, kind = internal 정규직 / partner 협력사) · `allowed_emails`(등록 사용자 + 초대 코드) · `profiles`(로그인 계정, linked) · `members`(휴가·실적용 팀원 명단, part = design/publishing/etc) · `notices` · `vacations` · `ax_posts`(자유 형식 AX 실적) · `ax_reports`(AI 이미지 월 실적, 팀원×월, member_id 없으면 회사 단위 이관분) · `ax_reviews`(검토) · Storage 버킷 `attachments`(비공개).

| 권한 (`profiles.role`) | 할 수 있는 일 |
|---|---|
| `admin` DX 관리자 | 전부. 공지 작성, AI 이미지 검토·삭제, 그룹·사용자 관리 |
| `partner` 작성자 | 공지를 뺀 팀원·휴가·AI 이미지 실적·첨부를 **소속과 관계없이** 작성. AX 실적 글은 본인 글만 수정·삭제 |
| `viewer` | 열람만 |
| `pending` | 아무것도 못 봄(승인 대기) |

화면 표시: `partner` + 정규직 소속 → "팀원", 협력사 소속 → "협력사".

가입: 관리자가 사용자 관리에 이메일 등록 → 6자리 초대 코드 자동 발급 → 본인이 로그인 화면 "비밀번호 만들기"에서 이메일+코드+비밀번호 입력. `handle_new_user` 트리거가 코드를 검사하고, 틀리면 가입 자체를 막는다. 코드 없이 생긴 계정은 `linked=false`로 승인 대기 → 관리자가 `approve_user()`로 승인.

## 4. 바꿀 때 지키는 규칙

**권한은 DB(RLS·트리거)에서 막는다.** 화면에서 버튼만 숨기는 것으로 끝내지 않는다. 새 테이블에는 RLS를 켜고 `is_member()` / `is_admin()` / `can_write_company()` / `my_role()` 헬퍼를 쓴다. 작성자·작성 시각 같은 값은 트리거에서 서버가 채운다.

**DB를 바꾸면 세 군데를 함께 고친다.**
1. `supabase/schema.sql`: 새 설치에서도 같은 결과가 나오게 반영하고 `add column if not exists` 등으로 재실행 안전하게 유지한다.
2. `supabase/upgrade-007-*.sql`(다음 번호): 운영 DB에 적용할 변경분만 담는다. 재실행 안전, 맨 끝에 사람이 읽기 쉬운 확인용 `select`를 둔다(예: `'ok' as 결과`).
3. `README.md`의 업그레이드 표에 한 줄 추가하고, 사용자에게 실행 방법과 기대 결과를 안내한다.

**보안**
- `config.js`에는 publishable(anon) 키만 둔다. service_role/secret 키, DB 비밀번호는 절대 커밋하지 않는다.
- 사용자 입력은 화면에 넣을 때 반드시 `esc()`를 거친다. 링크 자동 연결은 `linkify()`만 쓴다. `innerHTML`에 원문을 그대로 넣지 않는다.
- 첨부는 비공개 버킷 + 서명 URL(1시간). 경로 규칙: `notices/`(관리자), `ax/<그룹id>/`, `posts/`, `avatars/users/<본인 id>/`, `avatars/members/`. 새 경로를 만들면 Storage 정책도 같이 고친다.

**화면·디자인**
- 색은 `index.html`의 CSS 변수만 쓴다. 새 색을 만들면 `:root`, `@media (prefers-color-scheme: dark)`, `:root[data-theme="dark"]` 세 곳에 모두 정의한다(라이트·다크 토글 지원).
- 파스텔 토큰 `--pb/--pp/--pe/--py/--pg/--pt`와 색조 `--h-blue/purple/orange/yellow/green/teal/brown/red/gray`를 재사용한다. 협력사 색: 디지털 = 주황, 기업 = 초록.
- 글꼴은 Pretendard 우선(없으면 IBM Plex Sans KR). 이모지는 사용자가 요청한 곳(테마 토글, 업무관리 배너)에만 쓴다.
- 모바일(≤860px)에서는 사이드바가 위쪽 가로 메뉴가 된다. 화면 폭 390px에서 가로 스크롤이 생기지 않아야 한다.
- 공휴일은 `app.js` 맨 위 `HOLIDAYS`에 있다(현재 2026년). 연말에 다음 해를 추가한다.

## 5. 검증 방법 (도구는 `tools/`, 사용법은 `tools/README.md`)

바꾼 뒤에는 아래를 돌려 **통과를 확인하고 나서** 커밋한다.
- 문법: `node --check app.js`
- DB: `tools/pg/run-sql-test.sh` (새 설치) / `tools/pg/run-sql-test.sh --from <운영 상태 커밋> supabase/upgrade-00N-*.sql` (운영 DB 재현 + 업그레이드 두 번). 권한 점검 표가 `fail 0`이어야 한다. 새 권한 규칙은 `tools/pg/rls-check.sql`에 항목을 추가한다.
- 화면: `node tools/smoke/smoke.js` → `결과: 통과`. 새 화면·폼은 `ROUTES`/`FORMS`에, 새 테이블의 데모 데이터는 `tools/smoke/stub-supabase.js`에 추가한다. 눈으로 볼 때는 `--shots <폴더>`로 라이트·다크·모바일 캡처를 확인한다.
- Figma 캡처: `node tools/smoke/capture.js <폴더>` → 4장(01 홈·02 AX 실적 라이트, 03 휴가·04 AI 이미지 다크).
- 가짜 데이터로 만든 캡처를 사용자에게 줄 때는 **"데모 데이터"라고 명시**하고, 실존 인물에게 가짜 기록을 붙이지 않는다(가명 사용). 실제 값은 기존 현황판의 2026년 4~10월 AI 이미지 수치뿐이다.
- `tools/`, `supabase/`, 문서 파일은 `.vercelignore`로 배포에서 빠진다(사이트에 공개되지 않음).

## 6. 배포와 커밋

- `main`에 커밋하고 push하면 Vercel이 1~2분 안에 배포한다. 별도 빌드 설정 없음(Framework Preset: Other).
- 커밋 메시지는 한국어로 무엇을 왜 바꿨는지 쓴다. 커밋 작성자는 `coolwoowaa`.
- DB 변경이 들어간 커밋은 배포만으로 적용되지 않는다. 반드시 사용자에게 upgrade SQL 실행을 안내한다.

## 7. 운영 메모 (겪은 문제와 현재 설정)

- **Confirm email: 꺼짐**이어야 한다. 켜져 있으면 가입 때 인증 메일을 보내려다 `over_email_send_rate_limit`로 막힌다. Supabase 기본 메일은 시간당 약 2통, 프로젝트 팀원 주소로만 발송된다.
- **Rate Limits → sign-ups and sign-ins: 150 / 5분 / IP**로 올려 둠. 한 사무실에서 몰리면 같은 IP로 잡혀 막혔었다.
- 회사 SMTP를 연결하기 전에는 비밀번호 재설정 메일이 없다. 연결 후 `config.js`의 `EMAIL_LINK: true`로 이메일 로그인 링크 버튼을 켤 수 있다.
- 가입 문제 진단 SQL: `auth.users` ⟕ `profiles`로 인증 여부·role·linked 확인, `allowed_emails` ⟕ `auth.users`로 "등록됐는데 계정 없는 사람" 확인.
- Free 플랜은 7일 동안 접속이 없으면 일시정지된다. 자동 백업이 없으니 가끔 CSV로 내보내 두도록 안내한다.
- 사이트는 사내망이 아니라 인터넷에 열려 있다(집·모바일 접속 가능). 내용은 로그인 + 등록된 계정만 볼 수 있다.

## 8. Figma 문서화 (AX과제)

기능을 크게 바꾸면 AX과제 파일의 섹션 3182:7을 함께 갱신한다. 양식은 다음과 같다.
- 어두운 섹션 배경
- 헤더: 제목 60 Bold + 한 줄 요약(오픈일은 연두색) + 4칸 카드(주요 기능 / 구축 방식 / 운영·권한 / 다음 단계) + 데모 데이터 각주
- 캡처 2×2: 위 라이트, 아래 다크. 이미지 FIT. 캡션은 "번호 화면명 모드 · 설명"
- 연두색 "디지털/기업 허브 바로가기 →" 버튼

캡처는 1440×1178 뷰포트, 2배율로 찍어 이미지 레이어 Fill만 교체한다. 글꼴은 Pretendard.

## 9. 남은 일 (제안했으나 미착수)

- 월간 AX 리포트 자동 생성
- 보완 요청·새 공지 알림 (메일 서버 연결 후)
- 기존 DX 현황판의 AX 진행 현황 데이터 이관 (CSV 받으면)
- 모바일 홈에 업무관리 바로가기 노출 여부 확인

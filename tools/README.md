# tools — 시험 도구 (사이트 동작과 무관, 배포 제외)

수정한 뒤 실서비스에 올리기 전에, 이 작업 환경 안에서 DB 규칙과 화면을 확인하는 도구다.
실제 Supabase·사이트에는 접속하지 않는다. 모든 데이터는 데모용이다(팀원 이름은 가명, 실제 값은 2026년 4~10월 AI 이미지 수치뿐).

## 1. DB 규칙 시험 — `tools/pg/`

로컬 Postgres 16에 Supabase를 흉내 낸 스키마(`mock-supabase.sql`)를 만들고 실제 `supabase/*.sql`을 실행한 뒤, 권한 점검(`rls-check.sql`, 65개 항목)을 돌린다.

```bash
tools/pg/run-sql-test.sh                                  # 새 설치: schema.sql ×2 → seed.sql → 권한 점검
tools/pg/run-sql-test.sh --from <커밋> supabase/upgrade-007-xxx.sql   # 운영 DB 재현 후 업그레이드 ×2 → 권한 점검
tools/pg/run-sql-test.sh --stop                           # 시험용 Postgres 끄기
```

- 결과 표 맨 아래가 `fail 0`이면 통과.
- `--from <커밋>`: 그 커밋의 `schema.sql`+`seed.sql`로 "운영 DB와 같은 상태"를 만든 뒤 업그레이드 파일을 두 번(재실행 안전 확인) 실행하고, 현재 `schema.sql`도 다시 실행해 본다. 새 upgrade를 만들 때는 **schema.sql에 반영하기 전 커밋**(= 현재 운영 상태)을 넣는다.
- 새 권한 규칙을 만들면 `rls-check.sql`에 `pg_temp.expect('항목', 'SQL', 통과해야하면 true)` 한 줄을 추가한다.
- 시험 DB 위치: `/tmp/hub-pgtest` (환경변수 `PGTEST_DIR`, `PGTEST_PORT`로 바꿀 수 있음).

## 2. 화면 점검 — `tools/smoke/`

Playwright(Chromium)로 저장소 파일을 그대로 열고, `vendor/supabase-2.117.3.js`만 가짜 Supabase(`stub-supabase.js`, 메모리 데이터)로 바꿔 끼운다.

```bash
node tools/smoke/smoke.js                     # 관리자·작성자(디지털·정규직)·열람 × 화면 8개 × PC·모바일 + 폼 열기 + 승인 대기·로그인·비밀번호 만들기
node tools/smoke/smoke.js --shots <폴더>       # 관리자 화면 라이트·다크·모바일 캡처도 저장
node tools/smoke/capture.js <폴더> [표시 이름]  # Figma AX과제용 캡처 4장 (2880×2356)
```

- `결과: 통과`가 나오면 끝. 문제가 있으면 목록이 나오고 종료 코드 1.
- 점검 항목: 페이지 오류·콘솔 오류 0건, 390px에서 가로 스크롤 없음, 각 화면 제목 렌더, 홈 계절 배너(글귀 30~50자·수채화 캔버스·다시 그려도 유지), AX 실적 댓글(권한별 입력창·등록), AI 이미지 제출 현황(미제출·보완 요청 표시, 안내 문구 복사), 엑셀 내보내기(권한별 버튼, CSV 머리글·BOM, 전체 백업 ZIP 구조·CRC), 권한별 폼 열림, 사용자 관리는 관리자만, 틀린 초대 코드 안내, 초대 코드 대문자·공백 정리.
- 가짜 계정: URL `?role=admin|partner|viewer|pending&co=tribe|corp|dx&name=…`, 로그인 전 화면은 `?nosession=1`. 시험 코드에서 `window.__DB`로 데이터를 읽고 바꿀 수 있다.
- 새 화면·폼을 만들면 `smoke.js`의 `ROUTES`·`FORMS`에 추가한다. 새 테이블을 쓰면 `stub-supabase.js`의 `DB`에 데모 데이터를 넣는다.

## 3. Figma 캡처 교체

`capture.js`로 만든 4장을 AX과제 파일 섹션 3182:7의 이미지 레이어(01~04)에 Fill로 교체한다. 데모 데이터 캡처이므로 헤더 각주를 유지한다. 실제 사이트 캡처로 바꾸면 각주를 지운다.

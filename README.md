# DX 협력사 허브

DX디자인팀과 협력사가 함께 쓰는 사이트입니다. 공지사항, 협력사 팀원 휴가 일정, 월별 AX 실적 제출과 첨부 검토를 한곳에서 관리합니다.

- **화면**: 정적 HTML/JS (빌드 없음) → Vercel에 그대로 배포
- **DB · 로그인 · 첨부**: Supabase (Postgres + Auth + Storage)
- **권한**: DB의 RLS 규칙이 강제합니다. 화면을 우회해 API를 직접 호출해도 같은 규칙이 적용됩니다.

| 역할 | 할 수 있는 일 |
|---|---|
| DX 관리자 (`admin`) | 전부. 공지 작성, 실적 검토(확인 완료/보완 요청), 협력사·사용자 관리 |
| 협력사 (`partner`) | 모든 내용 열람 + **자기 회사의** 팀원·휴가·실적 작성, 실적 첨부 업로드 |
| 열람 전용 (`viewer`) | 열람만 |
| 미등록 | 로그인은 되지만 '승인 대기' 화면만 보임 |

---

## 설치 (처음 한 번, 약 20분)

### 1. Supabase 프로젝트 만들기
1. https://supabase.com 에서 로그인 → **New project**
2. Region은 **Northeast Asia (Seoul)** 을 고릅니다.
3. DB 비밀번호는 안전한 곳에 보관합니다(앱에는 쓰이지 않음).

### 2. DB 만들기
1. 왼쪽 메뉴 **SQL Editor** → New query
2. `supabase/schema.sql` 전체를 붙여 넣고 **Run**
3. `supabase/seed.sql` 을 열어 `YOUR_EMAIL@medialog.co.kr` 를 **본인(첫 관리자) 이메일**로 바꾼 뒤 붙여 넣고 **Run**
   - 협력사 3곳과 기존 현황판의 2026년 4~10월 협력사 실적이 들어갑니다.

### 3. 로그인 설정
**Authentication → URL Configuration**
- **Site URL**: 배포 후 받은 주소 (예: `https://dx-partner-hub.vercel.app`)
- **Redirect URLs**: 위 주소와 로컬 확인용 `http://localhost:3000` 추가

**로그인 방식은 두 가지이고, 둘 다 화면에 있습니다.**

- **비밀번호 로그인 (바로 사용 가능, 추천)**
  관리자가 **Authentication → Users → Add user → Create new user** 에서 이메일과 임시 비밀번호를 넣고 **Auto Confirm User** 를 체크해 만듭니다. 받은 사람은 로그인 후 **내 계정**에서 비밀번호를 바꿉니다.
- **이메일 로그인 링크 (메일 서버 설정 필요)**
  Supabase 기본 메일 발송은 프로젝트 팀원 주소로만, 시간당 몇 통만 보낼 수 있습니다. 협력사에게 링크를 보내려면 **Authentication → Emails → SMTP Settings** 에 회사 메일 서버나 Resend 같은 발송 서비스를 연결하세요.

### 4. 첫 관리자 계정
1. Authentication → Users → **Add user** 로 본인 계정을 만듭니다 (seed.sql 에 넣은 이메일과 같아야 함).
2. 배포한 사이트에 로그인하면 DX 관리자로 들어갑니다.

### 5. `config.js` 채우기
**Project Settings → API** (또는 **API Keys**) 에서 복사해 `config.js` 에 넣습니다.

```js
window.HUB_CONFIG = {
  SUPABASE_URL: 'https://abcdefgh.supabase.co',
  SUPABASE_ANON_KEY: 'eyJ... 또는 sb_publishable_...'
};
```

> anon(publishable) 키는 공개돼도 괜찮은 키입니다. **service_role / secret 키는 절대 넣지 마세요.**

### 6. GitHub → Vercel 배포
1. 이 폴더를 GitHub 저장소로 올립니다.
2. https://vercel.com → **Add New → Project** → 저장소 Import
3. Framework Preset: **Other**, Build Command: 비움, Output Directory: 비움 → **Deploy**
4. 받은 주소를 3단계의 Site URL / Redirect URLs 에 넣습니다.

이후에는 GitHub에 push 할 때마다 자동으로 다시 배포됩니다.

> 회사 GitLab을 쓰려면: GitLab.com 저장소는 Vercel에 바로 연결됩니다. 사내 설치형 GitLab은 Vercel 연결이 제한될 수 있어, 그때는 GitHub를 쓰거나 GitLab CI에서 `vercel deploy` 를 실행하는 방식으로 배포합니다.

### 로컬에서 확인
```bash
python3 -m http.server 3000
```
브라우저에서 http://localhost:3000 을 엽니다.

---

## 운영

### 협력사 담당자 추가
1. 사이트 **사용자 관리 → 사용자 등록**: 이메일, 이름, 역할 `협력사`, 소속 협력사 선택
2. 비밀번호 방식이면 Supabase **Authentication → Users → Add user** 로 계정 생성 후 임시 비밀번호 전달
   (순서는 상관없습니다. 등록 전에 먼저 로그인한 사람은 '승인 대기'에 뜨고, 등록하는 즉시 권한이 붙습니다.)
3. 접근을 끊을 때는 사용자 관리에서 **접근 해제**. 계정은 남지만 아무것도 볼 수 없게 됩니다.

### AX 실적 흐름
1. 협력사가 **실적 제출**: AI 이미지 제작 건수, AI 활용 제작 건수, 전체 이미지 제작 수, 증빙 첨부
2. DX팀이 첨부 확인 → **확인 완료** 또는 **보완 요청**(의견 필수)
3. 협력사가 다시 제출하면 자동으로 **검토 대기**로 돌아갑니다.
4. 적용률 = AI 이미지 제작 건수 ÷ 전체 이미지 제작 수 (기존 현황판과 같은 기준)

### 첨부파일
- 비공개 저장소(`attachments` 버킷). 로그인한 등록 사용자만 1시간짜리 임시 링크로 열 수 있습니다.
- 엑셀·PPT·ZIP 포함 모든 형식, 파일당 50MB (Supabase 무료 플랜 상한).
- 협력사는 `ax/<자기 회사>/` 폴더에만 올릴 수 있습니다.

### 공휴일
`app.js` 맨 위 `HOLIDAYS` 에 2026년 공휴일이 들어 있습니다. 매년 초 다음 해 공휴일을 추가하세요.

### 무료 플랜에서 알아둘 것
- DB 500MB, 파일 1GB, 파일당 50MB
- **7일 동안 아무도 접속하지 않으면 프로젝트가 일시정지**됩니다. 대시보드에서 Restore 하면 데이터는 그대로 돌아옵니다. 상시 운영이 중요하면 Pro 플랜을 고려하세요.
- 자동 백업은 Pro 플랜부터입니다. 무료 플랜에서는 가끔 **Table Editor → Export to CSV** 로 테이블을 내려받아 두세요.

---

## 파일 구조
```
index.html            화면 틀과 스타일 (라이트/다크 토글 포함)
app.js                화면 동작, Supabase 연결
config.js             Supabase URL / anon 키  ← 직접 채움
vendor/               supabase-js 2.117.3 브라우저 빌드 (CDN 차단된 사내망 대비)
supabase/schema.sql   테이블, 권한(RLS), 트리거, 첨부 저장소
supabase/seed.sql     협력사 3곳, 첫 관리자, 2026년 4~10월 실적
vercel.json           보안 헤더, 검색 노출 차단
```

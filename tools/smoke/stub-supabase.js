/* 가짜 Supabase (시험 전용). vendor/supabase-2.117.3.js 요청을 이 파일로 바꿔 끼워 화면을 돌린다.
 * 모든 데이터는 데모용이다. 팀원 이름은 가명이고, 실제 값은 2026년 4~10월 AI 이미지 수치뿐이다.
 *
 * URL 파라미터
 *   ?role=admin|partner|viewer|pending   로그인 계정 권한 (기본 admin)
 *   ?co=tribe|corp|dx                    partner 소속 (기본 tribe)
 *   ?name=관리자                          화면에 표시될 이름
 *   ?nosession=1                         로그인 전 화면(로그인·비밀번호 만들기)
 *   ?missing=user_state,ax_comments      아직 DB 업그레이드를 안 한 상태 흉내(그 표를 읽고 쓰면 오류)
 * 시험 코드에서는 window.__DB 로 메모리 데이터를 읽고 쓸 수 있다.
 */
(function () {
  const q = new URLSearchParams(location.search);
  const role = q.get('role') || 'admin', co = q.get('co') || 'tribe';
  const me = { id: 'u1', email: 'me@test.kr', name: q.get('name') || '관리자', role, company_id: role === 'partner' ? co : null, avatar_path: null, linked: role !== 'pending', created_at: '2026-11-01T00:00:00Z' };

  const ax = [], rv = [];
  const legacy = { tribe: [[11,26],[15,16],[9,34],[26,31],[70,113],[40,63],[41,51]], corp: [[5,12],[10,50],[7,37],[6,32],[24,68],[9,33],[16,48]] };
  for (const [c, rows] of Object.entries(legacy)) rows.forEach(([a, t], i) => {
    const m = `2026-${String(i + 4).padStart(2, '0')}`, n = `2026-${String(i + 5).padStart(2, '0')}`;
    ax.push({ id: `${c}_${m}`, company_id: c, member_id: null, month: m, ai_image: a, ai_work: null, total: t, note: '기존 현황판 이관', attachments: [], submitted_by: null, submitted_at: `${n}-03T00:00:00+00:00`, created_at: `${n}-03T00:00:00+00:00` });
    rv.push({ report_id: `${c}_${m}`, status: 'approved', comment: '', reviewed_by: null, reviewed_at: `${n}-05T00:00:00+00:00` });
  });
  const rep = (id, mid, c, a, w, t, at, files) => ax.push({ id, member_id: mid, company_id: c, month: '2026-11', ai_image: a, ai_work: w, total: t, note: '', attachments: files || [], submitted_by: 'u2', submitted_at: at, created_at: at });
  rep('m1_2026-11', 'm1', 'tribe', 12, 6, 20, '2026-11-05T01:00:00+00:00', [{ path: 'ax/tribe/a.png', name: '증빙.png', type: 'image/png', size: 1 }]);
  rv.push({ report_id: 'm1_2026-11', status: 'approved', comment: '', reviewed_by: 'u1', reviewed_at: '2026-11-06T01:00:00+00:00' });
  rep('m2_2026-11', 'm2', 'tribe', 8, 3, 15, '2026-11-05T02:00:00+00:00');
  // 알림 시험용: 다른 관리자(u5)가 2시간 전에 보완 요청 → 디지털 소속 작성자에게 새 알림
  rv.push({ report_id: 'm2_2026-11', status: 'revise', comment: '증빙 파일을 첨부해 주세요.', reviewed_by: 'u5', reviewed_at: new Date(Date.now() - 7200e3).toISOString() });
  rep('m4_2026-11', 'm4', 'corp', 5, 2, 18, '2026-11-07T02:00:00+00:00', [{ path: 'ax/corp/b.pdf', name: '실적.pdf', type: 'application/pdf', size: 1 }]);

  const P = (id, title, summary, part, status, usable, tools, category, priority, s, e, files, upd, created, by) => ({ id, title, summary, body: '진행 과정 메모\n참고: https://example.com', part, company_id: 'dx', status, usable, tools, category, priority, start_date: s, end_date: e, attachments: files, created_by: by || 'u1', created_at: created || upd, updated_at: upd });
  const V = (id, mid, c, type, s, e) => ({ id, member_id: mid, company_id: c, type, start_date: s, end_date: e, memo: '', created_by: 'u1', created_at: '2026-11-01T00:00:00Z' });

  const DB = {
    companies: [{ id: 'dx', name: 'DX디자인팀', sort: 0, kind: 'internal' }, { id: 'tribe', name: '디지털', sort: 1, kind: 'partner' }, { id: 'corp', name: '기업', sort: 2, kind: 'partner' }],
    profiles: [me,
      { id: 'u2', email: 'digital@test.kr', name: '디지털 담당', role: 'partner', company_id: 'tribe', linked: true, created_at: '2026-11-06T00:00:00Z' },
      { id: 'u3', email: 'corp@test.kr', name: '기업 담당', role: 'partner', company_id: 'corp', linked: true, created_at: '2026-11-06T00:00:00Z' },
      { id: 'u5', email: 'admin2@test.kr', name: 'DX 관리자 B', role: 'admin', company_id: null, linked: true, created_at: '2026-11-06T00:00:00Z' },
      { id: 'u4', email: 'walkin@test.kr', name: '', role: 'pending', company_id: null, linked: false, created_at: '2026-11-07T00:00:00Z' }],
    allowed_emails: [
      { email: 'me@test.kr', name: me.name, role: 'admin', company_id: null, invite_code: 'AAAAAA' },
      { email: 'digital@test.kr', name: '디지털 담당', role: 'partner', company_id: 'tribe', invite_code: 'BBBBBB' },
      { email: 'corp@test.kr', name: '기업 담당', role: 'partner', company_id: 'corp', invite_code: 'CCCCCC' },
      { email: 'admin2@test.kr', name: 'DX 관리자 B', role: 'admin', company_id: null, invite_code: 'DDDDDD' },
      { email: 'later@test.kr', name: '가입 전 작성자', role: 'partner', company_id: 'corp', invite_code: 'TEST22' }],
    members: [
      { id: 'm1', name: '디자이너 A', company_id: 'tribe', title: '2D', part: 'design' }, { id: 'm2', name: '디자이너 B', company_id: 'tribe', title: '3D', part: 'design' },
      { id: 'm3', name: '퍼블리셔 C', company_id: 'tribe', title: '', part: 'publishing' }, { id: 'm4', name: '디자이너 D', company_id: 'corp', title: '상품상세', part: 'design' },
      { id: 'm5', name: '퍼블리셔 E', company_id: 'corp', title: '', part: 'publishing' }, { id: 'm6', name: '팀원 F', company_id: 'dx', title: '', part: 'design' },
      { id: 'm7', name: '디자이너 G', company_id: 'corp', title: '배너', part: 'design' }],
    notices: [
      { id: 'n1', title: '11월 AI 이미지 실적 제출 안내', body: '디자인 파트는 11월 실적을 12월 5일까지 제출해 주세요.\n\n1) AI 이미지 제작 메뉴에서 본인 이름을 골라 건수를 입력합니다.\n2) 증빙 파일(작업 화면 캡처나 결과물)을 함께 첨부합니다.\n3) 보완 요청을 받으면 알림에서 확인하고 다시 제출합니다.\n\n문의: https://example.com/help', category: 'must', pinned: true, attachments: [{ path: 'notices/thumb-demo.png', name: '제출 안내.png', type: 'image/png', size: 1 }], created_by: 'u1', created_at: '2026-11-07T00:00:00Z', updated_at: '2026-11-07T00:00:00Z' },
      { id: 'n2', title: '디지털/기업 허브 오픈 안내', body: '', category: 'notice', pinned: false, attachments: [{ path: 'notices/guide.pdf', name: '사용 가이드.pdf', type: 'application/pdf', size: 1 }], created_by: 'u1', created_at: '2026-11-06T00:00:00Z', updated_at: '2026-11-06T00:00:00Z' },
      { id: 'n3', title: 'AX 실적 작성 가이드 (파트·상태·활용 가능 표시)', body: '', category: 'guide', pinned: false, attachments: [], created_by: 'u1', created_at: '2026-11-06T00:00:00Z', updated_at: '2026-11-06T00:00:00Z' }],
    vacations: [
      V('v1', 'm1', 'tribe', 'annual', '2026-11-09', '2026-11-10'), V('v2', 'm4', 'corp', 'am', '2026-11-09', '2026-11-09'), V('v3', 'm3', 'tribe', 'annual', '2026-11-12', '2026-11-12'),
      V('v4', 'm6', 'dx', 'pm', '2026-11-13', '2026-11-13'), V('v5', 'm2', 'tribe', 'annual', '2026-11-16', '2026-11-18'), V('v6', 'm5', 'corp', 'annual', '2026-11-20', '2026-11-20'),
      V('v7', 'm1', 'tribe', 'quarter', '2026-11-24', '2026-11-24'), V('v8', 'm6', 'dx', 'annual', '2026-11-27', '2026-11-27'), V('v9', 'm4', 'corp', 'comp', '2026-11-02', '2026-11-03')],
    ax_reports: ax, ax_reviews: rv,
    ax_posts: [
      P('p6', '[공통] 디지털/기업 협력사·팀원 허브 사이트 구축', '공지·휴가·AX 실적·AI 이미지 실적을 협력사와 함께 관리하는 사이트 구축·배포', 'common', 'doing', false, ['Claude Code'], 'output', 'core', '2026-11-06', '2026-11-30', [], '2026-11-07T09:00:00Z', '2026-11-06T09:00:00Z'),
      P('p1', '[공통] 협력사 이벤트 제작 가이드 영상', 'AI를 처음 쓰는 협력사가 기획서부터 이벤트 초안·검수까지 따라 할 수 있도록 3분 영상과 공유 페이지 제작', 'common', 'done', true, ['Claude Code', 'ChatGPT Work', 'Figma Make', 'Codex'], 'guide', 'high', '2026-10-26', '2026-10-29', [{ path: 'posts/a.mp4', name: 'U+이벤트_AI제작가이드.mp4', type: 'video/mp4', size: 1 }], '2026-11-02T01:00:00Z'),
      P('p3', '[공통] U+ 이벤트 제작실 PC·MW 초안 자동 조립 도구 구축·배포', '기획서 문구를 U+ 이벤트 디자인 모듈로 조립하는 PC·MW 초안 제작 도구와 설치·검수 가이드 배포', 'common', 'done', true, ['Claude', 'ChatGPT Work', 'Figma Make'], 'output', 'core', '2026-08-07', '2026-10-21', [{ path: 'posts/b.zip', name: 'uplus-event-maker.zip', type: 'application/zip', size: 1 }], '2026-10-27T01:00:00Z'),
      P('p4', '[기업] 기업 홈페이지 벤치마킹·분석 도구 Design Radar 구축·고도화', '국내외 기업 홈페이지의 PC·모바일 화면과 디자인 분석을 월별로 축적하고, U+ 적용 아이디어로 연결하는 도구', 'design', 'done', false, ['Codex'], 'study', 'normal', '2026-07-26', '2026-10-21', [], '2026-11-02T01:00:00Z'),
      P('p2', '[기업] 상품상세 아이콘 파인더 개발·배포', '선형 SVG 아이콘 검색부터 색상·크기 조정, Figma 반입까지 연결하는 아이콘 파인더 제작·배포', 'design', 'done', true, ['Codex'], 'output', 'normal', '2026-06-27', '2026-06-29', [{ path: 'posts/c.zip', name: 'lguplus_icon_finder_v3.zip', type: 'application/zip', size: 1 }], '2026-10-22T01:00:00Z'),
      P('p7', '[퍼블] 배너 검수기 플러그인 프로토타입', '배너 이미지 명도대비와 디자인 가이드 위반 사항을 자동으로 검사', 'publishing', 'test', false, ['Claude', 'ChatGPT'], 'case', 'high', '2026-11-03', '2026-11-14', [], '2026-11-05T01:00:00Z', '2026-11-03T01:00:00Z', 'u2')],
    ax_comments: [
      { id: 'c1', post_id: 'p1', body: '영상 잘 봤습니다. 기획서 넣는 부분을 조금 더 천천히 보여 주시면 좋겠어요.', created_by: 'u2', created_at: '2026-11-03T02:10:00Z', updated_at: '2026-11-03T02:10:00Z' },
      { id: 'c2', post_id: 'p1', body: '다음 버전에 반영할게요. 참고 링크: https://example.com/guide', created_by: 'u1', created_at: '2026-11-03T05:40:00Z', updated_at: '2026-11-03T06:10:00Z' },
      { id: 'c3', post_id: 'p7', body: '명도대비 기준은 KWCAG 4.5:1로 잡으면 될까요?', created_by: 'u3', created_at: '2026-11-06T01:00:00Z', updated_at: '2026-11-06T01:00:00Z' },
      // 알림 시험용: 방금(1시간 전) 달린 댓글 → 처음 열면 새 알림 1건
      { id: 'c4', post_id: 'p6', body: '협력사에서도 잘 쓰고 있습니다. 모바일에서도 보기 편해요.', created_by: 'u3', created_at: new Date(Date.now() - 3600e3).toISOString(), updated_at: new Date(Date.now() - 3600e3).toISOString() }
    ]
  };
  window.__DB = DB;

  const KEY = { ax_reviews: 'report_id', allowed_emails: 'email', user_state: 'user_id' };
  const missing = (q.get('missing') || '').split(',').filter(Boolean);
  const uid = () => 'x' + Math.random().toString(36).slice(2, 10);
  function qb(table) {
    let op = 'select', payload = null, single = false; const filters = [];
    const b = {
      select() { return b; }, order() { return b; }, limit() { return b; }, maybeSingle() { single = true; return b; },
      eq(c, v) { filters.push([c, v]); return b; },
      insert(p) { op = 'insert'; payload = p; return b; }, update(p) { op = 'update'; payload = p; return b; },
      upsert(p) { op = 'upsert'; payload = p; return b; }, delete() { op = 'delete'; return b; },
      then(res, rej) {
        const rows = DB[table] || (DB[table] = []), key = KEY[table] || 'id';
        if (missing.includes(table)) return Promise.resolve({ data: null, error: { code: '42P01', message: `relation "public.${table}" does not exist` } }).then(res, rej);
        const hit = r => filters.every(([c, v]) => r[c] === v); let data;
        if (op === 'select') { data = rows.filter(hit).map(r => ({ ...r })); if (single) data = data[0] || null; }
        else if (op === 'insert' || op === 'upsert') {
          const now = new Date().toISOString();
          const r = { id: uid(), created_at: now, updated_at: now, created_by: me.id, ...payload };
          if (table === 'ax_reports') { r.submitted_by = me.id; r.submitted_at = now; }
          if (table === 'ax_reviews') { r.reviewed_by = me.id; r.reviewed_at = now; }
          if (table === 'allowed_emails' && !r.invite_code) r.invite_code = 'NEW234';
          if (table === 'user_state') { delete r.id; delete r.created_by; r.user_id = me.id; r.alerts_seen_at = now; }
          const i = rows.findIndex(x => x[key] === r[key]);
          if (op === 'upsert' && i >= 0) rows[i] = { ...rows[i], ...r }; else rows.push(r);
          data = [r];
        } else if (op === 'update') { data = rows.filter(hit); data.forEach(r => Object.assign(r, payload, { updated_at: new Date().toISOString() })); }
        else { data = rows.filter(hit); DB[table] = rows.filter(r => !hit(r)); }
        return Promise.resolve({ data, error: null }).then(res, rej);
      }
    };
    return b;
  }
  const tiny = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="#9ab"/></svg>');
  // 대표 공지 썸네일용 데모 그림 (경로에 thumb 가 들어간 파일)
  const demoThumb = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe3d3"/><stop offset="1" stop-color="#dfe6ff"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><circle cx="318" cy="76" r="46" fill="#ffc98a" opacity=".85"/><rect x="58" y="92" width="186" height="140" rx="16" fill="#fff" opacity=".92"/><rect x="80" y="118" width="96" height="12" rx="6" fill="#2d5bea"/><rect x="80" y="144" width="142" height="9" rx="4.5" fill="#c9d2e3"/><rect x="80" y="164" width="120" height="9" rx="4.5" fill="#c9d2e3"/><rect x="80" y="184" width="134" height="9" rx="4.5" fill="#c9d2e3"/><path d="M262 232l44-70 34 44 20-24 40 50z" fill="#8fb3ff" opacity=".9"/><circle cx="286" cy="150" r="13" fill="#fff" opacity=".9"/></svg>');
  const urlOf = p => /thumb/.test(p) ? demoThumb : tiny;
  window.supabase = { createClient() { return {
    from: qb,
    auth: {
      getSession: async () => ({ data: { session: q.get('nosession') ? null : { user: { id: me.id, email: me.email } } } }),
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
      signOut: async () => ({}), updateUser: async () => ({ error: null }),
      signInWithPassword: async () => ({ error: { message: 'Invalid login credentials' } }),
      signInWithOtp: async () => ({ error: null }),
      signUp: async (a) => {
        window.__signup = a;
        const al = DB.allowed_emails.find(x => x.email === a.email);
        const code = String(a.options?.data?.invite_code || '').trim().toUpperCase();
        if (!al || al.invite_code !== code) return { data: null, error: { message: 'Database error saving new user', status: 500 } };
        return { data: { user: { identities: [{}] }, session: null }, error: null };
      }
    },
    rpc: async (fn, args) => {
      if (fn === 'approve_user') { const p = DB.profiles.find(x => x.email === args.p_email), a = DB.allowed_emails.find(x => x.email === args.p_email); if (p && a) Object.assign(p, { role: a.role, company_id: a.company_id, linked: true }); }
      if (fn === 'set_my_avatar') me.avatar_path = args.p_path;
      window.__rpc = { fn, args }; return { error: null };
    },
    storage: { from() { return {
      createSignedUrls: async ps => ({ data: ps.map(p => ({ path: p, signedUrl: urlOf(p) })) }),
      createSignedUrl: async p => ({ data: { signedUrl: urlOf(p) } }),
      upload: async () => ({ error: null }), remove: async () => ({})
    }; } },
    channel() { return { on() { return this; }, subscribe() { return this; } }; }
  }; } };
})();

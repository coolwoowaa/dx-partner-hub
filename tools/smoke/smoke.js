// 화면 점검: 모든 계정 유형 × 모든 화면을 돌며 오류·가로 스크롤·주요 폼 열림을 확인한다.
//   node tools/smoke/smoke.js                 점검만
//   node tools/smoke/smoke.js --shots <폴더>   관리자 화면을 라이트·다크·모바일로 캡처도 저장
// 통과하면 "결과: 통과", 문제가 있으면 목록을 출력하고 종료 코드 1.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { routeHub, watchErrors, HOST } = require('./serve');

const ROUTES = ['home', 'alerts', 'notice', 'leave', 'ax', 'aiimg', 'team', 'users', 'account'];
const ACCOUNTS = [
  { label: '관리자', q: 'role=admin' },
  { label: '작성자(디지털)', q: 'role=partner&co=tribe' },
  { label: '작성자(정규직)', q: 'role=partner&co=dx' },
  { label: '열람 전용', q: 'role=viewer' },
  { label: '관리자(DB 업그레이드 전)', q: 'role=admin&missing=user_state' },
];
const FORMS = ['post-new', 'vac-new', 'ax-new', 'mem-new', 'notice-new', 'user-new', 'exp-open'];
const shotsDir = (() => { const i = process.argv.indexOf('--shots'); return i > 0 ? process.argv[i + 1] : null; })();

(async () => {
  // LANG: 시험 환경에 언어 설정이 없으면 한글 다운로드 파일 이름이 'download'로 바뀌므로 UTF-8로 지정한다
  const b = await chromium.launch({ env: { ...process.env, LANG: process.env.LANG || 'C.UTF-8', LC_ALL: process.env.LC_ALL || 'C.UTF-8' } });
  const problems = [], notes = []; let lastZip = null;
  const fail = (who, msg) => problems.push(`[${who}] ${msg}`);

  for (const acc of ACCOUNTS) {
    for (const vp of [{ w: 1300, h: 900, tag: 'PC' }, { w: 390, h: 844, tag: '모바일' }]) {
      const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h } });
      const p = await ctx.newPage(); const errs = watchErrors(p); await routeHub(p);
      await p.goto(`${HOST}/?${acc.q}#home`); await p.waitForTimeout(500);
      const missingMode = /missing=/.test(acc.q);
      const canWrite = acc.label !== '열람 전용';
      // 알림: 처음에는 새 알림 숫자가 보이고, 알림 화면을 열면 읽음 처리(이번 방문 동안은 '새' 표시 유지), 다시 오면 표시 없음
      const badge = () => p.evaluate(() => { const e = document.querySelector('#nav-alert-cnt'); return e.hidden ? 0 : Number(e.textContent); });
      const expNew = /co=tribe/.test(acc.q) ? 2 : 1;   // 데모 데이터: 내 글의 새 댓글 1건 (+ 디지털 소속이면 보완 요청 1건)
      if ((await badge()) !== expNew) fail(`${acc.label}/${vp.tag}`, `처음 새 알림 숫자가 ${await badge()} (데모 데이터 ${expNew}건)`);
      if (!(await p.$('.dash-head .al-link'))) fail(`${acc.label}/${vp.tag}`, '홈에 새 알림 링크가 없음');
      await p.evaluate(() => location.hash = 'alerts'); await p.waitForTimeout(250);
      const al1 = await p.evaluate(() => ({ rows: document.querySelectorAll('.li.al').length, fresh: document.querySelectorAll('.li.al.new').length, saved: (window.__DB.user_state || []).length }));
      if (al1.fresh !== expNew) fail(`${acc.label}/${vp.tag}`, `알림 화면: 전체 ${al1.rows}건, 새 알림 ${al1.fresh}건 (새 알림 ${expNew}건이어야 함)`);
      const todoN = await p.$$eval('.li.al[data-act="ax-view"]', l => l.length);
      if (todoN !== expNew - 1) fail(`${acc.label}/${vp.tag}`, `보완 요청 알림이 ${todoN}건 (${expNew - 1}건이어야 함)`);
      if (missingMode ? al1.saved !== 0 : al1.saved !== 1) fail(`${acc.label}/${vp.tag}`, `읽음 시각 저장 기록이 ${al1.saved}건`);
      if ((await badge()) !== 0) fail(`${acc.label}/${vp.tag}`, '알림 화면을 열어도 숫자가 남아 있음');
      await p.click('.li.al.new[data-act="post-view"]', { timeout: 3000 }).catch(() => {}); await p.waitForTimeout(150);
      if (!(await p.$('#modal:not([hidden]) #cmts'))) fail(`${acc.label}/${vp.tag}`, '알림을 눌러도 해당 글이 열리지 않음');
      await p.keyboard.press('Escape'); await p.waitForTimeout(80);
      await p.evaluate(() => location.hash = 'home'); await p.waitForTimeout(150);
      await p.evaluate(() => location.hash = 'alerts'); await p.waitForTimeout(200);
      if (await p.$('.li.al.new')) fail(`${acc.label}/${vp.tag}`, "읽은 알림에 '새' 표시가 다시 나옴");
      if (missingMode) {
        if (/일부 데이터를 불러오지 못했습니다/.test(await p.textContent('#view'))) fail(`${acc.label}/${vp.tag}`, 'DB 업그레이드 전 상태에서 오류 안내가 뜸');
        if (!/이 기기에만 저장/.test(await p.textContent('#view'))) fail(`${acc.label}/${vp.tag}`, 'DB 업그레이드 전 안내(이 기기에만 저장)가 없음');
        await p.reload(); await p.waitForTimeout(500);
        if ((await badge()) !== 0) fail(`${acc.label}/${vp.tag}`, 'DB 업그레이드 전: 새로고침하면 읽은 알림이 다시 새 알림으로 나옴');
        errs.forEach(e => fail(`${acc.label}/${vp.tag}`, e)); await ctx.close(); continue;
      }
      await p.evaluate(() => location.hash = 'home'); await p.waitForTimeout(100);
      for (const r of ROUTES) {
        await p.evaluate(h => location.hash = h, r); await p.waitForTimeout(150);
        const sw = await p.evaluate(() => document.documentElement.scrollWidth);
        if (sw > vp.w + 1) fail(`${acc.label}/${vp.tag}`, `#${r} 가로 스크롤 생김 (폭 ${sw}px)`);
        if (r === 'users' && !acc.label.startsWith('관리자')) {
          const t = await p.textContent('#view');
          if (!/관리자만 볼 수 있는 메뉴/.test(t)) fail(`${acc.label}/${vp.tag}`, '#users 가 관리자 외 계정에 열림');
        } else if (!(await p.$('#view h1, #view .dash-head'))) fail(`${acc.label}/${vp.tag}`, `#${r} 제목이 렌더되지 않음`);
      }
      // 홈 계절 배너: 글귀 30~50자, 수채화 캔버스, 다시 그려도 같은 배너 유지(애니메이션이 끊기지 않게)
      await p.evaluate(() => location.hash = 'home'); await p.waitForTimeout(900);
      const ss = await p.evaluate(() => { const n = document.querySelector('.ss'); window.__ss = n;
        return n && { q: [...(n.querySelector('blockquote')?.textContent || '')].length, cv: n.querySelectorAll('.ss-art canvas').length }; });
      if (!ss) fail(`${acc.label}/${vp.tag}`, '홈 계절 배너가 없음');
      else { if (ss.q < 30 || ss.q > 50) fail(`${acc.label}/${vp.tag}`, `오늘의 글귀 길이 ${ss.q}자 (30~50자여야 함)`); if (!ss.cv) fail(`${acc.label}/${vp.tag}`, '수채화 캔버스가 그려지지 않음'); }
      // 홈 대표 공지: 필독+고정 공지가 맨 아래 공지사항 목록 왼쪽(모바일은 위)에 작은 카드로 보이고, 제목 반짝임·내용·썸네일이 있으며 누르면 공지가 열림
      const hn = await p.evaluate(() => { const n = document.querySelector('.hn'); if (!n) return null; const sh = n.querySelector('.shine'), img = n.querySelector('.hn-thumb img');
        const r = n.getBoundingClientRect(), l = n.parentElement.querySelector('.nlist').getBoundingClientRect(), view = document.querySelector('#view');
        return { title: sh?.textContent || '', anim: getComputedStyle(sh).animationName, body: (n.querySelector('.hn-text')?.textContent || '').length, img: !!(img && img.getAttribute('src')),
          h: Math.round(r.height), w: Math.round(r.width), lw: Math.round(l.width), bottom: n.closest('.dcard') === document.querySelector('.dash-grid').lastElementChild, left: r.right <= l.left + 1, above: r.bottom <= l.top + 1, last: !!n.closest('.dash-grid') && n.closest('.dcard').getBoundingClientRect().top > view.querySelector('.ptiles').getBoundingClientRect().bottom,
          dup: [...n.parentElement.querySelectorAll('.nlist .nt')].some(x => x.textContent.includes(sh.textContent)) }; });
      if (!hn) fail(`${acc.label}/${vp.tag}`, '홈에 대표 공지가 없음');
      else {
        if (!/11월 AI 이미지 실적 제출 안내/.test(hn.title)) fail(`${acc.label}/${vp.tag}`, `대표 공지 제목이 다름: ${hn.title}`);
        if (hn.anim !== 'hn-shine') fail(`${acc.label}/${vp.tag}`, `제목 반짝임이 적용되지 않음 (${hn.anim})`);
        if (hn.body < 40) fail(`${acc.label}/${vp.tag}`, '대표 공지 내용이 보이지 않음');
        if (!hn.last || !(vp.tag === 'PC' ? hn.left : hn.above)) fail(`${acc.label}/${vp.tag}`, `대표 공지 위치가 다름 (맨 아래 공지사항 목록의 ${vp.tag === 'PC' ? '왼쪽' : '위'}이어야 함)`);
        if (!hn.bottom) fail(`${acc.label}/${vp.tag}`, '공지사항 카드가 홈 맨 아래가 아님');
        if (hn.h > (vp.tag === 'PC' ? 260 : 170)) fail(`${acc.label}/${vp.tag}`, `대표 공지 카드가 너무 높음 (높이 ${hn.h}px)`);
        if (vp.tag === 'PC' && (hn.w < 684 || hn.lw < 240)) fail(`${acc.label}/${vp.tag}`, `대표 공지 가로 ${hn.w}px (684px 이상이어야 함), 오른쪽 목록 ${hn.lw}px (240px 이상)`);
        if (hn.dup) fail(`${acc.label}/${vp.tag}`, '대표 공지가 오른쪽 목록에도 중복으로 나옴');
        if (!hn.img) fail(`${acc.label}/${vp.tag}`, '대표 공지 썸네일이 불러와지지 않음');
        await p.click('.hn'); await p.waitForTimeout(150);
        if (!/홈 대표 공지/.test((await p.textContent('#modal .mh').catch(() => '')) || '')) fail(`${acc.label}/${vp.tag}`, '대표 공지 제목을 눌러도 공지가 열리지 않음');
        await p.keyboard.press('Escape'); await p.waitForTimeout(80);
      }
      await p.click('.wkday:nth-child(3)'); await p.waitForTimeout(150);
      if (!(await p.evaluate(() => window.__ss && window.__ss === document.querySelector('.ss')))) fail(`${acc.label}/${vp.tag}`, '홈을 다시 그릴 때 계절 배너가 새로 만들어짐');
      // AX 실적 댓글: 열람 전용은 입력창 없음, 작성 권한이 있으면 등록되고 목록에 보임
      await p.evaluate(() => location.hash = 'ax'); await p.waitForTimeout(150);
      await p.click('#post-list tr[data-id="p1"]'); await p.waitForTimeout(150);
      const cm = await p.evaluate(() => ({ n: document.querySelectorAll('#cmts .cmt').length, form: !!document.querySelector('#cmt-body'), focus: document.activeElement?.id }));
      if (cm.n !== 2) fail(`${acc.label}/${vp.tag}`, `댓글 ${cm.n}개 보임 (데모 데이터 2개)`);
      if (cm.form !== (acc.label !== '열람 전용')) fail(`${acc.label}/${vp.tag}`, `댓글 입력창 표시가 권한과 다름 (${cm.form})`);
      if (cm.focus === 'cmt-body') fail(`${acc.label}/${vp.tag}`, '글을 열자마자 댓글 입력창으로 이동함');
      if (cm.form) {
        await p.fill('#cmt-body', '시험 댓글입니다'); await p.keyboard.press('Control+Enter'); await p.waitForTimeout(400);
        const after = await p.evaluate(() => [...document.querySelectorAll('#cmts .ct')].map(x => x.textContent));
        if (!after.includes('시험 댓글입니다')) fail(`${acc.label}/${vp.tag}`, '댓글 등록이 목록에 반영되지 않음');
        const sw2 = await p.evaluate(() => document.documentElement.scrollWidth);
        if (sw2 > vp.w + 1) fail(`${acc.label}/${vp.tag}`, `댓글 창에서 가로 스크롤 생김 (폭 ${sw2}px)`);
        await p.evaluate(() => { window.__DB.ax_comments = window.__DB.ax_comments.filter(c => c.body !== '시험 댓글입니다'); });
      }
      await p.keyboard.press('Escape'); await p.waitForTimeout(80);
      // AI 이미지 제출 현황: 미제출·보완 요청 이름이 보이고, 작성 권한이 있으면 안내 문구가 복사됨
      await p.evaluate(() => { location.hash = 'aiimg'; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => { window.__clip = t; } } }); }); await p.waitForTimeout(200);
      const subm = (await p.textContent('.subm').catch(() => '')) || '';
      if (!/디자이너 G/.test(subm) || !/보완 요청/.test(subm)) fail(`${acc.label}/${vp.tag}`, `제출 현황에 미제출·보완 요청이 안 보임: ${subm.slice(0, 80)}`);
      const copyBtn = await p.$('.sec-h [data-act="remind-copy"]');
      if (!!copyBtn !== canWrite) fail(`${acc.label}/${vp.tag}`, `안내 문구 복사 버튼 표시가 권한과 다름 (${!!copyBtn})`);
      if (copyBtn) {
        await copyBtn.click(); await p.waitForTimeout(100);
        const clip = (await p.evaluate(() => window.__clip)) || '';
        if (!/11월 AI 이미지 실적 제출 안내/.test(clip) || !/기업: 디자이너 G/.test(clip) || !/디지털: 디자이너 B/.test(clip) || !/#aiimg/.test(clip)) fail(`${acc.label}/${vp.tag}`, `안내 문구 내용이 이상함: ${clip}`);
      }
      // 엑셀 내보내기: 작성 권한이 있을 때만 버튼이 보이고, CSV(BOM)와 전체 백업 ZIP이 내려받아짐
      await p.evaluate(() => location.hash = 'leave'); await p.waitForTimeout(150);
      const expBtn = await p.$('[data-act="exp-open"]');
      if (!!expBtn !== canWrite) fail(`${acc.label}/${vp.tag}`, `엑셀 내보내기 버튼 표시가 권한과 다름 (${!!expBtn})`);
      if (expBtn) {
        await expBtn.click(); await p.waitForTimeout(150);
        const sw3 = await p.evaluate(() => document.documentElement.scrollWidth);
        if (sw3 > vp.w + 1) fail(`${acc.label}/${vp.tag}`, `내보내기 창에서 가로 스크롤 생김 (폭 ${sw3}px)`);
        const grab = async sel => { const [d] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.click(sel)]); return { name: d.suggestedFilename(), buf: fs.readFileSync(await d.path()) }; };
        const csv = await grab('[data-act="exp"][data-k="vac-month"]').catch(e => null);
        if (!csv) fail(`${acc.label}/${vp.tag}`, '휴가 CSV가 내려받아지지 않음');
        else {
          if (!/^허브_휴가_\d{4}-\d{2}_\d{8}\.csv$/.test(csv.name)) fail(`${acc.label}/${vp.tag}`, `CSV 파일 이름이 이상함: ${csv.name}`);
          const txt = csv.buf.toString('utf8');
          if (csv.buf[0] !== 0xEF || csv.buf[1] !== 0xBB || !/^\uFEFF팀원,소속,구분,파트,유형,시작일,종료일,차감 일수,기간 내 일수,메모,등록자,등록일\r\n/.test(txt)) fail(`${acc.label}/${vp.tag}`, 'CSV 머리글 또는 BOM이 이상함');
          if (txt.trim().split('\r\n').length < 2) fail(`${acc.label}/${vp.tag}`, 'CSV에 내용이 없음');
        }
        const zip = await grab('[data-act="exp-all"]').catch(e => null);
        if (!zip || zip.buf.readUInt32LE(0) !== 0x04034b50 || !/\.zip$/.test(zip.name)) fail(`${acc.label}/${vp.tag}`, '전체 백업 ZIP이 내려받아지지 않음');
        else if (!lastZip) lastZip = zip.buf;
        await p.keyboard.press('Escape'); await p.waitForTimeout(80);
      }
      if (vp.tag === 'PC') {
        const opened = [];
        for (const act of FORMS) {
          await p.evaluate(() => location.hash = 'home'); await p.waitForTimeout(80);
          const ok = await p.evaluate(a => { const route = { 'post-new': 'ax', 'vac-new': 'leave', 'ax-new': 'aiimg', 'mem-new': 'team', 'notice-new': 'notice', 'user-new': 'users', 'exp-open': 'ax' }[a]; location.hash = route; return route; }, act);
          await p.waitForTimeout(150);
          const btn = await p.$(`[data-act="${act}"]`);
          if (!btn) continue;
          await btn.click(); await p.waitForTimeout(150);
          if (await p.$('#modal:not([hidden]) .modal')) opened.push(act); else fail(acc.label, `${act} 폼이 열리지 않음`);
          await p.keyboard.press('Escape'); await p.waitForTimeout(80);
        }
        notes.push(`${acc.label}: 열린 폼 ${opened.join(', ') || '없음'}`);
      }
      errs.forEach(e => fail(`${acc.label}/${vp.tag}`, e));
      await ctx.close();
    }
  }

  // 승인 대기 · 로그인 전 화면
  for (const [label, q, expectH1] of [['승인 대기', 'role=pending', '승인 대기 중입니다'], ['로그인 전', 'nosession=1', '로그인']]) {
    const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
    const p = await ctx.newPage(); const errs = watchErrors(p); await routeHub(p);
    await p.goto(`${HOST}/?${q}#home`); await p.waitForTimeout(500);
    const h1 = (await p.textContent('#gate h1').catch(() => '')) || '';
    if (h1.trim() !== expectH1) fail(label, `안내 화면 제목이 "${h1.trim()}" (기대: ${expectH1})`);
    if (label === '로그인 전') {
      await p.fill('#l-email', 'later@test.kr'); await p.click('[data-gate="to-signup"]'); await p.waitForTimeout(100);
      await p.fill('#s-code', 'ZZZZZZ'); await p.fill('#s-pw', 'pass1234!'); await p.fill('#s-pw2', 'pass1234!');
      await p.click('[data-gate="signup"]'); await p.waitForTimeout(200);
      const msg = (await p.textContent('#l-msg')) || '';
      if (!/초대 코드가 맞지 않거나/.test(msg)) fail(label, `틀린 초대 코드 안내가 이상함: ${msg}`);
      await p.fill('#s-code', ' test22'); await p.click('[data-gate="signup"]'); await p.waitForTimeout(200);
      const sent = await p.evaluate(() => window.__signup && window.__signup.options.data.invite_code);
      if (sent !== 'TEST22') fail(label, `초대 코드 정리(대문자·공백 제거) 안 됨: ${sent}`);
    }
    errs.forEach(e => fail(label, e));
    await ctx.close();
  }

  // 전체 백업 ZIP 구조 확인: 중앙 목록의 파일 수·크기·CRC가 실제 내용과 맞는지
  if (lastZip) {
    const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc = b => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };
    const z = lastZip, eo = z.length - 22, names = [];
    if (z.readUInt32LE(eo) !== 0x06054b50) fail('전체 백업', 'ZIP 끝 표식이 없음');
    else {
      let o = z.readUInt32LE(eo + 16);
      for (let i = 0; i < z.readUInt16LE(eo + 10); i++) {
        const size = z.readUInt32LE(o + 24), nl = z.readUInt16LE(o + 28), lo = z.readUInt32LE(o + 42), name = z.slice(o + 46, o + 46 + nl).toString('utf8');
        const data = z.slice(lo + 30 + z.readUInt16LE(lo + 26), lo + 30 + z.readUInt16LE(lo + 26) + size);
        if (z.readUInt32LE(lo) !== 0x04034b50 || crc(data) !== z.readUInt32LE(o + 16)) fail('전체 백업', `ZIP 안의 ${name} 이(가) 깨짐`);
        if (data[0] !== 0xEF) fail('전체 백업', `${name} 에 BOM이 없음`);
        names.push(name); o += 46 + nl;
      }
      if (names.length !== 7) fail('전체 백업', `ZIP 안 파일이 ${names.length}개 (7개여야 함)`);
      notes.push(`전체 백업 ZIP: ${names.join(', ')}`);
    }
  } else fail('전체 백업', 'ZIP을 한 번도 받지 못함');

  if (shotsDir) {
    fs.mkdirSync(shotsDir, { recursive: true });
    for (const [theme, vp, tag] of [['light', { width: 1440, height: 1000 }, 'pc-light'], ['dark', { width: 1440, height: 1000 }, 'pc-dark'], ['light', { width: 390, height: 844 }, 'mobile']]) {
      const ctx = await b.newContext({ viewport: vp });
      await ctx.addInitScript(t => { try { localStorage.setItem('hub.theme', t); } catch (e) {} }, theme);
      const p = await ctx.newPage(); await routeHub(p);
      await p.goto(`${HOST}/?role=admin#home`); await p.waitForTimeout(500); await p.mouse.move(2, vp.height - 2);
      for (const r of ROUTES) {
        await p.evaluate(h => location.hash = h, r); await p.waitForTimeout(200);
        await p.screenshot({ path: path.join(shotsDir, `${tag}-${r}.png`), fullPage: tag !== 'mobile' });
      }
      await ctx.close();
    }
    notes.push(`캡처 저장: ${path.resolve(shotsDir)}`);
  }

  await b.close();
  notes.forEach(n => console.log('· ' + n));
  if (problems.length) { console.log(`\n결과: 문제 ${problems.length}건`); problems.forEach(x => console.log(' - ' + x)); process.exit(1); }
  console.log('\n결과: 통과 (계정 4종 × 화면 9개 × PC·모바일, 계절 배너, 대표 공지, 알림, 댓글, 제출 현황, 엑셀 내보내기, 폼 열기, 승인 대기·로그인·비밀번호 만들기)');
})();

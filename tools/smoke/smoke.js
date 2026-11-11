// 화면 점검: 모든 계정 유형 × 모든 화면을 돌며 오류·가로 스크롤·주요 폼 열림을 확인한다.
//   node tools/smoke/smoke.js                 점검만
//   node tools/smoke/smoke.js --shots <폴더>   관리자 화면을 라이트·다크·모바일로 캡처도 저장
// 통과하면 "결과: 통과", 문제가 있으면 목록을 출력하고 종료 코드 1.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { routeHub, watchErrors, HOST } = require('./serve');

const ROUTES = ['home', 'notice', 'leave', 'ax', 'aiimg', 'team', 'users', 'account'];
const ACCOUNTS = [
  { label: '관리자', q: 'role=admin' },
  { label: '작성자(디지털)', q: 'role=partner&co=tribe' },
  { label: '작성자(정규직)', q: 'role=partner&co=dx' },
  { label: '열람 전용', q: 'role=viewer' },
];
const FORMS = ['post-new', 'vac-new', 'ax-new', 'mem-new', 'notice-new', 'user-new'];
const shotsDir = (() => { const i = process.argv.indexOf('--shots'); return i > 0 ? process.argv[i + 1] : null; })();

(async () => {
  const b = await chromium.launch();
  const problems = [], notes = [];
  const fail = (who, msg) => problems.push(`[${who}] ${msg}`);

  for (const acc of ACCOUNTS) {
    for (const vp of [{ w: 1300, h: 900, tag: 'PC' }, { w: 390, h: 844, tag: '모바일' }]) {
      const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h } });
      const p = await ctx.newPage(); const errs = watchErrors(p); await routeHub(p);
      await p.goto(`${HOST}/?${acc.q}#home`); await p.waitForTimeout(500);
      for (const r of ROUTES) {
        await p.evaluate(h => location.hash = h, r); await p.waitForTimeout(150);
        const sw = await p.evaluate(() => document.documentElement.scrollWidth);
        if (sw > vp.w + 1) fail(`${acc.label}/${vp.tag}`, `#${r} 가로 스크롤 생김 (폭 ${sw}px)`);
        if (r === 'users' && acc.label !== '관리자') {
          const t = await p.textContent('#view');
          if (!/관리자만 볼 수 있는 메뉴/.test(t)) fail(`${acc.label}/${vp.tag}`, '#users 가 관리자 외 계정에 열림');
        } else if (!(await p.$('#view h1, #view .dash-head'))) fail(`${acc.label}/${vp.tag}`, `#${r} 제목이 렌더되지 않음`);
      }
      if (vp.tag === 'PC') {
        const opened = [];
        for (const act of FORMS) {
          await p.evaluate(() => location.hash = 'home'); await p.waitForTimeout(80);
          const ok = await p.evaluate(a => { const route = { 'post-new': 'ax', 'vac-new': 'leave', 'ax-new': 'aiimg', 'mem-new': 'team', 'notice-new': 'notice', 'user-new': 'users' }[a]; location.hash = route; return route; }, act);
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
  console.log('\n결과: 통과 (계정 4종 × 화면 8개 × PC·모바일, 폼 열기, 승인 대기·로그인·비밀번호 만들기)');
})();

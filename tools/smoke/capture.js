// Figma AX과제 섹션(3182:7)에 넣을 캡처 4장을 만든다. 1440×1178 뷰포트, 2배율(2880×2356) → 이미지 레이어 비율과 같음.
//   node tools/smoke/capture.js <저장 폴더> [표시 이름]
// 01 홈(라이트) · 02 AX 실적(라이트) · 03 휴가 일정(다크) · 04 AI 이미지 제작(다크)
// 데모 데이터이므로 Figma 각주의 "데모 데이터로 캡처" 문구를 유지한다.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { routeHub, HOST } = require('./serve');

const out = process.argv[2] || 'captures';
const name = encodeURIComponent(process.argv[3] || '관리자');
const SHOTS = [
  ['01-home-light.png', 'light', 'home', async p => { await p.click('.wkday:nth-child(2)').catch(() => {}); }],
  ['02-ax-light.png', 'light', 'ax'],
  ['03-leave-dark.png', 'dark', 'leave'],
  ['04-aiimg-dark.png', 'dark', 'aiimg'],
];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  for (const [file, theme, route, prep] of SHOTS) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1178 }, deviceScaleFactor: 2, colorScheme: theme });
    await ctx.addInitScript(t => { try { localStorage.setItem('hub.theme', t); } catch (e) {} }, theme);
    const p = await ctx.newPage(); await routeHub(p);
    await p.goto(`${HOST}/?role=admin&name=${name}#${route}`); await p.waitForTimeout(1800); // 홈 계절 배너가 번져 나타날 때까지
    if (prep) { await prep(p); await p.waitForTimeout(200); }
    await p.mouse.move(2, 1176); await p.waitForTimeout(100); // 호버 흔적 제거
    await p.screenshot({ path: path.join(out, file) });
    await ctx.close();
    console.log('저장: ' + path.resolve(out, file));
  }
  await b.close();
})();

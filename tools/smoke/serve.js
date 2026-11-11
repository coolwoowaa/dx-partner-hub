// Playwright 페이지에 저장소 파일을 그대로 서빙하고, Supabase만 가짜로 바꿔 끼운다. (네트워크·실제 DB 불필요)
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const STUB = path.join(__dirname, 'stub-supabase.js');
const HOST = 'http://hub.test';

async function routeHub(page) {
  await page.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.hostname !== 'hub.test') return r.continue(); // 웹폰트 등 외부 요청은 그대로(막혀도 대체 글꼴로 표시)
    if (u.pathname.endsWith('/vendor/supabase-2.117.3.js')) return r.fulfill({ body: fs.readFileSync(STUB), contentType: 'text/javascript' });
    if (u.pathname.endsWith('/config.js')) return r.fulfill({ body: "window.HUB_CONFIG={SUPABASE_URL:'https://demo.supabase.co',SUPABASE_ANON_KEY:'demo'}", contentType: 'text/javascript' });
    const f = path.join(ROOT, u.pathname === '/' ? 'index.html' : u.pathname);
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) return r.fulfill({ status: 404, body: 'not found' });
    return r.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' });
  });
}
function watchErrors(page) {
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|net::/.test(m.text())) errs.push('console: ' + m.text()); });
  return errs;
}
module.exports = { routeHub, watchErrors, HOST, ROOT };

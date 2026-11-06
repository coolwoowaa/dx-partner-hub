/* 디지털/기업 허브 — Supabase 버전
 * 데이터: Supabase Postgres (RLS 로 권한 강제) / 첨부: Supabase Storage 'attachments' (비공개)
 * 역할: admin = DX디자인팀, partner = 협력사(자기 회사 데이터만 작성), viewer = 열람 전용, pending = 미승인
 */
(() => {
'use strict';

/* ---------- constants ---------- */
const HOLIDAYS = {
  '2026-01-01':'신정','2026-02-16':'설날 연휴','2026-02-17':'설날','2026-02-18':'설날 연휴','2026-03-01':'삼일절','2026-03-02':'대체공휴일',
  '2026-05-05':'어린이날','2026-05-24':'부처님오신날','2026-05-25':'대체공휴일','2026-06-03':'지방선거일','2026-06-06':'현충일',
  '2026-08-15':'광복절','2026-08-17':'대체공휴일','2026-09-24':'추석 연휴','2026-09-25':'추석','2026-09-26':'추석 연휴',
  '2026-10-03':'개천절','2026-10-05':'대체공휴일','2026-10-09':'한글날','2026-12-25':'성탄절','2027-01-01':'신정','2027-03-01':'삼일절'
};
const TYPES = {
  annual:{label:'연차',short:'연차',unit:1}, am:{label:'오전 반차',short:'오전반차',unit:.5}, pm:{label:'오후 반차',short:'오후반차',unit:.5},
  quarter:{label:'반반차 (2시간)',short:'반반차',unit:.25}, sick:{label:'병가',short:'병가',unit:1}, comp:{label:'대체휴가',short:'대체',unit:1},
  family:{label:'경조휴가',short:'경조',unit:1}, etc:{label:'기타',short:'기타',unit:1}
};
const NCATS = {notice:'공지', must:'필독', schedule:'일정', guide:'가이드'};
const STATUS = {submitted:{l:'검토 대기',c:'warn'}, revise:{l:'보완 요청',c:'bad'}, approved:{l:'확인 완료',c:'ok'}};
const ROLES = {admin:'DX 관리자', partner:'협력사', viewer:'열람 전용', pending:'승인 대기'};
const DOW = ['일','월','화','수','목','금','토'];
const BUCKET = 'attachments';
const MAX_FILE = 50 * 1048576;
const ROUTES = ['home','notice','leave','ax','aiimg','team','users','account'];
const PARTS = {design:'디자인', publishing:'퍼블리싱', common:'공통'};
const PART_HUE = {design:'blue', publishing:'teal', common:'orange'};
const MEMBER_PARTS = {design:'디자인', publishing:'퍼블리싱', etc:'기타'};
const P_STATUS = {idea:{l:'아이디어',h:'gray'}, test:{l:'테스트',h:'blue'}, doing:{l:'진행 중',h:'purple'}, done:{l:'완료',h:'green'}};
const P_CAT = {case:{l:'활용사례',h:'purple'}, knowhow:{l:'노하우',h:'brown'}, output:{l:'산출물',h:'teal'}, study:{l:'학습자료',h:'yellow'}, guide:{l:'가이드',h:'green'}, meeting:{l:'회의·일정',h:'gray'}};
const P_PRI = {core:{l:'핵심',h:'red'}, high:{l:'중요',h:'yellow'}, normal:{l:'보통',h:'gray'}};
const TOOLS = [['Claude','orange'],['Claude Design','orange'],['Claude Code','brown'],['ChatGPT','blue'],['ChatGPT Work','blue'],['Codex','gray'],['Figma Make','purple'],['Gemini','green'],['Midjourney','teal'],['Firefly','red']];

/* ---------- supabase ---------- */
const cfg = window.HUB_CONFIG || {};
const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !/YOUR_/.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY));
const sb = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

/* ---------- state ---------- */
const now = new Date();
const S = {
  route:'home', session:null, me:null, role:'pending', myCompany:null, isAdmin:false,
  notices:[], vacations:[], members:[], companies:[], ax:[], reviews:{}, profiles:{}, allowed:[], posts:[],
  loaded:{}, loadErr:false,
  cal:{y:now.getFullYear(), m:now.getMonth()}, coFilter:'all',
  axYear:now.getFullYear(), axMonth:null, axCo:'all', axFilter:'pending', noticeQ:'', noticeCat:'all',
  postPart:'all', postWho:'all', postView:'all', postQ:'', homeDay:null, homeNotice:'all'
};

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2,'0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); };
const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const TODAY = ymd(now);
const isWeekend = s => { const g = parse(s).getDay(); return g===0 || g===6; };
const isOff = s => isWeekend(s) || !!HOLIDAYS[s];
const fmtD = s => { const d = parse(s); return `${d.getMonth()+1}.${d.getDate()} (${DOW[d.getDay()]})`; };
const fmtTs = iso => { if(!iso) return ''; const d = new Date(iso); return `${String(d.getFullYear()).slice(2)}.${pad(d.getMonth()+1)}.${pad(d.getDate())}`; };
const monthLabel = (m, withYear) => { const [y,mm] = m.split('-'); return (withYear?`${y}년 `:'') + `${Number(mm)}월`; };
const prevMonth = () => { const d = new Date(now.getFullYear(), now.getMonth()-1, 1); return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; };
const curMonth = `${now.getFullYear()}-${pad(now.getMonth()+1)}`;
const fmtDays = n => (Math.round(n*100)/100).toString() + '일';
const pct = (a,b) => b>0 ? Math.round(a/b*100) : null;
const fmtSize = b => b>1048576 ? (b/1048576).toFixed(1)+'MB' : Math.max(1,Math.round(b/1024))+'KB';
const extOf = n => (n.includes('.') ? n.split('.').pop() : '').toLowerCase();
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k,v) => { try { localStorage.setItem(k,v); } catch {} };
const ts = v => v ? new Date(v).getTime() : 0;
const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12);

const canW = () => S.isAdmin || S.role==='partner';
const canCo = cid => canW();  // 작성자는 소속과 관계없이 모든 그룹을 작성 (공지만 관리자 전용)
const coById = id => S.companies.find(c => c.id===id);
const coIdx = id => { const i = S.companies.findIndex(c => c.id===id); return i<0 ? 5 : i%6; };
const coColor = id => `var(--co${coIdx(id)+1})`;
const coName = id => coById(id)?.name || '삭제된 협력사';
const coChip = id => `<span class="chip co" style="--c:${coColor(id)}">${esc(coName(id))}</span>`;
const writableCos = () => S.companies.filter(c => canCo(c.id));
const isInternal = id => coById(id)?.kind === 'internal';
const partnerCos = () => S.companies.filter(c => c.kind !== 'internal');
const writablePartnerCos = () => partnerCos().filter(c => canCo(c.id));
const isPartnerAx = a => !isInternal(a.companyId);
const partnerMembers = () => S.members.filter(m => !isInternal(m.companyId)).sort((a,b) => (coById(a.companyId)?.sort||0) - (coById(b.companyId)?.sort||0) || a.name.localeCompare(b.name,'ko'));
const imgMembers = () => partnerMembers().filter(m => (m.part || 'design') === 'design');
const toolHue = t => (TOOLS.find(x => x[0]===t) || [0,'teal'])[1];
const tint = (label, h, extra='') => `<span class="chip tint h-${h}" ${extra}>${esc(label)}</span>`;
const toolChips = (tools, max) => { const l = tools || []; const shown = max ? l.slice(0, max) : l; return shown.map(t => tint(t, toolHue(t))).join('') + (max && l.length > max ? `<span class="chip">+${l.length-max}</span>` : ''); };
const canEditPost = p => S.isAdmin || (S.role==='partner' && p.createdBy===S.me?.id);
const byUpdated = (a,b) => ts(b.updatedAt) - ts(a.updatedAt);
const linkify = t => esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
const shortDate = d => d ? `${d.slice(2,4)}.${d.slice(5,7)}.${d.slice(8,10)}` : '';
const axWho = a => a.memberId ? (memberById(a.memberId)?.name || '삭제된 팀원') : '회사 단위 (이관)';
const sumAx = list => list.reduce((t,a) => ({ai:t.ai+(+a.aiImage||0), tot:t.tot+(+a.total||0), work:t.work+(+a.aiWork||0), workN:t.workN+(a.aiWork!=null?1:0), n:t.n+1}), {ai:0, tot:0, work:0, workN:0, n:0});
const roleLabel = (role, cid) => role==='partner' ? (isInternal(cid) ? '팀원' : '협력사') : ROLES[role];
const memberById = id => S.members.find(m => m.id===id);
const nameOf = id => { const p = id && S.profiles[id]; return p ? (p.name || p.email.split('@')[0]) : (id ? '알 수 없음' : '—'); };
const hue = id => { let h = 0; for (const ch of String(id)) h = (h*31 + ch.charCodeAt(0)) % 360; return h; };
const avImg = (path, seed, label, size) => path
  ? `<img class="av" alt="" data-path="${esc(path)}" style="width:${size}px;height:${size}px">`
  : `<span class="ini" style="width:${size}px;height:${size}px;font-size:${Math.round(size*.46)}px;background:hsl(${hue(seed)} 42% 50%)">${esc((label||'?').slice(0,1))}</span>`;
const userAv = (id, size=20) => avImg(S.profiles[id]?.avatarPath, id || 'x', nameOf(id), size);
const memberAv = (m, size=20) => m ? avImg(m.photoPath, m.id, m.name, size) : avImg(null, 'x', '?', size);
const who = id => id ? `<span class="who">${userAv(id)}${esc(nameOf(id))}</span>` : '<span class="muted">—</span>';

function leaveDays(v){
  const t = TYPES[v.type] || TYPES.etc;
  if (t.unit < 1) return isOff(v.start) ? 0 : t.unit;
  let n = 0;
  for (let d = parse(v.start); ymd(d) <= v.end; d = addDays(d,1)) if (!isOff(ymd(d))) n++;
  return n;
}
const statusOf = sub => { const r = S.reviews[sub.id]; return (r && ts(r.reviewedAt) >= ts(sub.submittedAt)) ? r.status : 'submitted'; };
const pendingCount = () => S.ax.filter(a => isPartnerAx(a) && statusOf(a)==='submitted').length;

const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genCode(){ const b = new Uint8Array(6); crypto.getRandomValues(b); return [...b].map(x => CODE_ABC[x % CODE_ABC.length]).join(''); }
const siteUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');
const inviteText = a => `[디지털/기업 허브] 계정 안내

사이트: ${siteUrl()}
이메일: ${a.email}
초대 코드: ${a.inviteCode}

처음 접속하면 로그인 화면 아래 '처음이신가요? 비밀번호 만들기'를 눌러
위 이메일과 초대 코드를 넣고 비밀번호를 정해 주세요.
초대 코드는 본인만 사용해 주세요.`;
async function copyText(text, label){
  try { await navigator.clipboard.writeText(text); toast(`${label}을(를) 복사했습니다.`); }
  catch {
    openModal(`${mhead('복사해서 전달하세요', '자동 복사가 막혀 있어요. 아래 내용을 선택해 복사해 주세요.')}<div class="mb"><textarea id="copy-box" rows="9" readonly>${esc(text)}</textarea></div><div class="mf"><button class="btn ink" data-act="close">닫기</button></div>`);
    const t = $('#copy-box'); t.focus(); t.select();
  }
}
let toastT;
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(()=> t.hidden = true, 2800); }
function errMsg(e){
  const code = e?.code || '', m = String(e?.message || '');
  if (code==='42501' || /row-level security|permission denied|Unauthorized|403/i.test(m)) return '권한이 없어 처리하지 못했습니다.';
  if (code==='23514') return '입력값을 확인해주세요.';
  if (code==='23503') return /ax_reports/.test(m) ? 'AX 실적 기록이 있어 삭제할 수 없습니다.' : '연결된 데이터가 있어 처리할 수 없습니다.';
  if (code==='23505') return '이미 등록된 항목입니다.';
  if (/exceeded the maximum allowed size|too large|413/i.test(m)) return '파일이 너무 큽니다. 50MB 이하로 올려주세요.';
  if (/Failed to fetch|NetworkError/i.test(m)) return '네트워크 연결을 확인해주세요.';
  return '처리하지 못했습니다. ' + m;
}
/* run a supabase query; expectRows=true treats "0 rows changed" (RLS-filtered update/delete) as a permission error */
async function run(q, expectRows){
  try {
    const {data, error} = await q;
    if (error) { toast(errMsg(error)); return null; }
    if (expectRows && Array.isArray(data) && data.length===0) { toast('권한이 없거나 이미 삭제된 항목입니다.'); return null; }
    return data ?? true;
  } catch (e) { toast(errMsg(e)); return null; }
}

/* ---------- data loading ---------- */
const MAP = {
  companies: r => ({id:r.id, name:r.name, sort:r.sort, kind:r.kind || 'partner'}),
  profiles:  r => ({id:r.id, email:r.email, name:r.name, role:r.role, companyId:r.company_id, avatarPath:r.avatar_path, linked:!!r.linked, createdAt:r.created_at}),
  members:   r => ({id:r.id, name:r.name, companyId:r.company_id, role:r.title, photoPath:r.photo_path, part:r.part || 'design'}),
  ax_posts:  r => ({id:r.id, title:r.title, summary:r.summary, body:r.body, part:r.part, companyId:r.company_id, status:r.status, usable:r.usable, tools:r.tools||[], category:r.category, priority:r.priority, start:r.start_date, end:r.end_date, attachments:r.attachments||[], createdBy:r.created_by, createdAt:r.created_at, updatedAt:r.updated_at}),
  notices:   r => ({id:r.id, title:r.title, body:r.body, category:r.category, pinned:r.pinned, attachments:r.attachments||[], createdBy:r.created_by, createdAt:r.created_at, updatedAt:r.updated_at}),
  vacations: r => ({id:r.id, memberId:r.member_id, companyId:r.company_id, type:r.type, start:r.start_date, end:r.end_date, memo:r.memo, createdBy:r.created_by, createdAt:r.created_at}),
  ax_reports:r => ({id:r.id, companyId:r.company_id, memberId:r.member_id, month:r.month, aiImage:r.ai_image, aiWork:r.ai_work, total:r.total, note:r.note, attachments:r.attachments||[], submittedBy:r.submitted_by, submittedAt:r.submitted_at, createdAt:r.created_at}),
  ax_reviews:r => ({id:r.report_id, status:r.status, comment:r.comment, reviewedBy:r.reviewed_by, reviewedAt:r.reviewed_at}),
  allowed_emails: r => ({email:r.email, name:r.name, role:r.role, companyId:r.company_id, inviteCode:r.invite_code || '', createdAt:r.created_at})
};
async function load(table){
  let q = sb.from(table).select('*');
  if (table==='companies') q = q.order('sort').order('created_at');
  const {data, error} = await q.limit(5000);
  if (error) { S.loadErr = true; render(); return; }
  const rows = data.map(MAP[table]);
  switch (table) {
    case 'companies': S.companies = rows; break;
    case 'profiles': { const p = {}; rows.forEach(r => p[r.id] = r); S.profiles = p;
      const mine = p[S.session.user.id];
      if (!mine || mine.role !== S.role || mine.companyId !== S.myCompany) { location.reload(); return; }
      break; }
    case 'members': S.members = rows; break;
    case 'notices': S.notices = rows; break;
    case 'vacations': S.vacations = rows; break;
    case 'ax_reports': S.ax = rows; break;
    case 'ax_reviews': { const r = {}; rows.forEach(x => r[x.id] = x); S.reviews = r; break; }
    case 'ax_posts': S.posts = rows; break;
    case 'allowed_emails': S.allowed = rows; break;
  }
  S.loaded[table] = true;
  render();
}
const reloadT = {};
function reload(table){ clearTimeout(reloadT[table]); reloadT[table] = setTimeout(() => load(table), 250); }
function loadAll(){
  ['companies','profiles','members','notices','vacations','ax_reports','ax_reviews','ax_posts'].forEach(load);
  if (S.isAdmin) load('allowed_emails');
  sb.channel('hub-changes')
    .on('postgres_changes', {event:'*', schema:'public'}, p => { if (MAP[p.table]) reload(p.table); })
    .subscribe();
}

/* ---------- files (Supabase Storage, signed URLs) ---------- */
const urlCache = new Map();
const signQueue = new Map(); let signT = 0;
function signBatched(path){
  return new Promise(res => {
    if (!signQueue.has(path)) signQueue.set(path, []);
    signQueue.get(path).push(res);
    clearTimeout(signT); signT = setTimeout(flushSign, 15);
  });
}
async function flushSign(){
  const batch = new Map(signQueue); signQueue.clear();
  const paths = [...batch.keys()];
  const map = {};
  try {
    const {data} = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
    (data || []).forEach(d => { if (d.signedUrl) map[d.path] = d.signedUrl; });
  } catch {}
  paths.forEach(p => {
    const u = map[p] || null;
    if (u) urlCache.set(p + '|', {url:u, exp:Date.now() + 50*60e3});
    batch.get(p).forEach(r => r(u));
  });
}
async function fileUrl(path, dlName){
  const key = path + '|' + (dlName || '');
  const c = urlCache.get(key);
  if (c && c.exp > Date.now()) return c.url;
  if (!dlName) return signBatched(path);
  const {data, error} = await sb.storage.from(BUCKET).createSignedUrl(path, 3600, dlName ? {download: dlName} : undefined);
  if (error) return null;
  urlCache.set(key, {url:data.signedUrl, exp:Date.now() + 50*60e3});
  return data.signedUrl;
}
function hydrate(root){
  (root || document).querySelectorAll('[data-path]:not([data-ready])').forEach(async el => {
    el.dataset.ready = '1';
    const u = await fileUrl(el.dataset.path, el.dataset.dl || null);
    if (!u) { if (el.tagName==='IMG') { el.alt = ''; el.classList.add('broken'); } return; }
    if (el.tagName==='IMG') el.src = u; else el.href = u;
  });
}
const isImg = f => /^image\//.test(f.type || '') || ['png','jpg','jpeg','gif','webp','svg'].includes(extOf(f.name));
const isPdf = f => f.type==='application/pdf' || extOf(f.name)==='pdf';
async function resizeImage(file, max){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight), out = Math.min(max, side);
    const c = document.createElement('canvas'); c.width = c.height = out;
    c.getContext('2d').drawImage(img, (img.naturalWidth-side)/2, (img.naturalHeight-side)/2, side, side, 0, 0, out, out);
    return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
  } finally { URL.revokeObjectURL(url); }
}
async function uploadPhoto(file, folder){
  if (!/^image\//.test(file.type)) throw {message:'이미지 파일만 올릴 수 있습니다.'};
  let blob;
  try { blob = await resizeImage(file, 320); } catch { throw {message:'이미지를 읽을 수 없습니다. JPG나 PNG로 올려주세요.'}; }
  const path = `${folder}/${uid()}.jpg`;
  const {error} = await sb.storage.from(BUCKET).upload(path, blob, {contentType:'image/jpeg', upsert:false});
  if (error) throw error;
  return path;
}
async function removeFiles(paths){ if (paths.length) await sb.storage.from(BUCKET).remove(paths).catch(()=>{}); }
function removeDropped(before, after){
  const keep = new Set((after||[]).map(f => f.path));
  removeFiles((before||[]).filter(f => !keep.has(f.path)).map(f => f.path));
}

/* ---------- render ---------- */
let rq = 0;
function render(){ if (rq) return; rq = setTimeout(() => { rq = 0; doRender(); }, 10); }
function doRender(){
  if (!S.me) return;
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.r===S.route));
  $('#nav-users').hidden = !S.isAdmin;
  const pc = pendingCount(), cnt = $('#nav-ax-cnt');
  cnt.hidden = !(S.isAdmin && pc); cnt.textContent = pc;
  $('#me').innerHTML = `${userAv(S.me.id, 32)}<div><b>${esc(S.me.name || S.me.email)}</b><small>${roleLabel(S.role, S.myCompany)}${S.myCompany ? ' · ' + esc(coName(S.myCompany)) : ''}</small></div>`;
  hydrate($('#me'));
  const views = {home:vHome, notice:vNotice, leave:vLeave, ax:vAxBoard, aiimg:vAx, team:vTeam, users:vUsers, account:vAccount};
  const v = $('#view');
  v.classList.toggle('dash', S.route==='home');
  v.innerHTML = banner() + (views[S.route] || vHome)();
  if (S.route==='notice') renderNoticeList();
  hydrate(v);
}
function banner(){
  if (S.loadErr) return `<div class="banner">일부 데이터를 불러오지 못했습니다. 새로고침해 주세요.</div>`;
  if (S.role==='viewer') return `<div class="banner">열람 전용 계정입니다. 휴가 등록이나 실적 제출이 필요하면 DX디자인팀에 요청해주세요.</div>`;
  return '';
}
const loading = t => !S.loaded[t];
const emptyRow = (cols, html) => `<tr><td colspan="${cols}"><div class="empty">${html}</div></td></tr>`;

/* ---------- HOME (dashboard) ---------- */
const ICONS = {
  cal: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="14" width="48" height="42" rx="11" fill="currentColor" opacity=".22"/><rect x="8" y="14" width="48" height="15" rx="7.5" fill="currentColor" opacity=".55"/><rect x="18" y="7" width="6" height="13" rx="3" fill="currentColor"/><rect x="40" y="7" width="6" height="13" rx="3" fill="currentColor"/><circle cx="23" cy="41" r="4.5" fill="currentColor"/><circle cx="41" cy="41" r="4.5" fill="currentColor" opacity=".45"/></svg>',
  spark: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M30 6c2 13 7 19 22 22-15 3-20 9-22 22-2-13-7-19-22-22 15-3 20-9 22-22z" fill="currentColor" opacity=".8"/><path d="M50 36c1 6 3 9 9 10-6 1-8 4-9 10-1-6-3-9-9-10 6-1 8-4 9-10z" fill="currentColor" opacity=".4"/></svg>',
  image: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="6" y="12" width="52" height="42" rx="11" fill="currentColor" opacity=".22"/><circle cx="22" cy="27" r="6" fill="currentColor" opacity=".7"/><path d="M10 50l15-15 9 9 8-7 14 13z" fill="currentColor" opacity=".75"/></svg>',
  check: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 14a8 8 0 0 1 8-8h28a8 8 0 0 1 8 8v24a8 8 0 0 1-8 8H30l-12 10v-10h0a8 8 0 0 1-8-8z" fill="currentColor" opacity=".25"/><path d="M21 26l7 7 15-15" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
function weekDays(){
  const d = parse(TODAY), g = d.getDay();
  const mon = addDays(d, g===0 ? 1 : g===6 ? 2 : 1-g);
  return [0,1,2,3,4].map(i => ymd(addDays(mon,i)));
}
const vacOn = day => S.vacations.filter(v => v.start <= day && day <= v.end && !isOff(day));
function lvBtn(v){
  const m = memberById(v.memberId), t = TYPES[v.type] || TYPES.etc, cid = m?.companyId || v.companyId;
  return `<button class="lv co" style="--c:${coColor(cid)}" data-act="vac-view" data-id="${esc(v.id)}" title="${esc((m?.name||'삭제된 팀원')+' · '+coName(cid)+' · '+t.label)}">${memberAv(m, 16)}<b>${esc(m?.name || '삭제된 팀원')}</b> <span class="ty">${t.short}</span></button>`;
}
function dayEvents(day){
  const ev = [];
  if (HOLIDAYS[day]) ev.push({k:'종일', html:`<b style="color:var(--bad)">${HOLIDAYS[day]}</b>`});
  if (!isOff(day)) vacOn(day).forEach(v => { const m = memberById(v.memberId), t = TYPES[v.type] || TYPES.etc;
    ev.push({k: v.type==='am' ? '오전' : v.type==='pm' ? '오후' : v.type==='quarter' ? '2시간' : '종일', html:`<button class="tl-btn" data-act="vac-view" data-id="${esc(v.id)}">${memberAv(m, 18)}<b>${esc(m?.name || '삭제된 팀원')}</b> ${t.label}<span class="muted"> · ${esc(coName(m?.companyId || v.companyId))}</span></button>`}); });
  S.posts.filter(p => p.start===day || p.end===day).forEach(p => ev.push({k: p.end===day ? '마감' : '시작', html:`<button class="tl-btn" data-act="post-view" data-id="${esc(p.id)}">${tint('AX', PART_HUE[p.part])} ${esc(p.title)}</button>`}));
  return ev;
}
function vHome(){
  const hello = S.me.name || S.me.email.split('@')[0];
  const rm = prevMonth();
  const todayVac = vacOn(TODAY);
  const monthPosts = S.posts.filter(p => ymd(new Date(p.createdAt)).slice(0,7) === curMonth);
  const usableCnt = S.posts.filter(p => p.status==='done' && p.usable).length;
  const doingCnt = S.posts.filter(p => p.status==='doing' || p.status==='test').length;
  const pcos = partnerCos(), dm = imgMembers();
  const axRm = S.ax.filter(a => isPartnerAx(a) && a.month===rm), smRm = sumAx(axRm);
  const pc = pendingCount();
  const subMem = new Set(axRm.filter(a => a.memberId).map(a => a.memberId));
  const legacyRm = pcos.length && pcos.every(c => axRm.some(a => a.companyId===c.id && !a.memberId));

  const tile = (cls, href, pill, big, cap, icon) => `<a class="ptile ${cls}" href="${href}"><span class="pill">${pill}</span><b class="num">${big}</b><small>${cap}</small>${ICONS[icon]}</a>`;
  const tiles = [
    tile('t-blue', '#leave', '오늘 휴가', `${todayVac.length}명`, todayVac.length ? esc(todayVac.slice(0,3).map(v => memberById(v.memberId)?.name || '').join(', ')) + (todayVac.length > 3 ? ` 외 ${todayVac.length-3}명` : '') : '오늘은 모두 출근해요', 'cal'),
    tile('t-purple', '#ax', '이번 달 AX 실적', `${monthPosts.length}건`, `활용 가능 사례 ${usableCnt}건 · 진행 중 ${doingCnt}건`, 'spark'),
    tile('t-peach', '#aiimg', `${Number(rm.slice(5))}월 AI 이미지 적용률`, smRm.n ? `${pct(smRm.ai, smRm.tot) ?? '–'}%` : '–', smRm.n ? `AI ${smRm.ai} / 전체 ${smRm.tot} · 협력사 디자인` : '아직 제출된 실적이 없어요', 'image'),
    S.isAdmin
      ? tile('t-yellow', '#aiimg', '검토 대기', `${pc}건`, pc ? 'AI 이미지 증빙을 확인해주세요' : '확인할 증빙이 없어요', 'check')
      : tile('t-yellow', '#notice', '최근 7일 공지', `${S.notices.filter(n => (Date.now() - ts(n.createdAt)) < 7*864e5).length}건`, `전체 공지 ${S.notices.length}건`, 'check')
  ].join('');

  const recent = [...S.posts].sort(byUpdated).slice(0, 3);
  const axCards = recent.length ? recent.map(p => `<button class="axcard p-${PART_HUE[p.part]}" data-act="post-view" data-id="${esc(p.id)}">
      <span class="axcard-top"><span>${PARTS[p.part]} · ${P_CAT[p.category]?.l || ''}</span><span class="st">${P_STATUS[p.status]?.l || ''}</span></span>
      <b class="axcard-title">${esc(p.title)}</b>
      <span class="axcard-sum">${esc(p.summary || '')}</span>
      <span class="axcard-foot">${who(p.createdBy)}<span class="num">${fmtTs(p.updatedAt)}</span></span>
      <span class="axcard-tools">${toolChips(p.tools, 3)}</span></button>`).join('')
    : `<div class="axcard empty-card"><b>아직 올라온 AX 실적이 없어요</b><span class="muted">디자인·퍼블리싱에서 AI를 활용한 사례, 노하우, 산출물을 자유롭게 올려주세요.</span>${canW() ? '<button class="btn pri sm" data-act="post-new">첫 AX 실적 올리기</button>' : ''}</div>`;

  // week card (Sun..Sat of this week)
  const t0 = parse(TODAY), sun = addDays(t0, -t0.getDay());
  const week = [0,1,2,3,4,5,6].map(i => ymd(addDays(sun, i)));
  const sel = S.homeDay && week.includes(S.homeDay) ? S.homeDay : TODAY, sd = parse(sel);
  const evs = dayEvents(sel);

  const nlist = sortedNotices().filter(n => S.homeNotice==='all' || n.category==='must').slice(0, 5);

  return `
  <div class="dash-head"><div><p class="muted" style="margin:0 0 2px">${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 ${DOW[now.getDay()]}요일</p><h1>안녕하세요, ${esc(hello)}님</h1></div>
    <div class="row">${canW() ? `<button class="btn" data-act="vac-new">휴가 등록</button><button class="btn" data-act="ax-new">AI 이미지 제출</button><button class="btn pri" data-act="post-new">+ AX 실적 올리기</button>` : ''}</div></div>

  <div class="ptiles">${tiles}</div>

  <div class="dash-grid">
    <section class="dcard span-8"><div class="dcard-h"><h2>최근 AX 실적</h2><a class="more" href="#ax">더보기</a></div>
      <div class="axcards">${axCards}</div></section>

    <section class="dcard span-4"><div class="dcard-h"><h2>${sel===TODAY ? '오늘' : `${sd.getMonth()+1}월 ${sd.getDate()}일`}, ${DOW[sd.getDay()]}요일</h2><a class="more" href="#leave">휴가 달력</a></div>
      <div class="wkstrip">${week.map(d => { const dd = parse(d), g = dd.getDay(); const has = dayEvents(d).length;
        return `<button class="wkday ${d===TODAY?'today':''} ${d===sel?'sel':''} ${g===0||HOLIDAYS[d]?'red':''}" data-act="hday" data-d="${d}" aria-pressed="${d===sel}"><small>${DOW[g]}</small><span class="num">${dd.getDate()}</span><i class="${has?'on':''}"></i></button>`; }).join('')}</div>
      <ul class="tl">${evs.length ? evs.map(e => `<li><span class="tl-k">${e.k}</span><span class="tl-v">${e.html}</span></li>`).join('') : `<li class="tl-empty">${loading('vacations') ? '불러오는 중…' : '휴가·일정이 없는 날이에요'}</li>`}</ul></section>

    <section class="dcard span-7"><div class="dcard-h"><div class="tabs" role="tablist"><button role="tab" class="${S.homeNotice==='all'?'on':''}" data-act="hnotice" data-k="all" aria-selected="${S.homeNotice==='all'}">공지사항</button><button role="tab" class="${S.homeNotice==='must'?'on':''}" data-act="hnotice" data-k="must" aria-selected="${S.homeNotice==='must'}">필독</button></div><a class="more" href="#notice">더보기</a></div>
      <ul class="nlist">${nlist.length ? nlist.map(n => `<li><button data-act="notice-view" data-id="${esc(n.id)}"><span class="nt">${n.pinned ? '<span class="chip acc" style="height:18px;font-size:10.5px">고정</span>' : ''}${esc(n.title)}${(Date.now() - ts(n.createdAt)) < 3*864e5 ? '<span class="nbadge">N</span>' : ''}</span><span class="num muted">${fmtTs(n.createdAt)}</span></button></li>`).join('')
        : `<li class="tl-empty">${loading('notices') ? '불러오는 중…' : S.homeNotice==='must' ? '필독 공지가 없어요' : '등록된 공지가 없어요'}</li>`}</ul></section>

    <section class="dcard span-5"><div class="dcard-h"><h2>${Number(rm.slice(5))}월 AI 이미지 제작</h2><a class="more" href="#aiimg" data-act="ax-goto" data-month="${rm}">현황판</a></div>
      ${S.isAdmin && pc ? `<div class="callout"><span>검토를 기다리는 AI 이미지 실적이</span><b class="num">${pc}건</b><span>있어요!</span></div>`
        : `<div class="callout calm"><span>${legacyRm ? '기존 현황판의 회사 단위 기록이에요' : `디자이너 제출 <b class="num">${subMem.size}/${dm.length}명</b>`}</span></div>`}
      <div class="bars">${pcos.map(c => { const sm = sumAx(axRm.filter(a => a.companyId===c.id)), r = pct(sm.ai, sm.tot);
        return `<button class="barrow" data-act="ax-goto" data-month="${rm}" data-co="${esc(c.id)}"><span class="bn"><span class="dot" style="color:${coColor(c.id)}"></span> ${esc(c.name)}</span><span class="bt"><span style="width:${r||0}%;background:${coColor(c.id)}"></span></span><span class="bv num">${r==null ? '–' : r+'%'}</span></button>`; }).join('')}
        ${smRm.n ? `<div class="barrow total"><span class="bn">협력사 합계</span><span class="bt"><span style="width:${pct(smRm.ai,smRm.tot)||0}%"></span></span><span class="bv num">${pct(smRm.ai,smRm.tot)}%</span></div>` : ''}</div></section>
  </div>`;
}

/* ---------- NOTICES ---------- */
function sortedNotices(){
  return [...S.notices].sort((a,b) => (b.pinned?1:0)-(a.pinned?1:0) || ts(b.createdAt)-ts(a.createdAt));
}
function noticeLi(n){
  const isNew = (Date.now() - ts(n.createdAt)) < 3*864e5;
  return `<div class="li" data-act="notice-view" data-id="${esc(n.id)}">
    <span class="chip ${n.category==='must'?'bad':n.pinned?'acc':''}">${n.pinned?'고정 · ':''}${NCATS[n.category]||'공지'}</span>
    <span class="grow"><span class="ttl">${esc(n.title)}${isNew?' <span class="chip warn" style="height:18px;font-size:10.5px">N</span>':''}</span>
    <span class="meta">${esc(nameOf(n.createdBy))} · ${fmtTs(n.createdAt)}${(n.attachments||[]).length?` · 첨부 ${n.attachments.length}`:''}</span></span></div>`;
}
function vNotice(){
  return `<div class="head"><div><h1>공지사항</h1><p>DX디자인팀이 협력사에 전달하는 공지, 일정, 작업 가이드입니다.</p></div>
    ${S.isAdmin ? `<button class="btn pri" data-act="notice-new">+ 공지 작성</button>` : ''}</div>
  <div class="row" style="justify-content:space-between;margin-bottom:12px">
    <div class="seg" role="group" aria-label="분류">${[['all','전체'],...Object.entries(NCATS)].map(([k,l]) => `<button data-act="ncat" data-k="${k}" class="${S.noticeCat===k?'on':''}">${l}</button>`).join('')}</div>
    <input type="search" id="nq" placeholder="제목·내용 검색" value="${esc(S.noticeQ)}" style="max-width:240px">
  </div>
  <div class="tbl-wrap"><table><thead><tr><th style="width:90px">분류</th><th>제목</th><th style="width:70px" class="c">첨부</th><th style="width:130px">작성자</th><th style="width:90px">등록일</th></tr></thead><tbody id="notice-list"></tbody></table></div>`;
}
function renderNoticeList(){
  const tb = $('#notice-list'); if (!tb) return;
  const q = S.noticeQ.trim().toLowerCase();
  const list = sortedNotices().filter(n => (S.noticeCat==='all' || n.category===S.noticeCat) && (!q || (n.title+' '+n.body).toLowerCase().includes(q)));
  tb.innerHTML = list.length ? list.map(n => `<tr class="click" data-act="notice-view" data-id="${esc(n.id)}">
    <td><span class="chip ${n.category==='must'?'bad':''}">${NCATS[n.category]||'공지'}</span></td>
    <td><span class="t-title">${n.pinned?'<span class="chip acc" style="height:18px;font-size:10.5px;margin-right:4px">고정</span>':''}${esc(n.title)}</span><span class="t-sub">${esc(String(n.body||'').slice(0,80))}</span></td>
    <td class="c num">${(n.attachments||[]).length || '—'}</td><td>${who(n.createdBy)}</td><td class="num">${fmtTs(n.createdAt)}</td></tr>`).join('')
    : emptyRow(5, loading('notices') ? '불러오는 중…' : q || S.noticeCat!=='all' ? '<b>조건에 맞는 공지가 없습니다</b>검색어나 분류를 바꿔보세요.' : `<b>등록된 공지가 없습니다</b>${S.isAdmin ? '오른쪽 위 ‘공지 작성’으로 첫 공지를 올리세요.' : 'DX디자인팀이 공지를 올리면 여기에 표시됩니다.'}`);
}

/* ---------- LEAVE ---------- */
function vLeave(){
  const {y,m} = S.cal;
  const first = new Date(y,m,1), start = addDays(first, -first.getDay());
  const last = new Date(y,m+1,0), end = addDays(last, 6-last.getDay());
  const mStart = ymd(first), mEnd = ymd(last);
  const fil = v => S.coFilter==='all' || (memberById(v.memberId)?.companyId || v.companyId)===S.coFilter;
  const inMonth = S.vacations.filter(v => v.start <= mEnd && v.end >= mStart).filter(fil);
  let cells = '';
  for (let d = start; d <= end; d = addDays(d,1)) {
    const s = ymd(d), g = d.getDay(), out = d.getMonth()!==m, hol = HOLIDAYS[s];
    const list = out || isOff(s) ? [] : inMonth.filter(v => v.start <= s && s <= v.end);
    cells += `<div class="cell ${out?'out':''} ${isOff(s)&&!out?'off':''} ${s===TODAY?'today':''}">
      <div class="dn ${g===0||hol?'red':g===6?'blue':''}"><span>${d.getDate()}</span>${hol && !out?`<small>${hol}</small>`:''}</div>
      ${list.slice(0,4).map(lvBtn).join('')}${list.length>4?`<span class="more">+${list.length-4}명</span>`:''}</div>`;
  }
  const agendaDays = [];
  for (let d = new Date(first); d <= last; d = addDays(d,1)) { const s = ymd(d); if (isOff(s)) continue; const l = inMonth.filter(v => v.start<=s && s<=v.end); if (l.length) agendaDays.push([s,l]); }
  const per = {};
  inMonth.forEach(v => {
    const clip = {...v, start: v.start < mStart ? mStart : v.start, end: v.end > mEnd ? mEnd : v.end};
    (per[v.memberId] ||= {n:0, days:0}); per[v.memberId].n++; per[v.memberId].days += leaveDays(clip);
  });
  const perRows = Object.entries(per).sort((a,b) => b[1].days - a[1].days);
  const sorted = [...inMonth].sort((a,b) => a.start.localeCompare(b.start));
  return `<div class="head"><div><h1>휴가 일정</h1><p>정규직 팀원과 협력사 팀원의 연차·반차 일정을 등록하고 공유합니다. 주말과 공휴일은 휴가 일수에서 빠집니다.</p></div>
    ${canW() ? `<button class="btn pri" data-act="vac-new">+ 휴가 등록</button>` : ''}</div>
  <div class="row" style="justify-content:space-between;margin-bottom:12px">
    <div class="row"><button class="btn sm" data-act="cal-prev" aria-label="이전 달">‹</button><h2 style="font-size:16px;min-width:110px;text-align:center" class="num">${y}년 ${m+1}월</h2><button class="btn sm" data-act="cal-next" aria-label="다음 달">›</button><button class="btn sm" data-act="cal-today">오늘</button></div>
    <div class="seg" role="group" aria-label="협력사 필터"><button data-act="cof" data-k="all" class="${S.coFilter==='all'?'on':''}">전체</button>${S.companies.map(c => `<button data-act="cof" data-k="${esc(c.id)}" class="${S.coFilter===c.id?'on':''}"><span class="dot" style="color:${coColor(c.id)}"></span> ${esc(c.name)}</button>`).join('')}</div>
  </div>
  <div class="cal"><div class="wk">${DOW.map((d,i) => `<div class="wh ${i===0?'sun':i===6?'sat':''}">${d}</div>`).join('')}${cells}</div></div>
  <div class="agenda box list">${agendaDays.length ? agendaDays.map(([s,l]) => `<div class="li" style="cursor:default;flex-wrap:wrap"><b class="num" style="width:70px">${fmtD(s)}</b><span class="grow row" style="gap:4px">${l.map(lvBtn).join('')}</span></div>`).join('')
    : `<div class="empty">${loading('vacations') ? '불러오는 중…' : `<b>${m+1}월 휴가 일정이 없습니다</b>${canW() ? '‘휴가 등록’으로 일정을 추가하세요.' : ''}`}</div>`}</div>

  <div class="sec grid2">
    <div><div class="sec-h"><h2>${m+1}월 휴가 목록</h2><span class="muted" style="font-size:12px">${sorted.length}건</span></div>
      <div class="tbl-wrap"><table><thead><tr><th>팀원</th><th>유형</th><th>기간</th><th class="n">일수</th></tr></thead><tbody>
      ${sorted.length ? sorted.map(v => { const mm = memberById(v.memberId); return `<tr class="click" data-act="vac-view" data-id="${esc(v.id)}">
        <td><span class="who">${memberAv(mm, 26)}<span><span class="t-title">${esc(mm?.name||'삭제된 팀원')}</span><span class="t-sub">${esc(coName(mm?.companyId||v.companyId))}</span></span></span></td>
        <td>${(TYPES[v.type]||TYPES.etc).label}</td><td class="num">${v.start===v.end ? fmtD(v.start) : fmtD(v.start)+' – '+fmtD(v.end)}</td><td class="n num">${fmtDays(leaveDays(v))}</td></tr>`; }).join('')
        : emptyRow(4, loading('vacations') ? '불러오는 중…' : '이번 달 등록된 휴가가 없습니다.')}
      </tbody></table></div></div>
    <div><div class="sec-h"><h2>팀원별 사용 일수</h2><span class="muted" style="font-size:12px">${m+1}월 기준</span></div>
      <div class="tbl-wrap"><table><thead><tr><th>팀원</th><th>협력사</th><th class="n">건수</th><th class="n">일수</th></tr></thead><tbody>
      ${perRows.length ? perRows.map(([mid,p]) => { const mm = memberById(mid); return `<tr><td><span class="who">${memberAv(mm, 22)}<span class="t-title">${esc(mm?.name||'삭제된 팀원')}</span></span></td><td>${mm?coChip(mm.companyId):'—'}</td><td class="n num">${p.n}</td><td class="n num">${fmtDays(p.days)}</td></tr>`; }).join('')
        : emptyRow(4, '집계할 휴가가 없습니다.')}
      </tbody></table></div></div>
  </div>`;
}

/* ---------- AX BOARD (free-form) ---------- */
function postCard(p){
  return `<button class="pcard" data-act="post-view" data-id="${esc(p.id)}">
    <span class="pcard-t">${tint(PARTS[p.part], PART_HUE[p.part])}<b>${esc(p.title)}</b></span>
    <span class="pcard-s">${esc(p.summary || '')}</span>
    <span class="pcard-f">${who(p.createdBy)}${toolChips(p.tools, 4)}</span></button>`;
}
function vAxBoard(){
  const posts = S.posts;
  const usable = posts.filter(p => p.status==='done' && p.usable).sort(byUpdated);
  const authors = [...new Set(posts.map(p => p.createdBy).filter(Boolean))].sort((a,b) => nameOf(a).localeCompare(nameOf(b), 'ko'));
  const q = S.postQ.trim().toLowerCase();
  let list = posts.filter(p => (S.postPart==='all' || p.part===S.postPart) && (S.postWho==='all' || p.createdBy===S.postWho)
    && (!q || [p.title, p.summary, p.body, (p.tools||[]).join(' ')].join(' ').toLowerCase().includes(q)));
  if (S.postView==='key') list = list.filter(p => p.priority !== 'normal');
  if (S.postView==='recent') list = list.filter(p => Date.now() - ts(p.updatedAt) < 14*864e5);
  list = [...list].sort(byUpdated);
  const cnt = k => posts.filter(p => p.status===k).length;
  return `<div class="head"><div><h1>AX 실적</h1><p>디자인·퍼블리싱 파트에서 AI를 업무에 적용하며 얻은 활용 사례, 노하우, 산출물을 자유 형식으로 공유하고 관리합니다.</p></div>
    ${canW() ? '<button class="btn pri" data-act="post-new">+ 새 글쓰기</button>' : ''}</div>
  <div class="pstats">
    <span>전체 <b class="num">${posts.length}</b></span><span>${tint('진행 중','purple')} <b class="num">${cnt('doing') + cnt('test')}</b></span><span>${tint('완료','green')} <b class="num">${cnt('done')}</b></span><span>${tint('활용 가능','orange')} <b class="num">${usable.length}</b></span>
    ${Object.entries(PARTS).map(([k,l]) => `<span class="muted">${l} <b class="num" style="color:var(--fg)">${posts.filter(p => p.part===k).length}</b></span>`).join('')}
  </div>

  <div class="sec" style="margin-top:18px"><div class="sec-h"><h2 style="font-size:13.5px">활용 <span class="muted" style="font-weight:500">(완료 · 활용 가능)</span></h2></div>
    ${usable.length ? `<div class="pcards">${usable.slice(0, 8).map(postCard).join('')}</div>` : `<div class="box"><div class="empty">완료된 글 중 ‘활용 가능’으로 표시한 사례가 여기에 모입니다.</div></div>`}</div>

  <div class="sec">
    <div class="ptabs" role="tablist"><button role="tab" class="${S.postWho==='all'?'on':''}" data-act="pwho" data-k="all">전체</button>${authors.map(id => `<button role="tab" class="${S.postWho===id?'on':''}" data-act="pwho" data-k="${esc(id)}">${esc(nameOf(id))}</button>`).join('')}</div>
    <div class="row" style="justify-content:space-between;margin:12px 0">
      <div class="row"><div class="seg" role="group" aria-label="보기">${[['all','전체'],['key','핵심·중요'],['recent','최근 업데이트']].map(([k,l]) => `<button data-act="pview" data-k="${k}" class="${S.postView===k?'on':''}">${l}</button>`).join('')}</div>
        <div class="seg" role="group" aria-label="파트">${[['all','모든 파트'], ...Object.entries(PARTS)].map(([k,l]) => `<button data-act="ppart" data-k="${k}" class="${S.postPart===k?'on':''}">${l}</button>`).join('')}</div></div>
      <input type="search" id="pq" placeholder="제목·내용·AI Tool 검색" value="${esc(S.postQ)}" style="max-width:240px">
    </div>
    <div class="tbl-wrap"><table class="ptable"><thead><tr><th>제목</th><th>요약</th><th>첨부파일</th><th>작성자</th><th>상태</th><th>AI Tool</th><th>중요도</th><th>분류</th><th>일정</th><th>최근 업데이트</th></tr></thead><tbody id="post-list">
      ${list.length ? list.map(p => `<tr class="click" data-act="post-view" data-id="${esc(p.id)}">
        <td class="pt-title"><span class="t-title">${p.part!=='common' ? '' : ''}${esc(p.title)}</span><span class="t-sub">${PARTS[p.part]}${p.companyId ? ' · ' + esc(coName(p.companyId)) : ''}</span></td>
        <td class="pt-sum">${esc(p.summary || '')}</td>
        <td class="pt-file">${(p.attachments||[]).length ? esc(p.attachments[0].name) + (p.attachments.length > 1 ? ` 외 ${p.attachments.length-1}` : '') : '<span class="muted">—</span>'}</td>
        <td>${who(p.createdBy)}</td>
        <td>${tint(P_STATUS[p.status]?.l || '', P_STATUS[p.status]?.h || 'gray')}</td>
        <td class="pt-tools">${toolChips(p.tools, 3)}</td>
        <td>${tint(P_PRI[p.priority]?.l || '', P_PRI[p.priority]?.h || 'gray')}</td>
        <td>${tint(P_CAT[p.category]?.l || '', P_CAT[p.category]?.h || 'gray')}</td>
        <td class="num">${p.start || p.end ? `${shortDate(p.start)} → ${shortDate(p.end)}` : '<span class="muted">—</span>'}</td>
        <td class="num">${fmtTs(p.updatedAt)}</td></tr>`).join('')
        : emptyRow(10, loading('ax_posts') ? '불러오는 중…' : posts.length ? '<b>조건에 맞는 글이 없습니다</b>필터나 검색어를 바꿔보세요.' : `<b>아직 올라온 AX 실적이 없습니다</b>${canW() ? '‘새 글쓰기’로 첫 활용 사례를 올려보세요.' : ''}`)}
    </tbody></table></div>
  </div>`;
}
function postView(id){
  const p = S.posts.find(x => x.id===id); if (!p) return;
  const st = P_STATUS[p.status] || P_STATUS.idea;
  openModal(`${mhead(esc(p.title), `${who(p.createdBy)} · 최근 업데이트 ${fmtTs(p.updatedAt)}${p.companyId ? ' · ' + esc(coName(p.companyId)) : ''}`)}
  <div class="mb">
    <div class="row" style="gap:6px">${tint(PARTS[p.part], PART_HUE[p.part])}${tint(st.l, st.h)}${p.usable ? tint('활용 가능','orange') : ''}${tint(P_CAT[p.category]?.l || '', P_CAT[p.category]?.h || 'gray')}${tint('중요도 ' + (P_PRI[p.priority]?.l || ''), P_PRI[p.priority]?.h || 'gray')}</div>
    ${p.summary ? `<p style="margin:0;font-size:14px;color:var(--fg-2)">${esc(p.summary)}</p>` : ''}
    <dl class="kv">
      <dt>AI Tool</dt><dd class="row" style="gap:4px">${(p.tools||[]).length ? toolChips(p.tools) : '—'}</dd>
      <dt>일정</dt><dd class="num">${p.start || p.end ? `${p.start ? fmtD(p.start) : ''} → ${p.end ? fmtD(p.end) : ''}` : '—'}</dd>
    </dl>
    ${p.body ? `<div class="f"><span class="lab">내용</span><div class="body-text">${linkify(p.body)}</div></div>` : ''}
    <div class="f"><span class="lab">첨부파일 ${(p.attachments||[]).length}개</span>${attachView(p.attachments)}</div>
  </div>
  <div class="mf">${canEditPost(p) ? `<span class="left" id="del-zone"><button class="btn danger" data-act="ask-del">삭제</button></span><button class="btn" data-act="post-edit" data-id="${esc(p.id)}">수정</button>` : ''}<button class="btn ink" data-act="close">닫기</button></div>`, true);
  delTarget = {kind:'post', id};
}
function tgGroup(name, options, selected, multi){
  return `<div class="tg" data-group="${name}" ${multi ? 'data-multi="1"' : ''} role="group">${options.map(([v,l,h]) => `<button type="button" class="chip tint h-${h} tgb" data-act="tg" data-v="${esc(v)}" aria-pressed="${(multi ? selected.includes(v) : selected===v) ? 'true' : 'false'}">${esc(l)}</button>`).join('')}</div>`;
}
const tgVal = name => [...document.querySelectorAll(`.tg[data-group="${name}"] .tgb[aria-pressed="true"]`)].map(b => b.dataset.v);
function postForm(id){
  const p = id ? S.posts.find(x => x.id===id) : null;
  const tools = p?.tools || [];
  const toolOpts = [...TOOLS.map(([t,h]) => [t,t,h]), ...tools.filter(t => !TOOLS.some(x => x[0]===t)).map(t => [t,t,'teal'])];
  openModal(`${mhead(p ? 'AX 실적 수정' : 'AX 실적 올리기', '진행 내용을 한 줄로 요약해 제목으로 써주세요.')}
  <form id="f-post" class="mb" novalidate>
    <div class="f"><label for="p-title">제목</label><input type="text" id="p-title" class="big-input" maxlength="140" value="${esc(p?.title||'')}" placeholder="예: [기업] 상품상세 KV 프롬프트 생성기 개발·배포"></div>
    <div class="f"><label for="p-sum">요약</label><input type="text" id="p-sum" maxlength="240" value="${esc(p?.summary||'')}" placeholder="진행 사항을 간략하게 요약해 주세요"></div>
    <div class="f"><span class="lab">작성자</span><span class="who">${userAv(p?.createdBy || S.me.id, 22)}${esc(nameOf(p?.createdBy || S.me.id))}</span><span class="hint">로그인한 계정으로 자동 등록됩니다</span></div>
    <div class="f"><span class="lab">파트</span>${tgGroup('part', Object.entries(PARTS).map(([k,l]) => [k,l,PART_HUE[k]]), p?.part || lsGet('hub.lastPart') || 'design')}</div>
    <div class="f"><span class="lab">상태</span>${tgGroup('status', Object.entries(P_STATUS).map(([k,o]) => [k,o.l,o.h]), p?.status || 'idea')}
      <label class="check" style="font-size:12.5px"><input type="checkbox" id="p-usable" ${p?.usable ? 'checked' : ''} ${p?.status==='done' ? '' : 'disabled'}> 활용 가능 — 목록 위 ‘활용’ 카드에 표시 (상태가 완료일 때 선택 가능)</label></div>
    <div class="f"><span class="lab">AI Tool <span class="muted" style="font-weight:400">여러 개 선택할 수 있습니다</span></span>${tgGroup('tools', toolOpts, tools, true)}
      <div class="row"><input type="text" id="p-tool-add" maxlength="30" placeholder="목록에 없는 도구 직접 추가" style="max-width:240px"><button type="button" class="btn sm" data-act="tool-add">추가</button></div></div>
    <div class="f"><span class="lab">분류</span>${tgGroup('category', Object.entries(P_CAT).map(([k,o]) => [k,o.l,o.h]), p?.category || 'case')}</div>
    <div class="f"><span class="lab">중요도</span>${tgGroup('priority', Object.entries(P_PRI).map(([k,o]) => [k,o.l,o.h]), p?.priority || 'normal')}</div>
    <div class="fr"><div class="f"><label for="p-start">시작일</label><input type="date" id="p-start" value="${p?.start||''}"></div><div class="f"><label for="p-end">완료일</label><input type="date" id="p-end" value="${p?.end||''}"></div></div>
    ${attachField(p?.attachments, 'posts')}
    <div class="f"><label for="p-body">내용</label><textarea id="p-body" rows="10" maxlength="30000" placeholder="진행한 업무와 새롭게 시도한 내용, 활용 방법·도구·참고 링크 등 진행 과정을 작성해 주세요.">${esc(p?.body||'')}</textarea><span class="hint">링크(https://…)는 자동으로 연결됩니다. 이미지·영상·문서는 첨부파일로 올려주세요.</span></div>
    <div class="err" id="f-err"></div>
  </form>
  <div class="mf"><button class="btn" data-act="close">취소</button><button class="btn pri" data-submit="f-post">${p ? '저장' : '등록'}</button></div>`, true);
  $('#f-post').dataset.id = id || '';
}
async function savePost(){
  const title = $('#p-title').value.trim(); if (!title) return $('#f-err').textContent = '제목을 입력해주세요.';
  const start = $('#p-start').value || null, end = $('#p-end').value || null;
  if (start && end && end < start) return $('#f-err').textContent = '완료일이 시작일보다 빠릅니다.';
  if (upl.uploading) return $('#f-err').textContent = '파일을 올리는 중입니다. 잠시 기다려주세요.';
  const status = tgVal('status')[0] || 'idea', part = tgVal('part')[0] || 'design';
  const id = $('#f-post').dataset.id, old = id ? S.posts.find(x => x.id===id) : null;
  const row = {title, summary:$('#p-sum').value.trim(), body:$('#p-body').value.trim(), part, status, usable: status==='done' && $('#p-usable').checked,
    tools: tgVal('tools'), category: tgVal('category')[0] || 'case', priority: tgVal('priority')[0] || 'normal', start_date:start, end_date:end, attachments: cleanFiles()};
  const ok = await run(id ? sb.from('ax_posts').update(row).eq('id', id).select('id') : sb.from('ax_posts').insert(row).select('id'), true);
  if (ok) { upl.saved = true; removeDropped(old?.attachments, row.attachments); lsSet('hub.lastPart', part); closeModal(); reload('ax_posts'); toast(old ? 'AX 실적을 수정했습니다.' : 'AX 실적을 올렸습니다.'); }
}

/* ---------- AI IMAGE (designers) ---------- */
function axCell(a){
  const st = statusOf(a);
  return `<button class="cellbtn" data-act="ax-view" data-id="${esc(a.id)}"><span class="rate num"><span class="dot st-${st}" title="${STATUS[st].l}"></span>${pct(a.aiImage,a.total) ?? '–'}%</span><span class="cnt num">${a.aiImage} / ${a.total}</span></button>`;
}
function sumCell(sm){
  return sm.n ? `<span class="cellsum"><span class="rate num">${pct(sm.ai,sm.tot) ?? '–'}%</span><span class="cnt num">${sm.ai} / ${sm.tot}</span></span>` : '<span class="miss">·</span>';
}
function vAx(){
  const yr = S.axYear, rm = prevMonth();
  const AX = S.ax.filter(isPartnerAx), pcos = partnerCos(), pm = imgMembers();
  const yrs = [...new Set([now.getFullYear(), ...AX.map(a => Number(a.month.slice(0,4)))])].sort();
  const AXY = AX.filter(a => a.month.startsWith(yr+'-'));
  const firstM = AXY.length ? Math.min(...AXY.map(a => Number(a.month.slice(5)))) : 1;
  const months = []; for (let i = firstM; i <= 12; i++) months.push(`${yr}-${pad(i)}`);
  const pastMonths = months.filter(m => m <= curMonth);
  if (!S.axMonth || !S.axMonth.startsWith(yr+'-')) S.axMonth = [...new Set(AXY.map(a => a.month))].sort().filter(m => m <= curMonth).pop() || (rm.startsWith(yr+'-') ? rm : pastMonths[pastMonths.length-1] || `${yr}-01`);
  const mo = S.axMonth;
  const shownCos = S.axCo==='all' ? pcos : pcos.filter(c => c.id===S.axCo);

  // KPI for selected month
  const inMo = AX.filter(a => a.month===mo), tMo = sumAx(inMo);
  const subMem = new Set(inMo.filter(a => a.memberId).map(a => a.memberId));
  const tiles = [
    `<div class="tile"><span>${monthLabel(mo)} 협력사 합계 적용률</span><b>${tMo.n ? (pct(tMo.ai,tMo.tot) ?? '–')+'%' : '–'}</b><small class="num">AI 이미지 ${tMo.ai} / 전체 ${tMo.tot}${tMo.workN ? ` · AI 활용 ${tMo.work}건` : ''}</small></div>`,
    ...pcos.map(c => { const sm = sumAx(inMo.filter(a => a.companyId===c.id)); const mem = pm.filter(m => m.companyId===c.id);
      const leg = inMo.some(a => a.companyId===c.id && !a.memberId);
      return `<div class="tile"><span><span class="dot" style="color:${coColor(c.id)}"></span> ${esc(c.name)} 적용률</span><b>${sm.n ? (pct(sm.ai,sm.tot) ?? '–')+'%' : '–'}</b><small class="num">AI ${sm.ai} / 전체 ${sm.tot} · ${leg ? '회사 단위 기록' : `제출 ${mem.filter(m => subMem.has(m.id)).length}/${mem.length}명`}</small></div>`; })
  ].join('');

  // chart: monthly partner total
  const sums = months.map(m => sumAx(AX.filter(a => a.month===m && (S.axCo==='all' || a.companyId===S.axCo))));
  const pts = months.map((m,i) => ({m, v: pct(sums[i].ai, sums[i].tot)}));
  const W = Math.max(320, Math.min(1200, (($('#view')?.clientWidth) || 900) - 100)), H = 190, L = 34, B = 26, T = 18, cw = (W-L-6)/pts.length, bw = Math.min(30, cw*.5);
  const yv = v => T + (H-T-B) * (1 - v/100);
  const chart = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="월별 AI 적용률">
    ${[0,25,50,75,100].map(g => `<line class="grid" x1="${L}" x2="${W-6}" y1="${yv(g)}" y2="${yv(g)}"/><text class="ax-l" x="${L-6}" y="${yv(g)+4}" text-anchor="end">${g}%</text>`).join('')}
    ${pts.map((p,i) => { const cx = L + cw*i + cw/2; return `${p.v!=null ? `<rect class="bar ${p.m===mo ? 'cur':''}" x="${cx-bw/2}" y="${yv(p.v)}" width="${bw}" height="${yv(0)-yv(p.v)}" rx="3"/><text class="val" x="${cx}" y="${yv(p.v)-5}" text-anchor="middle">${p.v}%</text>` : ''}<text class="ax-l" x="${cx}" y="${H-8}" text-anchor="middle">${Number(p.m.slice(5))}월</text>`; }).join('')}
  </svg>`;

  // per-member matrix grouped by company
  const rowsHtml = shownCos.map(c => {
    const cAX = AXY.filter(a => a.companyId===c.id);
    const mem = pm.filter(m => m.companyId===c.id);
    const extraIds = [...new Set(cAX.filter(a => a.memberId && !mem.some(m => m.id===a.memberId)).map(a => a.memberId))];
    const people = [...mem, ...extraIds.map(id => memberById(id) || {id, name:'삭제된 팀원', companyId:c.id})];
    const legacy = cAX.filter(a => !a.memberId), legacyMonths = new Set(legacy.map(a => a.month));
    const grp = `<tr class="grp"><td><span class="dot" style="color:${coColor(c.id)}"></span> <b>${esc(c.name)}</b> <span class="muted" style="font-weight:400">합계</span></td>${months.map(m => `<td>${sumCell(sumAx(cAX.filter(a => a.month===m)))}</td>`).join('')}<td>${sumCell(sumAx(cAX))}</td></tr>`;
    const memRows = people.map(m => { const mine = cAX.filter(a => a.memberId===m.id);
      return `<tr><td class="pcell"><span class="who">${memberAv(m, 22)}${esc(m.name)}</span></td>${months.map(mm => { const a = mine.find(x => x.month===mm);
        if (a) return `<td>${axCell(a)}</td>`;
        if (mm <= rm && canW() && !legacyMonths.has(mm)) return `<td><button class="cellbtn" data-act="ax-new" data-member="${esc(m.id)}" data-month="${mm}"><span class="miss">미제출</span></button></td>`;
        return `<td><span class="miss">·</span></td>`; }).join('')}<td>${sumCell(sumAx(mine))}</td></tr>`; }).join('');
    const legRow = legacy.length ? `<tr><td class="pcell"><span class="muted">회사 단위 (이관)</span></td>${months.map(mm => { const a = legacy.find(x => x.month===mm); return `<td>${a ? axCell(a) : '<span class="miss">·</span>'}</td>`; }).join('')}<td>${sumCell(sumAx(legacy))}</td></tr>` : '';
    const none = !people.length && !legacy.length ? `<tr><td class="pcell" colspan="${months.length+2}"><span class="muted">등록된 팀원이 없습니다. 협력사 · 팀원에서 추가하세요.</span></td></tr>` : '';
    return grp + memRows + legRow + none;
  }).join('');
  const totals = months.map(m => sumAx(AXY.filter(a => a.month===m && shownCos.some(c => c.id===a.companyId))));
  const yearTot = sumAx(AXY.filter(a => shownCos.some(c => c.id===a.companyId)));

  const filt = S.axFilter;
  const list = [...AX].filter(a => filt==='all' || (filt==='pending' ? statusOf(a)!=='approved' : statusOf(a)===filt))
    .filter(a => S.axCo==='all' || a.companyId===S.axCo)
    .sort((a,b) => ts(b.submittedAt) - ts(a.submittedAt));

  return `<div class="head"><div><h1>AI 이미지 제작 현황</h1><p>협력사 <b>디자인 파트</b> 팀원이 개인별로 월 실적(AI 이미지 제작 건수, AI 활용 제작 건수, 전체 이미지 제작 수)과 증빙을 올리면, 협력사별 합계와 팀원별 실적이 함께 집계됩니다. 디자인·퍼블리싱의 다른 AX 활동은 ‘AX 실적’ 메뉴에 올려주세요.</p></div>
    <div class="row">${yrs.length>1 ? `<select id="axyear" style="width:auto">${yrs.map(y => `<option value="${y}" ${y===yr?'selected':''}>${y}년</option>`).join('')}</select>` : ''}${canW() ? `<button class="btn pri" data-act="ax-new">+ 실적 제출</button>` : ''}</div></div>

  <div class="row" style="justify-content:space-between;margin-bottom:12px">
    <div class="row"><label for="axmonth" class="muted" style="font-size:12.5px">기준 월</label><select id="axmonth" style="width:auto">${pastMonths.map(m => `<option value="${m}" ${m===mo?'selected':''}>${monthLabel(m,true)}</option>`).join('')}</select></div>
    <div class="seg" role="group" aria-label="협력사 필터"><button data-act="axco" data-k="all" class="${S.axCo==='all'?'on':''}">전체</button>${pcos.map(c => `<button data-act="axco" data-k="${esc(c.id)}" class="${S.axCo===c.id?'on':''}"><span class="dot" style="color:${coColor(c.id)}"></span> ${esc(c.name)}</button>`).join('')}</div>
  </div>
  <div class="tiles fit">${tiles}</div>

  <div class="sec"><div class="sec-h"><h2>${yr}년 디자이너별 AI 이미지 적용 현황</h2><span class="muted" style="font-size:12px">적용률 = AI 이미지 제작 건수 ÷ 전체 이미지 제작 수 · 칸을 누르면 제출 내용과 첨부를 볼 수 있습니다</span></div>
  <div class="tbl-wrap"><table class="mx"><thead><tr><th>협력사 / 팀원</th>${months.map(m => `<th class="${m===mo?'curm':''}">${Number(m.slice(5))}월</th>`).join('')}<th>연간</th></tr></thead><tbody>
    ${pcos.length ? rowsHtml : emptyRow(months.length+2, loading('companies') ? '불러오는 중…' : '등록된 협력사가 없습니다.')}
    <tr class="hl"><td>적용률 (${S.axCo==='all' ? '협력사 합계' : esc(coName(S.axCo))})</td>${totals.map(t => `<td class="num"><b>${t.tot ? pct(t.ai,t.tot)+'%' : '–'}</b></td>`).join('')}<td class="num"><b>${yearTot.tot ? pct(yearTot.ai,yearTot.tot)+'%' : '–'}</b></td></tr>
    <tr class="hl"><td>AI 활용 제작 (합계)</td>${totals.map(t => `<td class="num">${t.workN ? t.work+'건' : '–'}</td>`).join('')}<td class="num">${yearTot.workN ? yearTot.work+'건' : '–'}</td></tr>
  </tbody></table></div>
  <div class="legend"><span><span class="dot st-submitted"></span>검토 대기</span><span><span class="dot st-revise"></span>보완 요청</span><span><span class="dot st-approved"></span>확인 완료</span><span>회사 단위 (이관) = 개인별 내역이 없는 기존 현황판 기록</span></div></div>

  <div class="sec"><div class="sec-h"><h2>월별 적용률 추이</h2><span class="muted" style="font-size:12px">${S.axCo==='all' ? '협력사 합계' : esc(coName(S.axCo))} · 진한 막대가 기준 월</span></div><div class="chart">${chart}</div></div>

  <div class="sec"><div class="sec-h"><h2>제출 내역</h2>
    <div class="seg" role="group" aria-label="상태 필터">${[['pending','처리 필요'],['submitted','검토 대기'],['revise','보완 요청'],['approved','확인 완료'],['all','전체']].map(([k,l]) => `<button data-act="axf" data-k="${k}" class="${filt===k?'on':''}">${l}</button>`).join('')}</div></div>
    <div class="tbl-wrap"><table><thead><tr><th>팀원</th><th>협력사</th><th>실적 월</th><th class="n">AI 이미지</th><th class="n">AI 활용</th><th class="n">전체</th><th class="n">적용률</th><th class="c">첨부</th><th>상태</th><th>제출</th></tr></thead><tbody>
    ${list.length ? list.map(a => { const st = STATUS[statusOf(a)], m = memberById(a.memberId); return `<tr class="click" data-act="ax-view" data-id="${esc(a.id)}">
      <td>${a.memberId ? `<span class="who">${memberAv(m, 22)}${esc(axWho(a))}</span>` : `<span class="muted">${axWho(a)}</span>`}</td><td>${coChip(a.companyId)}</td><td class="num">${monthLabel(a.month,true)}</td><td class="n num">${a.aiImage}</td><td class="n num">${a.aiWork ?? '–'}</td><td class="n num">${a.total}</td>
      <td class="n num"><b>${pct(a.aiImage,a.total) ?? '–'}%</b></td><td class="c num">${(a.attachments||[]).length || '<span class="muted">없음</span>'}</td>
      <td><span class="chip ${st.c}">${st.l}</span></td><td><span class="who">${esc(a.submittedBy ? nameOf(a.submittedBy) : '이관 데이터')}</span><span class="t-sub num">${fmtTs(a.submittedAt)}</span></td></tr>`; }).join('')
      : emptyRow(10, loading('ax_reports') ? '불러오는 중…' : filt==='pending' ? '<b>처리할 제출이 없습니다</b>검토 대기나 보완 요청 상태의 제출이 생기면 여기에 표시됩니다.' : '해당 상태의 제출이 없습니다.')}
    </tbody></table></div></div>`;
}

/* ---------- TEAM ---------- */
function vTeam(){
  const yr = now.getFullYear();
  const usedOf = mid => S.vacations.filter(v => v.memberId===mid && v.start.startsWith(yr+'')).reduce((s,v) => s+leaveDays(v), 0);
  const groups = [...S.companies].sort((a,b) => (a.kind==='internal'?0:1) - (b.kind==='internal'?0:1) || (a.sort||0) - (b.sort||0));
  return `<div class="head"><div><h1>협력사 · 팀원</h1><p>휴가 등록에 쓰이는 정규직 팀원과 협력사 팀원 명단입니다. ${yr}년 사용 휴가 일수가 함께 표시됩니다. 로그인 계정은 ‘사용자 관리’에서 따로 관리합니다.</p></div>
    <div class="row">${S.isAdmin ? `<button class="btn" data-act="co-new">+ 그룹 추가</button>` : ''}${writableCos().length ? `<button class="btn pri" data-act="mem-new">+ 팀원 추가</button>` : ''}</div></div>
  ${groups.length ? `<div class="cos">${groups.map(c => { const ms = S.members.filter(m => m.companyId===c.id).sort((a,b) => a.name.localeCompare(b.name,'ko'));
    return `<section class="cocard"><header><b><span class="dot" style="color:${coColor(c.id)}"></span>${esc(c.name)}<span class="chip ${c.kind==='internal'?'acc':''}" style="height:20px;font-size:11px">${c.kind==='internal'?'정규직':'협력사'}</span></b><span class="row"><span class="muted" style="font-size:12px">${ms.length}명</span>${S.isAdmin ? `<button class="icon-btn" data-act="co-edit" data-id="${esc(c.id)}" aria-label="${esc(c.name)} 설정">설정</button>` : ''}</span></header>
    ${ms.length ? ms.map(m => `<div class="mrow">${memberAv(m, 30)}<span class="grow"><b>${esc(m.name)}</b> ${tint(MEMBER_PARTS[m.part]||'디자인', m.part==='publishing'?'teal':m.part==='etc'?'gray':'blue', 'style="height:18px;font-size:10.5px"')} <small>${esc(m.role||'')}</small></span><small class="num">${fmtDays(usedOf(m.id))}</small>${canCo(c.id) ? `<button class="icon-btn" data-act="mem-edit" data-id="${esc(m.id)}" aria-label="${esc(m.name)} 수정">수정</button>` : ''}</div>`).join('')
      : `<div class="empty" style="padding:22px 14px">등록된 팀원이 없습니다.${canCo(c.id) ? '<br>‘팀원 추가’로 명단을 만드세요.' : ''}</div>`}</section>`; }).join('')}</div>`
    : `<div class="box"><div class="empty">${loading('companies') ? '불러오는 중…' : `<b>등록된 그룹이 없습니다</b>${S.isAdmin ? '‘그룹 추가’로 시작하세요.' : 'DX디자인팀이 그룹을 등록하면 표시됩니다.'}`}</div></div>`}`;
}

/* ---------- USERS (admin) ---------- */
function vUsers(){
  if (!S.isAdmin) return `<div class="box"><div class="empty">DX 관리자만 볼 수 있는 메뉴입니다.</div></div>`;
  const byEmail = {}; Object.values(S.profiles).forEach(p => byEmail[p.email] = p);
  const allowedMap = {}; S.allowed.forEach(a => allowedMap[a.email] = a);
  const waiting = Object.values(S.profiles).filter(p => p.role==='pending');
  const rows = [...S.allowed].sort((a,b) => (a.role===b.role ? 0 : a.role==='admin' ? -1 : b.role==='admin' ? 1 : 0) || (a.companyId||'').localeCompare(b.companyId||'') || a.email.localeCompare(b.email));
  const notJoined = rows.filter(a => !(byEmail[a.email]?.linked)).length;
  return `<div class="head"><div><h1>사용자 관리</h1><p>이메일을 등록하면 <b>초대 코드</b>가 만들어집니다. ‘안내 복사’로 사이트 주소·이메일·초대 코드를 복사해 본인에게 따로 전달하면, 본인이 로그인 화면의 ‘비밀번호 만들기’에서 계정을 만듭니다.</p></div>
    <button class="btn pri" data-act="user-new">+ 사용자 등록</button></div>
  ${waiting.length ? `<div class="sec" style="margin-top:0"><div class="sec-h"><h2>승인 대기</h2><span class="muted" style="font-size:12px">초대 코드 없이 만들어진 계정입니다. 본인이 맞는지 확인한 뒤 승인하세요.</span></div>
    <div class="tbl-wrap"><table><thead><tr><th>이메일</th><th>가입일</th><th>상태</th><th></th></tr></thead><tbody>
    ${waiting.map(p => { const a = allowedMap[p.email]; return `<tr><td>${esc(p.email)}</td><td class="num">${fmtTs(p.createdAt)}</td><td>${a ? `<span class="chip warn">등록된 이메일 · ${roleLabel(a.role, a.companyId)}</span>` : '<span class="muted" style="font-size:12px">등록되지 않은 이메일</span>'}</td>
      <td class="n">${a ? `<button class="btn sm pri" data-act="user-approve" data-email="${esc(p.email)}">승인</button>` : `<button class="btn sm" data-act="user-new" data-email="${esc(p.email)}">등록 후 승인</button>`}</td></tr>`; }).join('')}
    </tbody></table></div></div>` : ''}
  <div class="sec" ${waiting.length ? '' : 'style="margin-top:0"'}><div class="sec-h"><h2>등록된 사용자</h2><span class="muted" style="font-size:12px">${rows.length}명${notJoined ? ` · 아직 계정을 만들지 않은 사람 ${notJoined}명` : ''}</span></div>
  <div class="tbl-wrap"><table><thead><tr><th>이메일</th><th>이름</th><th>권한</th><th>소속</th><th>계정</th><th>초대 코드</th><th></th></tr></thead><tbody>
    ${rows.length ? rows.map(a => { const prof = byEmail[a.email], joined = prof?.linked;
      return `<tr><td><span class="who">${prof ? userAv(prof.id, 22) : avImg(null, a.email, a.name || a.email, 22)}${esc(a.email)}</span></td><td>${esc(a.name || '—')}</td><td><span class="chip ${a.role==='admin'?'acc':''}">${roleLabel(a.role, a.companyId)}</span></td><td>${a.companyId ? coChip(a.companyId) : '<span class="muted">—</span>'}</td>
      <td>${joined ? '<span class="chip ok">사용 중</span>' : prof ? '<span class="chip warn">승인 대기</span>' : '<span class="muted" style="font-size:12px">계정 만들기 전</span>'}</td>
      <td>${joined ? '<span class="muted" style="font-size:12px">사용됨</span>' : `<span class="row" style="gap:6px;flex-wrap:nowrap"><code class="icode">${esc(a.inviteCode || '—')}</code><button class="btn sm" data-act="invite-copy" data-email="${esc(a.email)}">안내 복사</button></span>`}</td>
      <td class="n"><button class="icon-btn" data-act="user-edit" data-email="${esc(a.email)}">수정</button></td></tr>`; }).join('')
      : emptyRow(7, loading('allowed_emails') ? '불러오는 중…' : '등록된 사용자가 없습니다.')}
  </tbody></table></div></div>`;
}

/* ---------- ACCOUNT ---------- */
function vAccount(){
  return `<div class="head"><div><h1>내 계정</h1><p>로그인 정보와 권한을 확인하고 비밀번호를 바꿀 수 있습니다.</p></div><button class="btn" data-act="logout">로그아웃</button></div>
  <div class="row" style="gap:16px;margin-bottom:24px">${userAv(S.me.id, 72)}
    <div style="display:flex;flex-direction:column;gap:8px"><b style="font-size:15px">${esc(S.me.name || S.me.email)}</b>
      <div class="row"><label class="btn sm" for="my-photo">${S.profiles[S.me.id]?.avatarPath ? '사진 바꾸기' : '프로필 사진 올리기'}</label><input type="file" id="my-photo" accept="image/*" hidden>${S.profiles[S.me.id]?.avatarPath ? '<button class="btn sm" data-act="my-photo-del">사진 삭제</button>' : ''}</div>
      <span class="muted" style="font-size:11.5px">정사각형으로 잘려 저장됩니다. JPG·PNG 권장</span></div></div>
  <dl class="kv">
    <dt>이메일</dt><dd>${esc(S.me.email)}</dd>
    <dt>이름</dt><dd>${esc(S.me.name || '—')} <span class="muted" style="font-size:12px">· 이름은 DX 관리자가 사용자 관리에서 바꿀 수 있습니다</span></dd>
    <dt>역할</dt><dd>${roleLabel(S.role, S.myCompany)}</dd>
    <dt>소속</dt><dd>${S.myCompany ? coChip(S.myCompany) : '—'}</dd>
  </dl>
  <div class="sec" style="max-width:420px"><div class="sec-h"><h2>비밀번호 변경</h2></div>
    <form id="f-pw" class="mb" style="padding:0" novalidate>
      <div class="f"><label for="pw1">새 비밀번호</label><input type="password" id="pw1" autocomplete="new-password" minlength="8" style="width:100%;height:36px;border:1px solid var(--line-2);border-radius:8px;background:var(--panel);padding:0 10px"></div>
      <div class="f"><label for="pw2">새 비밀번호 확인</label><input type="password" id="pw2" autocomplete="new-password" style="width:100%;height:36px;border:1px solid var(--line-2);border-radius:8px;background:var(--panel);padding:0 10px"></div>
      <div class="err" id="pw-err"></div>
      <div><button class="btn ink" data-act="pw-save" type="button">비밀번호 바꾸기</button></div>
    </form></div>`;
}

/* ---------- modal ---------- */
function openModal(html, wide){
  const m = $('#modal');
  m.innerHTML = `<div class="ov" data-ov><div class="modal ${wide?'wide':''}" role="dialog" aria-modal="true">${html}</div></div>`;
  m.hidden = false;
  hydrate(m); bindDrop();
  const f = m.querySelector('input:not([type=file]):not([readonly]),select,textarea'); (f || m.querySelector('button'))?.focus();
}
function closeModal(){
  if (upl && !upl.saved && upl.fresh.size) removeFiles([...upl.fresh]);
  if (memPhoto && !memPhoto.saved && memPhoto.fresh.size) removeFiles([...memPhoto.fresh]);
  memPhoto = null;
  const m = $('#modal'); m.hidden = true; m.innerHTML = ''; upl = null; delTarget = null;
}
const mhead = (t, sub) => `<div class="mh"><div><h3>${t}</h3>${sub?`<p>${sub}</p>`:''}</div><button class="icon-btn" data-act="close" aria-label="닫기">✕</button></div>`;

/* attachments widget */
let upl = null; // {files:[], uploading:0, fresh:Set<path>, folder, saved}
function attachField(existing, folder){
  upl = {files:(existing||[]).map(f => ({...f})), uploading:0, fresh:new Set(), folder, saved:false};
  return `<div class="f"><span class="lab">첨부파일</span>
    <label class="drop" id="drop" for="upl-in">파일을 끌어 놓거나 눌러서 선택<br><small>엑셀·PPT·PDF·이미지·ZIP 등 모든 형식 · 파일당 50MB</small></label>
    <input type="file" id="upl-in" multiple hidden>
    <div class="files" id="upl-list">${fileRows()}</div></div>`;
}
function fileIcon(f){ return isImg(f) && f.path ? `<img alt="" data-path="${esc(f.path)}">` : esc(extOf(f.name).toUpperCase().slice(0,4) || 'FILE'); }
function fileRows(){
  if (!upl) return '';
  return upl.files.map((f,i) => `<div class="file"><span class="ext">${f.path ? fileIcon(f) : '…'}</span><span class="grow"><span class="nm">${esc(f.name)}</span><small>${f.err ? `<span style="color:var(--bad)">${esc(f.err)}</span>` : f.path ? fmtSize(f.size||0) : '올리는 중…'}</small></span><button type="button" class="icon-btn" data-act="upl-rm" data-i="${i}" aria-label="${esc(f.name)} 빼기">빼기</button></div>`).join('');
}
function syncUpl(){
  const l = $('#upl-list'); if (l) { l.innerHTML = fileRows(); hydrate(l); }
  const sb_ = $('#modal [data-submit]'); if (sb_) sb_.disabled = !!(upl && upl.uploading > 0);
}
async function addFiles(fileList){
  if (!upl) return;
  const cur = upl;
  for (const file of fileList) {
    const entry = {name:file.name, size:file.size, type:file.type || 'application/octet-stream'};
    cur.files.push(entry);
    if (file.size > MAX_FILE) { entry.err = '50MB 초과'; syncUpl(); continue; }
    const ext = (extOf(file.name).replace(/[^a-z0-9]/g,'') || 'bin').slice(0,10);
    const path = `${typeof cur.folder==='function' ? cur.folder() : cur.folder}/${curMonth}/${uid()}.${ext}`;
    cur.uploading++; syncUpl();
    try {
      const {error} = await sb.storage.from(BUCKET).upload(path, file, {contentType: entry.type, upsert:false});
      if (error) entry.err = errMsg(error); else { entry.path = path; cur.fresh.add(path); }
    } catch (e) { entry.err = errMsg(e); }
    cur.uploading--; if (cur === upl) syncUpl();
  }
}
const cleanFiles = () => upl.files.filter(f => f.path && !f.err).map(f => ({path:f.path, name:f.name, type:f.type, size:f.size||0}));
function attachView(list){
  if (!list || !list.length) return '<div class="muted" style="font-size:12.5px">첨부 없음</div>';
  const imgs = list.filter(isImg), rest = list.filter(f => !isImg(f));
  return `${imgs.length ? `<div class="gallery">${imgs.map(f => `<button type="button" class="thumb" data-act="lb" data-path="${esc(f.path)}" data-name="${esc(f.name)}" data-ready="1"><img alt="${esc(f.name)}" data-path="${esc(f.path)}" loading="lazy"><span>${esc(f.name)}</span></button>`).join('')}</div>` : ''}
    ${rest.length ? `<div class="files">${rest.map(f => `<div class="file"><span class="ext">${esc(extOf(f.name).toUpperCase().slice(0,4) || 'FILE')}</span><span class="grow"><span class="nm">${esc(f.name)}</span><small>${fmtSize(f.size||0)}</small></span>
      ${isPdf(f) ? `<a class="btn sm" data-path="${esc(f.path)}" target="_blank" rel="noopener">열기</a>` : ''}<a class="btn sm" data-path="${esc(f.path)}" data-dl="${esc(f.name)}">다운로드</a></div>`).join('')}</div>` : ''}`;
}
function lightbox(path, name){
  const lb = $('#lb');
  lb.innerHTML = `<div class="lightbox" data-lbclose><img alt="${esc(name)}" data-path="${esc(path)}"><div class="row"><span style="color:#fff;font-size:12.5px">${esc(name)}</span><a class="btn sm" data-path="${esc(path)}" data-dl="${esc(name)}">다운로드</a><button class="btn sm" data-lbclose>닫기</button></div></div>`;
  lb.hidden = false; hydrate(lb);
}

/* notice */
function noticeView(id){
  const n = S.notices.find(x => x.id===id); if (!n) return;
  openModal(`${mhead(esc(n.title), `${NCATS[n.category]||'공지'}${n.pinned?' · 상단 고정':''} · ${esc(nameOf(n.createdBy))} · ${fmtTs(n.createdAt)}${n.updatedAt && ts(n.updatedAt) - ts(n.createdAt) > 60e3 ? ' (수정 '+fmtTs(n.updatedAt)+')' : ''}`)}
    <div class="mb"><div class="body-text">${esc(n.body)}</div>${(n.attachments||[]).length ? `<div class="f"><span class="lab">첨부파일 ${n.attachments.length}개</span>${attachView(n.attachments)}</div>` : ''}</div>
    <div class="mf">${S.isAdmin ? `<span class="left" id="del-zone"><button class="btn danger" data-act="ask-del">삭제</button></span><button class="btn" data-act="notice-edit" data-id="${esc(n.id)}">수정</button>` : ''}<button class="btn ink" data-act="close">닫기</button></div>`, true);
  delTarget = {kind:'notice', id};
}
function noticeForm(id){
  const n = id ? S.notices.find(x => x.id===id) : null;
  openModal(`${mhead(n ? '공지 수정' : '공지 작성', '협력사 전체에 공유됩니다.')}
  <form id="f-notice" class="mb" novalidate>
    <div class="f"><label for="n-title">제목</label><input type="text" id="n-title" maxlength="120" value="${esc(n?.title||'')}" required></div>
    <div class="fr"><div class="f"><label for="n-cat">분류</label><select id="n-cat">${Object.entries(NCATS).map(([k,l]) => `<option value="${k}" ${(n?.category||'notice')===k?'selected':''}>${l}</option>`).join('')}</select></div>
      <div class="f"><span class="lab">노출</span><label class="check" style="height:36px"><input type="checkbox" id="n-pin" ${n?.pinned?'checked':''}> 목록 상단에 고정</label></div></div>
    <div class="f"><label for="n-body">내용</label><textarea id="n-body" rows="9" maxlength="20000">${esc(n?.body||'')}</textarea></div>
    ${attachField(n?.attachments, 'notices')}
    <div class="err" id="f-err"></div>
  </form>
  <div class="mf"><button class="btn" data-act="close">취소</button><button class="btn pri" data-submit="f-notice">${n ? '저장' : '등록'}</button></div>`, true);
  $('#f-notice').dataset.id = id || '';
}
async function saveNotice(){
  const title = $('#n-title').value.trim(), body = $('#n-body').value.trim();
  if (!title) return $('#f-err').textContent = '제목을 입력해주세요.';
  const id = $('#f-notice').dataset.id, old = id ? S.notices.find(x => x.id===id) : null;
  const row = {title, body, category:$('#n-cat').value, pinned:$('#n-pin').checked, attachments:cleanFiles()};
  const ok = await run(id ? sb.from('notices').update(row).eq('id', id).select('id') : sb.from('notices').insert(row).select('id'), true);
  if (ok) { upl.saved = true; removeDropped(old?.attachments, row.attachments); closeModal(); reload('notices'); toast(old ? '공지를 수정했습니다.' : '공지를 등록했습니다.'); }
}

/* vacation */
function memberOptions(sel){
  return writableCos().map(c => { const ms = S.members.filter(m => m.companyId===c.id).sort((a,b) => a.name.localeCompare(b.name,'ko'));
    return ms.length ? `<optgroup label="${esc(c.name)}">${ms.map(m => `<option value="${esc(m.id)}" ${sel===m.id?'selected':''}>${esc(m.name)}${m.role?' · '+esc(m.role):''}</option>`).join('')}</optgroup>` : ''; }).join('');
}
function vacForm(id){
  const v = id ? S.vacations.find(x => x.id===id) : null;
  if (!S.members.some(m => canCo(m.companyId))) {
    openModal(`${mhead('휴가 등록')}<div class="mb"><div class="empty"><b>팀원 명단이 비어 있습니다</b>휴가를 등록하려면 먼저 ‘협력사 · 팀원’에서 팀원을 추가하세요.</div></div>
      <div class="mf"><button class="btn" data-act="close">닫기</button><a class="btn pri" href="#team" data-act="close">팀원 추가하러 가기</a></div>`); return;
  }
  const lastMember = lsGet('hub.lastMember');
  const start = v?.start || TODAY;
  openModal(`${mhead(v ? '휴가 수정' : '휴가 등록', '주말·공휴일은 휴가 일수에서 자동으로 빠집니다.')}
  <form id="f-vac" class="mb" novalidate>
    <div class="f"><label for="v-mem">팀원</label><select id="v-mem"><option value="">팀원 선택</option>${memberOptions(v?.memberId || (memberById(lastMember) ? lastMember : ''))}</select></div>
    <div class="f"><label for="v-type">유형</label><select id="v-type">${Object.entries(TYPES).map(([k,t]) => `<option value="${k}" ${(v?.type||'annual')===k?'selected':''}>${t.label}</option>`).join('')}</select></div>
    <div class="fr"><div class="f"><label for="v-start">시작일</label><input type="date" id="v-start" value="${start}"></div>
      <div class="f"><label for="v-end">종료일</label><input type="date" id="v-end" value="${v?.end || start}"></div></div>
    <div class="f"><label for="v-memo">메모 <span class="muted" style="font-weight:400">(선택)</span></label><input type="text" id="v-memo" maxlength="200" value="${esc(v?.memo||'')}" placeholder="예: 업무 대행 김OO, 긴급 연락 가능"></div>
    <div class="hint" id="v-days"></div>
    <div class="err" id="f-err"></div>
  </form>
  <div class="mf"><button class="btn" data-act="close">취소</button><button class="btn pri" data-submit="f-vac">${v ? '저장' : '등록'}</button></div>`);
  $('#f-vac').dataset.id = id || '';
  syncVacForm();
}
function syncVacForm(){
  const type = $('#v-type')?.value; if (!type) return;
  const half = TYPES[type].unit < 1, s = $('#v-start').value, e = $('#v-end');
  if (half) { e.value = s; e.disabled = true; } else { e.disabled = false; if (e.value < s) e.value = s; }
  const d = s && e.value >= s ? leaveDays({type, start:s, end:e.value}) : null;
  $('#v-days').textContent = d==null ? '' : d===0 ? '선택한 날짜는 주말 또는 공휴일입니다.' : `차감 일수: ${fmtDays(d)}`;
}
async function saveVac(){
  const memberId = $('#v-mem').value, type = $('#v-type').value, start = $('#v-start').value;
  const end = TYPES[type].unit < 1 ? start : $('#v-end').value;
  if (!memberId) return $('#f-err').textContent = '팀원을 선택해주세요.';
  if (!start || !end) return $('#f-err').textContent = '날짜를 입력해주세요.';
  if (end < start) return $('#f-err').textContent = '종료일이 시작일보다 빠릅니다.';
  if (leaveDays({type,start,end})===0) return $('#f-err').textContent = '주말·공휴일만 포함된 기간입니다. 날짜를 확인해주세요.';
  const id = $('#f-vac').dataset.id, m = memberById(memberId);
  const row = {member_id:memberId, company_id:m.companyId, type, start_date:start, end_date:end, memo:$('#v-memo').value.trim()};
  const ok = await run(id ? sb.from('vacations').update(row).eq('id', id).select('id') : sb.from('vacations').insert(row).select('id'), true);
  if (ok) { lsSet('hub.lastMember', memberId); closeModal(); reload('vacations'); toast(id ? '휴가를 수정했습니다.' : '휴가를 등록했습니다.'); }
}
function vacView(id){
  const v = S.vacations.find(x => x.id===id); if (!v) return;
  const m = memberById(v.memberId), t = TYPES[v.type]||TYPES.etc, cid = m?.companyId || v.companyId;
  openModal(`${mhead(`<span class="who" style="gap:10px">${memberAv(m, 32)}${esc(m?.name||'삭제된 팀원')} · ${t.label}</span>`, esc(coName(cid)))}
    <div class="mb"><div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="stat"><span>기간</span><b style="font-size:15px">${v.start===v.end ? fmtD(v.start) : fmtD(v.start)+' – '+fmtD(v.end)}</b></div><div class="stat"><span>차감 일수</span><b>${fmtDays(leaveDays(v))}</b></div></div>
    ${v.memo ? `<div class="f"><span class="lab">메모</span><div class="body-text">${esc(v.memo)}</div></div>` : ''}
    <div class="muted" style="font-size:12px">등록 ${esc(nameOf(v.createdBy))} · ${fmtTs(v.createdAt)}</div></div>
    <div class="mf">${canCo(cid) ? `<span class="left" id="del-zone"><button class="btn danger" data-act="ask-del">삭제</button></span><button class="btn" data-act="vac-edit" data-id="${esc(v.id)}">수정</button>` : ''}<button class="btn ink" data-act="close">닫기</button></div>`);
  delTarget = {kind:'vacation', id};
}

/* AX */
function axForm(memberId, month){
  const pm = imgMembers().filter(m => canCo(m.companyId));
  if (!pm.length) {
    openModal(`${mhead('AI 이미지 실적 제출')}<div class="mb"><div class="empty"><b>디자인 파트 협력사 팀원이 없습니다</b>AI 이미지 실적은 협력사 디자인 파트 팀원 개인별로 제출합니다. ‘협력사 · 팀원’에서 디지털·기업 팀원을 추가하고 파트를 ‘디자인’으로 지정하세요.</div></div>
      <div class="mf"><button class="btn" data-act="close">닫기</button><a class="btn pri" href="#team" data-act="close">팀원 추가하러 가기</a></div>`); return;
  }
  const last = lsGet('hub.lastAxMember');
  const mid = memberId && pm.some(m => m.id===memberId) ? memberId : (pm.find(m => m.id===last) || pm[0]).id;
  const mo = month || prevMonth();
  const opts = partnerCos().map(c => { const ms = pm.filter(m => m.companyId===c.id);
    return ms.length ? `<optgroup label="${esc(c.name)}">${ms.map(m => `<option value="${esc(m.id)}" ${m.id===mid?'selected':''}>${esc(m.name)}${m.role?' · '+esc(m.role):''}</option>`).join('')}</optgroup>` : ''; }).join('');
  openModal(`${mhead('AI 이미지 실적 제출', '디자이너 1명 × 월 1건씩 제출합니다. 같은 팀원·같은 달을 다시 제출하면 기존 내용이 수정됩니다.')}
  <form id="f-ax" class="mb" novalidate>
    <div class="fr"><div class="f"><label for="a-mem">팀원</label><select id="a-mem">${opts}</select></div>
      <div class="f"><label for="a-month">실적 월</label><input type="month" id="a-month" value="${mo}" max="${curMonth}" placeholder="YYYY-MM"></div></div>
    <div class="hint" id="a-state"></div>
    <div class="fr">
      <div class="f"><label for="a-ai">AI 이미지 제작 건수</label><input type="number" id="a-ai" min="0" step="1" inputmode="numeric"><span class="hint">AI로 생성해 결과물에 적용한 이미지</span></div>
      <div class="f"><label for="a-work">AI 활용 제작 건수</label><input type="number" id="a-work" min="0" step="1" inputmode="numeric"><span class="hint">기획·리터칭·카피 등 제작 과정에 AI를 쓴 작업</span></div>
      <div class="f"><label for="a-total">전체 이미지 제작 수</label><input type="number" id="a-total" min="0" step="1" inputmode="numeric"><span class="hint">해당 월 본인이 제작한 전체 이미지</span></div>
    </div>
    <div class="hint" id="a-rate"></div>
    <div class="f"><label for="a-note">특이사항 <span class="muted" style="font-weight:400">(선택)</span></label><textarea id="a-note" rows="3" maxlength="2000" style="min-height:76px" placeholder="예: 상품상세 2D 아이콘 제작 건수 증가"></textarea></div>
    <div id="a-files"></div>
    <div class="err" id="f-err"></div>
  </form>
  <div class="mf"><button class="btn" data-act="close">취소</button><button class="btn pri" data-submit="f-ax">제출</button></div>`, true);
  loadAxForm();
}
function loadAxForm(){
  const mid = $('#a-mem').value, mo = $('#a-month').value;
  if (upl && !upl.saved && upl.fresh.size) removeFiles([...upl.fresh]);
  const ex = S.ax.find(a => a.memberId===mid && a.month===mo);
  $('#a-ai').value = ex?.aiImage ?? ''; $('#a-work').value = ex?.aiWork ?? ''; $('#a-total').value = ex?.total ?? ''; $('#a-note').value = ex?.note || '';
  $('#a-files').innerHTML = attachField(ex?.attachments, () => `ax/${memberById($('#a-mem').value)?.companyId || 'etc'}`);
  hydrate($('#a-files')); bindDrop();
  const st = ex ? statusOf(ex) : null, m = memberById(mid);
  $('#a-state').innerHTML = `${m ? coChip(m.companyId) + ' ' : ''}` + (!ex ? '새 실적' : st==='approved' ? '<span class="chip ok">확인 완료</span> 이미 확인된 실적입니다. 수정하면 다시 검토 대기로 바뀝니다.'
    : st==='revise' ? `<span class="chip bad">보완 요청</span> ${esc(S.reviews[ex.id]?.comment || '')}` : '<span class="chip warn">검토 대기</span> 제출된 실적을 수정합니다.');
  syncRate();
}
function syncRate(){
  const ai = Number($('#a-ai').value), tot = Number($('#a-total').value);
  $('#a-rate').textContent = $('#a-ai').value!=='' && tot>0 ? `적용률 ${pct(ai,tot)}%` : '';
}
async function saveAx(){
  const err = $('#f-err');
  const mid = $('#a-mem').value, mo = $('#a-month').value.trim(), m = memberById(mid);
  const vals = ['a-ai','a-work','a-total'].map(i => $('#'+i).value.trim());
  if (!m) return err.textContent = '팀원을 선택해주세요.';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mo)) return err.textContent = '실적 월을 YYYY-MM 형식으로 입력해주세요.';
  if (vals[0]==='' || vals[2]==='') return err.textContent = 'AI 이미지 제작 건수와 전체 이미지 제작 수는 꼭 입력해주세요.';
  const [ai, work, tot] = vals.map(v => v==='' ? null : Number(v));
  if ([ai,work,tot].some(v => v!=null && (!Number.isInteger(v) || v<0))) return err.textContent = '건수는 0 이상의 정수로 입력해주세요.';
  if (ai > tot) return err.textContent = 'AI 이미지 제작 건수가 전체 이미지 제작 수보다 많습니다.';
  if (upl.uploading) return err.textContent = '파일을 올리는 중입니다. 잠시 기다려주세요.';
  const id = `${mid}_${mo}`, ex = S.ax.find(a => a.id===id);
  const row = {id, member_id:mid, company_id:m.companyId, month:mo, ai_image:ai, ai_work:work, total:tot, note:$('#a-note').value.trim(), attachments:cleanFiles()};
  const ok = await run(sb.from('ax_reports').upsert(row, {onConflict:'id'}).select('id'), true);
  if (ok) { upl.saved = true; removeDropped(ex?.attachments, row.attachments); lsSet('hub.lastAxMember', mid); closeModal(); reload('ax_reports'); toast(`${m.name} 님의 ${monthLabel(mo)} 실적을 제출했습니다.`); }
}
function axView(id){
  const a = S.ax.find(x => x.id===id); if (!a) return;
  const st = statusOf(a), r = S.reviews[a.id], m = memberById(a.memberId);
  const reviewNote = r && r.comment ? `<div class="review"><div class="row"><span class="chip ${STATUS[r.status]?.c||''}">${STATUS[r.status]?.l||''}</span><span class="muted" style="font-size:12px">${esc(nameOf(r.reviewedBy))} · ${fmtTs(r.reviewedAt)}${st==='submitted' ? ' · 이후 재제출됨' : ''}</span></div><div class="body-text" style="font-size:13px">${esc(r.comment)}</div></div>` : '';
  const title = a.memberId ? `<span class="who" style="gap:10px">${memberAv(m, 32)}${esc(axWho(a))} · ${monthLabel(a.month,true)}</span>` : `${esc(coName(a.companyId))} · ${monthLabel(a.month,true)} (회사 단위)`;
  openModal(`${mhead(title, `${esc(coName(a.companyId))} · 제출 ${esc(a.submittedBy ? nameOf(a.submittedBy) : '이관 데이터')} · ${fmtTs(a.submittedAt)}`)}
  <div class="mb">
    <div class="row"><span class="chip ${STATUS[st].c}">${STATUS[st].l}</span></div>
    <div class="stats"><div class="stat"><span>AI 이미지 제작</span><b>${a.aiImage}</b></div><div class="stat"><span>AI 활용 제작</span><b>${a.aiWork ?? '–'}</b></div><div class="stat"><span>전체 이미지</span><b>${a.total}</b></div><div class="stat"><span>적용률</span><b>${pct(a.aiImage,a.total) ?? '–'}%</b></div></div>
    ${a.note ? `<div class="f"><span class="lab">특이사항</span><div class="body-text">${esc(a.note)}</div></div>` : ''}
    <div class="f"><span class="lab">첨부파일 ${(a.attachments||[]).length}개</span>${attachView(a.attachments)}</div>
    ${reviewNote}
    ${S.isAdmin ? `<div class="f"><label for="r-comment">검토 의견</label><textarea id="r-comment" rows="3" style="min-height:70px" maxlength="2000" placeholder="보완 요청 시 필요한 내용을 적어주세요."></textarea><div class="err" id="f-err"></div></div>` : ''}
  </div>
  <div class="mf">
    ${S.isAdmin ? `<span class="left" id="del-zone"><button class="btn danger" data-act="ask-del">삭제</button></span>` : ''}
    ${a.memberId && canW() ? `<button class="btn" data-act="ax-new" data-member="${esc(a.memberId)}" data-month="${a.month}">수정</button>` : ''}
    ${S.isAdmin ? `<button class="btn" data-act="review" data-k="revise" style="color:var(--bad)">보완 요청</button><button class="btn pri" data-act="review" data-k="approved">확인 완료</button>` : `<button class="btn ink" data-act="close">닫기</button>`}
  </div>`, true);
  delTarget = {kind:'ax', id};
}
async function review(status){
  const id = delTarget?.id, comment = ($('#r-comment')?.value || '').trim();
  if (status==='revise' && !comment) return $('#f-err').textContent = '보완 요청 내용을 적어주세요.';
  const ok = await run(sb.from('ax_reviews').upsert({report_id:id, status, comment}, {onConflict:'report_id'}).select('report_id'), true);
  if (ok) { closeModal(); reload('ax_reviews'); toast(status==='approved' ? '확인 완료로 처리했습니다.' : '보완을 요청했습니다.'); }
}

/* team */
let memPhoto = null; // {orig, cur, fresh:Set, saved}
function memPhotoHtml(){
  const id = $('#f-mem')?.dataset.id || 'new', name = $('#m-name')?.value || '?';
  return `${avImg(memPhoto.cur, id, name, 56)}
    <div class="row"><label class="btn sm" for="m-photo">${memPhoto.cur ? '사진 바꾸기' : '사진 올리기'}</label><input type="file" id="m-photo" accept="image/*" hidden>
    ${memPhoto.cur ? '<button type="button" class="btn sm" data-act="m-photo-del">사진 빼기</button>' : ''}<span class="muted" style="font-size:11.5px" id="m-photo-msg"></span></div>`;
}
function syncMemPhoto(){ const w = $('#m-photo-wrap'); if (w) { w.innerHTML = memPhotoHtml(); hydrate(w); } }
function memForm(id){
  const m = id ? memberById(id) : null;
  const cos = writableCos();
  memPhoto = {orig: m?.photoPath || null, cur: m?.photoPath || null, fresh: new Set(), saved: false};
  openModal(`${mhead(m ? '팀원 수정' : '팀원 추가')}
  <form id="f-mem" class="mb" novalidate>
    <div class="f"><span class="lab">프로필 사진 <span class="muted" style="font-weight:400">(선택)</span></span><div class="row" id="m-photo-wrap" style="gap:12px"></div></div>
    <div class="f"><label for="m-name">이름</label><input type="text" id="m-name" maxlength="40" value="${esc(m?.name||'')}"></div>
    <div class="fr"><div class="f"><label for="m-co">소속</label><select id="m-co" ${cos.length===1 || m ? 'disabled' : ''}>${cos.map(c => `<option value="${esc(c.id)}" ${(m?.companyId||lsGet('hub.lastCo')||S.myCompany)===c.id?'selected':''}>${esc(c.name)}${c.kind==='internal'?' (정규직)':''}</option>`).join('')}</select></div>
    <div class="f"><label for="m-part">파트</label><select id="m-part">${Object.entries(MEMBER_PARTS).map(([k,l]) => `<option value="${k}" ${(m?.part||'design')===k?'selected':''}>${l}</option>`).join('')}</select></div></div>
    <div class="f"><label for="m-role">직무 <span class="muted" style="font-weight:400">(선택)</span></label><input type="text" id="m-role" maxlength="40" value="${esc(m?.role||'')}" placeholder="예: 3D 디자이너"><span class="hint">AI 이미지 제작 현황에는 협력사의 디자인 파트 팀원만 나옵니다.</span></div>
    ${m ? '<div class="hint">팀원을 삭제하면 그 팀원의 휴가 기록도 함께 삭제됩니다. AX 실적이 있는 팀원은 삭제할 수 없습니다. 소속을 바꾸려면 삭제 후 새로 추가해주세요.</div>' : ''}
    <div class="err" id="f-err"></div>
  </form>
  <div class="mf">${m ? `<span class="left" id="del-zone"><button class="btn danger" data-act="ask-del">삭제</button></span>` : ''}<button class="btn" data-act="close">취소</button><button class="btn pri" data-submit="f-mem">${m ? '저장' : '추가'}</button></div>`);
  $('#f-mem').dataset.id = id || '';
  syncMemPhoto();
  delTarget = {kind:'member', id};
}
async function pickMemPhoto(file){
  const st = memPhoto; if (!st) return;
  const btn = $('#modal [data-submit]'); if (btn) btn.disabled = true;
  const msg = $('#m-photo-msg'); if (msg) msg.textContent = '올리는 중…';
  try {
    const path = await uploadPhoto(file, `avatars/members/${$('#m-co').value}`);
    if (st.cur && st.fresh.has(st.cur)) { removeFiles([st.cur]); st.fresh.delete(st.cur); }
    st.fresh.add(path); st.cur = path;
    if (st === memPhoto) syncMemPhoto();
  } catch (e) { if (msg) msg.textContent = e.message && !e.code ? e.message : errMsg(e); }
  if (btn) btn.disabled = false;
}
async function saveMem(){
  const name = $('#m-name').value.trim(); if (!name) return $('#f-err').textContent = '이름을 입력해주세요.';
  const id = $('#f-mem').dataset.id;
  const row = {name, company_id:$('#m-co').value, title:$('#m-role').value.trim(), part:$('#m-part').value, photo_path: memPhoto.cur};
  const ok = await run(id ? sb.from('members').update(row).eq('id', id).select('id') : sb.from('members').insert(row).select('id'), true);
  if (ok) {
    memPhoto.saved = true;
    if (memPhoto.orig && memPhoto.orig !== memPhoto.cur) removeFiles([memPhoto.orig]);
    closeModal(); reload('members'); toast(id ? '팀원 정보를 수정했습니다.' : `${name} 님을 추가했습니다.`);
  }
}
function coForm(id){
  const c = id ? coById(id) : null;
  const hasData = c && (S.members.some(m => m.companyId===c.id) || S.ax.some(a => a.companyId===c.id));
  openModal(`${mhead(c ? '그룹 설정' : '그룹 추가', '정규직 팀은 휴가·팀원에만, 협력사는 AX 실적까지 표시됩니다.')}<form id="f-co" class="mb" novalidate>
    <div class="f"><label for="c-name">이름</label><input type="text" id="c-name" maxlength="40" value="${esc(c?.name||'')}" placeholder="예: 디지털"></div>
    <div class="f"><label for="c-kind">종류</label><select id="c-kind"><option value="partner" ${c?.kind!=='internal'?'selected':''}>협력사</option><option value="internal" ${c?.kind==='internal'?'selected':''}>정규직 팀</option></select></div>
    ${c && hasData ? '<div class="hint">팀원이나 실적이 있는 그룹은 삭제할 수 없습니다.</div>' : ''}
    <div class="err" id="f-err"></div></form>
  <div class="mf">${c && !hasData ? `<span class="left" id="del-zone"><button class="btn danger" data-act="ask-del">삭제</button></span>` : ''}<button class="btn" data-act="close">취소</button><button class="btn pri" data-submit="f-co">${c ? '저장' : '추가'}</button></div>`);
  $('#f-co').dataset.id = id || '';
  delTarget = {kind:'company', id};
}
async function saveCo(){
  const name = $('#c-name').value.trim(); if (!name) return $('#f-err').textContent = '이름을 입력해주세요.';
  const kind = $('#c-kind').value, id = $('#f-co').dataset.id;
  if (id) {
    if (await run(sb.from('companies').update({name, kind}).eq('id', id).select('id'), true)) { closeModal(); reload('companies'); toast('그룹 정보를 바꿨습니다.'); }
    return;
  }
  const newId = 'co' + Date.now().toString(36);
  const sort = Math.max(0, ...S.companies.map(c => c.sort||0)) + 1;
  if (await run(sb.from('companies').insert({id:newId, name, sort, kind}).select('id'), true)) { closeModal(); reload('companies'); toast(`${name}을(를) 추가했습니다.`); }
}

/* users */
function userForm(email, presetEmail){
  const a = email ? S.allowed.find(x => x.email===email) : null;
  const self = a && a.email===S.me.email;
  openModal(`${mhead(a ? '사용자 수정' : '사용자 등록', a ? esc(a.email) : '등록한 이메일로 로그인하면 바로 사이트를 쓸 수 있습니다.')}
  <form id="f-user" class="mb" novalidate>
    ${a ? '' : `<div class="f"><label for="u-email">이메일</label><input type="text" id="u-email" inputmode="email" autocomplete="off" value="${esc(presetEmail||'')}" placeholder="name@company.com"></div>`}
    <div class="f"><label for="u-name">이름</label><input type="text" id="u-name" maxlength="40" value="${esc(a?.name||'')}" placeholder="화면에 표시될 이름"></div>
    <div class="fr"><div class="f"><label for="u-role">권한</label><select id="u-role" ${self?'disabled':''}>${[['partner','작성자 (소속 데이터만)'],['admin','DX 관리자 (전체)'],['viewer','열람 전용']].map(([r,l]) => `<option value="${r}" ${(a?.role||'partner')===r?'selected':''}>${l}</option>`).join('')}</select></div>
      <div class="f"><label for="u-co">소속</label><select id="u-co"><option value="">없음</option>${[...S.companies].sort((x,y) => (x.kind==='internal'?0:1)-(y.kind==='internal'?0:1)).map(c => `<option value="${esc(c.id)}" ${a?.companyId===c.id?'selected':''}>${esc(c.name)}${c.kind==='internal'?' (정규직)':' (협력사)'}</option>`).join('')}</select></div></div>
    ${a ? `<div class="f"><span class="lab">초대 코드</span><div class="row"><code class="icode" id="u-code">${esc(a.inviteCode || '—')}</code><button type="button" class="btn sm" data-act="invite-copy" data-email="${esc(a.email)}">안내 복사</button><button type="button" class="btn sm" data-act="invite-reissue" data-email="${esc(a.email)}">코드 재발급</button></div><span class="hint">코드가 다른 사람에게 알려졌다면 재발급하세요. 이미 계정을 만든 사람에게는 영향이 없습니다.</span></div>` : ''}
    ${!a && presetEmail && Object.values(S.profiles).some(p => p.email===presetEmail && p.role==='pending') ? '<div class="banner" style="margin:0">이 이메일로 이미 만들어진 계정이 있습니다. 등록하면 그 계정을 바로 승인합니다. 본인이 맞는지 확인해 주세요.</div>' : ''}
    <div class="hint">작성자는 공지사항을 뺀 팀원·휴가·AX 실적·첨부를 모두 올리고 고칠 수 있습니다. 소속은 표시용이며, 정규직 소속이면 ‘팀원’, 협력사 소속이면 ‘협력사’로 보입니다. DX 관리자는 여기에 더해 공지 작성, 실적 검토, 그룹·사용자 관리를 합니다.${self ? ' 본인 계정의 권한은 바꿀 수 없습니다.' : ''}</div>
    <div class="err" id="f-err"></div>
  </form>
  <div class="mf">${a && !self ? `<span class="left" id="del-zone"><button class="btn danger" data-act="ask-del">접근 해제</button></span>` : ''}<button class="btn" data-act="close">취소</button><button class="btn pri" data-submit="f-user">${a ? '저장' : '등록'}</button></div>`);
  $('#f-user').dataset.email = email || '';
  $('#f-user').dataset.preset = presetEmail || '';
  delTarget = {kind:'user', id:email};
}
async function saveUser(){
  const editing = $('#f-user').dataset.email;
  const email = (editing || $('#u-email').value).trim().toLowerCase();
  const role = $('#u-role').value, companyId = $('#u-co').value || null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return $('#f-err').textContent = '이메일 형식을 확인해주세요.';
  if (role==='partner' && !companyId) return $('#f-err').textContent = '작성자는 소속을 선택해주세요. (표시용)';
  if (!editing && S.allowed.some(a => a.email===email)) return $('#f-err').textContent = '이미 등록된 이메일입니다.';
  const row = {email, name:$('#u-name').value.trim(), role, company_id: role==='partner' ? companyId : (role==='admin' ? null : companyId)};
  const preset = $('#f-user').dataset.preset;
  const ok = await run(sb.from('allowed_emails').upsert(row, {onConflict:'email'}).select('email,invite_code'), true);
  if (!ok) return;
  let msg = editing ? '사용자 정보를 수정했습니다.' : `${email} 을(를) 등록했습니다. ‘안내 복사’로 초대 코드를 전달하세요.`;
  if (!editing && preset===email && Object.values(S.profiles).some(p => p.email===email && p.role==='pending')) {
    const {error} = await sb.rpc('approve_user', {p_email: email});
    msg = error ? '등록했지만 승인하지 못했습니다. 승인 대기 목록에서 다시 승인해 주세요.' : `${email} 을(를) 등록하고 승인했습니다.`;
  }
  closeModal(); load('allowed_emails'); reload('profiles'); toast(msg);
}

/* delete flow */
let delTarget = null;
async function doDelete(){
  const t = delTarget; if (!t) return;
  let ok = null;
  if (t.kind==='notice') { const n = S.notices.find(x => x.id===t.id); ok = await run(sb.from('notices').delete().eq('id', t.id).select('id'), true); if (ok) { removeFiles((n?.attachments||[]).map(f => f.path)); reload('notices'); } }
  if (t.kind==='vacation') { ok = await run(sb.from('vacations').delete().eq('id', t.id).select('id'), true); if (ok) reload('vacations'); }
  if (t.kind==='member') { const m = memberById(t.id); ok = await run(sb.from('members').delete().eq('id', t.id).select('id'), true); if (ok) { if (m?.photoPath) removeFiles([m.photoPath]); if (memPhoto) memPhoto.saved = true; reload('members'); reload('vacations'); } }
  if (t.kind==='post') { const p = S.posts.find(x => x.id===t.id); ok = await run(sb.from('ax_posts').delete().eq('id', t.id).select('id'), true); if (ok) { removeFiles((p?.attachments||[]).map(f => f.path)); reload('ax_posts'); } }
  if (t.kind==='company') { ok = await run(sb.from('companies').delete().eq('id', t.id).select('id'), true); if (ok) reload('companies'); }
  if (t.kind==='ax') { const a = S.ax.find(x => x.id===t.id); ok = await run(sb.from('ax_reports').delete().eq('id', t.id).select('id'), true); if (ok) { removeFiles((a?.attachments||[]).map(f => f.path)); reload('ax_reports'); reload('ax_reviews'); } }
  if (t.kind==='user') { ok = await run(sb.from('allowed_emails').delete().eq('email', t.id).select('email'), true); if (ok) { load('allowed_emails'); reload('profiles'); } }
  if (ok) { delTarget = null; closeModal(); toast(t.kind==='user' ? '접근을 해제했습니다.' : '삭제했습니다.'); }
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  if (e.target.matches('[data-lbclose]')) { $('#lb').hidden = true; $('#lb').innerHTML = ''; return; }
  if (e.target.matches('[data-ov]')) { closeModal(); return; }
  if (e.target.closest('[data-theme-toggle]')) return;
  const sbm = e.target.closest('[data-submit]');
  if (sbm) { e.preventDefault(); ({'f-notice':saveNotice,'f-vac':saveVac,'f-ax':saveAx,'f-mem':saveMem,'f-co':saveCo,'f-user':saveUser,'f-post':savePost})[sbm.dataset.submit]?.(); return; }
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id, k = el.dataset.k;
  switch (a) {
    case 'close': closeModal(); break;
    case 'notice-view': noticeView(id); break;
    case 'post-new': if (canW()) postForm(); break;
    case 'post-view': postView(id); break;
    case 'post-edit': postForm(id); break;
    case 'pwho': S.postWho = k; render(); break;
    case 'pview': S.postView = k; render(); break;
    case 'ppart': S.postPart = k; render(); break;
    case 'hday': S.homeDay = el.dataset.d; render(); break;
    case 'hnotice': S.homeNotice = k; render(); break;
    case 'tg': { const g = el.closest('.tg'); if (g.dataset.multi) el.setAttribute('aria-pressed', el.getAttribute('aria-pressed')==='true' ? 'false' : 'true');
      else g.querySelectorAll('.tgb').forEach(b => b.setAttribute('aria-pressed', b===el ? 'true' : 'false'));
      if (g.dataset.group==='status') { const u = $('#p-usable'); if (u) { u.disabled = el.dataset.v!=='done'; if (u.disabled) u.checked = false; } }
      break; }
    case 'tool-add': addTool(); break;
    case 'notice-new': noticeForm(); break;
    case 'notice-edit': noticeForm(id); break;
    case 'ncat': S.noticeCat = k; render(); break;
    case 'vac-new': if (canW()) vacForm(); break;
    case 'vac-view': vacView(id); break;
    case 'vac-edit': vacForm(id); break;
    case 'cal-prev': S.cal.m--; if (S.cal.m<0){S.cal.m=11;S.cal.y--;} render(); break;
    case 'cal-next': S.cal.m++; if (S.cal.m>11){S.cal.m=0;S.cal.y++;} render(); break;
    case 'cal-today': S.cal = {y:now.getFullYear(), m:now.getMonth()}; render(); break;
    case 'cof': S.coFilter = k; render(); break;
    case 'ax-new': if (canW()) axForm(el.dataset.member, el.dataset.month); break;
    case 'ax-goto': e.preventDefault(); if (el.dataset.month) S.axMonth = el.dataset.month; if (el.dataset.co) S.axCo = el.dataset.co; S.axYear = Number((el.dataset.month||curMonth).slice(0,4)); if (location.hash==='#aiimg') render(); else location.hash = 'aiimg'; break;
    case 'axco': S.axCo = k; render(); break;
    case 'ax-view': axView(id); break;
    case 'axf': S.axFilter = k; render(); break;
    case 'review': review(k); break;
    case 'mem-new': memForm(); break;
    case 'mem-edit': memForm(id); break;
    case 'co-new': coForm(); break;
    case 'co-edit': coForm(id); break;
    case 'm-photo-del': if (memPhoto) { if (memPhoto.cur && memPhoto.fresh.has(memPhoto.cur)) { removeFiles([memPhoto.cur]); memPhoto.fresh.delete(memPhoto.cur); } memPhoto.cur = null; syncMemPhoto(); } break;
    case 'my-photo-del': setMyPhoto(null); break;
    case 'user-new': userForm(null, el.dataset.email); break;
    case 'invite-copy': { const a = S.allowed.find(x => x.email===el.dataset.email); if (a) copyText(inviteText(a), '초대 안내'); break; }
    case 'invite-reissue': reissueCode(el.dataset.email); break;
    case 'user-approve': approveUser(el.dataset.email); break;
    case 'user-edit': userForm(el.dataset.email); break;
    case 'upl-rm': { const f = upl.files.splice(Number(el.dataset.i),1)[0]; if (f?.path && upl.fresh.has(f.path)) { upl.fresh.delete(f.path); removeFiles([f.path]); } syncUpl(); break; }
    case 'lb': lightbox(el.dataset.path, el.dataset.name); break;
    case 'ask-del': $('#del-zone').innerHTML = `<span class="confirm">정말 ${delTarget?.kind==='user' ? '접근을 해제' : '삭제'}할까요? <button class="btn sm danger" data-act="do-del">${delTarget?.kind==='user' ? '해제' : '삭제'}</button><button class="btn sm" data-act="no-del">취소</button></span>`; break;
    case 'no-del': $('#del-zone').innerHTML = `<button class="btn danger" data-act="ask-del">${delTarget?.kind==='user' ? '접근 해제' : '삭제'}</button>`; break;
    case 'do-del': doDelete(); break;
    case 'logout': sb.auth.signOut().then(() => location.replace(location.pathname)); break;
    case 'pw-save': savePassword(); break;
  }
});
document.addEventListener('input', e => {
  if (e.target.id==='nq') { S.noticeQ = e.target.value; renderNoticeList(); }
  if (e.target.id==='pq') { S.postQ = e.target.value; clearTimeout(pqT); pqT = setTimeout(() => { render(); setTimeout(() => { const i = $('#pq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 20); }, 250); }
  if (['a-ai','a-total'].includes(e.target.id)) syncRate();
});
document.addEventListener('change', e => {
  const id = e.target.id;
  if (id==='v-type' || id==='v-start' || id==='v-end') syncVacForm();
  if (id==='a-mem' || id==='a-month') loadAxForm();
  if (id==='upl-in') { addFiles([...e.target.files]); e.target.value = ''; }
  if (id==='m-photo' && e.target.files[0]) { pickMemPhoto(e.target.files[0]); e.target.value = ''; }
  if (id==='my-photo' && e.target.files[0]) { setMyPhoto(e.target.files[0]); e.target.value = ''; }
  if (id==='axyear') { S.axYear = Number(e.target.value); S.axMonth = null; render(); }
  if (id==='axmonth') { S.axMonth = e.target.value; render(); }
});
document.addEventListener('keydown', e => {
  if (e.key==='Escape') { if (!$('#lb').hidden) { $('#lb').hidden = true; return; } if (!$('#modal').hidden) closeModal(); }
  if (e.key==='Enter' && e.target.id==='p-tool-add') { e.preventDefault(); addTool(); return; }
  if (e.key==='Enter' && e.target.matches('#modal input[type=text],#modal input[type=number]')) { e.preventDefault(); $('#modal [data-submit]')?.click(); }
});
document.addEventListener('submit', e => e.preventDefault());
function bindDrop(){
  const d = $('#drop'); if (!d || d.dataset.bound) return; d.dataset.bound = '1';
  d.addEventListener('dragover', e => { e.preventDefault(); d.classList.add('over'); });
  d.addEventListener('dragleave', () => d.classList.remove('over'));
  d.addEventListener('drop', e => { e.preventDefault(); d.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
}
async function setMyPhoto(file){
  const old = S.profiles[S.me.id]?.avatarPath || null;
  let path = null;
  try {
    if (file) { toast('사진을 올리는 중입니다…'); path = await uploadPhoto(file, `avatars/users/${S.me.id}`); }
    const {error} = await sb.rpc('set_my_avatar', {p_path: path});
    if (error) { if (path) removeFiles([path]); return toast(errMsg(error)); }
    if (old) removeFiles([old]);
    if (S.profiles[S.me.id]) S.profiles[S.me.id] = {...S.profiles[S.me.id], avatarPath: path};
    render(); reload('profiles');
    toast(file ? '프로필 사진을 바꿨습니다.' : '프로필 사진을 삭제했습니다.');
  } catch (e) { toast(e.message && !e.code ? e.message : errMsg(e)); }
}
let pqT = 0;
async function reissueCode(email){
  const code = genCode();
  const ok = await run(sb.from('allowed_emails').update({invite_code: code}).eq('email', email).select('email'), true);
  if (!ok) return;
  const a = S.allowed.find(x => x.email===email); if (a) a.inviteCode = code;
  const el = $('#u-code'); if (el) el.textContent = code;
  load('allowed_emails'); toast('새 초대 코드를 만들었습니다.');
}
async function approveUser(email){
  const {error} = await sb.rpc('approve_user', {p_email: email});
  if (error) return toast(errMsg(error));
  reload('profiles'); load('allowed_emails'); toast(`${email} 계정을 승인했습니다.`);
}
function addTool(){
  const i = $('#p-tool-add'), v = (i?.value || '').trim(); if (!v) return;
  const g = $('.tg[data-group="tools"]');
  const ex = [...g.querySelectorAll('.tgb')].find(b => b.dataset.v.toLowerCase()===v.toLowerCase());
  if (ex) ex.setAttribute('aria-pressed', 'true');
  else g.insertAdjacentHTML('beforeend', `<button type="button" class="chip tint h-${toolHue(v)} tgb" data-act="tg" data-v="${esc(v)}" aria-pressed="true">${esc(v)}</button>`);
  i.value = '';
}
async function savePassword(){
  const p1 = $('#pw1').value, p2 = $('#pw2').value, err = $('#pw-err');
  if (p1.length < 8) return err.textContent = '8자 이상으로 입력해주세요.';
  if (p1 !== p2) return err.textContent = '두 비밀번호가 다릅니다.';
  const {error} = await sb.auth.updateUser({password:p1});
  if (error) return err.textContent = errMsg(error);
  $('#pw1').value = $('#pw2').value = ''; err.textContent = ''; toast('비밀번호를 바꿨습니다.');
}
function onHash(){ const h = location.hash.slice(1); S.route = ROUTES.includes(h) ? h : 'home'; closeModal(); render(); window.scrollTo(0,0); }
window.addEventListener('hashchange', onHash);
let rsT; let lastW = window.innerWidth;
window.addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(() => { if (S.route==='ax' && Math.abs(window.innerWidth - lastW) > 40) { lastW = window.innerWidth; render(); } }, 200); });

/* ---------- theme toggle ---------- */
const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const rootEl = document.documentElement;
const effTheme = () => rootEl.getAttribute('data-theme') || (mq && mq.matches ? 'dark' : 'light');
function syncTheme(){
  const dark = effTheme()==='dark';
  document.querySelectorAll('[data-theme-toggle]').forEach(b => {
    b.dataset.dark = dark ? '1' : '';
    b.setAttribute('aria-checked', String(dark));
    b.setAttribute('aria-label', dark ? '라이트 모드로 전환' : '다크 모드로 전환');
    b.title = dark ? '라이트 모드로 전환' : '다크 모드로 전환';
  });
}
document.addEventListener('click', e => {
  if (!e.target.closest('[data-theme-toggle]')) return;
  const next = effTheme()==='dark' ? 'light' : 'dark';
  rootEl.setAttribute('data-theme', next); lsSet('hub.theme', next); syncTheme();
});
if (mq && mq.addEventListener) mq.addEventListener('change', syncTheme);

/* ---------- gate: setup / login / pending ---------- */
const themeBtn = `<button type="button" class="theme-tg" data-theme-toggle role="switch" aria-checked="false" aria-label="다크 모드로 전환"><span class="knob"></span><span class="ic sun" aria-hidden="true">☀️</span><span class="ic moon" aria-hidden="true">🌙</span></button>`;
const gateBrand = `<div class="brand"><div class="mark">DX</div><div><b>디지털/기업 허브</b><small>Medialog DX디자인팀</small></div>${themeBtn}</div>`;
function showGate(kind, email){
  $('#app').hidden = true;
  const g = $('#gate'); g.hidden = false;
  if (kind==='setup') {
    g.innerHTML = `<div class="gate-card">${gateBrand}<h1>Supabase 연결이 필요합니다</h1>
      <p><code>config.js</code> 에 Supabase 프로젝트의 URL과 anon 키를 넣고 다시 배포해주세요. 자세한 순서는 README의 ‘설치’ 항목에 있습니다.</p></div>`;
  } else if (kind==='pending') {
    g.innerHTML = `<div class="gate-card">${gateBrand}<h1>승인 대기 중입니다</h1>
      <p><b>${esc(email)}</b> 계정은 아직 사용자로 등록되지 않았습니다. DX디자인팀에 이 이메일의 등록을 요청해주세요. 등록되면 새로고침만 하면 됩니다.</p>
      <button class="btn" data-gate="reload">새로고침</button><button class="btn" data-gate="logout">다른 계정으로 로그인</button></div>`;
  } else if (kind==='signup') {
    g.innerHTML = `<div class="gate-card">${gateBrand}<h1>비밀번호 만들기</h1>
      <p>DX디자인팀에서 받은 <b>초대 코드</b>와 등록된 이메일로 처음 한 번만 비밀번호를 만들면 됩니다.</p>
      <form id="f-signup" novalidate style="display:flex;flex-direction:column;gap:12px">
        <div class="f"><label for="l-email">이메일</label><input type="text" id="l-email" inputmode="email" autocomplete="username" value="${esc(email || lsGet('hub.email') || '')}"></div>
        <div class="f"><label for="s-code">초대 코드</label><input type="text" id="s-code" maxlength="12" autocomplete="one-time-code" placeholder="예: K7M9QX" style="text-transform:uppercase;letter-spacing:.12em;font-weight:600"></div>
        <div class="f"><label for="s-pw">비밀번호</label><input type="password" id="s-pw" autocomplete="new-password" placeholder="8자 이상" style="width:100%;height:36px;border:1px solid var(--line-2);border-radius:8px;background:var(--panel);padding:0 10px"></div>
        <div class="f"><label for="s-pw2">비밀번호 확인</label><input type="password" id="s-pw2" autocomplete="new-password" style="width:100%;height:36px;border:1px solid var(--line-2);border-radius:8px;background:var(--panel);padding:0 10px"></div>
        <button class="btn pri" data-gate="signup" type="submit">비밀번호 만들고 시작하기</button>
      </form>
      <button class="btn" data-gate="to-login">이미 비밀번호가 있어요 · 로그인</button>
      <div id="l-msg" hidden></div></div>`;
  } else {
    g.innerHTML = `<div class="gate-card">${gateBrand}<h1>로그인</h1>
      <p>DX디자인팀에 등록된 이메일로 로그인하세요.</p>
      <form id="f-login" novalidate style="display:flex;flex-direction:column;gap:12px">
        <div class="f"><label for="l-email">이메일</label><input type="text" id="l-email" inputmode="email" autocomplete="username" value="${esc(lsGet('hub.email')||'')}"></div>
        <div class="f"><label for="l-pw">비밀번호</label><input type="password" id="l-pw" autocomplete="current-password" style="width:100%;height:36px;border:1px solid var(--line-2);border-radius:8px;background:var(--panel);padding:0 10px"></div>
        <button class="btn pri" data-gate="pw" type="submit">로그인</button>
      </form>
      <button class="btn" data-gate="to-signup">처음이신가요? 비밀번호 만들기</button>
      ${cfg.EMAIL_LINK ? '<div class="or">또는</div><button class="btn" data-gate="otp">이메일로 로그인 링크 받기</button>' : ''}
      <div id="l-msg" hidden></div></div>`;
  }
  syncTheme();
}
function gateMsg(text, kind){ const m = $('#l-msg'); if (!m) return; m.hidden = false; m.className = 'msg ' + (kind||''); m.textContent = text; }
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-gate]'); if (!b) return;
  e.preventDefault();
  const k = b.dataset.gate;
  if (k==='reload') return location.reload();
  if (k==='logout') { await sb.auth.signOut(); return location.replace(location.pathname); }
  if (k==='to-signup') return showGate('signup', ($('#l-email')?.value || '').trim());
  if (k==='to-login') return showGate('login');
  const email = ($('#l-email')?.value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return gateMsg('이메일을 정확히 입력해주세요.', 'bad');
  lsSet('hub.email', email);
  b.disabled = true;
  if (k==='signup') {
    const code = ($('#s-code').value || '').trim().toUpperCase(), pw = $('#s-pw').value, pw2 = $('#s-pw2').value;
    if (!/^[A-Z0-9]{6}$/.test(code)) { b.disabled = false; return gateMsg('초대 코드 6자리를 정확히 입력해주세요.', 'bad'); }
    if (pw.length < 8) { b.disabled = false; return gateMsg('비밀번호는 8자 이상으로 정해주세요.', 'bad'); }
    if (pw !== pw2) { b.disabled = false; return gateMsg('두 비밀번호가 다릅니다.', 'bad'); }
    const {data, error} = await sb.auth.signUp({email, password: pw, options: {data: {invite_code: code}, emailRedirectTo: siteUrl()}});
    b.disabled = false;
    if (error) {
      const m = String(error.message || '');
      if (/already|registered|exists/i.test(m)) return gateMsg('이미 비밀번호를 만든 이메일입니다. 로그인해 주세요. 비밀번호를 잊었다면 DX디자인팀에 알려주세요.', 'bad');
      if (/database error|invalid_invite|saving new user/i.test(m) || error.status===500) return gateMsg('초대 코드가 맞지 않거나 등록되지 않은 이메일입니다. 이메일과 코드를 다시 확인해 주세요.', 'bad');
      if (/signups? not allowed|disabled/i.test(m)) return gateMsg('지금은 계정을 만들 수 없도록 설정돼 있습니다. DX디자인팀에 알려주세요.', 'bad');
      if (/password/i.test(m)) return gateMsg('비밀번호가 너무 단순합니다. 영문·숫자를 섞어 8자 이상으로 정해주세요.', 'bad');
      if (/email rate|over_email_send|sending confirmation|error sending/i.test(m + ' ' + (error.code||''))) return gateMsg(`인증 메일 발송이 막혀 계정을 만들지 못했습니다. DX디자인팀에 알려주세요. (관리자: Supabase에서 Confirm email 끄기) [${error.code || error.status || ''}]`, 'bad');
      if (/rate limit|too many|429/i.test(m + ' ' + (error.code||'') + ' ' + error.status)) return gateMsg(`같은 네트워크에서 시도가 몰려 잠시 막혔습니다. 5분쯤 뒤에 다시 해주세요. [${error.code || error.status || ''}]`, 'bad');
      return gateMsg(errMsg(error) + ` [${error.code || error.status || ''}]`, 'bad');
    }
    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return gateMsg('이미 비밀번호를 만든 이메일입니다. 로그인해 주세요.', 'bad');
    if (!data?.session) return gateMsg('계정을 만들었습니다. 메일함의 인증 링크를 누른 뒤 로그인해 주세요.', 'ok');
    gateMsg('계정을 만들었습니다. 잠시만요…', 'ok');
    return;
  }
  if (k==='pw') {
    const {error} = await sb.auth.signInWithPassword({email, password:$('#l-pw').value});
    b.disabled = false;
    if (error) {
      const m = String(error.message || '') + ' ' + (error.code || '');
      if (/not confirmed|email_not_confirmed/i.test(m)) gateMsg('이메일 인증이 끝나지 않은 계정입니다. DX디자인팀에 알려주세요. (관리자: 사용자 삭제 후 다시 비밀번호 만들기)', 'bad');
      else if (/rate limit|too many|429/i.test(m + ' ' + error.status)) gateMsg('같은 네트워크에서 로그인 시도가 몰려 잠시 막혔습니다. 5분쯤 뒤에 다시 해주세요.', 'bad');
      else gateMsg(/invalid/i.test(m) ? '이메일 또는 비밀번호가 맞지 않습니다. 처음이라면 아래 ‘비밀번호 만들기’를 이용하세요.' : errMsg(error) + ` [${error.code || error.status || ''}]`, 'bad');
    }
  } else {
    const {error} = await sb.auth.signInWithOtp({email, options:{emailRedirectTo: location.origin + location.pathname}});
    b.disabled = false;
    if (error) gateMsg(/rate|limit/i.test(error.message) ? '메일 발송 한도를 넘었습니다. 잠시 후 다시 시도하거나 비밀번호로 로그인해주세요.' : errMsg(error), 'bad');
    else gateMsg(`${email} 로 로그인 링크를 보냈습니다. 메일함에서 링크를 눌러주세요.`, 'ok');
  }
});

/* ---------- boot ---------- */
async function start(session){
  if (S.session) return;
  S.session = session;
  const {data:prof, error} = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (error) { S.session = null; showGate('login'); gateMsg(errMsg(error), 'bad'); return; }
  if (!prof || prof.role==='pending') { showGate('pending', session.user.email); return; }
  S.me = {id:prof.id, email:prof.email, name:prof.name};
  S.role = prof.role; S.myCompany = prof.company_id; S.isAdmin = prof.role==='admin';
  $('#gate').hidden = true; $('#app').hidden = false;
  const h = location.hash.slice(1); S.route = ROUTES.includes(h) ? h : 'home';
  if (/access_token|type=/.test(location.hash)) history.replaceState(null, '', location.pathname + '#home');
  syncTheme(); render(); loadAll();
}
async function boot(){
  syncTheme();
  if (!sb) return showGate('setup');
  sb.auth.onAuthStateChange((event, session) => {
    if (event==='SIGNED_IN' && session) setTimeout(() => start(session), 0);
    if (event==='SIGNED_OUT' && S.session) location.replace(location.pathname);
  });
  const {data:{session}} = await sb.auth.getSession();
  if (session) start(session); else showGate('login');
}
boot();
})();

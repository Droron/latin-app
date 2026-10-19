// Headless browser test: node --experimental-websocket test/run.mjs [url] [--shots]
// Drives the system Chrome via the DevTools protocol; no npm packages needed.
// Default URL: dist/latin.html (file://). Pass http(s)://…/ to also test the PWA (manifest, icons, service worker, offline).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const URL0 = process.argv.slice(2).find(a => !a.startsWith('--')) || 'file://' + path.join(ROOT, 'dist/latin.html');
const HTTP = /^https?:/.test(URL0);
const SHOTS = path.join(ROOT, 'screenshots/nav');
const SAVE = true; const PFX = process.env.PFX || 'before';
mkdirSync(SHOTS, { recursive: true });
const CHROME = process.env.CHROME || 'google-chrome';
const port = 9300 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(path.join(tmpdir(), 'lat-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ver;
for (let i = 0; i < 50; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(200); } }
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); const listeners = [];
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } else listeners.forEach(f => f(m)); };
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

const errors = []; const results = [];
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true });
listeners.push(m => {
  if (m.sessionId !== S) return;
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error ' + m.params.args.map(a => a.value ?? a.description).join(' '));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon|net::ERR_INTERNET_DISCONNECTED/.test(m.params.entry.text)) errors.push('log ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
});
await send('Page.enable', {}, S); await send('Runtime.enable', {}, S); await send('Log.enable', {}, S); await send('Network.enable', {}, S);

const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, S); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + '\n' + expr.slice(0, 200)); return r.result.value; };
const click = async (sel) => { const ok = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true})()`); if (!ok) throw new Error('missing ' + sel); await sleep(120); };
const exists = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`);
const count = sel => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const nav = async h => { await ev(`location.hash=${JSON.stringify(h)}`); await sleep(400); };
async function shot(name, full = false) { if (!SAVE) return; await sleep(450); const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full }, S); writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(data, 'base64')); }
const check = (name, cond, info = '') => { results.push([cond ? 'PASS' : 'FAIL', name, info]); };
const fresh = async () => { await ev(`localStorage.removeItem('latina.v1')`); await send('Page.reload', {}, S); await sleep(900); };

// answer the current question using the app's own question object (window.LatinApp.current)
const ANSWER = `async (correct) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = window.LatinApp.current; if (!q || !document.querySelector('#stage .q')) return 'none';
  if (q.kind === 'learn' || q.kind === 'read') { document.querySelector('#cont').click(); await sleep(60); return 'step:' + q.kind; }
  if (q.kind === 'self') { document.querySelector('#reveal').click(); await sleep(40); document.querySelector(correct ? '#selfYes' : '#selfNo').click(); await sleep(60); return correct ? 'ok' : 'no'; }
  if (q.choices) { const btns = [...document.querySelectorAll('.choice')]; const k = q.choices.findIndex(c => correct ? c.ok : !c.ok); btns[k < 0 ? 0 : k].click(); }
  else { const inp = document.querySelector('#ans'); let a = q.answers[0];
    if (correct && q.word && q.lang === 'la') a = a.split('/')[0].trim().toUpperCase().replace('A', 'Ā') + '.';   // case + macron + punctuation must be forgiven
    if (correct && q.word && q.lang === 'en') a = 'the ' + a.split(/[\\/,]/)[0].trim();
    inp.value = correct ? a : 'zzzz'; document.querySelector('#tf').requestSubmit(); }
  await sleep(120);
  const fb = document.querySelector('.feedback.show, .feedback:not(.leaving)'); const ok = !!fb && fb.classList.contains('ok');
  fb?.querySelector('.next-btn')?.click(); await sleep(120);
  return ok ? 'ok' : 'no';
}`;
async function runSession(name, { maxQ = 60, wrongFirst = false, collect = false } = {}) {
  let n = 0, ok = 0, graded = 0; const log = [];
  while (n < maxQ && !(await exists('.results'))) {
    if (collect) log.push(await ev(`(()=>{const q=LatinApp.current; return q && {kind:q.kind, section:q.section||'', word:q.word&&q.word.id, firstN:q.word&&q.word.firstN, choices:(q.choices||[]).map(c=>c.text), lesson:q.lesson||null}})()`));
    const r = await ev(`(${ANSWER})(${!(wrongFirst && graded === 0)})`);
    if (r === 'none') break; n++;
    if (!r.startsWith('step')) { graded++; if (r === 'ok') ok++; }
  }
  check(`${name}: session completes`, await exists('.results'), `${n} steps, ${ok}/${graded} correct`);
  return { n, ok, graded, log };
}
for (const vp of [{ name: 'phone', w: 390, h: 844, dpr: 2, mobile: true }, { name: 'desktop', w: 1280, h: 860, dpr: 1, mobile: false }]) {
  await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr, mobile: vp.mobile }, S);
  await send('Page.navigate', { url: URL0 + '#/today' }, S); await sleep(1200);
  await fresh();
  await ev(`(()=>{const s=JSON.parse(localStorage.getItem('latina.v1')||'{}'); s.course={reached:3,done:{L001:true,L002:true},curriculum:'dcc-core-v1'}; localStorage.setItem('latina.v1',JSON.stringify(s))})()`);
  await send('Page.reload', {}, S); await sleep(900);
  await nav('#/library'); await nav('#/lesson/L003');
  await ev(`document.querySelector('a[href*="practice/email"]').scrollIntoView({block:'center'})`); await shot(`${PFX}-${vp.name}-1-lesson-exercises`);
  await click('a[href*="practice/email"]'); await sleep(400);
  await runSession('ex');
  await shot(`${PFX}-${vp.name}-2-end-of-exercises`);
  const primary = await ev(`(document.querySelector('.results .btn-primary')||{}).textContent||''`);
  const doneBtn = await ev(`[...document.querySelectorAll('.results a, .results button')].map(b=>b.textContent.trim()+'→'+(b.getAttribute('href')||'')).join(' | ')`);
  await ev(`(document.querySelector('#continueLesson')||[...document.querySelectorAll('.results a')].find(a=>/Done|Continue|Back/.test(a.textContent))).click()`); await sleep(900);
  await shot(`${PFX}-${vp.name}-3-after-finishing`);
  console.log(vp.name, 'buttons:', doneBtn, '| landed on', await ev('location.hash'), '| scrollY', await ev('Math.round(scrollY)'));
  await ev('history.back()'); await sleep(900);
  console.log(vp.name, 'after back:', await ev('location.hash'), await ev(`!!document.querySelector('.session-top')`) ? '(session screen)' : '');
}
for (const r of results) if (r[0] !== 'PASS') console.log(r.join(' '));
console.log(errors.join('\n') || 'no JS errors');
chrome.kill(); process.exit(0);

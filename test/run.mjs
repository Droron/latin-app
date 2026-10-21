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
const SHOTS = path.join(ROOT, 'screenshots');
const SAVE = process.argv.includes('--shots');
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

async function suite(vp) {
  const tag = vp.name;
  await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr, mobile: vp.mobile }, S);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }, S);
  await send('Page.navigate', { url: URL0 + '#/today' }, S); await sleep(1200);
  await fresh();
  const L = await ev(`LatinApp.lessons.map(l=>({n:l.n,id:l.id,date:l.date,ex:(l.exercises||[]).length}))`);
  check(`${tag} lessons numbered 1..N in order`, L.every((l, i) => l.n === i + 1 && l.id === 'L' + String(i + 1).padStart(3, '0')) && L.length >= 3, L.map(l => l.n + ':' + l.id).join(' '));
  check(`${tag} today shows latest lesson`, (await ev(`document.querySelector('.hero .meta').textContent`)).includes(`Lesson ${L.length} of ${L.length}`));
  check(`${tag} course path strip`, (await count('.path-strip .pnode')) === L.length && await exists('.pnode.current'));
  await shot(`${tag}-home`);
  await ev(`localStorage.setItem('latina.v1', JSON.stringify({xp: 321, course: {reached: 5, done: {'2026-10-16': true}}, rules: {agreement: {h: [1], n: 1, right: 1}}, srs: {puella: {box: 3, due: 0}}}))`);
  await send('Page.reload', {}, S); await sleep(900);
  const mig = await ev(`(()=>{const s=JSON.parse(localStorage.getItem('latina.v1')); return {xp:s.xp, reached:s.course.reached, done:Object.keys(s.course.done).length, cur:s.course.curriculum, rules:Object.keys(s.rules).length, box:s.srs.puella&&s.srs.puella.box}})()`);
  check(`${tag} old progress migrates (same key, XP + word boxes kept, course restarted)`, mig.xp === 321 && mig.reached === 1 && mig.done === 0 && mig.cur === 'dcc-core-v1' && mig.rules === 0 && mig.box === 3, JSON.stringify(mig));
  await fresh();
  const g = await ev(`[LatinApp.grade('Puélla.', ['puella'],'la'), LatinApp.grade('PUELA',['puella'],'la'), LatinApp.grade('the girl',['girl'],'en'), LatinApp.grade('likes',['loves / likes'],'en'), LatinApp.grade('bona',['bonus / bona'],'la'), LatinApp.grade('cat',['et'],'la'), LatinApp.grade('salve ego sum puella',['Salve! Ego sum puella.'],'la')]`);
  check(`${tag} forgiving matching`, JSON.stringify(g) === JSON.stringify(['exact', 'close', 'exact', 'exact', 'exact', false, 'exact']), JSON.stringify(g));

  // ---- ordering on a fresh profile: only Lesson 1 is reached
  await nav('#/practice/mc?scope=all');
  const l1 = await ev(`LatinApp.words.filter(w=>w.firstN===1).map(w=>w.en)`);
  const mc = await runSession(`${tag} mc (fresh: lesson 1 only)`, { collect: true });
  check(`${tag} practice uses only reached lessons`, mc.log.every(q => q.firstN === 1 && q.choices.every(c => l1.includes(c))), mc.log.map(q => q.word).join(','));
  const ord = await ev(`LatinApp.words.filter(w=>w.firstN===1).map(w=>w.id)`);
  const seq = mc.log.map(q => q.word);
  check(`${tag} practice questions follow lesson order`, seq.every((w, i) => i === 0 || ord.indexOf(w) >= ord.indexOf(seq[i - 1])), seq.join(','));
  await fresh();
  await nav('#/review/go');
  const rv = await runSession(`${tag} review (new words)`, { collect: true, wrongFirst: true });
  const newIds = rv.log.slice(0, 6).map(q => q.word);
  check(`${tag} review introduces new words in lesson order`, JSON.stringify(newIds) === JSON.stringify(ord.slice(0, 6)), newIds.join(','));
  check(`${tag} review requeues a missed word`, rv.graded === 7, `${rv.graded} graded`);
  await nav('#/review'); await shot(`${tag}-review-home`);

  // ---- guided lesson 1 (course order Words → Grammar → Exercises → Translation)
  await fresh();
  await nav('#/lesson/L001/start'); await shot(`${tag}-course-learn`);
  const c1 = await runSession(`${tag} course lesson 1`, { collect: true });
  const SEC = ['Words', 'Grammar', 'Exercises', 'Translation'];
  const secs = c1.log.map(q => SEC.indexOf(q.section));
  check(`${tag} course sections in order`, secs.every((s, i) => s >= 0 && (i === 0 || s >= secs[i - 1])), [...new Set(c1.log.map(q => q.section))].join('→'));
  check(`${tag} lesson 1 marked done, lesson 2 current`, await ev(`!!LatinApp.state().course.done['L001']`) && (await ev(`(location.hash='#/library', new Promise(r=>setTimeout(()=>r(document.querySelector('.course-item.current .node').textContent.trim()),400)))`)) === '2');
  await shot(`${tag}-library`);
  // ---- lesson page + prev/next
  await nav('#/lesson/L002');
  check(`${tag} lesson page prev/next`, (await ev(`[...document.querySelectorAll('.lesson-nav a')].map(a=>a.getAttribute('href')).join(' ')`)) === '#/lesson/L001 #/lesson/L003');
  const LAST = L[L.length - 1];
  await nav('#/lesson/' + LAST.id); await shot(`${tag}-lesson`); if (tag === 'phone') await shot(`${tag}-lesson-full`, true);
  check(`${tag} last lesson shows its exercises`, (await count('.exlist .exrow')) >= LAST.ex);
  // ---- guided last lesson (words, grammar, exercises, reading)
  await nav('#/lesson/' + LAST.id + '/start');
  let shotDone = false;
  const c5 = await (async () => { let n = 0; const log = [];
    while (n < 80 && !(await exists('.results'))) {
      const q = await ev(`(()=>{const q=LatinApp.current; return q && {kind:q.kind, section:q.section}})()`); log.push(q);
      if (!shotDone && q && q.kind === 'self') { await ev(`document.querySelector('#selfAns').value='The road is long. Julia, a little girl, is standing now…'`); await shot(`${tag}-exercise-translate`); shotDone = true; }
      if (q && q.kind === 'type' && q.section === 'Exercises' && tag === 'phone') { await ev(`document.querySelector('#ans').value='Iūlia nōn timet'`); await shot(`${tag}-exercise-email`); }
      const r = await ev(`(${ANSWER})(true)`); if (r === 'none') break; n++; }
    return log; })();
  check(`${tag} course last lesson completes with all sections`, await exists('.results') && ['Words', 'Grammar', 'Exercises', 'Translation'].every(s => c5.some(q => q && q.section === s)));
  check(`${tag} reaching the last lesson unlocks all lessons`, (await ev(`LatinApp.state().course.reached`)) === L.length);
  // ---- lesson exercises mode (every lesson's own questions)
  const exTotal = L.reduce((n, l) => n + l.ex, 0);
  await nav('#/practice/email?scope=all');
  const em = await runSession(`${tag} lesson exercises`);
  check(`${tag} lesson exercises: all ${exTotal} items graded right`, em.graded === exTotal && em.ok === exTotal, `${em.ok}/${em.graded}`);
  // ---- all practice modes
  for (const m of ['mc', 'mcr', 'type', 'listen', 'fill', 'mix']) {
    await nav(`#/practice/${m}?scope=all`);
    if (m === 'mc') await shot(`${tag}-exercise-mc`);
    if (m === 'fill') await shot(`${tag}-exercise-fill`);
    if (m === 'mc' && tag === 'phone') { await ev(`(${ANSWER.replace("fb?.querySelector('.next-btn')?.click();", '')})(true)`); await shot(`${tag}-exercise-feedback`); await ev(`document.querySelector('.feedback .next-btn').click()`); await sleep(200); }
    const r = await runSession(`${tag} ${m}`, { collect: m === 'fill' });
    check(`${tag} ${m}: right answers graded correct`, r.ok === r.graded, `${r.ok}/${r.graded}`);
    if (m === 'fill') {   // every option offered in a blank is a form already taught (no untaught words as distractors)
      const known = new Set(await ev(`LatinApp.lexicon.lemmas.flatMap(e=>e.derived.formsSeen.map(f=>LatinApp.norm(f.form)))`));
      const opts = r.log.filter(Boolean).flatMap(q => q.choices);
      const bad = []; for (const o of opts) if (!known.has(await ev(`LatinApp.norm(${JSON.stringify(o)})`))) bad.push(o);
      check(`${tag} fill choices are all taught forms`, opts.length > 0 && bad.length === 0, bad.join(',') || `${opts.length} options`);
    }
    if (m === 'mix') await shot(`${tag}-results`);
  }
  // flashcards + match
  await nav('#/practice/flash?scope=all'); await click('#fc'); await sleep(650); await shot(`${tag}-flashcard`);
  check(`${tag} flashcard flips`, await exists('.flash.flipped'));
  for (let i = 0; i < 1000 && !(await exists('.results')); i++) { await click('#fc'); await click('#got'); }
  check(`${tag} flashcards complete`, await exists('.results'));
  await nav('#/practice/match?scope=all');
  await ev(`(async()=>{const s=ms=>new Promise(r=>setTimeout(r,ms)); const L=[...document.querySelectorAll('.tile[data-side=la]')]; const first=L[0]; first.click(); await s(50); const wrong=[...document.querySelectorAll('.tile[data-side=en]')].find(t=>t.dataset.id!==first.dataset.id); wrong.click(); await s(50);
    for(const l of L){ l.click(); await s(40); document.querySelector('.tile[data-side=en][data-id="'+l.dataset.id+'"]').click(); await s(60);} })()`);
  await sleep(900); check(`${tag} match completes`, await exists('.results'));
  // ---- lexicon
  await nav('#/words');
  const lc = await ev(`document.querySelector('#lemmaCount').textContent`);
  check(`${tag} lexicon lemma count shown`, lc === String(await ev(`LatinApp.lexicon.stats.lemmaCount`)), 'lemmas=' + lc);
  check(`${tag} lexicon growth chart + list in lesson order`, (await count('.chart .c')) === L.length && (await ev(`(()=>{const n=[...document.querySelectorAll('.lnum')].map(x=>+x.textContent.slice(1)); return n.every((v,i)=>!i||v>=n[i-1])})()`)));
  await ev(`(()=>{const q=document.querySelector('#q'); q.value='sunt'; q.dispatchEvent(new Event('input'))})()`); await sleep(100);
  check(`${tag} lexicon: form search finds lemma (sunt → sum)`, (await ev(`[...document.querySelectorAll('.lmain .w')].map(x=>x.textContent).join('|')`)).startsWith('sum'));
  await ev(`(()=>{const q=document.querySelector('#q'); q.value=''; q.dispatchEvent(new Event('input')); document.querySelectorAll('details.lemma')[3].open=true;})()`);
  await shot(`${tag}-lexicon`);
  // ---- grammar
  await nav('#/grammar');
  check(`${tag} grammar rules listed in order`, (await ev(`[...document.querySelectorAll('.rnum')].map(x=>+x.textContent).join(',')`)) === L.map((_, i) => i + 1).join(','));
  await shot(`${tag}-grammar`);
  await nav('#/grammar/verb-3sg'); await shot(`${tag}-rule`);
  const before = await ev(`(LatinApp.state().rules['verb-3sg'] || {n:0}).n`);
  await nav('#/grammar/verb-3sg/practice');
  const gr = await runSession(`${tag} rule practice (verb-3sg)`);
  await nav('#/grammar');
  check(`${tag} rule progress updates`, (await ev(`LatinApp.state().rules['verb-3sg'].n`)) === before + gr.graded && gr.graded >= 5, `${before} → +${gr.graded} answers`);
  check(`${tag} rule mastered after perfect practice`, (await ev(`document.querySelectorAll('.rule-item')[2].querySelector('.tag').textContent`)).startsWith('mastered'));
  // ---- stats, theme, persistence
  await nav('#/stats');
  check(`${tag} progress shows lemmas & rules`, (await ev(`document.querySelector('#view').textContent`)).includes('Lemmas learned') && (await ev(`document.querySelector('#view').textContent`)).includes('Rules mastered'));
  await shot(`${tag}-stats`);
  await click('#themeBtn'); await sleep(300);
  check(`${tag} dark mode`, (await ev(`document.documentElement.dataset.theme`)) === 'dark');
  await nav('#/today'); await shot(`${tag}-home-dark`);
  await nav('#/stats'); await click('#themeBtn');
  const xp = await ev(`LatinApp.state().xp`); await send('Page.reload', {}, S); await sleep(1000);
  check(`${tag} progress persists after reload (key latina.v1)`, (await ev(`JSON.parse(localStorage.getItem('latina.v1')).xp`)) === xp && xp > 0, 'xp=' + xp);
  check(`${tag} no horizontal overflow`, await ev(`document.documentElement.scrollWidth <= window.innerWidth + 1`));
}

// ---- navigation: every session returns to where it was launched from; back controls; history / swipe-back
async function navSuite(vp) {
  const tag = vp.name + ' nav';
  await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr, mobile: vp.mobile }, S);
  await fresh();
  await ev(`(()=>{const s=JSON.parse(localStorage.getItem('latina.v1')||'{}'); s.course={reached:3,done:{L001:true,L002:true},sections:{},curriculum:'dcc-core-v1'}; localStorage.setItem('latina.v1',JSON.stringify(s))})()`);
  await send('Page.reload', {}, S); await sleep(900);
  const H = () => ev('location.hash');
  const back = async () => { await ev('history.back()'); await sleep(500); };
  const backLabel = () => ev(`(()=>{const b=document.querySelector('#backBtn'); return b && !b.hidden ? b.textContent.trim() : null})()`);
  const tabOn = () => ev(`(document.querySelector('#tabbar a.on')||{}).dataset?.tab||''`);
  const inSession = () => exists('.session-top');
  const sessionNoResults = async () => (await inSession()) && !(await exists('.results'));

  // roots have no back control; non-root screens do, named after the destination
  await nav('#/today');
  check(`${tag}: root screens have no back control`, (await backLabel()) === null);
  await nav('#/library'); await nav('#/lesson/L003');
  check(`${tag}: lesson header back names where you came from`, (await backLabel()) === 'Course', String(await backLabel()));

  // 1. exercises launched inside a lesson → summary → Continue lesson → same lesson, scrolled to the next section
  await click('#doExercises'); await sleep(400);
  const nv = await ev('LatinApp.nav()');
  check(`${tag}: exercises remember their origin + section`, nv.session && nv.session.origin === '#/lesson/L003' && nv.session.sec === 'exercises', JSON.stringify(nv.session));
  check(`${tag}: session header shows "‹ Lesson 3", Course tab stays active`, (await backLabel()) === 'Lesson 3' && (await tabOn()) === 'library', `${await backLabel()} / ${await tabOn()}`);
  const ex = await runSession(`${tag}: lesson 3 exercises`);
  const sum = await ev(`[...document.querySelectorAll('.results .stat')].map(s=>s.textContent.trim()).join(' | ')`);
  check(`${tag}: end screen has score, XP and a "Continue lesson" primary button`, (await exists('#continueLesson.btn-primary')) && sum.includes(`${ex.ok}/${ex.graded}`) && /\+\d+XP/.test(sum.replace(/\s/g, '')), sum);
  await shot(`${vp.name}-end-of-exercises`);
  await click('#continueLesson'); await sleep(700);
  const rb = await ev(`(()=>{const b=document.querySelector('#returnBanner'); if(!b) return null; const r=b.getBoundingClientRect(); return {txt:b.textContent, top:Math.round(r.top), next:b.nextElementSibling&&b.nextElementSibling.id, y:Math.round(scrollY)}})()`);
  check(`${tag}: back on the same lesson (not Practice)`, (await H()) === '#/lesson/L003' && !(await inSession()), await H());
  check(`${tag}: scrolled to the section after the exercises (reading), with a summary`, rb && rb.next === 'sec-reading' && rb.top >= 0 && rb.top < vp.h / 2 && rb.y > 300 && /Exercises done/.test(rb.txt) && /XP/.test(rb.txt), JSON.stringify(rb));
  check(`${tag}: exercises section marked done`, (await ev(`!!LatinApp.state().course.sections.L003.exercises`)) && (await exists('#sec-exercises .sec-done')));
  await shot(`${vp.name}-back-in-lesson`);
  check(`${tag}: back header after returning = Course`, (await backLabel()) === 'Course', String(await backLabel()));
  await back();
  check(`${tag}: Back after finishing never re-enters the finished session`, (await H()) === '#/library' && !(await inSession()), await H());

  // reading reveal marks it done
  await nav('#/lesson/L003'); await click('[data-reading]');
  check(`${tag}: revealing the reading marks it done`, await ev(`!!LatinApp.state().course.sections.L003.reading`));

  // 3. quitting: no confirmation before answering; confirmation once started; returns to the launching section
  await nav('#/lesson/L003');
  await click('#sec-words a[href*="practice/flash"]'); await sleep(400);
  await click('#quitBtn'); await sleep(500);
  check(`${tag}: quitting an untouched session needs no confirmation`, (await H()) === '#/lesson/L003' && !(await exists('.sheet-wrap')), await H());
  await click('#sec-words a[href*="practice/flash"]'); await sleep(400);
  await click('#fc'); await click('#got');
  await click('#quitBtn'); await sleep(200);
  check(`${tag}: X during a session asks for confirmation`, await exists('.sheet-wrap #sheetYes'));
  await click('#sheetNo'); await sleep(200);
  check(`${tag}: "Keep going" stays in the session`, (await sessionNoResults()) && !(await exists('.sheet-wrap')));
  await click('#backBtn'); await sleep(200);
  check(`${tag}: header back during a session also asks`, await exists('.sheet-wrap'));
  await click('#sheetYes'); await sleep(700);
  const qy = await ev(`(()=>{const r=document.querySelector('#sec-words').getBoundingClientRect(); return Math.round(r.top)})()`);
  check(`${tag}: leaving returns to the lesson at the section it came from`, (await H()) === '#/lesson/L003' && qy >= 0 && qy < 200, `${await H()} top=${qy}`);
  check(`${tag}: quitting does not mark the section done`, !(await ev(`!!LatinApp.state().course.sections.L003.words`)));

  // 2. swipe-back / browser back mid-session returns to origin
  await click('#sec-grammar a[href*="practice/fill"]'); await sleep(400);
  await ev(`(${ANSWER})(true)`);
  await back();
  check(`${tag}: swipe-back mid-session returns to the lesson`, (await H()) === '#/lesson/L003' && !(await inSession()), await H());

  // 2. every other origin: Practice tab, Review, Grammar rule
  await nav('#/practice'); await click('#scopes button[data-s="L002"]'); await sleep(300);
  await click('.mode[data-mode="mc"]'); await sleep(400);
  check(`${tag}: Practice session header "‹ Practice"`, (await backLabel()) === 'Practice');
  await runSession(`${tag}: practice mc`);
  check(`${tag}: practice end screen offers "Back to Practice"`, (await ev(`(document.querySelector('#doneBtn')||{}).textContent||''`)) === 'Back to Practice');
  await click('#doneBtn'); await sleep(600);
  check(`${tag}: practice returns to the Practice tab with its scope`, (await H()) === '#/practice?scope=L002' && (await ev(`document.querySelector('#scopes .on').dataset.s`)) === 'L002', await H());
  await nav('#/review'); await click('a[href="#/review/go"]'); await sleep(400);
  await runSession(`${tag}: review`, { maxQ: 80 });
  await click('#doneBtn'); await sleep(600);
  check(`${tag}: review returns to Review`, (await H()) === '#/review', await H());
  await nav('#/grammar'); await nav('#/grammar/verb-3sg');
  check(`${tag}: rule detail back = Grammar`, (await backLabel()) === 'Grammar');
  await click('a[href*="/grammar/verb-3sg/practice"]'); await sleep(400);
  await runSession(`${tag}: rule practice`);
  await click('#doneBtn'); await sleep(600);
  check(`${tag}: rule practice returns to the rule`, (await H()) === '#/grammar/verb-3sg' && (await backLabel()) === 'Grammar', `${await H()} ${await backLabel()}`);

  // lesson → rule tag → back restores the lesson scroll position
  await nav('#/lesson/L003');
  await ev(`document.querySelector('a.tag[href="#/grammar/verb-3sg"]').scrollIntoView({block:'center'})`); await sleep(300);
  const y0 = await ev('Math.round(scrollY)');
  await click('a.tag[href="#/grammar/verb-3sg"]'); await sleep(500);
  check(`${tag}: rule opened from a lesson says "‹ Lesson 3"`, (await backLabel()) === 'Lesson 3', String(await backLabel()));
  await click('#backBtn'); await sleep(700);
  const y1 = await ev('Math.round(scrollY)');
  check(`${tag}: header back returns to the lesson where you were`, (await H()) === '#/lesson/L003' && Math.abs(y1 - y0) < 40, `${y0} → ${y1}`);

  // word detail: from lexicon and from a lesson word
  await nav('#/words'); await ev(`document.querySelector('details.lemma').open=true`);
  await click('details.lemma[open] a[href^="#/words/"]'); await sleep(400);
  check(`${tag}: word page from Lexicon says "‹ Lexicon"`, (await H()).startsWith('#/words/') && (await backLabel()) === 'Lexicon' && (await exists('#view .vcard .word')));
  await shot(`${vp.name}-word`);
  await click('#backBtn'); await sleep(500);
  check(`${tag}: word page back → Lexicon`, (await H()) === '#/words');
  await nav('#/lesson/L001'); await click('.vcard a.word-link'); await sleep(400);
  check(`${tag}: word page from a lesson says "‹ Lesson 1"`, (await backLabel()) === 'Lesson 1');

  // course step-by-step from the lesson → next lesson; back returns to the previous lesson, not the session
  await nav('#/lesson/L001'); await click('#sec-practice a[href*="/lesson/L001/start"]'); await sleep(400);
  await runSession(`${tag}: course lesson 1`, { maxQ: 80 });
  check(`${tag}: finished lesson offers "Next: Lesson 2" and "Back to Lesson 1"`, (await exists('#nextLesson')) && (await ev(`document.querySelector('#doneBtn').textContent`)) === 'Back to Lesson 1');
  await click('#nextLesson'); await sleep(600);
  check(`${tag}: Next goes to Lesson 2`, (await H()) === '#/lesson/L002');
  await back();
  check(`${tag}: Back from there → Lesson 1 (session not in history)`, (await H()) === '#/lesson/L001' && !(await inSession()), await H());

  // dead ends: bad links redirect without polluting history; deep links still get a back control; empty sessions offer a way back
  await nav('#/library'); await nav('#/lesson/NOPE'); await sleep(300);
  check(`${tag}: unknown lesson redirects to Course`, (await H()) === '#/library');
  await nav('#/stats'); await nav('#/practice/flash?scope=L999'); await sleep(200);
  check(`${tag}: empty session has a way back`, (await exists('#emptyBack')) && (await ev(`document.querySelector('#emptyBack').textContent`)) === 'Back to Progress');
  await click('#emptyBack'); await sleep(500);
  check(`${tag}: …which returns to Progress`, (await H()) === '#/stats');
  await ev(`sessionStorage.clear(); history.replaceState(null,'','#/lesson/L002')`); await send('Page.reload', {}, S); await sleep(900);
  check(`${tag}: deep-linked lesson still has a back control (Course)`, (await backLabel()) === 'Course');
  await click('#backBtn'); await sleep(500);
  check(`${tag}: …which opens Course`, (await H()) === '#/library');
  if (!vp.mobile) {
    await nav('#/grammar/verb-3sg');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, S); await sleep(500);
    check(`${tag}: Escape goes back`, (await H()) === '#/library', await H());
  }
  check(`${tag}: no horizontal overflow with back control`, await ev(`document.documentElement.scrollWidth <= window.innerWidth + 1`));
}

async function pwa() {
  const base = URL0.replace(/[^/]*$/, '');
  const man = await ev(`fetch('manifest.webmanifest').then(r=>r.json())`);
  check('pwa manifest', man.name === 'Lingua Latina' && man.display === 'standalone' && man.icons.some(i => i.sizes === '512x512'), man.name);
  const icons = await ev(`Promise.all(['icons/apple-touch-icon.png','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png'].map(u=>fetch(u).then(r=>r.status+':'+r.headers.get('content-type'))))`);
  check('pwa icons served as PNG', icons.every(s => s.startsWith('200:image/png')), icons.join(' '));
  check('pwa apple tags', await ev(`!!document.querySelector('link[rel=apple-touch-icon][href$=".png"]') && !!document.querySelector('meta[name=apple-mobile-web-app-capable]')`));
  await send('Page.reload', {}, S); await sleep(2500);
  const ctl = await ev(`navigator.serviceWorker.ready.then(()=>!!navigator.serviceWorker.controller)`);
  const cached = await ev(`caches.keys().then(ks=>ks.filter(k=>k.startsWith('latina-')))`);
  check('pwa service worker controls page', ctl, cached.join(','));
  await nav('#/today');
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, S);
  await send('Page.reload', {}, S); await sleep(1500);
  check('pwa works offline', await exists('.hero h1'));
  if (process.env.OFFLINE_HOOK) {   // real offline: stop the server, reload, check
    spawn('sh', ['-c', process.env.OFFLINE_HOOK]); await sleep(1000);
    await send('Page.reload', {}, S); await sleep(2000);
    check('pwa works with server stopped', await exists('.hero h1') && (await ev(`LatinApp.lessons.length`)) >= 3);
  }
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, S);
  void base;
}

const VPS = [{ name: 'phone', w: 390, h: 844, dpr: 3, mobile: true }, { name: 'desktop', w: 1280, h: 860, dpr: 1, mobile: false }];
try { for (const vp of VPS) { await suite(vp); await navSuite(vp); } if (HTTP) await pwa(); }
catch (e) { results.push(['FAIL', 'harness', e.message]); }
for (const r of results) console.log(r.join('  '));
console.log(errors.length ? 'JS ERRORS:\n' + errors.join('\n') : 'No JS errors');
const fails = results.filter(r => r[0] === 'FAIL').length + errors.length;
console.log(`${results.length - results.filter(r => r[0] === 'FAIL').length}/${results.length} checks passed`);
ws.close(); chrome.kill(); process.exit(fails ? 1 : 0);

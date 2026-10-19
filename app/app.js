/* Lingua Latina – plain JS, no build step. Data: window.LATIN_LESSONS / LATIN_LEXICON / LATIN_GRAMMAR (lessons.js). */
(function () {
  'use strict';

  // ---------------------------------------------------------------- utils
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a, n) => shuffle(a).slice(0, n);
  const DAY = 86400000;
  const dayKey = (d = new Date()) => { const z = new Date(d); return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, '0')}-${String(z.getDate()).padStart(2, '0')}`; };
  const parseDay = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDate = k => parseDay(k).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const roman = n => { const t = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let r = ''; for (const [v, s] of t) while (n >= v) { r += s; n -= v; } return r; };
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

  // forgiving answer matching: case, macrons/diacritics, punctuation, articles all optional
  function norm(s, lang) {
    let t = String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[“”"‘’'`.,!?;:()\[\]¿¡…–—-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (lang === 'en') t = t.replace(/^(the|a|an|to) /, '');
    return t;
  }
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[n];
  }
  function variants(s, lang) {
    const out = new Set();
    String(s).split(/\s*[\/;,]\s*|\s+or\s+/).forEach(p => {
      const noParen = p.replace(/\(.*?\)/g, ' ');
      [p, noParen].forEach(x => { const v = norm(x, lang); if (v) out.add(v); });
    });
    const whole = norm(String(s).replace(/\(.*?\)/g, ' '), lang); if (whole) out.add(whole);
    return out;
  }
  // returns 'exact' | 'close' | false
  function grade(input, answers, lang) {
    const got = norm(input, lang); if (!got) return false;
    const pool = new Set(); answers.forEach(a => variants(a, lang).forEach(v => pool.add(v)));
    if (pool.has(got)) return 'exact';
    for (const v of pool) { const tol = v.length >= 8 ? 2 : v.length >= 4 ? 1 : 0; if (tol && lev(got, v) <= tol) return 'close'; }
    return false;
  }

  // ---------------------------------------------------------------- data (everything in lesson order)
  const LESSONS = (window.LATIN_LESSONS || []).slice().sort((a, b) => a.number - b.number);
  LESSONS.forEach(l => { l.n = l.number; l.id = l.id || l.date; });
  const LBY = new Map(LESSONS.map(l => [l.id, l]));
  const LEX = window.LATIN_LEXICON || { lemmas: [], stats: { lemmaCount: 0, formCount: 0, byPos: {}, growth: [] } };
  const GR = window.LATIN_GRAMMAR || { rules: [], stats: { ruleCount: 0, growth: [] } };
  const RULES = GR.rules.filter(r => r.introducedIn).sort((a, b) => a.number - b.number);
  const RBY = new Map(RULES.map(r => [r.id, r]));
  const FORM2LEMMA = new Map();
  LEX.lemmas.forEach(e => Object.keys(e.forms || {}).forEach(f => FORM2LEMMA.has(norm(f)) || FORM2LEMMA.set(norm(f), e.id)));
  const LEMMAS = LEX.lemmas.filter(e => e.derived && e.derived.firstLesson && e.pos !== 'proper noun'); // DCC lemmas, already in teaching order from build
  const LEXBY = new Map(LEX.lemmas.map(e => [e.id, e]));
  const META = window.LATIN_META || {};

  // study cards: one per vocab id, ordered by first appearance (lesson number, then position in that lesson's word list)
  const wordKey = v => norm(v.id || v.la.split('/')[0], 'la');
  const WORDS = new Map();
  let seq = 0;
  for (const l of LESSONS) {
    l.vocab.forEach(v => {
      const k = wordKey(v);
      let w = WORDS.get(k);
      if (!w) { w = { id: k, lessons: [], notes: [], examples: [], accept: [], forms: [], first: l.id, firstN: l.n, order: seq++ }; WORDS.set(k, w); }
      for (const f of v.la.split('/').map(x => x.trim()).filter(Boolean)) if (!w.forms.some(x => norm(x) === norm(f))) w.forms.push(f);
      w.la = w.forms.join(' / '); w.en = v.en; w.pos = v.pos || w.pos; w.gender = v.gender || w.gender;
      if (v.pron) w.pron = v.pron; if (v.dict) w.dict = v.dict;
      if (!w.lessons.includes(l.id)) w.lessons.push(l.id);
      if (v.source !== 'example') w.core = true;
      if (v.notes && !w.notes.includes(v.notes)) w.notes.push(v.notes);
      if (v.example && !w.examples.some(e => e.la === v.example.la)) w.examples.push(v.example);
      (v.accept || []).forEach(a => w.accept.includes(a) || w.accept.push(a));
    });
  }
  const ALL_WORDS = Array.from(WORDS.values()).sort((a, b) => a.order - b.order);
  ALL_WORDS.forEach(w => { w.lemma = LEXBY.has(w.id) ? w.id : FORM2LEMMA.get(norm(w.forms[0])) || null; });
  const laForms = w => w.forms;
  const enAnswers = w => [w.en, ...w.accept];
  const byOrder = (a, b) => a.order - b.order;

  // ---------------------------------------------------------------- state (localStorage key unchanged: latina.v1)
  const KEY = 'latina.v1';
  const defaults = () => ({ xp: 0, days: {}, srs: {}, answered: 0, correct: 0, sessions: 0, lessonsSeen: {}, bestMatch: null,
    settings: { theme: 'auto', rate: 0.85, goal: 50, newPerDay: 6 }, newToday: { day: '', n: 0 },
    course: { reached: 1, done: {} }, rules: {} });
  let S;
  try {
    const d = defaults();
    S = Object.assign(d, JSON.parse(localStorage.getItem(KEY) || '{}'));
    S.settings = Object.assign(defaults().settings, S.settings); S.course = Object.assign(defaults().course, S.course); S.rules = S.rules || {};
  } catch (e) { S = defaults(); }
  if (META.curriculum && S.course.curriculum !== META.curriculum) {   // new course content: restart the course path, keep XP/streak/settings/word boxes
    S.course = { reached: 1, done: {}, curriculum: META.curriculum }; S.rules = {};
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ }
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } };

  // ---- course path: lessons are reached in order; nothing from a later lesson appears before it is reached
  const reachedN = () => Math.min(LESSONS.length, Math.max(1, S.course.reached || 1));
  const isReached = l => l.n <= reachedN();
  const isDone = l => !!S.course.done[l.id];
  const currentLesson = () => LESSONS.find(l => !isDone(l)) || LESSONS[LESSONS.length - 1];
  const reach = l => { if (l && l.n > reachedN()) { S.course.reached = l.n; save(); } };
  const reachedLessons = () => LESSONS.filter(isReached);
  const reachedWords = () => ALL_WORDS.filter(w => w.firstN <= reachedN());
  const lessonsFor = scope => scope === 'all' ? reachedLessons() : LESSONS.filter(l => l.id === scope);
  const wordsFor = scope => scope === 'all' ? reachedWords() : ALL_WORDS.filter(w => w.lessons.includes(scope)).sort(byOrder);
  const latest = LESSONS[LESSONS.length - 1];
  const lessonState = l => isDone(l) ? 'done' : l === currentLesson() ? 'current' : isReached(l) ? 'reached' : 'upcoming';

  // XP + streak
  function addXP(n) {
    if (!n) return; S.xp += n; const k = dayKey(); S.days[k] = (S.days[k] || 0) + n; save(); renderChips(true);
  }
  function streak() {
    let d = new Date(); let n = 0;
    if (!S.days[dayKey(d)]) d = new Date(d - DAY);
    while (S.days[dayKey(d)]) { n++; d = new Date(d - DAY); }
    return n;
  }
  function bestStreak() {
    const ks = Object.keys(S.days).filter(k => S.days[k]).sort(); let best = 0, run = 0, prev = null;
    for (const k of ks) { const d = parseDay(k); run = prev && Math.round((d - prev) / DAY) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
    return best;
  }
  const RANKS = ['Tiro', 'Discipulus', 'Lector', 'Scriba', 'Orator', 'Rhetor', 'Magister', 'Senator', 'Consul', 'Imperator'];
  const lvlAt = n => 50 * n * (n + 1);
  const level = () => {
    let n = 0; while (S.xp >= lvlAt(n + 1)) n++;
    const lo = lvlAt(n), hi = lvlAt(n + 1);
    return { lv: n + 1, rank: RANKS[Math.min(n, RANKS.length - 1)], into: Math.round((S.xp - lo) / (hi - lo) * 100), toNext: hi - S.xp };
  };

  // Leitner spaced repetition: boxes 1..6
  const INTERVAL = [0, 0, 1, 3, 7, 14, 30];
  function review(id, ok) {
    const now = Date.now();
    let c = S.srs[id];
    if (!c) c = S.srs[id] = { box: 0, due: now, seen: 0, right: 0, wrong: 0 };
    c.seen++; c.last = now;
    if (ok) { c.right++; c.box = Math.min(6, Math.max(1, c.box + 1)); } else { c.wrong++; c.box = 1; }
    const days = INTERVAL[c.box];
    c.due = days ? parseDay(dayKey(new Date(now + days * DAY))).getTime() + 4 * 3600000 : now + 10 * 60000;
    S.answered++; if (ok) S.correct++;
    save();
  }
  function practiceResult(id, ok) {
    const c = S.srs[id];
    if (!c) return review(id, ok);
    if (!ok) return review(id, false);
    if (c.due <= Date.now()) return review(id, true);
    c.seen++; c.right++; S.answered++; S.correct++; save();
  }
  const dueWords = () => reachedWords().filter(w => S.srs[w.id] && S.srs[w.id].due <= Date.now());
  const newWords = () => reachedWords().filter(w => !S.srs[w.id]);            // already in lesson order
  function newAllowance() {
    if (S.newToday.day !== dayKey()) S.newToday = { day: dayKey(), n: 0 };
    return Math.max(0, S.settings.newPerDay - S.newToday.n);
  }
  const box = w => (S.srs[w.id] || {}).box || 0;
  const mastery = words => words.length ? words.reduce((s, w) => s + Math.min(5, box(w)), 0) / (words.length * 5) : 0;

  // lemma status from its study cards: new / learning / known
  const CARDS_OF = new Map(); ALL_WORDS.forEach(w => { if (w.lemma) { if (!CARDS_OF.has(w.lemma)) CARDS_OF.set(w.lemma, []); CARDS_OF.get(w.lemma).push(w); } });
  function lemmaStatus(e) {
    const cs = CARDS_OF.get(e.id) || [];
    if (!cs.length || !cs.some(w => S.srs[w.id])) return 'new';
    return cs.every(w => box(w) >= 4) ? 'known' : 'learning';
  }
  // grammar rule progress: last 20 results per rule
  function recordRules(ids, ok) {
    (ids || []).forEach(id => { if (!RBY.has(id)) return; const r = S.rules[id] = S.rules[id] || { h: [], n: 0, right: 0 }; r.h.push(ok ? 1 : 0); if (r.h.length > 20) r.h.shift(); r.n++; if (ok) r.right++; });
    save();
  }
  function ruleProgress(r) {
    const p = S.rules[r.id];
    if (!p || !p.n) return { status: 'not started', acc: null, n: 0 };
    const last = p.h.slice(-10), acc = Math.round(last.reduce((a, b) => a + b, 0) / last.length * 100);
    return { status: p.n >= 5 && acc >= 80 ? 'mastered' : 'practising', acc, n: p.n };
  }
  const ruleReached = r => r.introducedIn <= reachedN();
  // ---------------------------------------------------------------- theme
  function applyTheme() {
    const t = S.settings.theme;
    const dark = t === 'dark' || (t === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const b = $('#themeBtn'); if (b) b.innerHTML = dark ? I.sun : I.moon;
  }
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

  // ---------------------------------------------------------------- speech
  let voices = [];
  const loadVoices = () => { try { voices = speechSynthesis.getVoices() || []; } catch (e) { voices = []; } };
  if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  function bestVoice() {
    return voices.find(v => /^la\b|^la-/i.test(v.lang)) || voices.find(v => /^it-IT/i.test(v.lang) && /alice|federica|luca|google/i.test(v.name))
      || voices.find(v => /^it/i.test(v.lang)) || voices.find(v => /^es/i.test(v.lang)) || null;
  }
  function speak(text, btn) {
    if (!('speechSynthesis' in window)) { toast('Speech is not available in this browser'); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text).replace(/\s*\/\s*/g, ', '));
      const v = bestVoice(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'it-IT';
      u.rate = S.settings.rate;
      if (btn) { btn.classList.add('speaking'); u.onend = u.onerror = () => btn.classList.remove('speaking'); setTimeout(() => btn.classList.remove('speaking'), 4000); }
      speechSynthesis.speak(u);
    } catch (e) { toast('Could not play audio'); }
  }
  const speakBtn = (text, small) => `<button class="speak${small ? ' small' : ''}" data-say="${esc(text)}" aria-label="Pronounce ${esc(text)}">${I.speaker}</button>`;

  // ---------------------------------------------------------------- icons
  const svg = (p, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${p}</svg>`;
  const I = {
    today: svg('<path d="M3 21h18M5 21V10M9.5 21V10M14.5 21V10M19 21V10M2.5 10h19L12 3z"/>'),
    library: svg('<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2.5zM4 19.5A2 2 0 0 0 6 22h13v-3"/><path d="M8 7h7M8 11h5"/>'),
    practice: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'),
    review: svg('<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5"/>'),
    stats: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    flame: svg('<path d="M12 22c4 0 7-2.7 7-6.8 0-3.4-2.2-5.4-3.6-7.2-.4 1.6-1.3 2.7-2.4 3.2C13.3 7.5 11.6 4.4 9 2c.3 3.5-1.6 5.6-3 7.6C4.9 11.1 5 12.6 5 15.2 5 19.3 8 22 12 22z" fill="currentColor" stroke="none"/>'),
    star: svg('<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="currentColor" stroke="none"/>'),
    speaker: svg('<path d="M11 5L6 9H3v6h3l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
    sun: svg('<circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v2.5M12 20v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M1.5 12H4M20 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/>'),
    moon: svg('<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    check: svg('<path d="M4 12.5l5 5L20 6.5"/>'),
    x: svg('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>'),
    cards: svg('<rect x="3" y="6" width="13" height="15" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v13"/>'),
    choose: svg('<rect x="3" y="4" width="18" height="4" rx="1.5"/><rect x="3" y="10" width="18" height="4" rx="1.5"/><rect x="3" y="16" width="18" height="4" rx="1.5"/>'),
    swap: svg('<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>'),
    keyboard: svg('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'),
    pairs: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>'),
    blank: svg('<path d="M3 7h6M15 7h6M3 17h18"/><rect x="9.5" y="4.5" width="5" height="5" rx="1"/>'),
    ear: svg('<path d="M6 9a6 6 0 1 1 12 0c0 3-2 4-3 5.5S14 18 12.5 19.5 8 20 8 17"/><path d="M10 9a2 2 0 1 1 4 0c0 1.5-2 2-2 3.5"/>'),
    mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>'),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  };
  const LAUREL = `<svg class="laurel" viewBox="0 0 150 110" fill="currentColor" aria-hidden="true">${Array.from({ length: 7 }, (_, i) => {
    const a = (-60 + i * 20) * Math.PI / 180, r = 46, cx = 75 - Math.cos(a) * r * 1.05 - 6, cy = 60 + Math.sin(a) * r;
    const cx2 = 150 - cx; return `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="5" ry="12" transform="rotate(${(-30 + i * 20)} ${cx.toFixed(1)} ${cy.toFixed(1)})" opacity="${.55 + i * .06}"/><ellipse cx="${cx2.toFixed(1)}" cy="${cy.toFixed(1)}" rx="5" ry="12" transform="rotate(${(30 - i * 20)} ${cx2.toFixed(1)} ${cy.toFixed(1)})" opacity="${.55 + i * .06}"/>`;
  }).join('')}<text x="75" y="70" font-family="Georgia,serif" font-size="30" text-anchor="middle" font-weight="700">✓</text></svg>`;

  Object.assign(I, {
    scroll: svg('<path d="M8 3h11v15a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-2h11v2a3 3 0 0 0 3 3"/><path d="M8 3a3 3 0 0 0-3 3v10M11 8h5M11 12h5"/>'),
    lexicon: svg('<path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z"/><path d="M8 16h12M9 8l2.5 6L14 8M9.8 12h3.4"/>'),
    lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    left: svg('<path d="M15 5l-7 7 7 7"/>'), right: svg('<path d="M9 5l7 7-7 7"/>'),
    play: svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
  });

  // ---------------------------------------------------------------- chrome
  const TABS = [['today', 'Today', I.today], ['library', 'Course', I.library], ['practice', 'Practice', I.practice], ['review', 'Review', I.review], ['stats', 'Progress', I.stats]];
  function renderTabs(active) {
    const due = dueWords().length;
    $('#tabbar').innerHTML = TABS.map(([k, label, ic]) => `<a href="#/${k}" class="${k === active ? 'on' : ''}" data-tab="${k}" aria-label="${label}">${ic}<span>${label}</span>${k === 'review' && due ? `<em class="badge">${due}</em>` : ''}</a>`).join('');
  }
  function renderChips(bump) {
    const s = $('#chipStreak'), x = $('#chipXp');
    s.innerHTML = I.flame + streak(); x.innerHTML = I.star + S.xp;
    if (bump) { x.classList.remove('bump'); void x.offsetWidth; x.classList.add('bump'); }
  }
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400); }

  // ---------------------------------------------------------------- router
  const view = () => $('#view');
  let cleanup = null;
  function setView(html, tab) {
    if (cleanup) { try { cleanup(); } catch (e) { } cleanup = null; }
    document.body.classList.remove('in-session');
    $$('.feedback, .confetti').forEach(x => x.remove());
    const v = view(); v.innerHTML = html; v.classList.remove('view-enter'); void v.offsetWidth; v.classList.add('view-enter');
    renderTabs(tab); window.scrollTo(0, 0);
  }
  function route() {
    const h = location.hash.replace(/^#\/?/, '') || 'today';
    const [path, qs] = h.split('?'); const parts = path.split('/'); const q = new URLSearchParams(qs || '');
    try {
      switch (parts[0]) {
        case 'today': return viewToday();
        case 'library': return viewLibrary();
        case 'lesson': return parts[2] === 'start' ? startSession('course', parts[1]) : viewLesson(parts[1]);
        case 'words': return viewLexicon();
        case 'grammar': return parts[1] ? (parts[2] === 'practice' ? startSession('rule', parts[1]) : viewRule(parts[1])) : viewGrammar();
        case 'practice': return parts[1] ? startSession(parts[1], q.get('scope') || 'all') : viewPractice(q.get('scope'));
        case 'review': return parts[1] === 'go' ? startSession('review', 'all') : viewReview();
        case 'stats': return viewStats();
        default: return viewToday();
      }
    } catch (e) { console.error(e); setView(`<div class="card">Something went wrong: ${esc(e.message)}</div>`, ''); }
  }
  const go = h => { if (location.hash === h) route(); else location.hash = h; };

  // ---------------------------------------------------------------- course path widgets
  const STATE_LABEL = { done: 'Completed', current: 'Current lesson', reached: 'Started', upcoming: 'Up next' };
  function pathStrip(activeId) {
    return `<nav class="path-strip" aria-label="Course path">${LESSONS.map((l, i) => {
      const st = lessonState(l);
      return `${i ? `<i class="seg-line ${isDone(LESSONS[i - 1]) ? 'on' : ''}"></i>` : ''}<a class="pnode ${st}${l.id === activeId ? ' active' : ''}" href="#/lesson/${l.id}" title="Lesson ${l.n}: ${esc(l.title)} – ${STATE_LABEL[st]}"><span>${st === 'done' ? I.check : l.n}</span></a>`;
    }).join('')}</nav>`;
  }
  function lessonNav(l) {
    const prev = LESSONS[l.n - 2], next = LESSONS[l.n];
    return `<div class="lesson-nav">${prev ? `<a class="card nav-card" href="#/lesson/${prev.id}">${I.left}<div><small>Lesson ${prev.n}</small><b>${esc(prev.title)}</b></div></a>` : '<span></span>'}
      ${next ? `<a class="card nav-card next" href="#/lesson/${next.id}"><div><small>Lesson ${next.n}</small><b>${esc(next.title)}</b></div>${I.right}</a>` : '<span></span>'}</div>`;
  }

  // ---------------------------------------------------------------- lesson rendering
  function lessonBody(l) {
    const s = l.source || {};
    const vocab = l.vocab.map((v, i) => `
      <article class="card vcard">
        <div class="top"><div><div class="vnum">${i + 1}</div><div class="word">${esc(v.la)}</div>${v.dict ? `<div class="pron">${esc(v.dict)}</div>` : ''}${v.pron ? `<div class="pron">${esc(v.pron)}</div>` : ''}</div>${speakBtn(v.la)}</div>
        <div class="en">${esc(v.en)}</div>
        <div class="tags">${v.pos ? `<span class="tag">${esc(v.pos)}</span>` : ''}${v.gender ? `<span class="tag red">${v.gender === 'f' ? 'feminine' : v.gender === 'm' ? 'masculine' : 'neuter'}</span>` : ''}${v.decl ? `<span class="tag">${['', '1st', '2nd', '3rd', '4th', '5th'][v.decl] || v.decl} decl.</span>` : ''}${v.source === 'example' ? '<span class="tag green">from an example</span>' : ''}</div>
        ${v.notes ? `<div class="note">${md(v.notes)}</div>` : ''}
        ${v.example ? `<div class="ex">${speakBtn(v.example.la, true)}<div><div class="la">${esc(v.example.la)}</div><div class="tr">${esc(v.example.en)}</div></div></div>` : ''}
      </article>`).join('');
    const grammar = (l.grammar || []).map(g => `
      <article class="card gcard"><h3>${esc(g.title)}</h3><p>${md(g.body)}</p>
      ${g.table ? `<table class="gt"><thead><tr>${g.table.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${g.table.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}
      ${(g.rules || []).filter(id => RBY.has(id)).length ? `<div class="tags">${g.rules.filter(id => RBY.has(id)).map(id => `<a class="tag" href="#/grammar/${id}">Rule ${RBY.get(id).number} · ${esc(RBY.get(id).title)}</a>`).join('')}</div>` : ''}
      </article>`).join('');
    const examples = (l.examples || []).map(e => `
      <div class="card exrow" data-toggle>${speakBtn(e.la, true)}<div class="txt"><div class="la">${esc(e.la)}</div><div class="tr">${esc(e.en)}</div><div class="hint">Tap to reveal the translation</div></div></div>`).join('');
    const ex = l.exercises || [];
    const exList = ex.map((x, i) => `<div class="card exrow" data-toggle><span class="vnum" style="margin:0">${i + 1}</span><div class="txt"><div>${md(x.prompt)}${x.la ? ` <span class="la">${esc(x.la)}</span>` : ''}${x.review ? ' <span class="tag">review</span>' : ''}</div><div class="tr"><b class="la">${esc(x.answer)}</b></div><div class="hint">Tap to show the answer</div></div></div>`).join('');
    return `
      ${l.intro ? `<p class="muted" style="font-size:16px;margin:18px 2px 0">${md(l.intro)}</p>` : ''}
      ${s.truncated ? `<div class="notice" style="margin-top:16px">${I.info}<div><b>Partial lesson.</b> ${esc(s.truncatedNote || 'The email was cut off.')} ${s.continueUrl ? `<a href="${esc(s.continueUrl)}" target="_blank" rel="noopener">Open the full session ↗</a>` : ''}</div></div>` : ''}
      <section class="section"><div class="section-head"><div><div class="eyebrow">1 · Verba</div><h2 class="section-title">Words <small>${l.vocab.length}</small></h2></div>
        <a class="link-btn" href="#/practice/flash?scope=${l.id}">Flashcards →</a></div><div class="vocab-grid">${vocab}</div></section>
      ${grammar ? `<section class="section"><div class="section-head"><div><div class="eyebrow">2 · Grammatica</div><h2 class="section-title">Grammar</h2></div>
        <a class="link-btn" href="#/practice/fill?scope=${l.id}">Drill →</a></div>${grammar}</section>` : ''}
      ${examples ? `<section class="section"><div class="section-head"><div><div class="eyebrow">Exempla</div><h2 class="section-title">Example sentences</h2></div></div><div class="exlist">${examples}</div></section>` : ''}
      ${exList ? `<section class="section"><div class="section-head"><div><div class="eyebrow">3 · Exercitia</div><h2 class="section-title">Exercises <small>${ex.length + (l.drills || []).length}</small></h2></div>
        <a class="link-btn" href="#/practice/email?scope=${l.id}">Do them →</a></div><div class="exlist">${exList}</div></section>` : ''}
      ${l.reading ? `<section class="section"><div class="eyebrow">4 · Lectio</div><h2 class="section-title" style="margin-bottom:12px">Translate the paragraph</h2>
        <div class="card exrow" data-toggle>${speakBtn(l.reading.la, true)}<div class="txt"><div class="la">${esc(l.reading.la)}</div>${l.reading.hint ? `<div class="hint" style="display:block">${md(l.reading.hint)}</div>` : ''}<div class="tr">${esc(l.reading.en)}</div><div class="hint">Tap to reveal the translation</div></div></div></section>` : ''}
      <section class="section"><div class="section-head"><div><div class="eyebrow">Exercitatio</div><h2 class="section-title">Practise this lesson</h2></div></div>
        <a class="btn btn-primary btn-block" href="#/lesson/${l.id}/start" style="margin-bottom:12px">${I.play} ${isDone(l) ? 'Redo' : 'Start'} Lesson ${l.n} step by step</a>
        ${modeTiles(l.id)}</section>
      ${(l.notes || []).length ? `<section class="section"><div class="eyebrow">Notae</div>${l.notes.map(n => `<p class="muted">${md(n)}</p>`).join('')}</section>` : ''}
      ${lessonNav(l)}
      <div class="meander"></div>
      <p class="muted" style="font-size:12px;text-align:center;margin-top:10px">Lesson ${l.n} of ${META.plannedLessons || LESSONS.length} planned · ${(l.vocab || []).length} new words from the DCC core list · ${esc(l.rule ? 'new rule: ' + ((RBY.get(l.rule) || {}).title || l.rule) : 'review lesson')}</p>`;
  }
  function bindLesson(l) {
    $$('[data-toggle]').forEach(r => r.addEventListener('click', e => { if (!e.target.closest('.speak')) r.classList.toggle('open'); }));
    S.lessonsSeen[l.id] = true; save();
  }

  // ---------------------------------------------------------------- views
  function viewToday() {
    const l = latest;
    if (!l) return setView('<div class="card">No lessons yet. Add one with <code>scripts/add_lesson</code>.</div>', 'today');
    const cur = currentLesson();
    const todayXP = S.days[dayKey()] || 0, goal = S.settings.goal, pct = Math.min(100, Math.round(todayXP / goal * 100));
    const due = dueWords().length, fresh = Math.min(newWords().length, newAllowance());
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Salve, Dror · Good morning' : hour < 18 ? 'Salve, Dror · Good afternoon' : 'Salve, Dror · Good evening';
    setView(`
      <section class="hero">
        <div class="numeral" aria-hidden="true">${roman(l.n)}</div>
        <div class="greet">${greet}</div>
        <div class="meta" style="margin-top:6px">${l.date === dayKey() ? "Today's lesson" : 'Latest lesson'} · <b>Lesson ${l.n}</b> of ${LESSONS.length} · ${fmtDate(l.date)}</div>
        <h1>${esc(l.title)}</h1>
        <div class="hero-row">
          <div class="hero-actions">
            <a class="btn btn-light" href="#/lesson/${l.id}/start">${I.play} ${isDone(l) ? 'Redo' : 'Start'} Lesson ${l.n}</a>
            ${due || fresh ? `<a class="btn btn-ghost-light" href="#/review/go">${I.review} Review ${due ? due + ' due' : fresh + ' new'}</a>` : ''}
          </div>
          <div class="ring" style="--p:${pct}" title="Daily goal"><span><div><b>${todayXP}</b>/${goal} XP</div></span></div>
        </div>
      </section>
      <section class="card course-card">
        <div class="section-head" style="margin:0 0 6px"><div><div class="eyebrow">Iter · Your course</div><b>${LESSONS.filter(isDone).length} of ${LESSONS.length} lessons completed</b></div>
        <a class="link-btn" href="#/library">All lessons →</a></div>
        ${pathStrip(l.id)}
        ${cur !== l && !isDone(cur) ? `<a class="btn btn-block" style="margin-top:10px" href="#/lesson/${cur.id}/start">${I.play} Continue the course: Lesson ${cur.n}</a>` : ''}
        <div class="mini-stats"><a href="#/words"><b>${LEX.stats.lemmaCount}</b> lemmas</a><a href="#/words"><b>${LEX.stats.formCount}</b> forms</a><a href="#/grammar"><b>${RULES.length}</b> grammar rules</a></div>
      </section>
      ${lessonBody(l)}`, 'today');
    bindLesson(l);
  }

  function viewLesson(id) {
    const l = LBY.get(id);
    if (!l) return go('#/library');
    setView(`
      <a class="link-btn" href="#/library">← Course</a>
      ${pathStrip(l.id)}
      <div class="eyebrow" style="margin-top:10px">Lesson ${l.n} of ${LESSONS.length} · ${fmtDate(l.date)} · ${STATE_LABEL[lessonState(l)]}</div>
      <h1 style="font-size:30px;margin-top:4px">${esc(l.title)}</h1>
      ${l.subtitle ? `<div class="muted la" style="margin-top:4px">${esc(l.subtitle)}</div>` : ''}
      ${lessonBody(l)}`, 'library');
    bindLesson(l);
  }

  function viewLibrary() {
    const items = LESSONS.map((l, i) => {
      const ws = wordsFor(l.id), m = Math.round(mastery(ws) * 100), st = lessonState(l);
      const rules = RULES.filter(r => r.introducedIn === l.n).length;
      return `<a class="course-item ${st}" href="#/lesson/${l.id}" style="animation-delay:${i * .04}s">
        <div class="rail"><span class="node">${st === 'done' ? I.check : l.n}</span></div>
        <div class="card body"><div class="sub">Lesson ${l.n} · ${fmtDate(l.date)} · <span class="st">${STATE_LABEL[st]}</span></div>
        <h3>${esc(l.title)}</h3><div class="sub">${l.vocab.length} words${rules ? ` · ${rules} new rule${rules > 1 ? 's' : ''}` : ''}${(l.exercises || []).length ? ` · ${l.exercises.length} exercises` : ''}${l.source?.truncated ? ' · partial email' : ''}</div>
        <div class="bar"><i style="width:${m}%"></i></div></div></a>`;
    }).join('');
    setView(`
      <div class="eyebrow">Iter</div><h1 style="font-size:30px;margin:4px 0 16px">Your course</h1>
      <div class="row2" style="margin-bottom:22px">
        <a class="card hub" href="#/words"><span class="ico">${I.lexicon}</span><b>${LEX.stats.lemmaCount}</b><span>lemmas · ${LEX.stats.formCount} forms</span><small>Lexicon →</small></a>
        <a class="card hub" href="#/grammar"><span class="ico">${I.scroll}</span><b>${RULES.length}</b><span>grammar rules</span><small>Grammar →</small></a>
      </div>
      <div class="section-head"><h2 class="section-title">Lessons in order <small>${LESSONS.length}</small></h2></div>
      <div class="course">${items}</div>`, 'library');
  }
  // ---------------------------------------------------------------- lexicon
  const POS_LABEL = { noun: 'Nouns', verb: 'Verbs', adjective: 'Adjectives', adverb: 'Adverbs', preposition: 'Prepositions', conjunction: 'Conjunctions', interjection: 'Interjections', pronoun: 'Pronouns', 'proper noun': 'Names' };
  const STATUS_TAG = { new: '', learning: 'red', known: 'green' };
  function lemmaMeta(e) {
    const bits = [];
    if (e.gender) bits.push({ m: 'masc.', f: 'fem.', n: 'neut.' }[e.gender] || e.gender);
    if (e.declension) bits.push(`${typeof e.declension === 'number' ? ['', '1st', '2nd', '3rd', '4th', '5th'][e.declension] : e.declension} decl.`);
    if (e.conjugation) bits.push(typeof e.conjugation === 'number' ? `${['', '1st', '2nd', '3rd', '4th'][e.conjugation]} conj.` : e.conjugation);
    return bits.join(' · ');
  }
  function viewLexicon() {
    const st = LEX.stats, g = st.growth || [], max = Math.max(1, ...g.map(x => x.lemmas));
    const counts = { new: 0, learning: 0, known: 0 }; LEMMAS.forEach(e => counts[lemmaStatus(e)]++);
    const row = e => {
      const s = lemmaStatus(e), d = e.derived, future = d.firstLesson > reachedN();
      return `<details class="lemma ${future ? 'future' : ''}"><summary>
        <span class="lnum">L${d.firstLesson}</span>
        <div class="lmain"><div class="w">${esc(e.lemma)}${e.inferred && e.inferred.length ? '<sup title="Partly inferred beyond the lesson text">*</sup>' : ''}</div><div class="m">${esc(e.en)}</div></div>
        <span class="tag ${STATUS_TAG[s]}">${future ? 'upcoming' : s}</span></summary>
        <div class="ldetail">
          <div class="tags"><span class="tag">${esc(e.pos)}</span>${lemmaMeta(e) ? `<span class="tag">${esc(lemmaMeta(e))}</span>` : ''}${e.rank ? `<span class="tag green">DCC #${e.rank}</span>` : ''}</div>
          <table class="gt"><thead><tr><th>Form seen</th><th>Parse</th><th>Lessons</th><th></th></tr></thead><tbody>
          ${d.formsSeen.map(f => `<tr><td>${esc(f.form)}</td><td>${esc(f.parse || '')}</td><td style="font-style:normal">${f.lessons.join(', ')}</td><td>${speakBtn(f.form, true)}</td></tr>`).join('')}</tbody></table>
          ${e.note ? `<p class="muted" style="font-size:14px;margin:8px 0 0">${md(e.note)}</p>` : ''}
          ${e.inferred && e.inferred.length ? `<p class="muted" style="font-size:13px;margin:6px 0 0">* Inferred (not stated in the lessons): ${esc(e.inferred.join(', '))}.</p>` : ''}
        </div></details>`;
    };
    setView(`<a class="link-btn" href="#/library">← Course</a><div class="eyebrow" style="margin-top:6px">Lexicon</div>
      <section class="card lex-hero"><div class="bignum"><b id="lemmaCount">${st.lemmaCount}</b><span>lemmas</span></div><div class="bignum"><b>${st.formCount}</b><span>forms seen</span></div>
        <div class="bignum"><b>${counts.known}</b><span>known</span></div></section>
      <div class="tags" style="margin:12px 0">${Object.entries(st.byPos).map(([p, n]) => `<span class="tag">${esc(POS_LABEL[p] || p)} ${n}</span>`).join('')}</div>
      <section class="card"><h3 style="font-size:16px">Growth by lesson</h3>
        <div class="chart">${g.map(x => `<div class="c" title="Lesson ${x.lesson}: ${x.lemmas} lemmas, ${x.forms} forms"><em>${x.lemmas}</em><i style="height:${x.lemmas / max * 100}%"></i><span>L${x.lesson}</span></div>`).join('')}</div>
        <p class="muted" style="font-size:13px;margin:6px 0 0">${counts.new} new · ${counts.learning} learning · ${counts.known} known – status comes from spaced review.</p></section>
      <input class="search" id="q" type="search" placeholder="Search lemma, form or meaning…" autocomplete="off" autocapitalize="off" style="margin-top:14px">
      <div class="card" style="margin-top:12px;padding:4px 12px" id="lex">${LEMMAS.map(row).join('')}</div>`, 'library');
    $('#q').addEventListener('input', e => {
      const q = norm(e.target.value);
      $('#lex').innerHTML = LEMMAS.filter(x => !q || norm(x.lemma).includes(q) || norm(x.en).includes(q) || Object.keys(x.forms).some(f => norm(f).includes(q))).map(row).join('') || '<p class="muted">No matches.</p>';
    });
  }

  // ---------------------------------------------------------------- grammar
  const RSTAT = { 'not started': '', practising: 'red', mastered: 'green' };
  const ruleItems = r => quizFor(r).length;
  function viewGrammar() {
    const learned = RULES.filter(ruleReached).length, mastered = RULES.filter(r => ruleProgress(r).status === 'mastered').length;
    setView(`<a class="link-btn" href="#/library">← Course</a><div class="eyebrow" style="margin-top:6px">Grammatica</div>
      <h1 style="font-size:30px;margin:4px 0 6px">Grammar rules</h1>
      <p class="muted" style="margin:0 0 14px">In the order you meet them. ${learned} of ${RULES.length} reached · ${mastered} mastered.</p>
      <div class="rules">${RULES.map((r, i) => {
        const p = ruleProgress(r), open = ruleReached(r);
        return `<a class="card rule-item ${open ? '' : 'future'}" href="#/grammar/${r.id}" style="animation-delay:${i * .03}s"><span class="rnum">${r.number}</span>
          <div class="body"><h3>${esc(r.title)}</h3><div class="sub">Lesson ${r.introducedIn}${r.reinforcedIn.length ? ` · reinforced in ${r.reinforcedIn.join(', ')}` : ''} · ${ruleItems(r)} exercises</div>
          <div class="bar"><i style="width:${p.acc || 0}%"></i></div></div>
          <span class="tag ${RSTAT[p.status]}">${open ? p.status + (p.acc != null ? ` ${p.acc}%` : '') : 'lesson ' + r.introducedIn}</span></a>`;
      }).join('')}</div>`, 'library');
  }
  function viewRule(id) {
    const r = RBY.get(id); if (!r) return go('#/grammar');
    const p = ruleProgress(r), open = ruleReached(r), n = ruleItems(r);
    const prev = RULES[r.number - 2], next = RULES[r.number];
    setView(`<a class="link-btn" href="#/grammar">← Grammar</a>
      <div class="eyebrow" style="margin-top:6px">Rule ${r.number} of ${RULES.length} · introduced in Lesson ${r.introducedIn}</div>
      <h1 style="font-size:28px;margin:4px 0 12px">${esc(r.title)}</h1>
      <article class="card gcard"><p>${md(r.explanation)}</p></article>
      ${r.examples.length ? `<section class="section"><div class="eyebrow">Exempla</div><div class="exlist" style="margin-top:10px">${r.examples.map(e => `<div class="card exrow open">${speakBtn(e.la, true)}<div class="txt"><div class="la">${esc(e.la)}</div><div class="tr">${esc(e.en)}${e.lessons && e.lessons.length ? ` · Lesson ${e.lessons.join(', ')}` : ''}</div></div></div>`).join('')}</div></section>` : ''}
      <section class="section card"><h3 style="font-size:17px;margin-bottom:6px">Where you met it</h3>
        <p class="muted" style="margin:0;font-size:15px">Introduced: <a href="#/lesson/${LESSONS[r.introducedIn - 1].id}">Lesson ${r.introducedIn}</a>${r.reinforcedIn.length ? ` · Reinforced: ${r.reinforcedIn.map(x => `<a href="#/lesson/${LESSONS[x - 1].id}">Lesson ${x}</a>`).join(', ')}` : ''}</p>
        <div class="stat-grid" style="margin-top:12px"><div class="stat"><b>${p.status === 'not started' ? '–' : p.acc + '%'}</b><span>Accuracy</span></div><div class="stat"><b>${p.n}</b><span>Answers</span></div>
        <div class="stat"><b>${n}</b><span>Exercises</span></div><div class="stat"><b style="font-size:16px">${p.status}</b><span>Status</span></div></div></section>
      ${open && n ? `<a class="btn btn-primary btn-block" style="margin-top:16px" href="#/grammar/${r.id}/practice">${I.play} Practise this rule only</a>`
        : `<p class="muted" style="text-align:center">${open ? 'No exercises for this rule yet.' : `Unlocks when you reach Lesson ${r.introducedIn}.`}</p>`}
      <div class="lesson-nav">${prev ? `<a class="card nav-card" href="#/grammar/${prev.id}">${I.left}<div><small>Rule ${prev.number}</small><b>${esc(prev.title)}</b></div></a>` : '<span></span>'}
      ${next ? `<a class="card nav-card next" href="#/grammar/${next.id}"><div><small>Rule ${next.number}</small><b>${esc(next.title)}</b></div>${I.right}</a>` : '<span></span>'}</div>`, 'library');
  }

  // ---------------------------------------------------------------- practice / review / stats
  const MODES = [
    ['flash', 'Flashcards', 'Flip cards, rate yourself', I.cards],
    ['mc', 'Latin → English', 'Pick the meaning', I.choose],
    ['mcr', 'English → Latin', 'Pick the Latin word', I.swap],
    ['type', 'Type it', 'Spell the Latin – macrons optional', I.keyboard],
    ['match', 'Match pairs', 'Race to pair the words', I.pairs],
    ['fill', 'Fill the blank', 'Complete sentences & grammar', I.blank],
    ['listen', 'Listen', 'Hear it, choose the meaning', I.ear],
    ['email', 'Lesson exercises', "Each lesson's own questions", I.mail],
  ];
  function modeTiles(scope) {
    const emailCount = lessonsFor(scope).reduce((n, l) => n + (l.exercises || []).length, 0);
    return `<div class="modes">${MODES.map(([k, t, d, ic], i) => {
      const off = k === 'email' && !emailCount;
      return `<button class="mode" data-mode="${k}" data-scope="${scope}" style="animation-delay:${i * .03}s" ${off ? 'disabled' : ''}><span class="ico">${ic}</span><b>${t}</b><span>${off ? 'None yet' : k === 'email' ? `${emailCount} questions` : d}</span></button>`;
    }).join('')}</div>`;
  }
  function viewPractice(scope) {
    scope = scope && (scope === 'all' || LBY.has(scope)) ? scope : 'all';
    const rn = reachedN();
    setView(`<div class="eyebrow">Exercitia</div><h1 style="font-size:30px;margin:4px 0 6px">Practice</h1>
      <p class="muted" style="margin:0 0 14px">Everything follows lesson order. "All" covers the lessons you have reached (1–${rn}); start a later lesson to unlock its words.</p>
      <div class="seg" id="scopes"><button data-s="all" class="${scope === 'all' ? 'on' : ''}">Lessons 1–${rn} · ${reachedWords().length} words</button>${LESSONS.map(l => `<button data-s="${l.id}" class="${scope === l.id ? 'on' : ''}">Lesson ${l.n}${isReached(l) ? '' : ' 🔒'}</button>`).join('')}</div>
      <a class="btn btn-primary btn-block" href="#/practice/mix?scope=${scope}" style="margin-bottom:14px">${I.practice} Mixed session</a>
      ${modeTiles(scope)}`, 'practice');
    $$('#scopes button').forEach(b => b.addEventListener('click', () => go(`#/practice?scope=${b.dataset.s}`)));
  }

  function viewReview() {
    const due = dueWords(), fresh = newWords(), allow = newAllowance(), pool = reachedWords();
    const boxes = [1, 2, 3, 4, 5, 6].map(b => pool.filter(w => box(w) === b).length);
    const next = pool.map(w => S.srs[w.id]).filter(c => c && c.due > Date.now()).sort((a, b) => a.due - b.due)[0];
    const label = ['Today', '1 day', '3 days', '1 week', '2 weeks', '1 month'];
    setView(`<div class="eyebrow">Repetitio</div><h1 style="font-size:30px;margin:4px 0 6px">Spaced review</h1>
      <p class="muted" style="margin:0 0 16px">Words from Lessons 1–${reachedN()}. New words are introduced in lesson order; right answers move a word up a box, misses send it back to box 1.</p>
      <div class="stat-grid"><div class="stat"><b>${due.length}</b><span>Due now</span></div><div class="stat"><b>${Math.min(allow, fresh.length)}</b><span>New today</span></div>
      <div class="stat"><b>${pool.length - fresh.length}</b><span>In rotation</span></div><div class="stat"><b>${boxes[3] + boxes[4] + boxes[5]}</b><span>Known</span></div></div>
      <a class="btn btn-primary btn-block" style="margin-top:16px" href="#/review/go" ${due.length || (allow && fresh.length) ? '' : 'disabled'}>${I.review} ${due.length ? `Review ${due.length} word${due.length > 1 ? 's' : ''}` : allow && fresh.length ? `Learn ${Math.min(allow, fresh.length)} new words` : 'All caught up'}</a>
      ${fresh.length && allow ? `<p class="muted" style="text-align:center;font-size:14px">Next new: ${fresh.slice(0, Math.min(allow, 6)).map(w => `<span class="la">${esc(w.la)}</span>`).join(', ')}</p>` : ''}
      ${!due.length && next ? `<p class="muted" style="text-align:center;font-size:14px">Next word due ${new Date(next.due).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</p>` : ''}
      <section class="section card"><h3 style="font-size:18px;margin-bottom:12px">Leitner boxes</h3><div class="boxes">
      ${boxes.map((n, i) => `<div class="b"><span>Box ${i + 1} <small class="muted">· ${label[i]}</small></span><div class="bar" style="margin:0"><i style="width:${pool.length ? n / pool.length * 100 : 0}%"></i></div><b style="text-align:right">${n}</b></div>`).join('')}
      </div></section>`, 'review');
  }

  function viewStats() {
    const lv = level(), acc = S.answered ? Math.round(S.correct / S.answered * 100) : 0;
    const days = Array.from({ length: 14 }, (_, i) => dayKey(new Date(Date.now() - (13 - i) * DAY)));
    const max = Math.max(S.settings.goal, ...days.map(d => S.days[d] || 0));
    const lc = { new: 0, learning: 0, known: 0 }; LEMMAS.forEach(e => lc[lemmaStatus(e)]++);
    const rReached = RULES.filter(ruleReached).length, rMastered = RULES.filter(r => ruleProgress(r).status === 'mastered').length;
    const t = S.settings.theme;
    setView(`<div class="eyebrow">Progressus</div><h1 style="font-size:30px;margin:4px 0 16px">Your progress</h1>
      <div class="card" style="display:flex;align-items:center;gap:16px"><div class="ring" style="--p:${lv.into};background:conic-gradient(var(--gold) calc(var(--p)*1%), var(--bg2) 0)"><span style="background:var(--card);color:var(--ink)"><div><b>${lv.lv}</b>level</div></span></div>
        <div><div class="eyebrow">${lv.rank}</div><div style="font-family:var(--serif);font-size:22px;font-weight:600">${S.xp} XP</div><div class="muted" style="font-size:14px">${lv.toNext} XP to level ${lv.lv + 1}${RANKS[lv.lv] ? ` · ${RANKS[lv.lv]}` : ''}</div></div></div>
      <div class="stat-grid" style="margin-top:12px">
        <div class="stat"><b>${streak()}</b><span>Day streak</span></div><div class="stat"><b>${bestStreak()}</b><span>Best streak</span></div>
        <a class="stat" href="#/library"><b>${LESSONS.filter(isDone).length}/${LESSONS.length}</b><span>Lessons done</span></a><div class="stat"><b>${acc}%</b><span>Accuracy</span></div>
        <a class="stat" href="#/words"><b>${lc.known + lc.learning}/${LEMMAS.length}</b><span>Lemmas learned</span></a><a class="stat" href="#/words"><b>${lc.known}</b><span>Lemmas known</span></a>
        <a class="stat" href="#/grammar"><b>${rReached}/${RULES.length}</b><span>Rules learned</span></a><a class="stat" href="#/grammar"><b>${rMastered}</b><span>Rules mastered</span></a>
        <div class="stat"><b>${S.answered}</b><span>Answers</span></div><div class="stat"><b>${S.sessions}</b><span>Sessions</span></div>
        <div class="stat"><b>${LEX.stats.formCount}</b><span>Forms seen</span></div><div class="stat"><b>${S.bestMatch ? S.bestMatch + 's' : '–'}</b><span>Best match</span></div>
      </div>
      <section class="section card"><h3 style="font-size:18px">Last 14 days</h3><div class="chart">${days.map(d => { const v = S.days[d] || 0; return `<div class="c" title="${d}: ${v} XP"><i class="${v ? '' : 'zero'}" style="height:${v ? Math.max(6, v / max * 100) : 3}%"></i><span>${parseDay(d).getDate()}</span></div>`; }).join('')}</div></section>
      <section class="section card"><h3 style="font-size:18px;margin-bottom:4px">Settings</h3>
        <div class="setting"><label>Theme</label><div class="seg" style="margin:0" id="themeSeg">${['auto', 'light', 'dark'].map(x => `<button data-t="${x}" class="${t === x ? 'on' : ''}">${cap(x)}</button>`).join('')}</div></div>
        <div class="setting"><label>Speech speed<small id="rateV">${S.settings.rate.toFixed(2)}×</small></label><div style="display:flex;gap:8px;align-items:center"><input type="range" min="0.5" max="1.2" step="0.05" value="${S.settings.rate}" id="rate">${speakBtn('Puella bona est', true)}</div></div>
        <div class="setting"><label>Voice<small>${esc((bestVoice() || {}).name ? `${bestVoice().name} (${bestVoice().lang})` : 'System default (Italian requested)')}</small></label></div>
        <div class="setting"><label>Daily goal</label><div class="seg" style="margin:0" id="goalSeg">${[30, 50, 100].map(g => `<button data-g="${g}" class="${S.settings.goal === g ? 'on' : ''}">${g} XP</button>`).join('')}</div></div>
        <div class="setting"><label>New words per day</label><div class="seg" style="margin:0" id="newSeg">${[3, 6, 10].map(g => `<button data-n="${g}" class="${S.settings.newPerDay === g ? 'on' : ''}">${g}</button>`).join('')}</div></div>
        <div class="setting"><label>Backup<small>Progress is stored on this device only</small></label><div style="display:flex;gap:8px"><button class="btn" id="exp" style="min-height:42px">Export</button><label class="btn" style="min-height:42px">Import<input type="file" id="imp" accept="application/json" hidden></label></div></div>
        <div class="setting"><label>Reset progress</label><button class="btn btn-bad" id="reset" style="min-height:42px">Reset</button></div>
      </section>
      <section class="section card" id="about"><h3 style="font-size:18px;margin-bottom:6px">About</h3>
        <p class="muted" style="font-size:14px;margin:0 0 8px">A step-by-step course: ${LESSONS.length} of ${META.plannedLessons || LESSONS.length} planned lessons so far. Every lesson adds 5–8 of the most frequent Latin words and at most one grammar rule, and only ever uses words and forms you have already been taught.</p>
        <p class="muted" style="font-size:14px;margin:0">Vocabulary and frequency ranks: <a href="${esc((META.source || LEX.source || {}).url || 'https://dcc.dickinson.edu/latin-core-list1')}" target="_blank" rel="noopener">Dickinson College Commentaries Latin Core Vocabulary</a> by Christopher Francese et al., licensed <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC BY-SA 3.0</a>. Lesson texts are written for this app and adapt DCC definitions; they are shared under the same licence.</p></section>
      <p class="muted" style="text-align:center;font-size:12px;margin-top:18px">Lingua Latina · ${LESSONS.length} lessons · ${LEX.stats.lemmaCount} lemmas · ${RULES.length} rules<span id="swv"></span></p>`, 'stats');
    $$('#themeSeg button').forEach(b => b.onclick = () => { S.settings.theme = b.dataset.t; save(); applyTheme(); viewStats(); });
    $$('#goalSeg button').forEach(b => b.onclick = () => { S.settings.goal = +b.dataset.g; save(); viewStats(); });
    $$('#newSeg button').forEach(b => b.onclick = () => { S.settings.newPerDay = +b.dataset.n; save(); viewStats(); });
    $('#rate').oninput = e => { S.settings.rate = +e.target.value; $('#rateV').textContent = S.settings.rate.toFixed(2) + '×'; save(); };
    $('#exp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' })); a.download = `latina-progress-${dayKey()}.json`; a.click(); };
    $('#imp').onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => { S = Object.assign(defaults(), JSON.parse(t)); S.course = Object.assign(defaults().course, S.course); S.rules = S.rules || {}; save(); toast('Progress imported'); viewStats(); renderChips(); }).catch(() => toast('Could not read that file')); };
    let armed = false;
    $('#reset').onclick = e => { if (!armed) { armed = true; e.target.textContent = 'Tap again to confirm'; setTimeout(() => { armed = false; if (e.target.isConnected) e.target.textContent = 'Reset'; }, 3000); return; } S = defaults(); save(); applyTheme(); renderChips(); toast('Progress reset'); viewStats(); };
    if (window.__swVersion) $('#swv').textContent = ' · v' + window.__swVersion;
  }
  // ---------------------------------------------------------------- question generators (lesson order; only options are shuffled)
  const poolFor = scope => scope === 'all' || !LBY.has(scope) ? reachedWords() : ALL_WORDS.filter(w => w.firstN <= Math.max(LBY.get(scope).n, reachedN()));
  // weakest n words, then put back into lesson order
  const pickWeak = (ws, n) => ws.slice().sort((a, b) => box(a) - box(b) || a.order - b.order).slice(0, n).sort(byOrder);
  function distractors(w, pool, n, field) {
    const ok = o => o.id !== w.id && norm(o[field]) !== norm(w[field]);
    const same = shuffle(pool.filter(o => ok(o) && o.pos === w.pos)), rest = shuffle(pool.filter(o => ok(o) && o.pos !== w.pos));
    return same.concat(rest).slice(0, n);
  }
  function qMC(w, pool, reverse) {
    const ds = distractors(w, pool.length >= 4 ? pool : ALL_WORDS.filter(o => o.firstN <= Math.max(w.firstN, 2)), 3, reverse ? 'la' : 'en');
    return { kind: 'mc', word: w, reverse, prompt: reverse ? w.en : w.la, label: reverse ? 'Choose the Latin' : 'What does this mean?',
      choices: shuffle([w, ...ds]).map(o => ({ text: reverse ? o.la : o.en, ok: o.id === w.id })), answer: reverse ? w.la : w.en };
  }
  const qType = w => ({ kind: 'type', word: w, prompt: w.en, label: 'Type it in Latin', answers: laForms(w), answer: w.la, lang: 'la' });
  const qTypeEn = w => ({ kind: 'type', word: w, prompt: w.la, label: 'Type the English meaning', answers: enAnswers(w), answer: w.en, lang: 'en' });
  const qListen = (w, pool) => Object.assign(qMC(w, pool, false), { kind: 'listen', label: 'Listen and choose the meaning' });
  const qLearn = w => ({ kind: 'learn', word: w, label: 'New word' });

  const KNOWN_SENTENCES = new Set(LESSONS.flatMap(l => (l.examples || []).concat(l.vocab.filter(v => v.example).map(v => v.example)).map(e => norm(e.la))
    .concat((l.drills || []).map(d => norm(d.sentence.replace('___', d.answer))))));
  const drillItem = (d, l) => ({ kind: 'fill', sentence: d.sentence, answer: d.answer, rules: d.rules || [], lesson: l.n,
    choices: shuffle(d.choices.filter(c => c === d.answer || !KNOWN_SENTENCES.has(norm(d.sentence.replace('___', c))))).map(c => ({ text: c, ok: c === d.answer })),
    en: d.en, hint: d.hint, label: 'Fill the blank' });
  const formsUpTo = (e, n) => ((e.derived || {}).formsSeen || []).filter(f => f.lessons[0] <= n).map(f => f.form);
  const lemmaOfForm = (t, n) => { const id = FORM2LEMMA.get(norm(t)); const e = id && LEXBY.get(id); return e && e.firstLesson <= n && e.pos !== 'proper noun' ? e : null; };
  function clozeItems(l) {   // one per example sentence, in the lesson's order; blank position is deterministic
    const out = [], seen = new Set();
    const taught = LEX.lemmas.filter(e => e.firstLesson <= l.n && e.pos !== 'proper noun');
    (l.examples || []).concat(l.vocab.filter(v => v.example).map(v => v.example)).forEach((s, idx) => {
      if (seen.has(s.la)) return; seen.add(s.la);
      const end = (s.la.match(/[.!?]$/) || [''])[0];
      const toks = s.la.replace(/[.!?]$/, '').split(/\s+/);
      const cands = toks.map((t, i) => { const m = t.match(/^(.*?)([!?,.;:]*)$/); return { t: m[1], p: m[2], i, e: lemmaOfForm(m[1], l.n) }; }).filter(c => c.e);
      if (!cands.length) return;
      const c = cands[idx % cands.length];
      const sentence = toks.map((t, i) => i === c.i ? '___' + c.p : t).join(' ') + end;
      const fits = f => norm(f) !== norm(c.t) && !KNOWN_SENTENCES.has(norm(sentence.replace('___', f)));
      const same = [...new Set(formsUpTo(c.e, l.n))].filter(fits);
      const other = [...new Set(taught.filter(e => e.id !== c.e.id && e.pos === c.e.pos).flatMap(e => formsUpTo(e, l.n)))].filter(fits);
      const others = [...new Set(taught.filter(e => e.id !== c.e.id).flatMap(e => formsUpTo(e, l.n)))].filter(fits);
      const ds = pick(same, 2); for (const f of pick(other, 3).concat(pick(others, 3))) if (ds.length < 3 && !ds.includes(f)) ds.push(f);
      const opts = shuffle([c.t, ...ds]);
      const w = ALL_WORDS.find(w => w.id === c.e.id);
      out.push({ kind: 'fill', sentence, answer: c.t, choices: opts.map(o => ({ text: c.i === 0 ? cap(o) : o, ok: norm(o) === norm(c.t) })), en: s.en, label: 'Complete the sentence', word: w, lesson: l.n });
    });
    return out;
  }
  function exerciseItem(x, l) {
    const instr = (x.prompt || '').replace(/\*/g, '');
    const base = x.la ? { label: `Lesson ${l.n}${x.review ? ' · review' : ''} · ${instr}`, prompt: x.la, promptIsLa: true }
      : { label: `Lesson ${l.n}${x.review ? ' · review' : ''} · ${x.type ? cap(x.type) : 'Exercise'}`, prompt: instr, promptIsEn: true };
    Object.assign(base, { answer: x.answer, explain: x.explanation, rules: x.rules || [], lesson: l.n, source: 'lesson' });
    if (x.check === 'self') return Object.assign(base, { kind: 'self' });
    if (x.choices && x.choices.length) return Object.assign(base, { kind: 'mc', choices: shuffle(x.choices).map(c => ({ text: c, ok: c === x.answer })) });
    return Object.assign(base, { kind: 'type', answers: [x.answer, ...(x.accept || [])], lang: x.answerLang || 'la' });
  }
  const readingItem = l => ({ kind: 'self', label: `Lesson ${l.n} · Translate the paragraph`, prompt: l.reading.la, promptIsLa: true, answer: l.reading.en, explain: l.reading.hint, lesson: l.n });
  const ruleQuizItem = (q, r) => ({ kind: 'mc', label: `Rule ${r.number} · ${r.title}`, prompt: q.prompt, promptIsEn: true, answer: q.answer, explain: q.explanation,
    choices: shuffle(q.choices).map(c => ({ text: c, ok: c === q.answer })), rules: [r.id] });
  function quizFor(r) {   // a rule's own check questions, then every tagged drill/exercise from reached lessons, in lesson order
    const out = (r.quiz || []).map(q => ruleQuizItem(q, r));
    LESSONS.filter(l => l.n <= Math.max(reachedN(), r.introducedIn)).forEach(l => {
      (l.drills || []).forEach(d => (d.rules || []).includes(r.id) && out.push(drillItem(d, l)));
      (l.exercises || []).forEach(x => (x.rules || []).includes(r.id) && out.push(exerciseItem(x, l)));
    });
    return out;
  }
  const lessonFill = l => (l.drills || []).map(d => drillItem(d, l)).concat(clozeItems(l));
  const sect = (items, name) => items.map(q => Object.assign(q, { section: name }));

  function courseQueue(l) {
    const pool = poolFor(l.id), q = [];
    const ws = ALL_WORDS.filter(w => w.lessons.includes(l.id)).sort((a, b) => {   // this lesson's word-list order
      const ia = l.vocab.findIndex(v => wordKey(v) === a.id), ib = l.vocab.findIndex(v => wordKey(v) === b.id); return ia - ib; });
    ws.forEach((w, i) => { if (!S.srs[w.id] && w.firstN === l.n) q.push(qLearn(w)); q.push(i % 3 === 2 ? qMC(w, pool, true) : qMC(w, pool, false)); });
    sect(q, 'Words');
    const g = []; (l.grammar || []).forEach(card => g.push({ kind: 'read', card, label: 'Grammar', rules: card.rules || [] }));
    sect(g.concat((l.drills || []).map(d => drillItem(d, l))), 'Grammar').forEach(x => q.push(x));
    const ex = (l.exercises || []), normal = ex.filter(x => x.check !== 'self'), self = ex.filter(x => x.check === 'self');
    sect(normal.length ? normal.map(x => exerciseItem(x, l)) : clozeItems(l), 'Exercises').forEach(x => q.push(x));
    const tr = self.map(x => exerciseItem(x, l));
    if (l.reading && !self.some(x => norm(x.prompt).includes(norm(l.reading.la)))) tr.push(readingItem(l));
    sect(tr, 'Translation').forEach(x => q.push(x));
    return q;
  }

  function buildQueue(mode, scope) {
    const pool = poolFor(scope), ws = wordsFor(scope), ls = lessonsFor(scope);
    switch (mode) {
      case 'mc': return pickWeak(ws, 10).map(w => qMC(w, pool, false));
      case 'mcr': return pickWeak(ws, 10).map(w => qMC(w, pool, true));
      case 'type': return pickWeak(ws, 10).map((w, i) => i % 3 === 2 ? qTypeEn(w) : qType(w));
      case 'listen': return pickWeak(ws, 10).map(w => qListen(w, pool));
      case 'fill': { const f = ls.flatMap(lessonFill); return scope === 'all' ? f.slice(-12) : f; }
      case 'email': return ls.flatMap(l => (l.exercises || []).map(x => exerciseItem(x, l)));
      case 'mix': {
        const v = sect(pickWeak(ws, 6).map((w, i) => [qMC(w, pool, false), qMC(w, pool, true), qType(w)][i % 3]), 'Words');
        const f = sect(ls.flatMap(lessonFill).slice(-4), 'Grammar');
        const e = sect(ls.flatMap(l => (l.exercises || []).filter(x => x.check !== 'self').map(x => exerciseItem(x, l))).slice(-2), 'Exercises');
        return v.concat(f, e);
      }
      case 'course': { const l = LBY.get(scope); return l ? courseQueue(l) : []; }
      case 'rule': { const r = RBY.get(scope); return r ? quizFor(r) : []; }
      case 'review': {
        const due = shuffle(dueWords()), fresh = newWords().slice(0, newAllowance());   // new words strictly in lesson order
        return due.concat(fresh).slice(0, 20).map(w => {
          const b = box(w), all = reachedWords();
          const q = b <= 1 ? qMC(w, all, false) : b === 2 ? qMC(w, all, true) : b === 3 ? qTypeEn(w) : qType(w);
          q.isNew = !S.srs[w.id]; return q;
        });
      }
    }
    return [];
  }

  // ---------------------------------------------------------------- session runner
  function sessionShell(mode, scope) {
    const back = mode === 'review' ? '#/review' : mode === 'course' ? `#/lesson/${scope}` : mode === 'rule' ? `#/grammar/${scope}` : '#/practice';
    setView(`<div class="session-top"><a class="icon-btn" href="${back}" aria-label="Quit session">${I.close}</a><div class="progress"><i id="prog"></i></div><span class="counter" id="ctr"></span></div><div id="stage"></div>`,
      mode === 'review' ? 'review' : mode === 'course' || mode === 'rule' ? 'library' : 'practice');
    document.body.classList.add('in-session');
  }
  function startSession(mode, scope) {
    if (mode === 'course') reach(LBY.get(scope));
    else if (mode !== 'rule' && scope !== 'all' && LBY.has(scope)) reach(LBY.get(scope));
    if (mode === 'flash') return flashSession(scope);
    if (mode === 'match') return matchSession(scope);
    let queue = buildQueue(mode, scope);
    const tab = mode === 'review' ? 'review' : mode === 'course' || mode === 'rule' ? 'library' : 'practice';
    if (!queue.length) {
      setView(`<div class="results"><h2>Nothing to do here</h2><p class="muted">${mode === 'review' ? 'No words are due and today\'s new words are done. Come back later!' : mode === 'email' ? 'No lesson exercises in these lessons (the early emails were cut off).' : 'No items for this selection.'}</p><a class="btn btn-primary" href="#/practice">Practice instead</a></div>`, tab);
      return;
    }
    if (mode === 'review') { S.newToday.n += queue.filter(q => q.isNew).length; save(); }
    sessionShell(mode, scope);
    let i = 0, right = 0, graded = 0, xp = 0, total = queue.length; const requeued = new Set();
    const stage = $('#stage');
    const keyH = e => {
      const fb = $('.feedback.show');
      if (fb && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fb.querySelector('.next-btn')?.click(); return; }
      if (!fb && /^[1-4]$/.test(e.key) && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { $$('.choice')[+e.key - 1]?.click(); }
    };
    document.addEventListener('keydown', keyH);
    cleanup = () => document.removeEventListener('keydown', keyH);
    const advance = () => { i++; i < queue.length ? show() : finish(); };

    function show() {
      $('#prog').style.width = `${i / total * 100}%`; $('#ctr').textContent = `${Math.min(i + 1, total)}/${total}`;
      const q = queue[i]; window.LatinApp.current = q;
      const sec = q.section ? `<span class="sec">${esc(q.section)}</span> · ` : '';
      const isEnPrompt = q.promptIsEn || (q.kind === 'mc' && q.reverse) || (q.kind === 'type' && q.lang === 'la' && !q.promptIsEn && q.word);
      let h = `<div class="q"><div class="q-label">${sec}${esc(q.label)}${q.isNew ? ' · <span class="tag green">new</span>' : ''}</div>`;
      if (q.kind === 'learn') {
        const w = q.word, ex = w.examples[0];
        h += `<div class="card learn"><div class="top"><div><div class="word">${esc(w.la)}</div>${w.dict ? `<div class="pron">${esc(w.dict)}</div>` : ''}${w.pron ? `<div class="pron">${esc(w.pron)}</div>` : ''}</div>${speakBtn(w.la)}</div>
          <div class="en">${esc(w.en)}</div>${w.notes.length ? `<div class="note">${md(w.notes[w.notes.length - 1])}</div>` : ''}
          ${ex ? `<div class="ex">${speakBtn(ex.la, true)}<div><div class="la">${esc(ex.la)}</div><div class="tr">${esc(ex.en)}</div></div></div>` : ''}</div>
          <button class="btn btn-primary btn-block" id="cont" style="margin-top:16px">Got it – continue</button>`;
      } else if (q.kind === 'read') {
        const g = q.card;
        h += `<article class="card gcard"><h3>${esc(g.title)}</h3><p>${md(g.body)}</p>
          ${g.table ? `<table class="gt"><thead><tr>${g.table.head.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${g.table.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}</article>
          <button class="btn btn-primary btn-block" id="cont" style="margin-top:16px">Understood – continue</button>`;
      } else if (q.kind === 'self') {
        h += `<div class="q-prompt ${q.promptIsLa ? 'sentence' : 'en'}" style="font-size:${q.promptIsLa ? 24 : 20}px">${esc(q.prompt)}${q.promptIsLa ? speakBtn(q.prompt, true) : ''}</div>
          <textarea class="answer-input" id="selfAns" rows="3" placeholder="Write your translation (optional)…" style="min-height:96px;padding:12px 16px;font-size:18px"></textarea>
          <div class="input-help">Then compare with the model answer and mark yourself honestly.</div>
          <div id="model"></div><button class="btn btn-primary btn-block" id="reveal">Show the answer</button>`;
      } else if (q.kind === 'fill') {
        h += `<div class="q-prompt sentence">${esc(q.sentence).replace('___', '<span class="blank">?</span>')}</div><div class="q-sub">${esc(q.en || '')}${q.hint ? ` · <i>hint: ${esc(q.hint)}</i>` : ''}</div>`;
        h += `<div class="choices">${q.choices.map((c, k) => `<button class="choice la-choice" data-k="${k}"><span class="k">${k + 1}</span>${esc(c.text)}</button>`).join('')}</div>`;
      } else if (q.kind === 'listen') {
        h += `<div class="q-prompt" style="justify-content:center;margin:26px 0">${speakBtn(q.prompt).replace('class="speak"', 'class="speak" style="width:96px;height:96px" id="bigSay"')}</div><div class="q-sub" style="text-align:center"><button class="link-btn" id="peek">Show the word</button></div>`;
        h += `<div class="choices">${q.choices.map((c, k) => `<button class="choice" data-k="${k}"><span class="k">${k + 1}</span>${esc(c.text)}</button>`).join('')}</div>`;
      } else {
        h += `<div class="q-prompt ${isEnPrompt ? 'en' : ''}" ${q.promptIsEn ? 'style="font-size:22px"' : ''}>${esc(q.prompt)}${!isEnPrompt ? speakBtn(q.prompt, true) : ''}</div>`;
        h += q.word && q.word.pron && !isEnPrompt ? `<div class="q-sub">${esc(q.word.pron)}</div>` : '<div class="q-sub"></div>';
        if (q.kind === 'mc') h += `<div class="choices">${q.choices.map((c, k) => `<button class="choice ${q.reverse ? 'la-choice' : ''}" data-k="${k}"><span class="k">${k + 1}</span>${esc(c.text)}</button>`).join('')}</div>`;
        else h += `<form id="tf" autocomplete="off"><input class="answer-input" id="ans" placeholder="${q.lang === 'la' ? 'Latine…' : 'In English…'}" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done"><div class="input-help">Capitals, macrons (ā), punctuation and “the/a” are optional · small typos forgiven</div><div class="row2"><button type="button" class="btn" id="skip">I don't know</button><button class="btn btn-primary" type="submit">Check</button></div></form>`;
      }
      stage.innerHTML = h + '</div>';
      $('#cont', stage)?.addEventListener('click', advance);
      if (q.kind === 'self') {
        $('#reveal').onclick = () => {
          $('#model').innerHTML = `<div class="card" style="margin:6px 0 12px"><div class="q-label">Model answer</div><div style="font-size:18px;margin-top:4px">${esc(q.answer)}</div>${q.explain ? `<div class="muted" style="font-size:14px;margin-top:6px">${md(q.explain)}</div>` : ''}</div>
            <div class="row2"><button class="btn btn-bad" id="selfNo">Not quite</button><button class="btn btn-good" id="selfYes">I got it</button></div>`;
          $('#reveal').remove(); $('#selfAns').disabled = true;
          $('#selfYes').onclick = () => answer(q, true, null, true); $('#selfNo').onclick = () => answer(q, false, null, true);
        };
      }
      if (q.kind === 'listen') { const b = $('#bigSay'); setTimeout(() => speak(q.prompt, b), 250); $('#peek').onclick = e => { e.target.outerHTML = `<span class="la" style="font-size:22px">${esc(q.prompt)}</span>`; }; }
      $$('.choice', stage).forEach(b => b.onclick = () => {
        const c = q.choices[+b.dataset.k];
        $$('.choice', stage).forEach((x, k) => { x.disabled = true; if (q.choices[k].ok) x.classList.add('correct'); });
        if (!c.ok) b.classList.add('wrong');
        answer(q, c.ok);
      });
      const tf = $('#tf');
      if (tf) {
        const inp = $('#ans'); setTimeout(() => inp.focus({ preventScroll: true }), 50);
        tf.onsubmit = e => { e.preventDefault(); if (!inp.value.trim()) { inp.classList.remove('wrong'); void inp.offsetWidth; inp.classList.add('wrong'); return; } const g = grade(inp.value, q.answers, q.lang); inp.disabled = true; inp.classList.add(g ? 'correct' : 'wrong'); answer(q, !!g, g === 'close' ? inp.value : null); };
        $('#skip').onclick = () => { inp.disabled = true; answer(q, false); };
      }
    }
    function answer(q, ok, closeInput, selfGraded) {
      graded++;
      if (ok) { right++; xp += 10; } else if (!requeued.has(q) && mode === 'review') { requeued.add(q); queue.push(Object.assign({}, q, { isNew: false })); total++; }
      if (q.word) (mode === 'review' ? review : practiceResult)(q.word.id, ok);
      else { S.answered++; if (ok) S.correct++; save(); }
      if (q.rules && q.rules.length) recordRules(q.rules, ok);
      if (selfGraded) return advance();
      const w = q.word;
      const sayText = q.kind === 'fill' ? q.sentence.replace('___', q.answer) : w ? w.la : null;
      $$('.feedback').forEach(x => x.remove());
      const fb = document.createElement('div');
      fb.className = 'feedback ' + (ok ? 'ok' : 'no');
      fb.innerHTML = `<div class="inner"><h4>${ok ? I.check : I.x}${ok ? pick(['Optime!', 'Bene!', 'Recte!', 'Euge!'], 1)[0] + (closeInput ? ' (almost)' : '') : 'Not quite'}</h4>
        <p>${ok && !closeInput ? (w && q.kind !== 'fill' ? `<b>${esc(w.la)}</b> = ${esc(w.en)}` : `<b>${esc(q.answer)}</b>`) : `Answer: <b>${esc(q.answer)}</b>${w && q.kind !== 'fill' ? ` – ${esc(q.reverse || q.lang === 'la' ? w.en : w.la)}` : ''}`}${q.explain ? `<br>${md(q.explain)}` : ''}</p>
        <div class="row2">${sayText ? `<button class="btn fb-say">${I.speaker} Hear it</button>` : '<span></span>'}<button class="btn next-btn ${ok ? 'btn-good' : 'btn-bad'}">Continue</button></div></div>`;
      document.body.appendChild(fb); requestAnimationFrame(() => fb.classList.add('show'));
      if (sayText) fb.querySelector('.fb-say').onclick = e => speak(sayText, e.currentTarget);
      const nextBtn = fb.querySelector('.next-btn'); let done = false;
      nextBtn.onclick = () => { if (done) return; done = true; fb.classList.remove('show'); fb.classList.add('leaving'); setTimeout(() => fb.remove(), 300); advance(); };
      setTimeout(() => nextBtn.isConnected && nextBtn.focus({ preventScroll: true }), 60);
    }
    function finish() {
      $('#prog').style.width = '100%';
      const bonus = graded && right === graded ? 20 : 0;
      let extra = '';
      if (mode === 'course') {
        const l = LBY.get(scope), next = LESSONS[l.n]; S.course.done[l.id] = true; save();
        extra = `<p><b>Lesson ${l.n} complete.</b></p>${next ? `<a class="btn btn-primary btn-block" style="margin-bottom:10px" href="#/lesson/${next.id}">Next: Lesson ${next.n} →</a>` : '<p class="muted">That was the latest lesson – a new one arrives with the next email.</p>'}`;
      }
      endScreen(mode, scope, { right, total: graded, xp: xp + bonus, perfect: !!bonus, extra });
    }
    show();
  }

  function endScreen(mode, scope, r) {
    S.sessions++; save(); addXP(r.xp);
    const acc = r.total ? Math.round(r.right / r.total * 100) : 100;
    const title = acc === 100 ? 'Perfectum!' : acc >= 80 ? 'Optime!' : acc >= 50 ? 'Bene!' : 'Perge!';
    const sub = acc === 100 ? 'Flawless – a perfect round.' : acc >= 80 ? 'Excellent work.' : acc >= 50 ? 'Good – keep going.' : 'Keep going – repetition is the mother of learning.';
    document.body.classList.remove('in-session'); $$('.feedback').forEach(x => x.remove());
    const doneHref = mode === 'review' ? '#/review' : mode === 'course' ? `#/lesson/${scope}` : mode === 'rule' ? `#/grammar/${scope}` : '#/practice?scope=' + scope;
    $('#stage').innerHTML = `<div class="results">${LAUREL}<h2>${title}</h2><p class="muted">${sub}${r.perfect ? ' +20 bonus XP' : ''}</p>
      <div class="grid3"><div class="stat"><b>+${r.xp}</b><span>XP</span></div><div class="stat"><b>${acc}%</b><span>Accuracy</span></div><div class="stat"><b>${streak()}</b><span>Streak</span></div></div>
      ${r.extra || ''}
      <div class="row2"><a class="btn" href="${doneHref}">Done</a><button class="btn btn-primary" id="again">Again</button></div></div>`;
    $('#again').onclick = () => startSession(mode, scope);
    renderTabs(mode === 'review' ? 'review' : mode === 'course' || mode === 'rule' ? 'library' : 'practice');
    if (acc >= 80) confetti();
  }
  function confetti() {
    const c = document.createElement('div'); c.className = 'confetti';
    const cols = ['#9e3b26', '#b0802a', '#e9c87a', '#3f7a3a', '#e0775c'];
    c.innerHTML = Array.from({ length: 40 }, () => `<i style="left:${Math.random() * 100}%;background:${cols[Math.floor(Math.random() * cols.length)]};animation-delay:${Math.random() * .5}s;animation-duration:${1.2 + Math.random()}s"></i>`).join('');
    document.body.appendChild(c); setTimeout(() => c.remove(), 2600);
  }

  // flashcards (deck in lesson order)
  function flashSession(scope) {
    const deck = wordsFor(scope); if (!deck.length) return go('#/practice');
    sessionShell('flash', scope);
    let i = 0, known = 0, reverse = false;
    const stage = $('#stage');
    function show() {
      $('#prog').style.width = `${i / deck.length * 100}%`; $('#ctr').textContent = `${i + 1}/${deck.length}`;
      const w = deck[i];
      const front = reverse ? `<div class="big" style="font-family:var(--sans);font-size:32px">${esc(w.en)}</div>` : `${speakBtn(w.la)}<div class="big">${esc(w.la)}</div>${w.pron ? `<div class="small">${esc(w.pron)}</div>` : ''}`;
      const back = reverse ? `${speakBtn(w.la)}<div class="big" style="font-family:var(--serif);font-size:42px">${esc(w.la)}</div>${w.pron ? `<div class="small">${esc(w.pron)}</div>` : ''}` : `<div class="big">${esc(w.en)}</div>`;
      const ex = w.examples[0];
      stage.innerHTML = `<div class="q"><div class="q-label" style="text-align:center">Lesson ${w.firstN}</div><div class="seg" style="justify-content:center"><button id="dirLa" class="${reverse ? '' : 'on'}">Latin first</button><button id="dirEn" class="${reverse ? 'on' : ''}">English first</button></div>
        <div class="flash-wrap"><div class="flash" id="fc" role="button" aria-label="Flip card" tabindex="0">
          <div class="face front">${front}<div class="tap">Tap to flip</div></div>
          <div class="face back">${back}${w.notes[0] ? `<div class="small" style="max-width:34ch;font-size:14px">${md(w.notes[w.notes.length - 1])}</div>` : ''}${ex ? `<div class="small la" style="margin-top:14px;font-size:18px;color:var(--ink)">${esc(ex.la)}</div><div class="small" style="margin-top:2px;font-size:14px">${esc(ex.en)}</div>` : ''}</div>
        </div></div>
        <div class="row2" id="rate" style="visibility:hidden"><button class="btn btn-bad" id="again">Still learning</button><button class="btn btn-good" id="got">Got it</button></div></div>`;
      const fc = $('#fc');
      const flip = e => { if (e && e.target.closest('.speak')) return; fc.classList.toggle('flipped'); $('#rate').style.visibility = 'visible'; };
      fc.onclick = flip; fc.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } };
      $('#dirLa').onclick = () => { reverse = false; show(); }; $('#dirEn').onclick = () => { reverse = true; show(); };
      $('#again').onclick = () => next(false); $('#got').onclick = () => next(true);
    }
    function next(ok) { practiceResult(deck[i].id, ok); if (ok) known++; i++; i < deck.length ? show() : endScreen('flash', scope, { right: known, total: deck.length, xp: deck.length * 3 }); }
    show();
  }

  // match pairs: the 5 weakest words (lesson order); tile positions shuffled
  function matchSession(scope) {
    const set = pickWeak(wordsFor(scope), 5); if (!set.length) return go('#/practice');
    sessionShell('match', scope);
    const t0 = Date.now(); let done = 0, mistakes = 0, sel = null;
    const left = shuffle(set), right = shuffle(set);
    $('#ctr').textContent = `0/${set.length}`;
    $('#stage').innerHTML = `<div class="q"><div class="q-label">Tap a Latin word, then its meaning</div><div class="q-sub" id="timer">0.0s</div>
      <div class="match"><div class="col">${left.map(w => `<button class="tile la-t" data-id="${w.id}" data-side="la">${esc(w.la)}</button>`).join('')}</div>
      <div class="col">${right.map(w => `<button class="tile" data-id="${w.id}" data-side="en">${esc(w.en)}</button>`).join('')}</div></div></div>`;
    const tick = setInterval(() => { const t = $('#timer'); if (t) t.textContent = ((Date.now() - t0) / 1000).toFixed(1) + 's'; }, 100);
    cleanup = () => clearInterval(tick);
    $$('.tile').forEach(b => b.onclick = () => {
      if (b.classList.contains('done')) return;
      if (b.dataset.side === 'la') speak(set.find(w => w.id === b.dataset.id).la);
      if (!sel || sel.dataset.side === b.dataset.side) { $$('.tile.sel').forEach(x => x.classList.remove('sel')); sel = b; b.classList.add('sel'); return; }
      if (sel.dataset.id === b.dataset.id) {
        sel.classList.remove('sel'); sel.classList.add('done'); b.classList.add('done'); done++;
        $('#prog').style.width = `${done / set.length * 100}%`; $('#ctr').textContent = `${done}/${set.length}`;
        practiceResult(b.dataset.id, true);
        if (done === set.length) {
          clearInterval(tick); const secs = Math.round((Date.now() - t0) / 100) / 10;
          const best = !S.bestMatch || secs < S.bestMatch; if (best && mistakes === 0) S.bestMatch = secs; save();
          setTimeout(() => endScreen('match', scope, { right: set.length, total: set.length + mistakes, xp: set.length * 5 + (mistakes ? 0 : 10),
            extra: `<p class="muted">${secs}s · ${mistakes} mistake${mistakes === 1 ? '' : 's'}${best && !mistakes ? ' · new best time!' : ''}</p>` }), 450);
        }
      } else {
        mistakes++; const a = sel; [a, b].forEach(x => { x.classList.remove('sel'); x.classList.remove('err'); void x.offsetWidth; x.classList.add('err'); });
        practiceResult(a.dataset.side === 'la' ? a.dataset.id : b.dataset.id, false);
      }
      sel = null;
    });
  }

  // ---------------------------------------------------------------- global events
  document.addEventListener('click', e => {
    const s = e.target.closest('[data-say]'); if (s) { e.preventDefault(); e.stopPropagation(); speak(s.dataset.say, s); return; }
    const m = e.target.closest('[data-mode]'); if (m && !m.disabled) { go(`#/practice/${m.dataset.mode}?scope=${m.dataset.scope}`); }
  });
  $('#themeBtn').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme === 'dark'; S.settings.theme = dark ? 'light' : 'dark'; save(); applyTheme();
  });
  window.addEventListener('hashchange', route);

  // service worker (multi-file / GitHub Pages version only): offline + picks up new builds
  if ('serviceWorker' in navigator && !window.LATIN_SINGLE_FILE && /^https?:$/.test(location.protocol)) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      reg.update().catch(() => { });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => { }); });
    }).catch(() => { });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) toast('Updated to the latest version – new lessons appear after a refresh'); });
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.version) window.__swVersion = e.data.version; });
    navigator.serviceWorker.ready.then(r => r.active && r.active.postMessage('version')).catch(() => { });
  }

  // test hooks (harmless in production)
  window.LatinApp = { grade, norm, words: ALL_WORDS, lessons: LESSONS, rules: RULES, lexicon: LEX, state: () => S, current: null, quizFor: id => quizFor(RBY.get(id)) };

  applyTheme(); renderChips(); route();
})();

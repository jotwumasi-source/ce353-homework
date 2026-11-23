/* CE353 Homework front end. Two back ends with the same shape: Demo (this browser only) and Live (Google Apps Script). */
(function () {
  'use strict';
  var CFG = window.HW, E = window.Engine, $ = function (id) { return document.getElementById(id); };
  var qs = new URLSearchParams(location.search);
  var DEMO = !CFG.apiUrl;
  var DUR = (qs.get('mins') ? parseFloat(qs.get('mins')) : CFG.durationMin) * 60000;
  var DEADLINE = Date.parse(CFG.deadline);
  var CLOSED_FORCED = qs.get('closed') === '1';

  /* ---------------- Demo back end (this browser only; no class list check) ---------------- */
  var Demo = {
    now: function () { return CLOSED_FORCED ? DEADLINE + 3600e3 : Date.now(); },
    get: function (k) { try { return JSON.parse(localStorage.getItem('hw3demo:' + k) || 'null'); } catch (e) { return null; } },
    set: function (k, o) { try { localStorage.setItem('hw3demo:' + k, JSON.stringify(o)); } catch (e) {} },
    rnd: function () { return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2); },
    enroll: function (idx, name, pin) {
      if (Demo.get('acct:' + idx)) return Promise.resolve({ error: 'This index number is already registered. Sign in with your PIN.' });
      var dev = Demo.rnd(); Demo.set('acct:' + idx, { name: name, pin: pin, devs: [dev] });
      return Promise.resolve({ ok: true, dev: dev, who: name, index: idx });
    },
    login: function (idx, pin, dev) {
      var a = Demo.get('acct:' + idx); if (!a) return Promise.resolve({ error: 'No account yet. Choose Register to create one.' });
      if (dev && a.devs.indexOf(dev) >= 0) return Promise.resolve({ ok: true, dev: dev, who: a.name, index: idx });
      if (pin && pin === a.pin) { var d = Demo.rnd(); a.devs.push(d); Demo.set('acct:' + idx, a); return Promise.resolve({ ok: true, dev: d, who: a.name, index: idx }); }
      return Promise.resolve({ error: pin ? 'Wrong PIN.' : 'Please sign in again.', signedOut: !pin });
    },
    sess: function (idx) { var s = Demo.get('sess:' + idx); if (s && !s.submitted && Demo.now() >= Math.min(s.start + DUR, DEADLINE)) { s.submitted = true; Demo.set('sess:' + idx, s); } return s; },
    results: function (idx, s) {
      var per = [], tot = 0;
      E.buildAll(idx).forEach(function (pre, p) { var m = E.mark(pre, ((s && s.answers) || {})[p] || []); per.push({ p: p + 1, title: pre.title, score: m.score, of: pre.qs.length }); tot += m.score; });
      var released = Demo.now() >= DEADLINE;
      return { released: released, score: tot, of: 100, per: per, prior: [{ name: 'Homework 1', score: null, of: null }, { name: 'Homework 2', score: null, of: null }, { name: CFG.title, score: released ? tot : null, of: 100, current: true }] };
    },
    home: function (idx, dev) {
      return Demo.login(idx, null, dev).then(function (a) {
        if (a.error) return a;
        var s = Demo.sess(idx), now = Demo.now(), st = 'open', ends = null;
        if (s) { if (s.submitted) st = 'submitted'; else { st = 'running'; ends = Math.min(s.start + DUR, DEADLINE); } } else if (now >= DEADLINE) st = 'closed';
        return { ok: true, who: a.who, now: now, hw: { title: CFG.title, state: st, endsAt: ends, deadline: DEADLINE }, results: Demo.results(idx, s) };
      });
    },
    start: function (idx, dev) {
      return Demo.login(idx, null, dev).then(function (a) {
        if (a.error) return a;
        var now = Demo.now(), s = Demo.sess(idx);
        if (!s) { if (now >= DEADLINE) return { error: 'The homework has closed.' }; s = { start: now, submitted: false, answers: {} }; Demo.set('sess:' + idx, s); }
        if (s.submitted) return { mode: 'home' };
        return { mode: 'exam', title: CFG.title, now: now, endsAt: Math.min(s.start + DUR, DEADLINE), who: a.who, token: idx, answers: s.answers, pre: E.buildAll(idx).map(E.publicView) };
      });
    },
    adminCheck: function (key) { return Promise.resolve(key === 'admin' ? { ok: true } : { error: 'Wrong lecturer password. (Demo password: admin)' }); },
    adminStats: function () { var n = 0, st = 0; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf('hw3demo:acct:') === 0) n++; if (k.indexOf('hw3demo:sess:') === 0) st++; } } catch (e) {} return Promise.resolve({ ok: true, title: CFG.title, deadline: DEADLINE, roster: n, registered: n, started: st, finished: 0, mean: null }); },
    adminPreview: function (key, idx, ans) { var i = /^\d{5,10}$/.test(idx) ? idx : '0000000'; return Promise.resolve({ ok: true, index: i, title: CFG.title, pre: E.buildAll(i).map(ans ? E.adminView : E.publicView) }); },
    adminStudent: function (key, idx) { var a = Demo.get('acct:' + idx); return Promise.resolve(a ? { ok: true, name: a.name, registered: true, state: Demo.get('sess:' + idx) ? 'started' : 'not started', score: 0, per: [] } : { error: 'Index number not on the class list (demo: only registered students).' }); },
    save: function (tok, answers) { var s = Demo.sess(tok); if (s && !s.submitted) { s.answers = answers; Demo.set('sess:' + tok, s); return Promise.resolve({ ok: true }); } return Promise.resolve({ ok: false, closed: true }); },
    submit: function (tok, answers) { var s = Demo.get('sess:' + tok); if (s) { s.answers = answers; s.submitted = true; Demo.set('sess:' + tok, s); } return Promise.resolve({ ok: true }); }
  };
  /* ---------------- Live back end (Google Apps Script web app) ---------------- */
  var Live = {
    call: function (body) { return fetch(CFG.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }); },
    enroll: function (idx, name, pin) { return Live.call({ action: 'enroll', index: idx, name: name, pin: pin }); },
    login: function (idx, pin, dev) { return Live.call({ action: 'login', index: idx, pin: pin, dev: dev }); },
    home: function (idx, dev) { return Live.call({ action: 'home', index: idx, dev: dev }); },
    start: function (idx, dev) { return Live.call({ action: 'start', index: idx, dev: dev }); },
    adminCheck: function (key) { return Live.call({ action: 'admin_check', key: key }); },
    adminStats: function (key) { return Live.call({ action: 'admin_stats', key: key }); },
    adminPreview: function (key, idx, ans) { return Live.call({ action: 'admin_preview', key: key, index: idx, answers: !!ans }); },
    adminStudent: function (key, idx) { return Live.call({ action: 'admin_student', key: key, index: idx }); },
    save: function (tok, a) { return Live.call({ action: 'save', token: tok, answers: a }); },
    submit: function (tok, a) { return Live.call({ action: 'submit', token: tok, answers: a }); }
  };
  var API = DEMO ? Demo : Live;

  /* ---------------- helpers ---------------- */
  var S = { idx: '', dev: '', name: '', token: '', ends: 0, offset: 0, pre: [], answers: {}, tick: null, dirty: false, saving: null, done: false, hw: null, homeTick: null };
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem('hw_' + k); if (v === null) localStorage.removeItem('hw_' + k); else localStorage.setItem('hw_' + k, v); } catch (e) {} return null; }
  function show(id) { ['login', 'home', 'exam', 'admin'].forEach(function (x) { $(x).classList.toggle('hidden', x !== id); }); window.scrollTo(0, 0); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmt(ms) { ms = Math.max(0, ms); var s = Math.floor(ms / 1000); return Math.floor(s / 3600) + ':' + pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60); }
  function sheet(h, p, ok, no) {
    return new Promise(function (res) {
      $('sheetH').textContent = h; $('sheetP').textContent = p; $('sheetOk').textContent = ok; $('sheetNo').textContent = no || ''; $('sheetNo').classList.toggle('hidden', !no);
      $('sheet').classList.remove('hidden');
      $('sheetOk').onclick = function () { $('sheet').classList.add('hidden'); res(true); };
      $('sheetNo').onclick = function () { $('sheet').classList.add('hidden'); res(false); };
    });
  }
  function busy(btn, on, label) { btn.disabled = on; btn.textContent = on ? 'Please wait' : label; }
  var NOCONN = 'No connection. Check your internet and try again.';

  /* ---------------- register / sign in ---------------- */
  function showLogin(mode) { clearInterval(S.homeTick); S.preview = false; $('regForm').classList.toggle('hidden', mode !== 'register'); $('signForm').classList.toggle('hidden', mode !== 'signin'); $('admForm').classList.toggle('hidden', mode !== 'admin'); var i = ls('idx'); if (i) $('sIdx').value = i; show('login'); }
  $('toSign').onclick = function () { showLogin('signin'); }; $('toReg').onclick = function () { showLogin('register'); };
  $('regForm').addEventListener('submit', function (e) {
    e.preventDefault(); var idx = $('rIdx').value.trim().replace(/\s+/g, ''), name = $('rNm').value.trim().replace(/\s+/g, ' '), pin = $('rPin').value.trim(), btn = e.target.querySelector('button'); $('regErr').textContent = '';
    if (!/^\d{5,10}$/.test(idx)) { $('regErr').textContent = 'Enter your index number using digits only.'; return; }
    if (name.length < 5 || name.indexOf(' ') < 0) { $('regErr').textContent = 'Enter your full name as it appears on the class list.'; return; }
    if (!/^\d{4,8}$/.test(pin)) { $('regErr').textContent = 'Choose a PIN of 4 to 8 digits.'; return; }
    busy(btn, true); API.enroll(idx, name, pin).then(function (r) { busy(btn, false, 'Register'); if (r.error) { $('regErr').textContent = r.error; return; } ls('idx', idx); ls('dev', r.dev); S.idx = idx; S.dev = r.dev; $('rPin').value = ''; loadHome(); }).catch(function () { busy(btn, false, 'Register'); $('regErr').textContent = NOCONN; });
  });
  $('signForm').addEventListener('submit', function (e) {
    e.preventDefault(); var idx = $('sIdx').value.trim().replace(/\s+/g, ''), pin = $('sPin').value.trim(), btn = e.target.querySelector('button'); $('signErr').textContent = '';
    if (!/^\d{5,10}$/.test(idx)) { $('signErr').textContent = 'Enter your index number using digits only.'; return; }
    if (!pin) { $('signErr').textContent = 'Enter your PIN.'; return; }
    busy(btn, true); API.login(idx, pin, ls('idx') === idx ? ls('dev') : null).then(function (r) { busy(btn, false, 'Sign in'); if (r.error) { $('signErr').textContent = r.error; if (r.noAccount) setTimeout(function () { showLogin('register'); $('rIdx').value = idx; }, 1200); return; } ls('idx', idx); ls('dev', r.dev); S.idx = idx; S.dev = r.dev; $('sPin').value = ''; loadHome(); }).catch(function () { busy(btn, false, 'Sign in'); $('signErr').textContent = NOCONN; });
  });
  $('signOut').onclick = function () { ls('dev', null); S.dev = ''; showLogin('signin'); };

  /* ---------------- home ---------------- */
  function loadHome() {
    clearInterval(S.homeTick);
    API.home(S.idx, S.dev).then(function (r) {
      if (r.error) { if (r.signedOut) ls('dev', null); showLogin(ls('idx') ? 'signin' : 'register'); if (r.error && !r.signedOut) $('signErr').textContent = r.error; return; }
      S.name = r.who; S.offset = r.now - Date.now(); S.hw = r.hw; renderHome(r); show('home');
    }).catch(function () { showLogin('signin'); $('signErr').textContent = NOCONN; });
  }
  function dateText(ms) { try { return new Date(ms).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' (Ghana time)'; } catch (e) { return CFG.deadlineText; } }
  function renderHome(r) {
    var first = String(S.name).split(',').pop().trim().split(' ')[0] || ''; first = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    $('hWho').textContent = S.name + ' · ' + S.idx; $('hHello').textContent = first ? 'Hello, ' + first : 'Homework';
    var hw = r.hw, c = '', dl = dateText(hw.deadline);
    if (hw.state === 'open') c = '<h2>' + esc(hw.title) + '</h2><p>' + esc(CFG.subtitle || '') + '</p><p>Closes ' + esc(dl) + '.</p><p>You have ' + Math.round(DUR / 3600000) + ' hours from the moment you start. If you start late, your time ends at the closing time.</p><button class="btn" id="goStart">Start ' + esc(hw.title) + '</button>';
    else if (hw.state === 'running') c = '<h2>' + esc(hw.title) + '</h2><p>In progress. Time left</p><div class="big" id="hLeft">' + fmt(hw.endsAt - (Date.now() + S.offset)) + '</div><button class="btn" id="goStart">Continue</button>';
    else if (hw.state === 'submitted') c = '<h2>' + esc(hw.title) + '</h2><p>Submitted. ' + (r.results.released ? 'Your marks are below.' : 'Your marks appear here after the homework closes on ' + esc(dl) + '.') + '</p>';
    else c = '<h2>' + esc(hw.title) + '</h2><p>This homework has closed. You did not start it.</p>';
    $('hwCard').innerHTML = c;
    if ($('goStart')) $('goStart').onclick = startFlow;
    if (hw.state === 'running') S.homeTick = setInterval(function () { var left = hw.endsAt - (Date.now() + S.offset); if ($('hLeft')) $('hLeft').textContent = fmt(left); if (left <= 0) loadHome(); }, 1000);
    var R = r.results;
    $('mPrior').innerHTML = '<tr><th>Homework</th><th class="r">Marks</th></tr>' + R.prior.map(function (x) { var m = x.score == null ? '<span class="note">' + (x.current && !R.released ? 'after closing' : 'not recorded') + '</span>' : x.score + (x.of ? ' / ' + x.of : ''); return '<tr><td>' + esc(x.name) + (x.current ? ' <span class="note">· this one</span>' : '') + '</td><td class="r">' + m + '</td></tr>'; }).join('');
    $('mDetail').innerHTML = R.released && hw.state !== 'closed' ? '<div class="h3">' + esc(hw.title) + ' by preamble</div><div class="score">' + R.score + '<small> / ' + R.of + '</small></div><table><tr><th>Preamble</th><th class="r">Marks</th></tr>' + R.per.map(function (x) { return '<tr><td>' + x.p + '. ' + esc(x.title) + '</td><td class="r">' + x.score + ' / ' + x.of + '</td></tr>'; }).join('') + '</table>' : '';
  }
  function startFlow() {
    var running = S.hw && S.hw.state === 'running';
    var go = running ? Promise.resolve(true) : sheet('Start ' + S.hw.title + '?', 'Your ' + Math.round(DUR / 3600000) + ' hours begin now and cannot be paused. If you start late, your time ends at the closing time.', 'Start now', 'Not yet');
    go.then(function (ok) { if (!ok) return; API.start(S.idx, S.dev).then(function (r) { if (r.error) { sheet('Cannot start', r.error, 'OK'); return; } if (r.mode === 'exam') startExam(r); else loadHome(); }).catch(function () { sheet('No connection', NOCONN, 'OK'); }); });
  }

  /* ---------------- exam ---------------- */
  function startExam(r) {
    S.token = r.token; S.ends = r.endsAt; S.pre = r.pre; S.answers = r.answers || {}; S.done = false; S.offset = (r.now || Date.now()) - Date.now(); clearInterval(S.homeTick);
    $('who').textContent = S.preview ? 'Lecturer preview' : (r.title || S.hw.title); show('exam');
    var h = window.DATASHEET || '';
    S.pre.forEach(function (p, pi) {
      h += '<div class="sec"><div class="eyebrow">Preamble ' + p.id + ' of 10</div><h2>' + esc(p.title) + '</h2><p class="pre">' + p.text + '</p><div class="fig">' + p.svg + '<div class="cap">' + esc(p.cap || '') + '</div></div>';
      p.qs.forEach(function (q, qi) {
        var v = ((S.answers[pi] || [])[qi]); v = v == null ? '' : v;
        h += '<div class="q"><div class="n">' + p.id + '.' + (qi + 1) + '</div><div class="t">' + esc(q.t) + (q.ans !== undefined ? '<div class="ans">Answer: ' + esc(q.ans) + ' ' + esc(q.unit) + '</div>' : '') + '</div><div class="a"><input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-p="' + pi + '" data-q="' + qi + '" value="' + esc(v) + '"><span class="u">' + esc(q.unit) + '</span></div></div>';
      });
      h += '</div>';
    });
    h += S.preview ? '<div class="foot"><p>Preview only. Nothing is saved.</p><button class="btn" id="finish">Close preview</button></div>' : '<div class="foot"><p>Give each answer to 3 significant figures. Answers are accepted within 1%.</p><p>Everything saves automatically.</p><button class="btn" id="finish">Finish and submit</button></div>';
    $('paper').innerHTML = h; renderMath();
    $('paper').oninput = onInput; $('finish').onclick = finish;
    updateCount(); clearInterval(S.tick);
    if (S.preview) { $('timer').textContent = 'Preview'; $('count').textContent = 'No timer, nothing saved'; $('progBar').style.width = '0'; } else { S.tick = setInterval(tick, 500); tick(); }
  }
  function renderMath() { try { if (window.renderMathInElement) window.renderMathInElement($('paper'), { delimiters: [{ left: '$', right: '$', display: false }], throwOnError: false }); } catch (e) {} }
  function onInput(e) {
    var t = e.target; if (t.tagName !== 'INPUT') return;
    var p = +t.dataset.p, q = +t.dataset.q; (S.answers[p] = S.answers[p] || [])[q] = t.value;
    if (S.preview) return;
    S.dirty = true; $('saved').textContent = ''; updateCount();
    clearTimeout(S.saving); S.saving = setTimeout(save, DEMO ? 900 : 12000);
  }
  function answered() { var n = 0, tot = 0; S.pre.forEach(function (p, pi) { p.qs.forEach(function (q, qi) { tot++; var v = (S.answers[pi] || [])[qi]; if (v != null && String(v).trim() !== '') n++; }); }); return [n, tot]; }
  function updateCount() { var a = answered(); $('count').textContent = a[0] + ' of ' + a[1] + ' answered'; $('progBar').style.width = (a[1] ? a[0] / a[1] * 100 : 0) + '%'; }
  function save() {
    if (!S.dirty || S.done) return Promise.resolve();
    S.dirty = false;
    return API.save(S.token, S.answers).then(function (r) { if (r && r.closed) timeUp(); else $('saved').textContent = 'Saved'; }).catch(function () { S.dirty = true; $('saved').textContent = 'Not saved'; });
  }
  function tick() { var left = S.ends - (Date.now() + S.offset); $('timer').textContent = fmt(left); $('timer').classList.toggle('low', left < 10 * 60000); if (left <= 0) timeUp(); }
  function timeUp() {
    if (S.done) return; S.done = true; clearInterval(S.tick); clearTimeout(S.saving);
    API.submit(S.token, S.answers).then(function () { return sheet('Time is up', 'Your answers have been submitted.', 'Done'); }).then(loadHome);
  }
  function finish() {
    if (S.preview) { S.preview = false; $('paper').innerHTML = ''; show('admin'); return; }
    var a = answered();
    sheet('Submit your homework?', a[0] + ' of ' + a[1] + ' questions answered. You cannot change your answers after submitting.', 'Submit', 'Keep working').then(function (ok) {
      if (!ok) return; S.done = true; clearInterval(S.tick); clearTimeout(S.saving);
      API.submit(S.token, S.answers).then(function () { return sheet('Submitted', 'Your answers are saved. Your marks appear on the home page after the homework closes.', 'Done'); }).then(loadHome);
    });
  }
  window.addEventListener('beforeunload', function (e) { if (S.dirty && !S.done) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------------- lecturer ---------------- */
  $('toAdmin').onclick = function () { showLogin('admin'); }; $('admBack').onclick = function () { showLogin(ls('idx') ? 'signin' : 'register'); };
  function akey() { try { return sessionStorage.getItem('hw_akey') || ''; } catch (e) { return ''; } }
  $('admForm').addEventListener('submit', function (e) {
    e.preventDefault(); var k = $('aKey').value, btn = e.target.querySelector('button'); $('admErr').textContent = '';
    busy(btn, true); API.adminCheck(k).then(function (r) { busy(btn, false, 'Open lecturer view'); if (r.error) { $('admErr').textContent = r.error; return; } try { sessionStorage.setItem('hw_akey', k); } catch (x) {} $('aKey').value = ''; loadAdmin(); }).catch(function () { busy(btn, false, 'Open lecturer view'); $('admErr').textContent = NOCONN; });
  });
  function loadAdmin() {
    API.adminStats(akey()).then(function (r) {
      if (r.error) { showLogin('admin'); $('admErr').textContent = r.error; return; }
      $('aTitle').textContent = r.title;
      var row = function (a, b) { return '<tr><td>' + a + '</td><td class="r">' + b + '</td></tr>'; };
      $('aStats').innerHTML = '<table>' + row('On the class list', r.roster) + row('Registered', r.registered) + row('Started', r.started) + row('Finished', r.finished) + row('Mean score of those finished', r.mean == null ? 'n/a' : r.mean.toFixed(1) + ' / 100') + row('Closes', esc(dateText(r.deadline))) + '</table>';
      show('admin');
    }).catch(function () { showLogin('admin'); $('admErr').textContent = NOCONN; });
  }
  $('pGo').onclick = function () {
    var idx = $('pIdx').value.trim().replace(/\s+/g, ''), btn = $('pGo'); busy(btn, true);
    API.adminPreview(akey(), idx, $('pAns').checked).then(function (r) { busy(btn, false, 'Open preview'); if (r.error) { sheet('Cannot open preview', r.error, 'OK'); return; } S.preview = true; S.hw = { title: r.title }; startExam({ pre: r.pre, answers: {}, title: r.title }); }).catch(function () { busy(btn, false, 'Open preview'); sheet('No connection', NOCONN, 'OK'); });
  };
  $('lGo').onclick = function () {
    var idx = $('lIdx').value.trim().replace(/\s+/g, ''); $('lOut').textContent = '';
    API.adminStudent(akey(), idx).then(function (r) { $('lOut').innerHTML = r.error ? esc(r.error) : '<b>' + esc(r.name) + '</b><br>Registered: ' + (r.registered ? 'yes' : 'no') + '<br>Status: ' + esc(r.state) + (r.per && r.per.length ? '<br>Score: ' + r.score + ' / 100 (' + r.per.map(function (x) { return x.score; }).join(', ') + ')' : ''); });
  };
  $('aOut').onclick = function () { try { sessionStorage.removeItem('hw_akey'); } catch (e) {} showLogin(ls('idx') ? 'signin' : 'register'); };

  /* ---------------- start ---------------- */
  var i0 = ls('idx'), d0 = ls('dev');
  if (i0 && d0) { S.idx = i0; S.dev = d0; loadHome(); } else showLogin(i0 ? 'signin' : 'register');
})();

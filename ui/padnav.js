/* NEBULATOR controller navigation: use every page, dialog and setting with only a gamepad.
   D-pad / left stick move a focus ring, A selects, B goes back, LB/RB switch sections, right stick scrolls.
   Text fields open an on-screen keyboard, drop-downs open a picker, sliders change with left/right. */
(() => {
  'use strict';
  const body = document.body, $ = s => document.querySelector(s);
  const { h } = NEB;
  const sfx = n => { try { window.SFX && SFX[n] && SFX[n](); } catch { /* audio is optional */ } };
  const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex="0"], [role="switch"]';

  let cur = null, active = false, overlay = null, strip = false, hintEl = null;
  const prev = {}, hold = {};

  /* ───────── scope: which part of the UI the pad is driving right now ───────── */
  function scope() {
    if (overlay) return overlay.el;
    const m = $('#modal');
    if (body.classList.contains('modal-open') && m && m.classList.contains('show')) return m;
    if (body.classList.contains('sheet-open')) return $('#sheet');
    const run = $('#running');
    if (run && run.classList.contains('show')) return run;
    if (body.classList.contains('page-open')) return $('#page');
    return null;
  }
  const visible = el => {
    if (!el.getClientRects().length) return false;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.pointerEvents !== 'none';
  };
  function items(sc) {
    const out = [...sc.querySelectorAll(FOCUSABLE)].filter(e => !e.disabled && e.tabIndex !== -1 && !e.closest('[aria-hidden="true"]:not(#page)') && visible(e));
    if (sc.id === 'page' || sc.id === 'running') out.push(...document.querySelectorAll('.top .tools button'));
    return out.filter(e => !(e.type === 'hidden'));
  }

  /* ───────── focus ring ───────── */
  function setCur(el) {
    if (cur) cur.classList.remove('padfocus');
    cur = el;
    if (cur) { cur.classList.add('padfocus'); cur.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  }
  function engage() { if (!active) { active = true; body.classList.add('padnav'); } showHint(); }
  function disengage() { active = false; body.classList.remove('padnav'); setCur(null); showHint(); }
  addEventListener('pointerdown', () => { if (active && !overlay) disengage(); }, true);
  addEventListener('keydown', e => { if (active && !overlay && e.key !== 'Shift') disengage(); }, true);

  function first(sc) {
    const list = items(sc); if (!list.length) return null;
    return list.find(e => e.matches('.btn.primary, .primary')) && sc.id !== 'page' ? list.find(e => e.matches('.btn.primary, .primary')) : list[0];
  }
  function ensureCur(sc) {
    if (cur && cur.isConnected && sc.contains(cur) || (cur && cur.closest && cur.closest('.top .tools') && cur.isConnected)) return true;
    const f = first(sc); setCur(f); return !!f;
  }

  function move(dir) {
    const sc = scope(); if (!sc) return;
    if (!active) engage();
    if (!ensureCur(sc)) return;
    const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bs = 1e9; const vert = dir === 'u' || dir === 'd', cands = [];
    for (const e of items(sc)) {
      if (e === cur || cur.contains(e) || e.contains(cur)) continue;
      const r = e.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let prim, orth, overlap;
      if (dir === 'r') { if (r.left < a.right - a.width * .5 || cx <= ax) continue; prim = r.left - a.right; orth = Math.abs(cy - ay); overlap = r.top < a.bottom && r.bottom > a.top; }
      else if (dir === 'l') { if (r.right > a.left + a.width * .5 || cx >= ax) continue; prim = a.left - r.right; orth = Math.abs(cy - ay); overlap = r.top < a.bottom && r.bottom > a.top; }
      else if (dir === 'd') { if (r.top < a.bottom - a.height * .5 || cy <= ay) continue; prim = r.top - a.bottom; orth = Math.abs(cx - ax); overlap = r.left < a.right && r.right > a.left; }
      else { if (r.bottom > a.top + a.height * .5 || cy >= ay) continue; prim = a.top - r.bottom; orth = Math.abs(cx - ax); overlap = r.left < a.right && r.right > a.left; }
      if (vert) { cands.push({ e, along: Math.abs(cy - ay), orth }); continue; }
      const score = Math.max(0, prim) + orth * (overlap ? 1.2 : 4) + (overlap ? 0 : 200);
      if (score < bs) { bs = score; best = e; }
    }
    if (vert && cands.length) {                       // up/down: take the next row, then the closest control within that row
      const m = Math.min(...cands.map(c => c.along)), band = Math.max(28, a.height * .8);
      const row = cands.filter(c => c.along <= m + band);
      best = row.reduce((x, y) => (y.orth < x.orth ? y : x)).e;
    }
    if (best) { setCur(best); sfx('tick'); return; }
    // nothing further that way: scroll so hidden content (and its controls) comes into reach
    if (dir === 'd' || dir === 'u') scrollBy(dir === 'd' ? 1 : -1, .6);
  }
  function scroller(el) {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const o = getComputedStyle(n).overflowY;
      if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight + 2) return n;
    }
    return null;
  }
  function scrollBy(sign, amt) {
    const sc = scope(); const s = (cur && scroller(cur)) || (sc && (scroller(sc.querySelector('.mbox') || sc) || scroller(sc)));
    if (s) s.scrollBy({ top: sign * s.clientHeight * amt, behavior: 'smooth' });
  }

  /* ───────── activate ───────── */
  function activate() {
    if (!cur || !cur.isConnected) return;
    const el = cur, t = (el.type || '').toLowerCase();
    if (el.tagName === 'SELECT') return openPicker(el);
    if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|range|color|file)$/.test(t))) return openOsk(el);
    if (t === 'range') return;
    sfx('select');
    el.click();
    setTimeout(() => { if (cur && !cur.isConnected) refocus(); }, 60);
  }
  // the clicked control may have re-rendered its page; land on the nearest equivalent
  function refocus() {
    const sc = scope(); if (!sc) return setCur(null);
    const list = items(sc); if (!list.length) return setCur(null);
    setCur(list[0]);
  }
  function adjust(sign) {
    if (!cur || cur.tagName !== 'INPUT' || cur.type !== 'range') return false;
    const mn = +cur.min || 0, mx = cur.max === '' ? 100 : +cur.max, st = +cur.step || Math.max(1, (mx - mn) / 20);
    const step = Math.max(st, Math.round((mx - mn) / 25 / st) * st);
    const v = Math.min(mx, Math.max(mn, (+cur.value || 0) + sign * step));
    if (v !== +cur.value) { cur.value = v; cur.dispatchEvent(new Event('input', { bubbles: true })); cur.dispatchEvent(new Event('change', { bubbles: true })); sfx('tick'); }
    return true;
  }

  /* ───────── back ───────── */
  function back() {
    if (overlay) return overlay.cancel();
    const m = $('#modal');
    if (body.classList.contains('modal-open') && m) {
      const btns = [...m.querySelectorAll('button')].filter(visible);
      const bye = btns.find(b => /^(close|cancel|back|done|no|later|not now|skip|dismiss)\b/i.test(b.textContent.trim()));
      if (bye) bye.click(); else { const mb = m.querySelector('.mback'); if (mb) mb.click(); }
      sfx('tick'); return;
    }
    if (body.classList.contains('sheet-open')) { NEB.closeSheet(); setCur(null); return; }
    if (strip && active) { disengage(); return; }
    if (NEB.padBack && NEB.padBack()) return;
    if (body.classList.contains('page-open')) { setCur(null); NEB.goHome(); }
  }

  /* ───────── overlay helpers ───────── */
  function mkOverlay(el, cancel, onKey) {
    document.body.appendChild(el);
    overlay = { el, cancel: () => { close(); cancel && cancel(); }, onKey };
    function close() { el.remove(); overlay = null; }
    overlay.close = close;
    return overlay;
  }

  /* drop-down picker */
  function openPicker(sel) {
    const opts = [...sel.options];
    const list = h('div', { class: 'pn-list' }, opts.map((o, i) => h('button', { class: 'pn-opt' + (o.selected ? ' on' : ''), disabled: o.disabled,
      onclick: () => { sel.selectedIndex = i; sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); sfx('select'); overlay.close(); fix(); } }, o.textContent || o.value)));
    const el = h('div', { class: 'pn-ov' }, h('div', { class: 'pn-box' }, h('h3', null, (sel.getAttribute('aria-label') || sel.title || 'Choose')), list,
      h('div', { class: 'pn-foot' }, 'A choose · B cancel')));
    const prevCur = cur;
    mkOverlay(el, null);
    const on = list.querySelector('.on') || list.querySelector('button');
    setCur(on);
    function fix() { setCur(prevCur && prevCur.isConnected ? prevCur : null); if (!cur) refocus(); }
    overlay.cancel = () => { overlay.close(); fix(); };
  }

  /* on-screen keyboard */
  const ROWS = {
    abc: ['1234567890', 'qwertyuiop', 'asdfghjkl-', 'zxcvbnm._/'],
    sym: ['!@#$%^&*()', '[]{}<>=+~`', ':;"\'|?,.\\_', '/-_.:\\@#$%'],
  };
  function openOsk(input) {
    const orig = input.value; let text = orig, caps = false, mode = 'abc';
    const pre = h('div', { class: 'pn-pre' }), keysEl = h('div', { class: 'pn-keys' });
    const el = h('div', { class: 'pn-ov' }, h('div', { class: 'pn-box osk' },
      h('h3', null, input.placeholder || input.getAttribute('aria-label') || 'Type'), pre, keysEl,
      h('div', { class: 'pn-foot' }, 'A key · B backspace · X space · Y shift · LB/RB move on · Start done · Select cancel')));
    const sync = () => {
      input.value = text; input.dispatchEvent(new Event('input', { bubbles: true }));
      pre.replaceChildren(text ? document.createTextNode(input.type === 'password' ? '•'.repeat(text.length) : text) : h('span', { class: 'ph' }, input.placeholder || ''), h('i', { class: 'caret' }));
    };
    const type = c => { text += caps && c.length === 1 ? c.toUpperCase() : c; if (caps) { caps = false; draw(); } sync(); sfx('tick'); };
    const del = () => { text = text.slice(0, -1); sync(); sfx('tick'); };
    const done = () => {
      overlay.close(); input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      sfx('select'); setCur(input.isConnected ? input : null); if (!cur) refocus();
    };
    const cancel = () => { text = orig; sync(); overlay.close(); setCur(input.isConnected ? input : null); if (!cur) refocus(); };
    function draw() {
      const k = (label, fn, cls = '') => h('button', { class: 'pn-key ' + cls, onclick: fn }, label);
      keysEl.replaceChildren(
        ...ROWS[mode].map(r => h('div', { class: 'pn-row' }, [...r].map(c => k(caps && mode === 'abc' ? c.toUpperCase() : c, () => type(c))))),
        h('div', { class: 'pn-row' },
          k(caps ? 'SHIFT ✓' : 'Shift', () => { caps = !caps; draw(); setCur(keysEl.querySelector('.pn-row:last-child button')); }, 'wide'),
          k(mode === 'abc' ? '#+=' : 'ABC', () => { mode = mode === 'abc' ? 'sym' : 'abc'; draw(); setCur(keysEl.querySelector('.pn-row:last-child button:nth-child(2)')); }, 'wide'),
          k('Space', () => type(' '), 'space'), k('⌫', del, 'wide'), k('Clear', () => { text = ''; sync(); }, 'wide'), k('Done', done, 'wide ok')));
    }
    mkOverlay(el, null, { x: () => type(' '), y: () => { caps = !caps; draw(); setCur(keysEl.querySelector('.pn-key')); }, b: del, start: done, select: cancel, lb: () => {}, rb: done });
    overlay.cancel = cancel;
    draw(); sync(); setCur(keysEl.querySelector('.pn-row:nth-child(2) button'));
  }

  /* ───────── hint bar ───────── */
  function showHint() {
    if (!hintEl) { hintEl = document.createElement('div'); hintEl.className = 'pn-hint'; hintEl.setAttribute('aria-hidden', 'true'); document.body.appendChild(hintEl); }
    hintEl.classList.toggle('show', active && !overlay && !!scope());
    hintEl.innerHTML = '<b>A</b> Select <b>B</b> Back <b>LB</b><b>RB</b> Sections <b>R-Stick</b> Scroll';
  }

  /* ───────── gamepad loop ───────── */
  function pad() {
    const ps = navigator.getGamepads ? navigator.getGamepads() : [];
    // merge every connected pad so any player can navigate the menu
    const gps = [...ps].filter(Boolean);
    if (!gps.length) return null;
    const m = { b: [], ax: [0, 0, 0, 0] };
    for (const g of gps) {
      g.buttons.forEach((bt, i) => { if (bt && bt.pressed) m.b[i] = true; });
      for (let i = 0; i < 4; i++) if (Math.abs(g.axes[i] || 0) > Math.abs(m.ax[i])) m.ax[i] = g.axes[i];
    }
    return m;
  }
  function edge(name, on, rep) {
    const now = performance.now(); let fire = false;
    if (on) {
      if (!prev[name]) { fire = true; hold[name] = now + 380; }
      else if (rep && now >= hold[name]) { fire = true; hold[name] = now + 105; }
    }
    prev[name] = on; return fire;
  }
  function tick() {
    requestAnimationFrame(tick);
    if (document.hidden) return;
    const p = pad(); if (!p) return;
    const sc = scope(), b = i => !!p.b[i];
    strip = !!(sc && sc.id === 'page' && sc.dataset.page === 'skylanders');
    NEB.padHas = () => !(strip && !(active && cur));
    const st = {
      l: b(14) || p.ax[0] < -.55, r: b(15) || p.ax[0] > .55, u: b(12) || p.ax[1] < -.55, d: b(13) || p.ax[1] > .55,
      a: b(0), b: b(1), x: b(2), y: b(3), lb: b(4), rb: b(5), sel: b(8), start: b(9),
    };
    if (sc && (st.a || st.b || st.lb || st.rb || st.u || st.d || st.l || st.r)) NEB.padSwallow = true; // the home carousel must not re-read a press this module used
    const fl = edge('l', st.l, 1), fr = edge('r', st.r, 1), fu = edge('u', st.u, 1), fd = edge('d', st.d, 1);
    const fa = edge('a', st.a), fb = edge('b', st.b), fx = edge('x', st.x), fy = edge('y', st.y);
    const flb = edge('lb', st.lb), frb = edge('rb', st.rb), fs = edge('sel', st.sel), fst = edge('start', st.start);
    const ry = p.ax[3] || 0;
    if (!sc && !overlay) { prev.any = false; return; }
    if (NEB.padBusy && !overlay) return;                 // a binding is being captured or a game view owns the pad
    if (Math.abs(ry) > .35 && !overlay) { const s = (cur && scroller(cur)) || scroller(sc.querySelector('.mbox') || sc) || scroller(sc); if (s) s.scrollTop += ry * 22; }
    if (overlay) {
      if (fl) move('l'); if (fr) move('r'); if (fu) move('u'); if (fd) move('d');
      if (fa) { if (cur) { cur.click(); } }
      if (fb) { overlay.onKey && overlay.onKey.b ? overlay.onKey.b() : overlay.cancel(); }
      if (overlay && overlay.onKey) { if (fx) overlay.onKey.x(); if (fy) overlay.onKey.y(); if (fst) overlay.onKey.start(); if (fs) overlay.onKey.select(); if (frb) overlay.onKey.rb(); }
      else if (fs) overlay.cancel();
      return;
    }
    if (strip && !(active && cur)) {                     // the Skylanders strip owns left/right/A until you press up/down
      if (fu || fd) { engage(); const list = items(sc).filter(e => !e.matches('.fig, .nav')); setCur(list[0] || null); sfx('tick'); }
      if (fb) NEB.goHome();
      if (flb) NEB.cycleSystem(-1); if (frb) NEB.cycleSystem(1);
      return;
    }
    const any = fl || fr || fu || fd || fa || fb;
    if (any && !active) { engage(); ensureCur(sc); if (fb) back(); return; } // first press only reveals the ring
    if (fl) { if (!adjust(-1)) move('l'); }
    if (fr) { if (!adjust(1)) move('r'); }
    if (fu) move('u');
    if (fd) move('d');
    if (fa && active) activate();
    if (fb) back();
    if (!body.classList.contains('modal-open')) { if (flb) { NEB.cycleSystem(-1); setCur(null); } if (frb) { NEB.cycleSystem(1); setCur(null); } }
    if (cur && !cur.isConnected) refocus();
    if (active) showHint();
  }
  requestAnimationFrame(tick);

  NEB.padnav = { cur: () => cur, active: () => active, move, activate, back };
})();

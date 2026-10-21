/* NEBULATOR shell: carousel, rail, themes, settings sheet, shared modals. Talks to the core through api.js. */
(() => {
  'use strict';

  /* ───────── helpers ───────── */
  const $ = (s, r = document) => r.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const h = (tag, props, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') e.className = v;
      else if (k === 'innerHTML') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem('neb.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('neb.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  /* ───────── data ───────── */
  const SYSTEMS = [
    { id: 'wiiu',       name: 'Wii U',         color: '#2FB6C9' },
    { id: 'switch',     name: 'Switch',        color: '#E4503C', soon: true },
    { id: 'wii',        name: 'Wii',           color: '#7FA6C4', soon: true },
    { id: 'skylanders', name: 'Skylanders',    page: true },
    { id: 'controls',   name: 'Controls',      page: true },
    { id: 'gfx',        name: 'Graphics',      page: true },
    { id: 'updates',    name: 'Updates & DLC', page: true },
    { id: 'settings',   name: 'Settings',      color: '#B8B09A' },
  ];
  const SETTINGS = [
    { id: 'appearance', title: 'Appearance',      sub: 'Theme, motion, sound' },
    { id: 'display',    title: 'Display & Speed', sub: 'Filters, vsync, CPU mode' },
    { id: 'audio',      title: 'Audio',           sub: 'Output device and volumes' },
    { id: 'paths',      title: 'Game Folders',    sub: 'Where games, updates and DLC live' },
    { id: 'about',      title: 'About',           sub: 'NEBULATOR core' },
  ];
  const PALETTE = { nebula: ['#0A1416', '#E8E1CF', '#FF7A59'], dark: ['#121212', '#2E2E2E', '#FF5A36'], light: ['#EFEBE2', '#FBF8F1', '#E5421F'] };
  const THEME_NAMES = { nebula: 'Nebula', dark: 'Dark', light: 'Light' };
  const THEME_ORDER = ['nebula', 'dark', 'light'];

  /* ───────── state ───────── */
  const S = Object.assign({
    theme: 'nebula', sound: true, dust: true, size: 1, sys: 'wiiu', last: {}, fullscreen: false,
    motion: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full',
  }, store.get('state', {}));
  S.sys = 'wiiu'; // always start on the Wii U shelf, whatever tab was open last time
  if (!THEME_NAMES[S.theme]) S.theme = 'nebula';
  const save = () => store.set('state', S);
  document.documentElement.dataset.theme = S.theme;

  const NEB = window.NEB;
  Object.assign(NEB, { S, save, h, $, clamp, store, SYSTEMS, pages: {}, library: { games: [], scanning: false, loaded: false } });
  NEB.registerPage = (id, def) => { NEB.pages[id] = def; };

  /* ───────── elements ───────── */
  const stage = $('#stage'), track = $('#track'), rail = $('#rail'), slot = $('#slot');
  const titleEl = $('#title'), subEl = $('#sub'), countEl = $('#count');
  const sheet = $('#sheet'), toastEl = $('#toast'), pageEl = $('#page'), modalEl = $('#modal'), runningEl = $('#running');
  const themeName = $('#themeName');
  NEB.pageEl = pageEl;

  /* ───────── carousel state ───────── */
  let list = [], els = [], pos = 0, target = 0, vel = 0, cur = -1;
  let dragging = false, sheetOpen = false, U = 1, swapT = 0, prevPos = NaN;

  const sysOf = id => SYSTEMS.find(s => s.id === id);
  const firstLine = s => String(s || '').split('\n')[0].trim();
  NEB.firstLine = firstLine;

  function items(sysId) {
    if (sysId === 'settings') return SETTINGS.map(s => ({ ...s, setting: true }));
    const sys = sysOf(sysId);
    if (sys && sys.soon) return [{ id: 'soon', title: sys.name + ' core', sub: 'Not installed yet', soon: true }];
    const games = NEB.library.games.map(g => ({
      id: g.titleId, title: firstLine(g.name) || g.titleId, game: g,
      sub: [g.region, 'v' + g.version, g.update ? 'update' : null, g.dlc.length ? g.dlc.length + ' DLC' : null].filter(Boolean).join(' · '),
    }));
    if (games.length) return games;
    return [{ id: 'add', title: NEB.library.scanning ? 'Scanning…' : 'Add a game folder', add: true }];
  }

  // the game's own icon, faded in once it has been read from the game
  function gameIcon(id) {
    const wrap = h('div', { class: 'gicon' });
    NEB.icon(id).then(u => { if (u) { wrap.appendChild(h('img', { src: u, alt: '', draggable: 'false' })); requestAnimationFrame(() => wrap.classList.add('on')); } });
    return wrap;
  }
  NEB.gameIcon = gameIcon;

  function cartEl(g, i) {
    const sys = sysOf(S.sys);
    const tag = g.setting ? 'SYSTEM ' + String(i + 1).padStart(2, '0') : g.add ? 'EMPTY SLOT' : g.soon ? 'NO CORE' : sys.name.toUpperCase();
    return h('div', { class: 'cart' + (g.add || g.soon ? ' ghost' : ''), role: 'option', 'data-i': i, style: `--c:${sys.color || '#B8B09A'}` },
      h('div', { class: 'body' },
        h('div', { class: 'ridges' }),
        h('div', { class: 'label' + (g.game ? ' has-icon' : '') }, h('div', { class: 'stripe' }), g.game ? gameIcon(g.id) : null, h('div', { class: 'name' }, g.title), h('div', { class: 'tag' }, tag)),
        h('div', { class: 'pins' })));
  }

  function buildTrack() {
    list = items(S.sys);
    const i0 = clamp(S.last[S.sys] ?? 0, 0, list.length - 1);
    els = list.map(cartEl);
    track.replaceChildren(...els);
    pos = target = i0; vel = 0; cur = -1; prevPos = NaN;
    select(i0, true);
  }

  function select(i, silent) {
    i = clamp(i, 0, list.length - 1);
    target = i;
    if (i === cur) return;
    cur = i; S.last[S.sys] = i; save();
    els.forEach((e, k) => e.classList.toggle('sel', k === i));
    setTitle(list[i], i);
    if (!silent) { SFX.tick(); blink(); }
    bgDirty = true;
    if (sheetOpen) renderSheet();
  }
  const move = n => select(cur + n);

  function setTitle(g, i) {
    titleEl.replaceChildren(...[...g.title].map((ch, k) => h('span', { style: `--d:${k * 16}ms` }, ch === ' ' ? ' ' : ch)));
    titleEl.classList.remove('swap'); void titleEl.offsetWidth; titleEl.classList.add('swap');
    subEl.textContent = g.setting || g.soon ? g.sub : g.add ? 'Press Enter to pick a folder with your games' : g.sub;
    countEl.textContent = `${String(i + 1).padStart(2, '0')} / ${String(list.length).padStart(2, '0')}`;
  }
  function blink() { slot.classList.remove('blink'); void slot.offsetWidth; slot.classList.add('blink'); }

  /* spring: slightly underdamped so cartridges settle with a small overshoot */
  function step(dt) {
    if (dragging) return;
    if (S.motion === 'reduced') {
      pos += (target - pos) * Math.min(1, dt * 18); vel = 0;
      if (Math.abs(target - pos) < .001) pos = target;
      return;
    }
    const k = 190, c = 2 * Math.sqrt(k) * .78;
    vel += (k * (target - pos) - c * vel) * dt;
    pos += vel * dt;
    if (Math.abs(target - pos) < .0004 && Math.abs(vel) < .003) { pos = target; vel = 0; }
  }

  function paint() {
    const sp = 232 * U;
    track.style.setProperty('--smear', clamp(vel * 6, -7, 7).toFixed(2) + 'px');
    const sk = S.motion === 'reduced' ? 0 : clamp(-vel * 5, -9, 9);
    for (let i = 0; i < els.length; i++) {
      const o = i - pos, a = Math.abs(o), e = els[i];
      if (a > 4.6) { e.style.visibility = 'hidden'; continue; }
      e.style.visibility = '';
      const x = Math.sign(o) * (a < 1 ? a * sp : sp + (a - 1) * sp * .64);
      const lift = -16 * U * (1 - Math.min(a, 1));
      const z = -Math.min(a, 3) * 70;
      const rot = clamp(-o * 26, -42, 42);
      const sc = (1 - Math.min(a, 3) * .09) * U;
      e.style.transform = `translate3d(${x.toFixed(1)}px,${lift.toFixed(1)}px,${z.toFixed(0)}px) rotateY(${rot.toFixed(1)}deg) skewX(${sk.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
      e.style.opacity = a > 3.2 ? clamp(1 - (a - 3.2) / 1.4, 0, 1) : 1 - Math.max(0, a - 1) * .14;
      e.style.zIndex = 100 - Math.round(a * 10);
      e.style.setProperty('--dim', (Math.min(a, 3) * .1).toFixed(2));
    }
  }

  function layout() {
    U = clamp(Math.min(innerWidth / 1200, innerHeight / 780), .5, 1.3) * S.size;
    stage.style.setProperty('--u', U.toFixed(3));
    moveInd();
    prevPos = NaN;
  }
  NEB.layout = layout;

  /* ───────── section rail ───────── */
  let ind;
  function buildRail() {
    ind = h('i', { class: 'ind' });
    rail.replaceChildren(...SYSTEMS.map(s => h('button', {
      class: 'sys' + (s.id === S.sys ? ' on' : ''), 'data-id': s.id,
      onclick: e => { e.currentTarget.blur(); setSystem(s.id); },
    }, s.name)), ind);
    moveInd();
  }
  function moveInd() {
    const b = rail.querySelector('.on'); if (!b || !ind) return;
    ind.style.width = b.offsetWidth + 'px';
    ind.style.transform = `translateX(${b.offsetLeft}px)`;
  }

  let pageId = null;
  function showPage(id, dir) {
    const def = NEB.pages[id];
    document.body.classList.add('page-open');
    if (pageId && pageId !== id && NEB.pages[pageId] && NEB.pages[pageId].hide) NEB.pages[pageId].hide();
    pageId = id;
    pageEl.dataset.page = id;
    pageEl.style.setProperty('--dir', dir);
    pageEl.classList.remove('page-in'); void pageEl.offsetWidth; pageEl.classList.add('page-in');
    pageEl.replaceChildren();
    if (def) def.show(pageEl);
  }
  function hidePage() {
    if (pageId && NEB.pages[pageId] && NEB.pages[pageId].hide) NEB.pages[pageId].hide();
    pageId = null;
    document.body.classList.remove('page-open');
    pageEl.replaceChildren();
  }

  function setSystem(id) {
    if (id === S.sys && (pageId === id || !sysOf(id).page)) return;
    const oldI = SYSTEMS.findIndex(s => s.id === S.sys), newI = SYSTEMS.findIndex(s => s.id === id);
    const dir = newI > oldI ? 1 : -1;
    S.sys = id; save(); SFX.tab(); syncRunning();
    rail.querySelectorAll('.sys').forEach(b => b.classList.toggle('on', b.dataset.id === id));
    moveInd();
    if (id !== 'settings' && sheetOpen) closeSheet();
    if (sysOf(id).page) { showPage(id, dir); return; }
    const wasPage = !!pageId;
    hidePage();
    track.style.setProperty('--dir', dir);
    clearTimeout(swapT);
    if (wasPage) { buildTrack(); return; }
    track.classList.add('out');
    swapT = setTimeout(() => {
      buildTrack();
      track.classList.add('in'); track.classList.remove('out');
      void track.offsetWidth;
      requestAnimationFrame(() => track.classList.remove('in'));
    }, 170);
  }
  NEB.setSystem = setSystem;
  const cycleSystem = n => {
    const i = SYSTEMS.findIndex(s => s.id === S.sys);
    setSystem(SYSTEMS[(i + n + SYSTEMS.length) % SYSTEMS.length].id);
  };

  /* ───────── input ───────── */
  const blocked = () => document.body.classList.contains('page-open') || document.body.classList.contains('modal-open');
  let px0 = 0, lastX = 0, lastT = 0, pos0 = 0, moved = 0, dv = 0, downEl = null, wheelLock = 0;
  stage.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    dragging = true; px0 = lastX = e.clientX; pos0 = pos; moved = 0; dv = 0; lastT = performance.now();
    downEl = e.target.closest('.cart');
    stage.setPointerCapture(e.pointerId); stage.classList.add('drag');
  });
  stage.addEventListener('pointermove', e => {
    if (!dragging) return;
    const now = performance.now(), sp = 232 * U;
    moved = Math.max(moved, Math.abs(e.clientX - px0));
    const dtm = Math.max(1, now - lastT) / 1000;
    dv = dv * .6 + (-(e.clientX - lastX) / sp / dtm) * .4;
    pos = clamp(pos0 - (e.clientX - px0) / sp, -.35, list.length - .65);
    vel = dv; lastX = e.clientX; lastT = now;
    const r = clamp(Math.round(pos), 0, list.length - 1);
    if (r !== cur) select(r);
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false; stage.classList.remove('drag');
    if (moved < 6) {
      vel = 0;
      if (downEl) { const i = +downEl.dataset.i; i === cur ? activate() : select(i); }
      select(cur);
    } else {
      vel = clamp(vel, -14, 14);
      select(clamp(Math.round(pos + vel * .16), 0, list.length - 1));
    }
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY, now = performance.now();
    if (Math.abs(d) < 4 || now - wheelLock < 110) return;
    wheelLock = now; move(d > 0 ? 1 : -1);
  }, { passive: false });

  addEventListener('keydown', e => {
    const t = e.target;
    if (t && t.matches && t.matches('input, textarea, select')) { if (e.key === 'Escape') t.blur(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (blocked()) {
      // on a page (Skylanders, Controls, ...) up/down still switch sections, unless a dialog is open or a bind is being captured
      if (!NEB.captureKeys && !document.body.classList.contains('modal-open') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        cycleSystem(e.key === 'ArrowDown' ? 1 : -1); e.preventDefault();
      }
      return;
    }
    const inSheet = t && t.closest && t.closest('.sheet');
    switch (e.key) {
      case 'ArrowRight': case 'd': case 'D': move(1); break;
      case 'ArrowLeft': case 'a': case 'A': move(-1); break;
      case 'ArrowDown': case 's': case 'S': cycleSystem(1); break;
      case 'ArrowUp': case 'w': case 'W': cycleSystem(-1); break;
      case 'Enter': case ' ': if (inSheet) return; activate(); break;
      case 'Escape': closeSheet(); break;
      default: return;
    }
    e.preventDefault();
  });

  let padPrev = {};
  function pollPad() {
    const onPage = document.body.classList.contains('page-open') && !document.body.classList.contains('modal-open');
    if ((blocked() && !onPage) || NEB.padBusy) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find(Boolean); if (!gp) return;
    const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed), ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const st = { l: b(14) || ax < -.6, r: b(15) || ax > .6, u: b(12) || ay < -.6, d: b(13) || ay > .6, a: b(0), b: b(1), y: b(3), lb: b(4), rb: b(5) };
    if (!onPage && st.l && !padPrev.l) move(-1);
    if (!onPage && st.r && !padPrev.r) move(1);
    if ((st.d && !padPrev.d) || (st.rb && !padPrev.rb)) cycleSystem(1);
    if ((st.u && !padPrev.u) || (st.lb && !padPrev.lb)) cycleSystem(-1);
    if (!onPage && st.a && !padPrev.a) activate();
    if (!onPage && st.b && !padPrev.b) closeSheet();
    padPrev = st;
  }

  /* ───────── actions ───────── */
  function activate() {
    const g = list[cur]; if (!g) return;
    if (g.setting) return openSheet();
    if (g.soon) return toast(g.title + ' is planned. Only Wii U runs today.');
    if (g.add) return addFolder();
    launch(g, els[cur]);
  }

  async function launch(g, el) {
    if (NEB.state !== 'ui') return toast('A game is already running');
    el.classList.add('inserting'); slot.classList.add('go'); SFX.launch();
    setTimeout(() => { el.classList.remove('inserting'); slot.classList.remove('go'); }, 900);
    try {
      await NEB.api('launch', { titleId: g.game.titleId, fullscreen: !!S.fullscreen });
      NEB.status.title = firstLine(g.game.name); showRunning('loading'); NEB.pollNow();
    } catch (e) { SFX.error(); toast('Launch failed: ' + e.message); }
  }
  NEB.launchGame = (game) => { const i = list.findIndex(x => x.id === game.titleId); if (i >= 0 && els[i]) return launch(list[i], els[i]); };

  let toastT = 0;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 3600);
  }
  NEB.toast = toast;

  /* ───────── running / offline overlay ───────── */
  // while a game runs, only these sections stay usable (they act on the running game); the rest show the "now playing" card
  const LIVE_SECTIONS = new Set(['skylanders', 'controls']);
  let runChip = null;
  function showRunning(state) {
    runningEl.style.top = ($('.top') ? $('.top').offsetHeight : 64) + 'px'; // keep the section tabs clickable
    runningEl.replaceChildren(
      h('div', { class: 'run-card' },
        h('div', { class: 'run-led' }),
        h('div', { class: 'run-k' }, state === 'loading' ? 'Starting' : 'Now playing'),
        h('div', { class: 'run-t' }, firstLine(NEB.status.title) || 'Game'),
        h('p', { class: 'run-p' }, 'The game is in its own window. Skylanders and Controls stay available while you play; this menu comes back fully when you close the game.'),
        h('button', { class: 'btn danger', onclick: () => NEB.api('quit', { app: false }).catch(() => {}) }, 'Stop game')));
    runningEl.classList.add('show'); runningEl.setAttribute('aria-hidden', 'false');
  }
  function hideRunning() { runningEl.classList.remove('show'); runningEl.setAttribute('aria-hidden', 'true'); }
  function syncRunning() {
    const st = NEB.state;
    if (st === 'ui') {
      if (runChip) { runChip.remove(); runChip = null; }
      return hideRunning();
    }
    if (!runChip) {
      runChip = h('button', { class: 'runchip', title: 'A game is running. Click to stop it.', onclick: () => NEB.api('quit', { app: false }).catch(() => {}) },
        h('i'), h('b', null, 'Stop game'));
      const tools = $('.tools'); if (tools) tools.prepend(runChip);
    }
    if (LIVE_SECTIONS.has(S.sys)) hideRunning(); else showRunning(st);
  }
  NEB.on('state', st => { if (st === 'ui') loadLibrary(); syncRunning(); });
  NEB.on('status', st => {
    if (st.error && st.error !== NEB._lastErr) { NEB._lastErr = st.error; SFX.error(); toast(st.error.split('\n')[0]); }
    if (!st.error) NEB._lastErr = '';
  });
  NEB.on('offline', () => { document.body.classList.add('offline'); });
  NEB.on('online', () => { document.body.classList.remove('offline'); loadLibrary(); });
  NEB.on('badtoken', () => {
    modal(h('div', { class: 'mbox' }, h('h2', null, 'Open NEBULATOR from the launcher'),
      h('p', { class: 'lead' }, 'This page lost its access key. Start nebulator-core and it opens this window with a fresh link.')), { dismiss: false });
  });

  /* ───────── modal + folder picker ───────── */
  let modalResolve = null;
  function modal(node, opt = {}) {
    modalEl.replaceChildren(h('div', { class: 'mback', onclick: () => opt.dismiss !== false && closeModal() }), node);
    modalEl.classList.add('show'); modalEl.setAttribute('aria-hidden', 'false'); document.body.classList.add('modal-open');
    modalEl._esc = opt.dismiss !== false;
  }
  function closeModal(val) {
    modalEl.classList.remove('show'); modalEl.setAttribute('aria-hidden', 'true'); document.body.classList.remove('modal-open');
    const r = modalResolve; modalResolve = null; if (r) r(val);
  }
  NEB.modal = modal; NEB.closeModal = closeModal;
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && modalEl.classList.contains('show') && modalEl._esc) { closeModal(); e.stopPropagation(); }
  }, true);

  NEB.pickFolder = (title = 'Choose a folder', start = '') => new Promise(resolve => {
    modalResolve = resolve;
    const box = h('div', { class: 'mbox wide' });
    const load = async path => {
      let d;
      try { d = await NEB.api('fs?path=' + encodeURIComponent(path || '')); } catch (e) { SFX.error(); return toast(e.message); }
      box.replaceChildren(
        h('h2', null, title),
        h('div', { class: 'crumb' }, d.path || 'This computer'),
        h('div', { class: 'flist' },
          d.parent || d.path ? h('button', { class: 'fitem up', onclick: () => { SFX.tick(); load(d.parent); } }, '↑  Up') : null,
          d.entries.map(en => h('button', { class: 'fitem', onclick: () => { SFX.tick(); load(en.path); } }, en.name)),
          !d.entries.length ? h('div', { class: 'fempty' }, 'No subfolders') : null),
        h('div', { class: 'mfoot' },
          h('span', { class: 'hint' }, d.games ? d.games + ' game file' + (d.games > 1 ? 's' : '') + ' in this folder' : ''),
          h('button', { class: 'btn', onclick: () => closeModal(null) }, 'Cancel'),
          h('button', { class: 'btn primary', disabled: !d.path, onclick: () => { SFX.bind(); closeModal(d.path); } }, 'Use this folder')));
    };
    modal(box);
    load(start);
  });

  async function addFolder() {
    const p = await NEB.pickFolder('Add a folder with games, updates or DLC');
    if (!p) return;
    try {
      const st = await NEB.api('settings');
      if (!st.gamePaths.includes(p)) st.gamePaths.push(p);
      await NEB.api('settings', { gamePaths: st.gamePaths });
      await NEB.api('library/rescan', {});
      toast('Scanning ' + p);
      loadLibrary();
    } catch (e) { toast(e.message); }
  }
  NEB.addFolder = addFolder;

  /* ───────── library ───────── */
  let libTimer = 0;
  async function loadLibrary() {
    clearTimeout(libTimer);
    try {
      const d = await NEB.api('library');
      NEB.library.games = d.games.sort((a, b) => firstLine(a.name).localeCompare(firstLine(b.name)));
      NEB.library.scanning = d.scanning; NEB.library.loaded = true;
      NEB.emit('library');
      if (!sysOf(S.sys).page && S.sys !== 'settings') {
        const keep = list[cur] && list[cur].id;
        const fresh = items(S.sys);
        if (list.map(x => x.id).join() !== fresh.map(x => x.id).join() || list.some((x, k) => x.title !== fresh[k].title)) {
          const idx = keep ? fresh.findIndex(x => x.id === keep) : -1;
          if (idx >= 0) S.last[S.sys] = idx;
          buildTrack();
        }
      }
      if (d.scanning) libTimer = setTimeout(loadLibrary, 1500);
    } catch { /* offline: retried on reconnect */ }
  }
  NEB.loadLibrary = loadLibrary;

  /* ───────── themes ───────── */
  function setTheme(id, ev) {
    const apply = () => {
      document.documentElement.dataset.theme = id; S.theme = id; save();
      themeName.textContent = THEME_NAMES[id]; readDust(); bgDirty = true;
      if (sheetOpen) renderSheet();
      NEB.emit('theme', id);
    };
    if (id === S.theme) return;
    SFX.select();
    if (!document.startViewTransition || S.motion === 'reduced') return apply();
    // soft cross-fade of the whole page: text never shifts or gets chopped, so it stays readable throughout
    try { document.startViewTransition(apply); } catch (e) { apply(); }
  }
  NEB.setTheme = setTheme; NEB.THEME_ORDER = THEME_ORDER; NEB.THEME_NAMES = THEME_NAMES; NEB.PALETTE = PALETTE;
  $('#themeBtn').addEventListener('click', e => { e.currentTarget.blur(); setTheme(THEME_ORDER[(THEME_ORDER.indexOf(S.theme) + 1) % 3], e); });

  /* ───────── settings sheet (sections live in page-misc.js) ───────── */
  function openSheet() { sheetOpen = true; document.body.classList.add('sheet-open'); sheet.setAttribute('aria-hidden', 'false'); renderSheet(); }
  function closeSheet() { if (!sheetOpen) return; sheetOpen = false; document.body.classList.remove('sheet-open'); sheet.setAttribute('aria-hidden', 'true'); }

  function renderSheet() {
    const g = list[cur];
    if (!g || !g.setting) return closeSheet();
    const body = [
      h('button', { class: 'btn', style: 'position:absolute;top:24px;right:24px;margin:0', onclick: closeSheet }, 'Close'),
      h('h2', null, g.title), h('p', { class: 'lead' }, g.sub)];
    const build = NEB.settingsSections && NEB.settingsSections[g.id];
    if (build) body.push(...build(renderSheet));
    sheet.replaceChildren(...body);
  }
  NEB.openSettingsSection = id => {
    S.last.settings = Math.max(0, SETTINGS.findIndex(s => s.id === id));
    save(); setSystem('settings');
    setTimeout(() => { select(S.last.settings); openSheet(); }, 260);
  };

  /* ───────── aurora: smooth drifting curtains (replaces the old pixel dither) ───────── */
  const cv = $('#dust'), cx = cv.getContext('2d'), W = 360, Hh = 200, COL = 3;
  cv.width = W; cv.height = Hh;
  let bgT = 0, bgAcc = 0, bgShift = 0, bgDirty = true, ribbons = [], auroraA = 1;
  const hexRgb = hex => { const n = parseInt(hex.trim().slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  // one vertical alpha profile per colour: transparent top, soft body, bright lower edge, fade out
  function profile(rgb) {
    const p = document.createElement('canvas'); p.width = 1; p.height = 96;
    const g = p.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 96), c = a => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
    gr.addColorStop(0, c(0)); gr.addColorStop(.45, c(.16)); gr.addColorStop(.82, c(.62)); gr.addColorStop(.93, c(.95)); gr.addColorStop(1, c(0));
    g.fillStyle = gr; g.fillRect(0, 0, 1, 96); return p;
  }
  function readDust() {
    const cs = getComputedStyle(document.documentElement);
    ribbons = ['--aur1', '--aur2', '--aur3'].map(k => profile(hexRgb(cs.getPropertyValue(k))));
    auroraA = parseFloat(cs.getPropertyValue('--aur-a')) || 1;
    cv.style.opacity = cs.getPropertyValue('--dust-a');
  }
  function drawDust() {
    const t = bgT, sh = bgShift;
    cx.clearRect(0, 0, W, Hh);
    cx.globalCompositeOperation = document.documentElement.dataset.theme === 'light' ? 'source-over' : 'lighter';
    for (let r = 0; r < ribbons.length; r++) {
      const ph = r * 2.1, sp = .05 + r * .018, base = Hh * (.30 + r * .09), amp = Hh * (.10 + r * .03);
      for (let x = 0; x < W; x += COL) {
        const u = x / W * 3 + sh * (.5 + r * .2) + ph;
        const wave = Math.sin(u * 1.7 + t * sp * 2) + Math.sin(u * 3.1 - t * sp * 3.3 + r) * .5 + Math.sin(u * .6 + t * sp) * .8;
        const y = base + wave * amp * .5;
        const fold = .5 + .5 * Math.sin(u * 5.2 + t * sp * 4 + r * 1.7) * Math.sin(u * 1.3 - t * sp * 1.5);
        const h = Hh * (.28 + .22 * fold + .08 * Math.sin(u * 2.3 + t * .1));
        cx.globalAlpha = clamp((.25 + .75 * fold) * auroraA, 0, 1);
        cx.drawImage(ribbons[r], x, y - h * .8, COL + 1, h);
      }
    }
    cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over';
  }
  function dust(dt) {
    if (!S.dust) { cv.style.display = 'none'; return; }
    cv.style.display = '';
    bgShift += (pos * .5 - bgShift) * Math.min(1, dt * 3);
    bgAcc += dt;
    if (S.motion === 'reduced') { if (!bgDirty) return; bgDirty = false; }
    else { if (bgAcc < 1 / 30) return; bgT += bgAcc * (1 + Math.min(3, Math.abs(vel) * .3)); bgAcc = 0; }
    drawDust();
  }

  /* ───────── main loop ───────── */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(.033, (now - last) / 1000); last = now;
    if (!document.body.classList.contains('page-open')) {
      step(dt);
      if (pos !== prevPos || vel !== 0) { paint(); prevPos = pos; }
    }
    pollPad(); dust(dt);
    requestAnimationFrame(frame);
  }

  /* ───────── boot ───────── */
  NEB.boot = () => {
    themeName.textContent = THEME_NAMES[S.theme];
    readDust(); buildRail(); layout();
    addEventListener('resize', layout);
    addEventListener('pointerdown', () => SFX.unlock(), { once: true });
    addEventListener('keydown', () => SFX.unlock(), { once: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveInd);
    buildTrack();
    if (sysOf(S.sys).page) showPage(S.sys, 1);
    requestAnimationFrame(frame);
    NEB.startPolling();
  };
})();

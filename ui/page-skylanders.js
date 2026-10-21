/* Skylanders page: slide through your figures on a tinted stage and drop them onto the portal. */
(() => {
  'use strict';
  const { h, clamp } = NEB;
  const SLOTS = 8;

  let root = null, st = null, catalog = null, sel = 0, busy = false, alive = false, padPrev = {};
  const cleanups = [];

  const elOf = f => SKY.element(f.id);
  const keyOf = f => SKY.elementKey(f.id);

  const glyph = (key, cls = '') => {
    const e = SKY.EL[key] || SKY.EL.neutral;
    return h('span', { class: 'glyph ' + cls, innerHTML:
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${e.glyph}"/></svg>` });
  };

  async function load() {
    try {
      st = await NEB.api('sky');
      if (!catalog) catalog = await NEB.api('sky/catalog');
    } catch (e) { st = null; NEB.toast('Skylanders: ' + e.message); }
    sel = clamp(sel, 0, Math.max(0, (st ? st.collection.length : 1) - 1));
    render();
  }

  const onPortal = file => st.slots.findIndex(s => s.file === file);

  async function place(slot) {
    if (busy || !st.collection.length) return;
    const f = st.collection[sel];
    const at = onPortal(f.file);
    if (at >= 0) return remove(at);
    if (slot == null) slot = st.slots.slice(0, SLOTS).findIndex(s => !s.file);
    if (slot < 0) { SFX.error(); return NEB.toast('Portal is full. Remove a figure first.'); }
    busy = true;
    try {
      st = await NEB.api('sky/place', { slot, file: f.file });
      SFX.place(elOf(f).note);
      render(); pulse(slot, elOf(f).color);
    } catch (e) { SFX.error(); NEB.toast(e.message); }
    busy = false;
  }

  async function remove(slot) {
    if (busy) return;
    const s = st.slots[slot]; if (!s || !s.file) return;
    busy = true;
    try {
      const color = SKY.element(s.id).color, note = SKY.element(s.id).note;
      st = await NEB.api('sky/remove', { slot });
      SFX.remove(note); render(); pulse(slot, color, true);
    } catch (e) { SFX.error(); NEB.toast(e.message); }
    busy = false;
  }

  function pulse(slot, color, out) {
    const pad = root && root.querySelector(`.pad[data-slot="${slot}"]`);
    if (!pad) return;
    pad.style.setProperty('--pc', color);
    pad.classList.remove('ping', 'pong'); void pad.offsetWidth; pad.classList.add(out ? 'pong' : 'ping');
  }

  function go(n) {
    if (!st || !st.collection.length) return;
    const next = clamp(sel + n, 0, st.collection.length - 1);
    if (next === sel) return;
    sel = next; SFX.select(); layout(true);
  }

  async function setMode(emulated) {
    try { st = await NEB.api('sky/mode', { emulated }); SFX.tab(); render(); } catch (e) { SFX.error(); NEB.toast(e.message); }
  }

  /* ───────── catalog picker ───────── */
  function openCatalog() {
    const input = h('input', { type: 'text', placeholder: `Search ${catalog.length} figures…`, spellcheck: 'false' });
    const listEl = h('div', { class: 'clist' });
    // every figure, grouped by game (no cap); the search narrows it down
    const sorted = catalog.slice().sort((a, b) => SKY.gameRank(a.id) - SKY.gameRank(b.id) || a.id - b.id || a.var - b.var);
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      const rows = sorted.filter(c => !q || c.name.toLowerCase().includes(q) || SKY.element(c.id).name.toLowerCase() === q || SKY.gameOf(c.id).toLowerCase().includes(q));
      const out = []; let lastGame = null;
      for (const c of rows) {
        const e = SKY.element(c.id), g = SKY.gameOf(c.id), top = g.split(' · ')[0];
        if (top !== lastGame) { lastGame = top; out.push(h('div', { class: 'cgroup' }, top)); }
        out.push(h('button', { class: 'crow', style: `--ec:${e.color}`, onclick: () => create(c) },
          glyph(SKY.elementKey(c.id), 'sm'), h('span', { class: 'cn' }, c.name), h('span', { class: 'cg' }, e.name + ' · ' + g)));
      }
      listEl.replaceChildren(...out);
      listEl.scrollTop = 0;
      if (!rows.length) listEl.append(h('div', { class: 'fempty' }, 'Nothing matches'));
    };
    input.addEventListener('input', draw);
    NEB.modal(h('div', { class: 'mbox wide' },
      h('h2', null, 'New figure'),
      h('p', { class: 'lead' }, 'Creates a blank save file for the figure in your collection. Search by name, element or game.'),
      input, listEl,
      h('div', { class: 'mfoot' }, h('button', { class: 'btn', onclick: () => NEB.closeModal() }, 'Close'))));
    draw(); setTimeout(() => input.focus(), 50);
  }

  async function create(c) {
    try {
      const r = await NEB.api('sky/create', { id: c.id, var: c.var });
      NEB.closeModal(); SFX.bind();
      st = await NEB.api('sky');
      const i = st.collection.findIndex(f => f.file === r.file);
      if (i >= 0) sel = i;
      render();
    } catch (e) { SFX.error(); NEB.toast(e.message); }
  }

  function openImport() {
    const input = h('input', { type: 'text', placeholder: 'C:\\Skylanders\\Spyro.sky', spellcheck: 'false' });
    const go2 = async () => {
      try {
        const r = await NEB.api('sky/import', { path: input.value.trim() });
        NEB.closeModal(); SFX.bind(); st = await NEB.api('sky');
        const i = st.collection.findIndex(f => f.file === r.file); if (i >= 0) sel = i;
        render();
      } catch (e) { SFX.error(); NEB.toast(e.message); }
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go2(); });
    NEB.modal(h('div', { class: 'mbox' },
      h('h2', null, 'Import a figure dump'),
      h('p', { class: 'lead' }, 'Path to a 1024-byte .sky, .bin, .dump or .dmp file from a real figure. It is copied into your collection folder.'),
      input,
      h('div', { class: 'mfoot' }, h('button', { class: 'btn', onclick: () => NEB.closeModal() }, 'Cancel'), h('button', { class: 'btn primary', onclick: go2 }, 'Import'))));
    setTimeout(() => input.focus(), 50);
  }

  /* ───────── rendering ───────── */
  let strip = null;

  function layout(animate) {
    if (!st || !root) return;
    const f = st.collection[sel];
    const sky = root.querySelector('.sky');
    if (sky && f) { sky.style.setProperty('--el', elOf(f).color); const t = document.getElementById('tint'); if (t) t.style.setProperty('--el', elOf(f).color); }
    if (strip) {
      [...strip.children].forEach((c, i) => {
        const o = i - sel, a = Math.abs(o);
        c.style.setProperty('--o', o);
        c.style.setProperty('--a', Math.min(a, 4));
        c.classList.toggle('on', o === 0);
        c.style.zIndex = 20 - a;
        c.style.visibility = a > 4 ? 'hidden' : '';
      });
    }
    const info = root.querySelector('.sky-info');
    if (info && f) fillInfo(info, f, animate);
  }

  function fillInfo(info, f, animate) {
    const e = elOf(f), at = onPortal(f.file);
    info.replaceChildren(
      h('div', { class: 'si-k' }, `${e.name} · ${SKY.gameOf(f.id)}`),
      h('h2', { class: 'si-n' }, f.name),
      h('div', { class: 'si-m' }, `${sel + 1} of ${st.collection.length}   ·   id ${f.id}  variant ${f.var}`),
      h('div', { class: 'si-b' },
        h('button', { class: 'btn primary', onclick: () => place() }, at >= 0 ? `Remove from portal (slot ${at + 1})` : 'Place on portal'),
        h('span', { class: 'hint' }, 'Enter')));
    if (animate) { info.classList.remove('swap'); void info.offsetWidth; info.classList.add('swap'); }
  }

  function render() {
    if (!root) return;
    const emu = st ? st.emulated : true;
    const head = h('div', { class: 'sky-head' },
      h('div', null, h('div', { class: 'eyebrow' }, 'Portal of Power'), h('h1', { class: 'ph' }, 'Skylanders')),
      h('div', { class: 'sky-tools' },
        h('div', { class: 'seg' },
          h('button', { class: emu ? 'on' : '', onclick: () => setMode(true) }, 'Emulated'),
          h('button', { class: !emu ? 'on' : '', onclick: () => setMode(false) }, 'Real portal')),
        emu ? [h('button', { class: 'btn', onclick: openCatalog }, '+ New figure'), h('button', { class: 'btn', onclick: openImport }, 'Import dump')] : null));

    let body;
    if (!st) {
      body = h('div', { class: 'empty' }, h('h2', null, 'Core not reachable'), h('p', { class: 'lead' }, 'Waiting for nebulator-core.'));
    } else if (!emu) {
      body = h('div', { class: 'empty real' },
        h('div', { class: 'ring big' }, glyph('neutral')),
        h('h2', null, 'Real portal mode'),
        h('p', { class: 'lead' }, 'Plug your Portal of Power into a USB port before you start the game. The game talks to the physical portal and your real figures; the emulated collection is switched off.'),
        h('p', { class: 'lead dim' }, 'Windows: the portal needs the WinUSB driver (the free Zadig tool installs it). Linux: a udev rule giving your user access to USB device 1430:0150. The change applies the next time a game starts.'));
    } else if (!st.collection.length) {
      body = h('div', { class: 'empty' },
        h('div', { class: 'ring big' }, glyph('water')),
        h('h2', null, 'No figures yet'),
        h('p', { class: 'lead' }, 'Make a blank figure from the catalog, or import a dump from a real one.'),
        h('div', null, h('button', { class: 'btn primary', onclick: openCatalog }, '+ New figure'), h('button', { class: 'btn', onclick: openImport }, 'Import dump')));
    } else {
      strip = h('div', { class: 'sky-strip' }, st.collection.map((f, i) => {
        const e = elOf(f);
        return h('button', { class: 'fig', style: `--ec:${e.color}`, onclick: () => { if (i === sel) place(); else { sel = i; SFX.select(); layout(true); } } },
          h('span', { class: 'ring' }, glyph(keyOf(f))),
          h('span', { class: 'fn' }, f.name),
          onPortal(f.file) >= 0 ? h('i', { class: 'live' }) : null);
      }));
      body = h('div', { class: 'sky-main' },
        h('button', { class: 'nav prev', 'aria-label': 'Previous', onclick: () => go(-1) }, '‹'),
        strip,
        h('button', { class: 'nav next', 'aria-label': 'Next', onclick: () => go(1) }, '›'),
        h('div', { class: 'sky-info' }));
    }

    const pads = h('div', { class: 'sky-portal' + (emu && st && st.collection.length ? '' : ' off') },
      h('div', { class: 'pl' }, 'Portal'),
      h('div', { class: 'pads' }, Array.from({ length: SLOTS }, (_, i) => {
        const s = st && st.slots[i], on = s && s.file;
        const e = on ? SKY.element(s.id) : null;
        return h('button', { class: 'pad' + (on ? ' on' : ''), 'data-slot': i, style: e ? `--pc:${e.color}` : '', title: on ? s.name + ' (click to remove)' : 'Empty slot ' + (i + 1),
          onclick: () => (on ? remove(i) : place(i)) },
          on ? glyph(SKY.elementKey(s.id)) : h('span', { class: 'pn' }, i + 1),
          h('span', { class: 'pname' }, on ? s.name : ''));
      })));

    const wrap = h('div', { class: 'sky' }, head, body, pads);
    root.replaceChildren(wrap);
    layout(false);
  }

  /* ───────── page lifecycle ───────── */
  function key(e) {
    if (!alive || document.body.classList.contains('modal-open')) return;
    const t = e.target; if (t && t.matches && t.matches('input,textarea,select')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') go(1);
    else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') go(-1);
    else if (e.key === 'Enter' || e.key === ' ') place();
    else if (e.key === 'Delete' || e.key === 'Backspace') { if (st && st.collection[sel]) { const at = onPortal(st.collection[sel].file); if (at >= 0) remove(at); } }
    else if (e.key === 'n' || e.key === 'N') { if (st && st.emulated) openCatalog(); }
    else return;
    e.preventDefault();
  }
  function padLoop() {
    if (!alive) return;
    const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(Boolean);
    if (gp && !document.body.classList.contains('modal-open')) {
      const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed), ax = gp.axes[0] || 0;
      const s = { l: b(14) || ax < -.6, r: b(15) || ax > .6, a: b(0), x: b(2) };
      if (s.l && !padPrev.l) go(-1);
      if (s.r && !padPrev.r) go(1);
      if (s.a && !padPrev.a) place();
      padPrev = s;
    }
    requestAnimationFrame(padLoop);
  }

  NEB.registerPage('skylanders', {
    show(el) {
      root = el; alive = true; strip = null;
      el.replaceChildren(h('div', { class: 'sky' }));
      document.body.classList.add('tint-on');
      addEventListener('keydown', key); cleanups.push(() => removeEventListener('keydown', key));
      load(); requestAnimationFrame(padLoop);
    },
    hide() { alive = false; root = null; strip = null; document.body.classList.remove('tint-on'); cleanups.splice(0).forEach(fn => fn()); },
  });
  NEB.on('online', () => { if (alive) load(); });
})();

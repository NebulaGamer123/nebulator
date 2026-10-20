/* Controls page: players 1-4, device setup, click-to-bind with sound, live button preview. */
(() => {
  'use strict';
  const { h } = NEB;

  // browser KeyboardEvent.code -> SDL key name understood by the core
  const CODE = {
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Enter: 'Return', Space: 'Space', Tab: 'Tab',
    ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Left Alt', AltRight: 'Right Alt',
    Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`',
  };
  const keyName = e => {
    const c = e.code;
    if (/^Key[A-Z]$/.test(c)) return c.slice(3);
    if (/^Digit[0-9]$/.test(c)) return c.slice(5);
    if (/^F([1-9]|1[0-2])$/.test(c)) return c;
    if (/^Numpad[0-9]$/.test(c)) return 'Keypad ' + c.slice(6);
    return CODE[c] || null;
  };

  const GROUPS = [['face', 'Face buttons'], ['shoulder', 'Shoulders & triggers'], ['dpad', 'D-pad'], ['lstick', 'Left stick'], ['rstick', 'Right stick'], ['system', 'System']];
  const TYPE_LABEL = { vpad: 'Wii U GamePad', pro: 'Pro Controller' };

  let root = null, ov = null, player = 0, listening = null, alive = false, seq = null, capTimer = 0, liveTimer = 0, busyCap = false;
  let pressed = new Set();

  async function load() {
    try { ov = await NEB.api('input'); } catch (e) { ov = null; NEB.toast('Controls: ' + e.message); }
    render();
  }

  const pl = () => ov && ov.players[player];
  const btns = () => (pl() && ov.buttons[pl().type]) || [];
  const devName = id => { const d = ov.devices.find(x => x.id === id); return d ? d.name : 'Unavailable device'; };

  /* ───────── listening / binding ───────── */
  function stopListening() {
    listening = null; seq = null; clearTimeout(capTimer); NEB.captureKeys = false; NEB.padBusy = false;
    paintRows();
  }
  function startListening(name, sequence) {
    if (!pl() || !pl().configured) return;
    listening = name; seq = sequence || null; NEB.captureKeys = true; NEB.padBusy = true;
    SFX.arm(); paintRows();
    const row = root && root.querySelector(`.brow[data-b="${name}"]`);
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    clearTimeout(capTimer); firstCapture = true; capLoop();
  }
  let firstCapture = true;
  async function capLoop() {
    if (!alive || !listening) return;
    const p = pl();
    const hasPad = p && p.devices.some(id => { const d = ov.devices.find(x => x.id === id); return d && d.kind === 'gamepad'; });
    if (hasPad && !busyCap) {
      busyCap = true;
      const name = listening;
      try {
        const r = await NEB.api('input/capture', { player, button: name, begin: firstCapture });
        firstCapture = false;
        if (r.captured && listening === name) bound(name, r.label);
      } catch { /* retry */ }
      busyCap = false;
    }
    capTimer = setTimeout(capLoop, 70);
  }

  function bound(name, label) {
    if (pl()) pl().bindings[name] = label;
    SFX.bind();
    const next = seq ? nextButton(name) : null;
    flash(name);
    if (next) { listening = next; firstCapture = true; SFX.arm(); paintRows(); const row = root.querySelector(`.brow[data-b="${next}"]`); if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    else stopListening();
    paintRows();
  }
  function nextButton(name) {
    const list = btns().map(b => b.name), i = list.indexOf(name);
    return i >= 0 && i + 1 < list.length ? list[i + 1] : null;
  }
  function flash(name) {
    for (const el of root.querySelectorAll(`[data-b="${name}"]`)) { el.classList.remove('flash'); void el.getBoundingClientRect(); el.classList.add('flash'); }
  }

  async function bindKey(name, key) {
    try {
      const r = await NEB.api('input/bind-key', { player, button: name, key });
      if (!pl().devices.some(id => id.startsWith('Keyboard|'))) await load();
      bound(name, r.label);
    } catch (e) { SFX.error(); NEB.toast(e.message); }
  }
  async function unbind(name) {
    try {
      await NEB.api('input/unbind', { player, button: name });
      pl().bindings[name] = ''; SFX.clear();
      if (listening === name && !seq) stopListening();
      paintRows();
    } catch (e) { SFX.error(); NEB.toast(e.message); }
  }

  function onKey(e) {
    if (!alive || document.body.classList.contains('modal-open')) return;
    if (!listening) return;
    e.preventDefault(); e.stopPropagation();
    if (e.repeat) return;
    if (e.key === 'Escape') { SFX.clear(); stopListening(); return; }
    if (e.key === 'Delete' || (e.key === 'Backspace' && e.shiftKey)) { unbind(listening); return; }
    const k = keyName(e);
    if (!k) { SFX.error(); NEB.toast('That key can\'t be used'); return; }
    bindKey(listening, k);
  }

  /* ───────── setup actions ───────── */
  async function setup(deviceId, type) {
    try { ov = await NEB.api('input/setup', { player, device: deviceId, type }); SFX.bind(); render(); }
    catch (e) { SFX.error(); NEB.toast(e.message); }
  }
  async function clearPlayer() {
    try { ov = await NEB.api('input/clear', { player }); SFX.clear(); stopListening(); render(); }
    catch (e) { SFX.error(); NEB.toast(e.message); }
  }

  /* ───────── diagram ───────── */
  const NS = 'http://www.w3.org/2000/svg';
  function diagram() {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 440 270'); s.setAttribute('class', 'pad-svg');
    const el = (tag, attrs, b) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (b) { e.dataset.b = b; e.setAttribute('class', 'hot'); } return e; };
    const txt = (x, y, t) => { const e = el('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'dl' }); e.textContent = t; return e; };
    s.append(el('path', { d: 'M70 70h300q50 0 62 60l14 90q4 34-28 30-22-2-34-30l-14-30H160l-14 30q-12 28-34 30-32 4-28-30l14-90q12-60 62-60z', class: 'shell' }));
    // shoulders
    s.append(el('rect', { x: 58, y: 28, width: 70, height: 20, rx: 6 }, 'ZL'), txt(93, 38, 'ZL'));
    s.append(el('rect', { x: 312, y: 28, width: 70, height: 20, rx: 6 }, 'ZR'), txt(347, 38, 'ZR'));
    s.append(el('rect', { x: 62, y: 52, width: 78, height: 14, rx: 6 }, 'L'), txt(101, 59, 'L'));
    s.append(el('rect', { x: 300, y: 52, width: 78, height: 14, rx: 6 }, 'R'), txt(339, 59, 'R'));
    // left stick + dpad
    s.append(el('circle', { cx: 100, cy: 108, r: 26, class: 'well' }), el('circle', { cx: 100, cy: 108, r: 15 }, 'LClick'));
    [['LUp', 100, 78], ['LDown', 100, 138], ['LLeft', 70, 108], ['LRight', 130, 108]].forEach(([b, x, y]) => s.append(el('circle', { cx: x, cy: y, r: 5, class: 'dot' }, b)));
    s.append(el('rect', { x: 128, y: 150, width: 18, height: 18, rx: 3 }, 'Up'), el('rect', { x: 128, y: 190, width: 18, height: 18, rx: 3 }, 'Down'),
      el('rect', { x: 106, y: 170, width: 18, height: 18, rx: 3 }, 'Left'), el('rect', { x: 150, y: 170, width: 18, height: 18, rx: 3 }, 'Right'));
    // right stick
    s.append(el('circle', { cx: 290, cy: 190, r: 26, class: 'well' }), el('circle', { cx: 290, cy: 190, r: 15 }, 'RClick'));
    [['RUp', 290, 160], ['RDown', 290, 220], ['RLeft', 260, 190], ['RRight', 320, 190]].forEach(([b, x, y]) => s.append(el('circle', { cx: x, cy: y, r: 5, class: 'dot' }, b)));
    // face
    [['X', 342, 82], ['B', 342, 126], ['Y', 320, 104], ['A', 364, 104]].forEach(([b, x, y]) => s.append(el('circle', { cx: x, cy: y, r: 13 }, b), txt(x, y, b)));
    // system
    s.append(el('circle', { cx: 186, cy: 100, r: 8 }, 'Minus'), txt(186, 100, '−'), el('circle', { cx: 254, cy: 100, r: 8 }, 'Plus'), txt(254, 100, '+'), el('circle', { cx: 220, cy: 124, r: 9 }, 'Home'));
    s.addEventListener('click', e => { const t = e.target.closest('[data-b]'); if (t) { SFX.select(); startListening(t.dataset.b); } });
    return s;
  }

  /* ───────── rendering ───────── */
  function paintRows() {
    if (!root) return;
    const p = pl();
    for (const row of root.querySelectorAll('.brow')) {
      const n = row.dataset.b, label = p && p.bindings ? p.bindings[n] : '';
      row.classList.toggle('listen', listening === n);
      row.classList.toggle('down', pressed.has(n));
      const cap = row.querySelector('.cap');
      cap.textContent = listening === n ? 'press a key or button…' : (label || '—');
      cap.classList.toggle('empty', !label && listening !== n);
      row.querySelector('.x').style.visibility = label && listening !== n ? '' : 'hidden';
    }
    for (const n of root.querySelectorAll('.pad-svg [data-b]')) {
      n.classList.toggle('listen', listening === n.dataset.b);
      n.classList.toggle('down', pressed.has(n.dataset.b));
      n.classList.toggle('bound', !!(p && p.bindings && p.bindings[n.dataset.b]));
    }
    const bar = root.querySelector('.cbar');
    if (bar) bar.classList.toggle('on', !!listening);
  }

  function render() {
    if (!root) return;
    if (!ov) { root.replaceChildren(h('div', { class: 'pg' }, h('div', { class: 'empty' }, h('h2', null, 'Core not reachable')))); return; }
    const p = pl();

    const tabs = h('div', { class: 'ptabs' }, ov.players.map(q => h('button', {
      class: 'ptab' + (q.index === player ? ' on' : ''),
      onclick: () => { stopListening(); player = q.index; SFX.tab(); render(); },
    }, h('i', { class: 'led' + (q.configured ? ' lit' : '') }), 'Player ' + (q.index + 1))));

    let side, main;
    if (!p.configured) {
      side = h('div', { class: 'cside' },
        h('h2', { class: 'ch' }, 'Player ' + (player + 1)),
        h('p', { class: 'lead' }, 'Pick the device this player uses. Defaults are filled in, and you can rebind anything after.'),
        ov.devices.map(d => h('button', { class: 'dev', onclick: () => setup(d.id, player < 2 && d.kind === 'keyboard' ? 'pro' : 'pro') },
          h('span', { class: 'dk' }, d.kind === 'keyboard' ? '⌨' : '◉'), h('span', null, d.name), h('span', { class: 'hint' }, d.kind === 'keyboard' ? 'Keyboard' : 'Gamepad'))),
        ov.devices.every(d => d.kind === 'keyboard') ? h('p', { class: 'lead dim' }, 'No gamepad found. Plug one in and it shows up here.') : null,
        player > 0 ? h('p', { class: 'lead dim' }, 'Keyboard defaults only exist for player 1. Others need their keys bound by hand.') : null);
      main = h('div', { class: 'cmain idle' }, h('div', { class: 'ring big' }, h('span', { class: 'glyph', innerHTML: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M6 8h12a4 4 0 0 1 4 4l.5 4a2.5 2.5 0 0 1-4.5 1.5L16.5 15h-9L6 17.5A2.5 2.5 0 0 1 1.5 16L2 12a4 4 0 0 1 4-4zM8 10.5v3M6.5 12h3M16 11h.01M18 13h.01"/></svg>' })),
        h('h2', null, 'Not set up'), h('p', { class: 'lead' }, 'This player has no controller yet.'));
    } else {
      const type = p.type;
      side = h('div', { class: 'cside' },
        h('h2', { class: 'ch' }, 'Player ' + (player + 1)),
        h('div', { class: 'kv' }, h('span', null, 'Device'), h('b', null, p.devices.map(devName).join(' + ') || 'None')),
        h('div', { class: 'kv' }, h('span', null, 'Layout'),
          h('div', { class: 'seg' }, ['pro', 'vpad'].map(t => h('button', {
            class: t === type ? 'on' : '', disabled: t === 'vpad' && player > 1,
            onclick: () => { if (t !== type) setup(p.devices[0], t); },
          }, TYPE_LABEL[t])))),
        h('div', { class: 'cbtns' },
          h('button', { class: 'btn primary', onclick: () => startListening(btns()[0].name, true) }, 'Bind all'),
          h('button', { class: 'btn', onclick: () => setup(p.devices[0], type) }, 'Reset to defaults'),
          h('button', { class: 'btn danger', onclick: clearPlayer }, 'Remove')),
        h('div', { class: 'cbar' }, h('b', null, 'Listening'), ' Press a key or a gamepad button. ', h('kbd', null, 'Esc'), ' cancel   ', h('kbd', null, 'Shift+Del'), ' clear'),
        h('p', { class: 'lead dim' }, 'Keyboard and gamepad bindings can be mixed on one player. Changes save instantly and also apply to a running game.'),
        h('div', { class: 'devs' }, ov.devices.filter(d => !p.devices.includes(d.id)).map(d => h('button', { class: 'dev slim', onclick: () => setup(d.id, type) }, 'Switch to ', d.name))));

      const groups = GROUPS.map(([g, title]) => {
        const rows = btns().filter(b => b.group === g);
        if (!rows.length) return null;
        return h('div', { class: 'bgrp' }, h('h3', null, title), rows.map(b => h('div', { class: 'brow', 'data-b': b.name, tabindex: 0,
          onclick: () => { SFX.select(); startListening(b.name); },
          onkeydown: e => { if (!listening && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); startListening(b.name); } } },
          h('span', { class: 'bl' }, g === 'lstick' || g === 'rstick' ? b.label : b.label), h('span', { class: 'cap' }, '—'),
          h('button', { class: 'x', title: 'Clear', onclick: e => { e.stopPropagation(); unbind(b.name); } }, '×'))));
      });
      main = h('div', { class: 'cmain' }, h('div', { class: 'cdiag' }, diagram()), h('div', { class: 'bgrid' }, groups));
    }

    root.replaceChildren(h('div', { class: 'pg controls' },
      h('div', { class: 'ph-row' }, h('div', null, h('div', { class: 'eyebrow' }, 'Input'), h('h1', { class: 'ph' }, 'Controls')), tabs),
      h('div', { class: 'cgrid' }, side, main)));
    paintRows();
  }

  function liveLoop() {
    clearTimeout(liveTimer);
    if (!alive) return;
    if (!listening && pl() && pl().configured && !document.body.classList.contains('modal-open')) {
      NEB.api('input/state?player=' + player).then(r => {
        const next = new Set(r.down);
        if (next.size !== pressed.size || [...next].some(x => !pressed.has(x))) { pressed = next; paintRows(); }
      }).catch(() => {}).finally(() => { liveTimer = setTimeout(liveLoop, 90); });
    } else liveTimer = setTimeout(liveLoop, 150);
  }

  NEB.registerPage('controls', {
    show(el) {
      root = el; alive = true; listening = null; pressed = new Set();
      addEventListener('keydown', onKey, true);
      el.replaceChildren(h('div', { class: 'pg' }));
      load().then(liveLoop);
    },
    hide() { alive = false; root = null; stopListening(); removeEventListener('keydown', onKey, true); clearTimeout(liveTimer); },
  });
  NEB.on('online', () => { if (alive) load(); });
})();

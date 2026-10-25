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
  let joinTimer = 0, devTimer = 0, joinBusy = false, joinBegin = true, autoJoin = true, devSig = '';
  let pressed = new Set();

  async function load() {
    try { ov = await NEB.api('input'); devSig = devSigOf(ov); } catch (e) { ov = null; NEB.toast('Controls: ' + e.message); }
    joinBegin = true; render();
  }

  const pl = () => ov && ov.players[player];
  const btns = () => (pl() && ov.buttons[pl().type]) || [];
  const devName = id => { const d = ov.devices.find(x => x.id === id); return d ? d.name : 'Unavailable device'; };


  /* ───────── local multiplayer: hot-plug refresh + press-a-button-to-join ───────── */
  const freeSlot = () => ov ? ov.players.findIndex(q => !q.configured) : -1;
  const devSigOf = o => o.devices.map(d => d.id).join(',') + '|' + (o.unsupported || []).join(',');

  async function refreshDevices() {
    clearTimeout(devTimer);
    if (!alive) return;
    try {
      const o = await NEB.api('input/devices');
      if (ov && devSigOf(o) !== devSig) {
        const added = o.devices.filter(d => d.kind === 'gamepad' && !ov.devices.some(x => x.id === d.id));
        devSig = devSigOf(o);
        ov.devices = o.devices; ov.unsupported = o.unsupported; ov.generic = o.generic;
        if (added.length) NEB.toast(added[0].name + ' connected');
        if (!listening) render();
      }
    } catch { /* offline */ }
    devTimer = setTimeout(refreshDevices, 1500);
  }

  async function joinLoop() {
    clearTimeout(joinTimer);
    if (!alive) return;
    if (autoJoin && !listening && !joinBusy && ov && freeSlot() >= 0 && !document.body.classList.contains('modal-open')) {
      joinBusy = true;
      try {
        const r = await NEB.api('input/detect', { begin: joinBegin });
        joinBegin = false;
        if (r.found) {
          const slot = freeSlot();
          ov = await NEB.api('input/join', { device: r.device, player: slot });
          devSig = devSigOf(ov);
          player = slot; SFX.bind(); NEB.toast(r.name + ' joined as Player ' + (slot + 1));
          joinBegin = true; render();
        }
      } catch { /* retry */ }
      joinBusy = false;
    }
    joinTimer = setTimeout(joinLoop, 120);
  }

  function slotsBar() {
    const free = freeSlot();
    const chips = ov.players.map(q => {
      const names = q.configured ? q.devices.map(devName).join(' + ') : '';
      return h('button', { class: 'pslot' + (q.configured ? ' on' : '') + (q.index === player ? ' sel' : ''), onclick: () => { stopListening(); player = q.index; SFX.tab(); render(); } },
        h('span', { class: 'pn' }, 'P' + (q.index + 1)), h('span', { class: 'pd' }, q.configured ? names : 'Press a button to join'));
    });
    const notes = [];
    if (ov.unsupported && ov.unsupported.length) notes.push(h('p', { class: 'pnote warn' }, 'Detected but not usable as a gamepad: ' + ov.unsupported.join(', ') + '. Try plugging it in by cable, or pairing it again in Windows Bluetooth settings.'));
    if (ov.generic && ov.generic.length) notes.push(h('p', { class: 'pnote' }, ov.generic.join(', ') + ' runs on a generic layout. If buttons are off, use Bind all.'));
    return h('div', { class: 'pbar' },
      h('div', { class: 'pslots' }, chips),
      h('div', { class: 'pjoin' },
        free >= 0
          ? h('span', null, h('i', { class: 'pulse' }), autoJoin ? 'Press any button on a controller to add it as ' : 'Auto-join is off. Next free slot: ', h('b', null, 'Player ' + (free + 1)))
          : h('span', null, 'All four players are set up'),
        h('button', { class: 'btn slim', onclick: () => { autoJoin = !autoJoin; joinBegin = true; SFX.select(); render(); } }, autoJoin ? 'Pause auto-join' : 'Resume auto-join')),
      notes);
  }

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
    s.setAttribute('viewBox', '0 0 480 290'); s.setAttribute('class', 'pad-svg');
    const el = (tag, attrs, b) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (b) { e.dataset.b = b; e.setAttribute('class', 'hot'); } return e; };
    const txt = (x, y, t, cls) => { const e = el('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: cls || 'dl' }); e.textContent = t; return e; };
    // body: symmetric pro-controller silhouette with two grips
    s.append(el('path', { d: 'M110 68H370C402 68 416 84 424 118L446 214C452 248 436 264 414 264C394 264 382 252 374 238L362 222C357 215 351 212 343 212H137C129 212 123 215 118 222L106 238C98 252 86 264 66 264C44 264 28 248 34 214L56 118C64 84 78 68 110 68Z', class: 'shell' }));
    s.append(el('path', { d: 'M137 212H343', class: 'seam' }));
    // triggers and bumpers
    s.append(el('rect', { x: 66, y: 16, width: 96, height: 24, rx: 9 }, 'ZL'), txt(114, 28, 'ZL'));
    s.append(el('rect', { x: 318, y: 16, width: 96, height: 24, rx: 9 }, 'ZR'), txt(366, 28, 'ZR'));
    s.append(el('rect', { x: 70, y: 46, width: 100, height: 16, rx: 8 }, 'L'), txt(120, 54, 'L'));
    s.append(el('rect', { x: 310, y: 46, width: 100, height: 16, rx: 8 }, 'R'), txt(360, 54, 'R'));
    // left stick (click + four directions)
    s.append(el('circle', { cx: 118, cy: 116, r: 30, class: 'well' }), el('circle', { cx: 118, cy: 116, r: 18 }, 'LClick'));
    [['LUp', 118, 80], ['LDown', 118, 152], ['LLeft', 82, 116], ['LRight', 154, 116]].forEach(([b, x, y]) => s.append(el('circle', { cx: x, cy: y, r: 5.5, class: 'dot' }, b)));
    // d-pad
    [['Up', 178, 150, '▲'], ['Down', 178, 194, '▼'], ['Left', 156, 172, '◀'], ['Right', 200, 172, '▶']].forEach(([b, x, y, g]) =>
      s.append(el('rect', { x: x - 11, y: y - 11, width: 22, height: 22, rx: 5 }, b), txt(x, y + .5, g, 'dl sm')));
    // right stick
    s.append(el('circle', { cx: 302, cy: 168, r: 30, class: 'well' }), el('circle', { cx: 302, cy: 168, r: 18 }, 'RClick'));
    [['RUp', 302, 134], ['RDown', 302, 202], ['RLeft', 268, 168], ['RRight', 336, 168]].forEach(([b, x, y]) => s.append(el('circle', { cx: x, cy: y, r: 5.5, class: 'dot' }, b)));
    // face buttons
    [['X', 362, 88], ['B', 362, 136], ['Y', 338, 112], ['A', 386, 112]].forEach(([b, x, y]) => s.append(el('circle', { cx: x, cy: y, r: 13 }, b), txt(x, y + .5, b)));
    // system buttons
    s.append(el('circle', { cx: 212, cy: 100, r: 9 }, 'Minus'), txt(212, 100, '−'), el('circle', { cx: 268, cy: 100, r: 9 }, 'Plus'), txt(268, 100, '+'), el('circle', { cx: 240, cy: 134, r: 11 }, 'Home'), txt(240, 134.5, '⌂', 'dl sm'));
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
        [...ov.devices].sort((a, b) => (a.kind === 'gamepad' ? 0 : 1) - (b.kind === 'gamepad' ? 0 : 1)).map(d => h('button', { class: 'dev', onclick: () => setup(d.id, 'pro') },
          h('span', { class: 'dk' }, d.kind === 'keyboard' ? '⌨' : '◉'), h('span', null, d.name), h('span', { class: 'hint' }, d.kind === 'keyboard' ? 'Keyboard' : 'Gamepad'))),
        ov.devices.every(d => d.kind === 'keyboard') ? h('p', { class: 'lead dim' }, 'No controller found yet. Turn it on or plug it in and it appears here by itself. You can also just press a button on it.') : null,
        player === 0 ? h('p', { class: 'lead dim' }, 'Keyboard: WASD moves, arrow keys are the d-pad, X Z C V are A B X Y.') : null,
        player === 1 ? h('p', { class: 'lead dim' }, 'Keyboard for player 2 (shares one keyboard with player 1): arrow keys move, numpad 4 2 6 8 are X B A Y, T F G H is the d-pad.') : null,
        player > 1 ? h('p', { class: 'lead dim' }, 'Keyboard defaults only exist for players 1 and 2. Use controllers for players 3 and 4.') : null);
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
      slotsBar(),
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
      load().then(() => { liveLoop(); refreshDevices(); joinLoop(); });
    },
    hide() { alive = false; root = null; stopListening(); removeEventListener('keydown', onKey, true); clearTimeout(liveTimer); clearTimeout(joinTimer); clearTimeout(devTimer); },
  });
  NEB.on('online', () => { if (alive) load(); });
})();

/* Co-op page: host a game for friends on the same Wi-Fi, or join one. Joining opens a live view that shows the host's
   picture, plays its sound and sends this computer's keyboard / gamepad to the host as player 2-4. */
(() => {
  'use strict';
  const { h } = NEB;

  // bit i = Pro Controller button (i + 1): A B X Y L R ZL ZR + - Home Up Down Left Right L3 R3
  const BIT = { A: 0, B: 1, X: 2, Y: 3, L: 4, R: 5, ZL: 6, ZR: 7, PLUS: 8, MINUS: 9, HOME: 10, UP: 11, DOWN: 12, LEFT: 13, RIGHT: 14, L3: 15, R3: 16 };
  const KEYMAP = {
    KeyL: 'A', KeyK: 'B', KeyI: 'X', KeyJ: 'Y', KeyQ: 'L', KeyE: 'R', KeyZ: 'ZL', KeyX: 'ZR',
    Enter: 'PLUS', Backspace: 'MINUS', KeyH: 'RIGHT', KeyF: 'LEFT', KeyT: 'UP', KeyG: 'DOWN', KeyV: 'L3', KeyN: 'R3',
  };
  const STICK = { KeyW: ['ly', -1], KeyS: ['ly', 1], KeyA: ['lx', -1], KeyD: ['lx', 1], ArrowUp: ['ry', -1], ArrowDown: ['ry', 1], ArrowLeft: ['rx', -1], ArrowRight: ['rx', 1] };
  // standard gamepad layout -> Wii U Pro buttons (bottom face button is B on Nintendo pads)
  const PADMAP = { 0: 'B', 1: 'A', 2: 'Y', 3: 'X', 4: 'L', 5: 'R', 6: 'ZL', 7: 'ZR', 8: 'MINUS', 9: 'PLUS', 10: 'L3', 11: 'R3', 12: 'UP', 13: 'DOWN', 14: 'LEFT', 15: 'RIGHT', 16: 'HOME' };

  let root = null, alive = false, st = null, sig = '', timer = 0;
  let found = [], scanning = false, scanned = false;
  const form = { name: '', ip: '', code: '', hostName: '' };
  try { form.name = localStorage.getItem('neb.coopName') || ''; form.hostName = form.name; } catch { /* storage blocked */ }

  const sigOf = s => !s ? 'off' : JSON.stringify([s.role, s.ip, s.host.running, s.host.code, s.host.quality, s.host.fps, s.host.maxWidth, s.host.test,
    (s.host.guests || []).map(g => [g.slot, g.name]), s.guest.state, s.guest.message, s.guest.slot]);

  async function poll() {
    clearTimeout(timer);
    if (!alive && !view.on) return;
    try { st = await NEB.api('coop/status'); } catch { st = null; }
    guestSync();
    const s = sigOf(st);
    if (alive && s !== sig) { sig = s; render(); } else paintLive();
    timer = setTimeout(poll, view.on ? 1000 : 1200);
  }

  const post = async (path, body) => {
    try { st = await NEB.api('coop/' + path, body || {}); sig = ''; guestSync(); await poll(); return true; }
    catch (e) { NEB.toast(e.message); await poll(); return false; }
  };

  async function scan() {
    if (scanning) return;
    scanning = true; scanned = false; if (alive) render();
    try { found = (await NEB.api('coop/discover')).hosts || []; } catch { found = []; }
    scanning = false; scanned = true; if (alive) render();
  }

  /* ───────── page ───────── */
  const card = (title, sub, ...kids) => h('div', { class: 'cp-card' }, h('h2', null, title), sub ? h('p', { class: 'lead dim' }, sub) : null, ...kids);
  const field = (label, input) => h('label', { class: 'cp-field' }, h('span', { class: 'hint' }, label), input);
  const textIn = (key, ph, opt = {}) => h('input', { type: 'text', value: form[key], placeholder: ph, maxlength: opt.max || 32, autocomplete: 'off', spellcheck: 'false',
    oninput: e => { form[key] = opt.upper ? (e.target.value = e.target.value.toUpperCase()) : e.target.value; if (key === 'name' || key === 'hostName') { try { localStorage.setItem('neb.coopName', form[key]); } catch { /* ignore */ } } },
    onkeydown: e => { if (e.key === 'Enter' && opt.enter) opt.enter(); } });
  const seg = (opts, val, fn) => h('div', { class: 'seg' }, opts.map(([v, label]) =>
    h('button', { class: String(v) === String(val) ? 'on' : '', onclick: e => { SFX.select(); fn(v); [...e.currentTarget.parentNode.children].forEach(c => c.classList.toggle('on', c === e.currentTarget)); } }, label)));

  function hostPanel() {
    const hs = st.host;
    if (!hs.running) {
      return card('Host a game', 'Friends on your Wi-Fi join your game as player 2, 3 or 4. The game runs on this PC; they only need NEBULATOR.',
        field('Your name (shown to friends)', textIn('hostName', 'e.g. Harrold', { max: 24 })),
        h('button', { class: 'btn primary', onclick: () => post('host/start', { name: form.hostName }) }, 'Start hosting'),
        h('p', { class: 'lead dim' }, 'The first time, Windows may ask to allow NEBULATOR on your network. Choose Private networks.'));
    }
    const guests = hs.guests || [];
    return card('You are hosting', 'Tell your friends this code. Then start a game from the Wii U shelf; they appear as the next player.',
      h('div', { class: 'cp-code', title: 'Join code' }, [...hs.code].map(c => h('b', null, c))),
      h('p', { class: 'lead mono' }, 'This PC: ' + (st.ip || 'unknown') + (hs.test ? '   (test pattern mode)' : '')),
      h('h3', { class: 'cp-h3' }, 'Players'),
      h('div', { class: 'cp-guests' },
        h('div', { class: 'cp-g' }, h('b', null, 'Player 1'), h('span', null, 'You (host)'), h('span', { class: 'hint' }, ' ')),
        guests.length ? guests.map(g => h('div', { class: 'cp-g' }, h('b', null, 'Player ' + (g.slot + 1)), h('span', null, g.name),
          h('span', { class: 'hint', 'data-ping': g.slot }, '— ms'), h('button', { class: 'x', title: 'Remove', onclick: () => post('host/kick', { slot: g.slot }) }, '×')))
          : h('p', { class: 'lead dim' }, 'Waiting for friends to join…')),
      h('h3', { class: 'cp-h3' }, 'Stream quality'),
      h('div', { class: 'cp-opts' },
        h('div', null, h('span', { class: 'hint' }, 'Picture size'), seg([[480, 'Small'], [640, 'Normal'], [854, 'Sharp']], hs.maxWidth, v => post('host/settings', { maxWidth: +v }))),
        h('div', null, h('span', { class: 'hint' }, 'Smoothness'), seg([[20, '20 fps'], [30, '30 fps'], [60, '60 fps']], hs.fps, v => post('host/settings', { fps: +v }))),
        h('div', null, h('span', { class: 'hint' }, 'Compression'), seg([[40, 'Light'], [60, 'Balanced'], [80, 'Crisp']], hs.quality, v => post('host/settings', { quality: +v })))),
      h('p', { class: 'lead dim' }, 'Lower the size or smoothness if a friend’s picture stutters. Your own game is never affected by these.'),
      h('button', { class: 'btn danger', onclick: () => post('host/stop') }, 'Stop hosting'));
  }

  function joinPanel() {
    const g = st.guest;
    const hostList = scanning ? h('p', { class: 'lead dim' }, 'Looking for games on your Wi-Fi…')
      : found.length ? h('div', { class: 'cp-found' }, found.map(f => h('button', { class: 'cp-host' + (form.ip === f.ip ? ' on' : ''), onclick: () => { SFX.select(); form.ip = f.ip; render(); } },
        h('b', null, f.name || 'NEBULATOR host'), h('span', null, f.title ? NEB.firstLine(f.title) : 'In the menu'), h('span', { class: 'hint' }, f.ip + ' · ' + f.freeSlots + ' open'))))
      : h('p', { class: 'lead dim' }, scanned ? 'No games found. Check that you are on the same Wi-Fi and that your friend is hosting, or type their address below.' : 'Press Search to look for friends hosting on your Wi-Fi.');
    const joining = g.state === 'connecting';
    return card('Join a friend', 'You do not need the game. You will see and hear your friend’s game and play with your keyboard or controller.',
      h('div', { class: 'cp-row' }, h('button', { class: 'btn', onclick: scan }, scanning ? 'Searching…' : 'Search'), h('span', { class: 'hint' }, 'Same Wi-Fi only')),
      hostList,
      field('Host address', textIn('ip', 'e.g. 192.168.1.23', { max: 45 })),
      field('Join code', textIn('code', 'ABCDE', { max: 8, upper: true, enter: doJoin })),
      field('Your name', textIn('name', 'e.g. Sam', { max: 24 })),
      g.state === 'error' && g.message ? h('p', { class: 'lead cp-err' }, g.message) : null,
      h('button', { class: 'btn primary', disabled: joining, onclick: doJoin }, joining ? 'Connecting…' : 'Join'));
  }

  function doJoin() {
    if (!form.ip.trim()) return NEB.toast('Pick a host above or type its address');
    if (!form.code.trim()) return NEB.toast('Type the join code');
    startAudio(); // inside the click, so the browser allows sound
    post('join', { host: form.ip.trim(), code: form.code.trim(), name: form.name.trim() || 'Guest' });
  }

  function render() {
    if (!root) return;
    if (!st) { root.replaceChildren(h('div', { class: 'pg' }, h('div', { class: 'empty' }, h('h2', null, 'Co-op needs the NEBULATOR core'), h('p', { class: 'lead' }, 'Open NEBULATOR from the launcher.')))); return; }
    const hosting = st.host.running, joined = st.role === 'guest' && st.guest.state === 'connected';
    root.replaceChildren(h('div', { class: 'pg coop' },
      h('div', { class: 'ph-row' }, h('div', null, h('div', { class: 'eyebrow' }, 'Play together'), h('h1', { class: 'ph' }, 'Co-op'))),
      h('p', { class: 'lead' }, 'Host a game for friends on the same Wi-Fi, or join theirs. Every game’s normal 2-player mode just works: your friends show up as the next controllers.'),
      h('div', { class: 'cp-cols' }, hosting || !joined ? hostPanel() : null, hosting ? null : joinPanel())));
    paintLive();
  }

  function paintLive() {
    if (!root || !st) return;
    (st.host.guests || []).forEach(g => { const el = root.querySelector(`[data-ping="${g.slot}"]`); if (el) el.textContent = g.pingMs >= 0 ? g.pingMs + ' ms' : '— ms'; });
    if (view.on && view.hud && st.guest) view.hud.textContent = `Player ${st.guest.slot + 1} · ${st.guest.pingMs >= 0 ? st.guest.pingMs + ' ms' : '… ms'} · ${st.guest.fps} fps`;
  }

  /* ───────── guest live view ───────── */
  const view = { on: false, el: null, hud: null, down: new Set(), axes: { lx: 0, ly: 0, rx: 0, ry: 0 }, padB: 0, padAx: [0, 0, 0, 0], sent: '', busy: false, dirty: false, raf: 0, ac: null, next: 0, abort: null };

  function inputState() {
    let b = view.padB;
    const ax = { ...view.axes };
    view.down.forEach(code => { if (KEYMAP[code]) b |= 1 << BIT[KEYMAP[code]]; });
    let kx = 0, ky = 0, rx = 0, ry = 0;
    view.down.forEach(code => { const s = STICK[code]; if (!s) return; if (s[0] === 'lx') kx += s[1]; if (s[0] === 'ly') ky += s[1]; if (s[0] === 'rx') rx += s[1]; if (s[0] === 'ry') ry += s[1]; });
    const pick = (a, p) => Math.abs(p) > Math.abs(a) ? p : a;
    ax.lx = Math.round(127 * pick(kx, view.padAx[0])); ax.ly = Math.round(127 * pick(ky, view.padAx[1]));
    ax.rx = Math.round(127 * pick(rx, view.padAx[2])); ax.ry = Math.round(127 * pick(ry, view.padAx[3]));
    return { b, ...ax };
  }
  async function pushInput() {
    const s = inputState(), key = JSON.stringify(s);
    if (key === view.sent) return;
    if (view.busy) { view.dirty = true; return; }
    view.sent = key; view.busy = true;
    try { await NEB.api('coop/input', s); } catch { /* the status poll reports a dropped session */ }
    view.busy = false;
    if (view.dirty) { view.dirty = false; pushInput(); }
  }
  function pollPad() {
    if (!view.on) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let b = 0, a = [0, 0, 0, 0];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      p.buttons.forEach((btn, i) => { if (btn.pressed && PADMAP[i]) b |= 1 << BIT[PADMAP[i]]; });
      const dz = v => Math.abs(v) < .18 ? 0 : v;
      a = [dz(p.axes[0] || 0), dz(p.axes[1] || 0), dz(p.axes[2] || 0), dz(p.axes[3] || 0)];
      break;
    }
    if (b !== view.padB || a.some((v, i) => v !== view.padAx[i])) { view.padB = b; view.padAx = a; pushInput(); }
    view.raf = requestAnimationFrame(pollPad);
  }
  const onKeyDown = e => {
    if (!view.on) return;
    if (e.code === 'F11') return;
    e.preventDefault(); e.stopPropagation();
    if (e.code === 'Escape') { if (!e.repeat) toggleMenu(); return; }
    if (e.repeat) return;
    view.down.add(e.code); pushInput();
  };
  const onKeyUp = e => { if (!view.on) return; e.preventDefault(); e.stopPropagation(); view.down.delete(e.code); pushInput(); };
  const onBlur = () => { view.down.clear(); view.padB = 0; pushInput(); };

  function toggleMenu() { if (view.menu) view.menu.classList.toggle('show'); }

  function startAudio() {
    try {
      if (!view.ac) view.ac = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000, latencyHint: 'interactive' });
      if (view.ac.state === 'suspended') view.ac.resume();
    } catch { view.ac = null; }
  }
  async function audioLoop() {
    if (!view.ac) return;
    const ctl = view.abort = new AbortController();
    try {
      const r = await fetch('/api/coop/audio?t=' + encodeURIComponent(NEB.token || ''), { signal: ctl.signal });
      const rd = r.body.getReader();
      let rest = new Uint8Array(0);
      for (;;) {
        const { value, done } = await rd.read();
        if (done) break;
        const buf = new Uint8Array(rest.length + value.length); buf.set(rest); buf.set(value, rest.length);
        const n = buf.length - (buf.length % 4); rest = buf.slice(n);
        if (!n) continue;
        const frames = n / 4, s16 = new Int16Array(buf.buffer.slice(0, n)), ab = view.ac.createBuffer(2, frames, 48000);
        const L = ab.getChannelData(0), R = ab.getChannelData(1);
        for (let i = 0; i < frames; i++) { L[i] = s16[2 * i] / 32768; R[i] = s16[2 * i + 1] / 32768; }
        const now = view.ac.currentTime;
        if (view.next < now + .02) view.next = now + .05;       // fell behind: re-prime a small cushion
        else if (view.next > now + .2) continue;               // too far ahead: drop to stay in sync with the picture
        const src = view.ac.createBufferSource(); src.buffer = ab; src.connect(view.ac.destination); src.start(view.next); view.next += ab.duration;
      }
    } catch { /* closed on leave */ }
  }

  function enterView() {
    if (view.on) return;
    view.on = true; NEB.captureKeys = true; NEB.padBusy = true;
    document.body.classList.add('coop-view');
    const img = h('img', { class: 'cv-img', alt: '', draggable: 'false', src: '/api/coop/stream?t=' + encodeURIComponent(NEB.token || '') });
    view.hud = h('div', { class: 'cv-hud' }, 'Connecting…');
    view.menu = h('div', { class: 'cv-menu' },
      h('h2', null, 'Co-op'),
      h('p', { class: 'lead dim' }, 'Keys: WASD left stick · arrows right stick · L/K/I/J = A/B/X/Y · Q/E shoulders · Z/X triggers · T/F/G/H d-pad · Enter + · Backspace −. A gamepad works too.'),
      h('button', { class: 'btn', onclick: () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); } }, 'Fullscreen'),
      h('button', { class: 'btn', onclick: toggleMenu }, 'Back to game'),
      h('button', { class: 'btn danger', onclick: () => post('leave') }, 'Leave game'));
    view.el = h('div', { class: 'cv' }, img, view.hud, h('button', { class: 'cv-btn', title: 'Menu (Esc)', onclick: toggleMenu }, 'Menu'), view.menu);
    document.body.appendChild(view.el);
    addEventListener('keydown', onKeyDown, true); addEventListener('keyup', onKeyUp, true); addEventListener('blur', onBlur);
    view.sent = ''; view.padB = 0; view.padAx = [0, 0, 0, 0]; view.down.clear();
    pushInput(); view.raf = requestAnimationFrame(pollPad); audioLoop();
  }
  function leaveView() {
    if (!view.on) return;
    view.on = false; NEB.captureKeys = false; NEB.padBusy = false;
    document.body.classList.remove('coop-view');
    removeEventListener('keydown', onKeyDown, true); removeEventListener('keyup', onKeyUp, true); removeEventListener('blur', onBlur);
    cancelAnimationFrame(view.raf);
    if (view.abort) view.abort.abort();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (view.el) view.el.remove();
    view.el = view.hud = view.menu = null;
    if (view.ac) { try { view.ac.close(); } catch { /* ignore */ } view.ac = null; }
    view.next = 0;
  }
  let lastErr = '';
  function guestSync() {
    const g = st && st.guest;
    if (g && g.state === 'connected') { lastErr = ''; enterView(); }
    else {
      if (view.on) { if (g && g.state === 'error' && g.message) NEB.toast(g.message); leaveView(); }
      if (g && g.state === 'error' && g.message && g.message !== lastErr && !alive) { lastErr = g.message; NEB.toast(g.message); }
    }
  }

  NEB.registerPage('coop', {
    show(el) {
      root = el; alive = true; sig = '';
      el.replaceChildren(h('div', { class: 'pg' }));
      poll();
      if (!scanned && !scanning) scan();
    },
    hide() { alive = false; root = null; clearTimeout(timer); if (view.on) timer = setTimeout(poll, 1000); },
  });
  NEB.coop = { leave: () => post('leave') };
})();

/* Co-op page. Two ways to play together, each in its own dropdown group:
   - Lockstep: every player runs the game on their own PC (own graphics packs, resolution, shaders); only controller
     inputs travel over the network and the emulators are kept in step. Experimental.
   - Screen-share: one PC runs the game and streams picture and sound to friends on the same Wi-Fi.
   Joining a screen-share opens a live view that shows the host's picture, plays its sound and sends this computer's
   keyboard / gamepad to the host as player 2-4. */
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

  let root = null, alive = false, st = null, lk = null, sig = '', timer = 0;
  let found = [], scanning = false, scanned = false;
  const form = { name: '', ip: '', code: '', hostName: '', lkName: '', lkIp: '', lkCode: '', pickId: '' };
  try { form.name = localStorage.getItem('neb.coopName') || ''; form.hostName = form.name; form.lkName = form.name; } catch { /* storage blocked */ }

  /* dropdown state survives re-renders and restarts */
  const openMap = (() => { try { return JSON.parse(localStorage.getItem('neb.coop.open') || '{}') || {}; } catch { return {}; } })();
  const saveOpen = () => { try { localStorage.setItem('neb.coop.open', JSON.stringify(openMap)); } catch { /* ignore */ } };

  const sigOf = s => !s ? 'off' : JSON.stringify([s.role, s.ip, s.host.running, s.host.code, s.host.quality, s.host.fps, s.host.maxWidth, s.host.test,
    (s.host.guests || []).map(g => [g.slot, g.name]), s.guest.state, s.guest.message, s.guest.slot]);
  const lkSig = l => { if (!l) return 'lk-off'; const { live, ...rest } = l; return JSON.stringify(rest); };

  async function poll() {
    clearTimeout(timer);
    if (!alive && !view.on) return;
    try { st = await NEB.api('coop/status'); } catch { st = null; }
    try { lk = await NEB.api('coop/lock/status'); } catch { lk = null; }
    guestSync();
    const s = sigOf(st) + '|' + lkSig(lk);
    if (alive && s !== sig) { sig = s; render(); } else paintLive();
    timer = setTimeout(poll, view.on ? 1000 : 1200);
  }

  const post = async (path, body) => {
    try { st = await NEB.api('coop/' + path, body || {}); sig = ''; guestSync(); await poll(); return true; }
    catch (e) { NEB.toast(e.message); await poll(); return false; }
  };
  const lkPost = async (path, body) => {
    try { lk = await NEB.api('coop/lock/' + path, body || {}); sig = ''; await poll(); return true; }
    catch (e) { SFX.error(); NEB.toast(e.message); await poll(); return false; }
  };

  async function scan() {
    if (scanning) return;
    scanning = true; scanned = false; if (alive) render();
    try { found = (await NEB.api('coop/discover')).hosts || []; } catch { found = []; }
    scanning = false; scanned = true; if (alive) render();
  }

  /* ───────── building blocks ───────── */
  const field = (label, input) => h('label', { class: 'cp-field' }, h('span', { class: 'hint' }, label), input);
  const textIn = (key, ph, opt = {}) => h('input', { type: 'text', value: form[key], placeholder: ph, maxlength: opt.max || 32, autocomplete: 'off', spellcheck: 'false',
    oninput: e => { form[key] = opt.upper ? (e.target.value = e.target.value.toUpperCase()) : e.target.value; if (key === 'name' || key === 'hostName' || key === 'lkName') { try { localStorage.setItem('neb.coopName', form[key]); } catch { /* ignore */ } } },
    onkeydown: e => { if (e.key === 'Enter' && opt.enter) opt.enter(); } });
  const seg = (opts, val, fn) => h('div', { class: 'seg' }, opts.map(([v, label]) =>
    h('button', { class: String(v) === String(val) ? 'on' : '', onclick: e => { SFX.select(); fn(v); [...e.currentTarget.parentNode.children].forEach(c => c.classList.toggle('on', c === e.currentTarget)); } }, label)));
  const toggle = (on, fn) => h('button', { class: 'tog' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(!!on), onclick: e => { SFX.select(); const b = e.currentTarget; b.classList.toggle('on'); b.setAttribute('aria-checked', String(b.classList.contains('on'))); fn(b.classList.contains('on')); } }, h('i'));
  const pill = (text, kind) => h('span', { class: 'cp-pill' + (kind ? ' ' + kind : '') }, text);
  const note = (...t) => h('p', { class: 'lead dim' }, ...t);

  /* a dropdown: header row (title, one-line summary, chevron) and a body that slides open */
  function acc(id, title, summary, body, opt = {}) {
    const open = id in openMap ? !!openMap[id] : !!opt.open;
    const el = h('section', { class: 'cp-acc' + (open ? ' open' : '') + (opt.sub ? ' sub' : ''), 'data-acc': id },
      h('button', { class: 'cp-acc-h', 'aria-expanded': String(open),
        onclick: e => {
          const sec = e.currentTarget.parentNode, now = !sec.classList.contains('open');
          sec.classList.toggle('open', now); e.currentTarget.setAttribute('aria-expanded', String(now));
          openMap[id] = now; saveOpen(); SFX.tick();
        } },
        h('span', { class: 'cp-acc-t' }, title, opt.badge ? h('em', { class: 'cp-badge' }, opt.badge) : null),
        h('span', { class: 'cp-acc-s' }, summary || ''),
        h('i', { class: 'chev' })),
      h('div', { class: 'cp-acc-b' }, h('div', { class: 'cp-acc-bi' }, body)));
    return el;
  }

  /* ───────── lockstep ───────── */
  const KIND_LABEL = { host: 'Hosting', guest: 'Joined' };
  const games = () => (NEB.library && NEB.library.games) || [];
  const gameName = id => { const g = games().find(x => x.titleId === id); return g ? NEB.firstLine(g.name) : id || ''; };
  const lkRunning = () => !!(lk && lk.state === 'running');

  function lkSessionBody() {
    if (!lk) return note('This NEBULATOR core has no lockstep support yet. Update NEBULATOR and restart it.');
    if (lk.role === 'host') {
      return h('div', null,
        note('Friends join with this code. Everyone needs NEBULATOR, their own copy of the game, and to be able to reach this PC (same Wi-Fi, a VPN like Tailscale, or a forwarded port).'),
        h('div', { class: 'cp-code', title: 'Join code' }, [...(lk.code || '')].map(c => h('b', null, c))),
        h('p', { class: 'lead mono' }, 'This PC: ' + (lk.ip || 'unknown') + ':' + (lk.port || 17810)),
        h('button', { class: 'btn danger', disabled: lkRunning(), onclick: () => lkPost('host/stop') }, 'Close session'));
    }
    if (lk.role === 'guest') {
      return h('div', null,
        h('p', { class: 'lead' }, lk.state === 'running' ? 'Playing as Player ' + (lk.slot + 1) + '.' : 'Connected as Player ' + (lk.slot + 1) + '. Waiting for the host to start the game.'),
        h('p', { class: 'lead mono' }, 'Host: ' + (lk.hostAddr || '')),
        h('button', { class: 'btn danger', disabled: lkRunning(), onclick: () => lkPost('leave') }, 'Leave session'));
    }
    return h('div', { class: 'cp-cols tight' },
      h('div', null, h('h3', { class: 'cp-h3' }, 'Host a session'),
        field('Your name', textIn('lkName', 'e.g. Harrold', { max: 24 })),
        h('button', { class: 'btn primary', onclick: () => lkPost('host/start', { name: form.lkName }) }, 'Start hosting'),
        note('The first time, Windows may ask to allow NEBULATOR on your network. Choose Private networks.')),
      h('div', null, h('h3', { class: 'cp-h3' }, 'Join a session'),
        field('Host address', textIn('lkIp', 'e.g. 192.168.1.23', { max: 60 })),
        field('Join code', textIn('lkCode', 'ABCDE', { max: 8, upper: true, enter: doLkJoin })),
        field('Your name', textIn('lkName', 'e.g. Sam', { max: 24 })),
        lk.error ? h('p', { class: 'lead cp-err' }, lk.error) : null,
        h('button', { class: 'btn primary', onclick: doLkJoin }, 'Join')));
  }
  function doLkJoin() {
    if (!form.lkIp.trim()) return NEB.toast('Type the host address');
    if (!form.lkCode.trim()) return NEB.toast('Type the join code');
    lkPost('join', { host: form.lkIp.trim(), code: form.lkCode.trim(), name: (form.lkName || '').trim() || 'Guest' });
  }

  function manifestLines(m) {
    if (!m) return [];
    return [
      ['Game', m.title || m.titleId], ['Version', 'v' + m.version + (m.update ? ' · update v' + m.update : '') + (m.dlc ? ' · ' + m.dlc + ' DLC' : '')],
      ['NEBULATOR', m.build], ['CPU mode', m.cpuMode],
      ['Rule-changing graphics packs', m.packs && m.packs.length ? m.packs.join(', ') : 'none'],
    ];
  }

  function lkPlayersBody() {
    if (!lk || !lk.role) return note('Start or join a session first (open “Session” above).');
    const players = lk.players || [];
    const rows = players.map(p => h('div', { class: 'cp-g lk' },
      h('b', null, 'Player ' + (p.slot + 1)),
      h('span', null, p.name + (p.you ? ' (you)' : '') + (p.slot === 0 ? ' · host' : '')),
      p.problems && p.problems.length ? pill('Problem', 'bad') : p.ready ? pill('Ready', 'ok') : pill(p.slot === 0 && lk.titleId ? 'Host' : 'Not checked', 'warn'),
      h('span', { class: 'hint', 'data-lkping': p.slot }, p.pingMs >= 0 ? p.pingMs + ' ms' : '— ms')));
    const problems = players.flatMap(p => (p.problems || []).map(t => h('p', { class: 'lead cp-err' }, 'Player ' + (p.slot + 1) + ': ' + t)));
    const pickable = lk.role === 'host' && !lkRunning();
    const sel = h('select', { class: 'cp-select', disabled: !pickable, onchange: e => { form.pickId = e.target.value; lkPost('host/pick', { titleId: form.pickId }); } },
      h('option', { value: '' }, 'Choose a game…'),
      games().map(g => h('option', { value: g.titleId, selected: g.titleId === (lk.titleId || form.pickId) }, NEB.firstLine(g.name) + ' · v' + g.version)));
    const canStart = lk.role === 'host' && lk.titleId && players.length >= 1 && players.every(p => !p.problems || !p.problems.length) && !lkRunning();
    return h('div', null,
      h('div', { class: 'cp-guests' }, rows),
      problems,
      lk.role === 'host' ? [h('h3', { class: 'cp-h3' }, 'Game'), sel] : (lk.titleId ? h('p', { class: 'lead' }, 'Game: ' + gameName(lk.titleId)) : null),
      lk.manifest ? h('div', { class: 'cp-kv' }, manifestLines(lk.manifest).map(([k, v]) => h('div', null, h('span', { class: 'hint' }, k), h('span', null, String(v))))) : null,
      lk.role === 'host'
        ? h('div', { class: 'cp-row', style: 'margin-top:14px' },
          h('button', { class: 'btn primary', disabled: !canStart, onclick: () => lkPost('host/launch') }, lkRunning() ? 'Running' : 'Start game for everyone'),
          players.length < 2 ? h('span', { class: 'hint' }, 'Works with one player too: handy for testing.') : null)
        : h('p', { class: 'lead dim' }, 'Only the host starts the game. It opens on your PC automatically.'),
      note('Everyone plays with a Pro Controller layout in lockstep (GamePad touch and motion are not sent). Rule-changing graphics packs must match the host; looks-only packs (resolution, shaders, textures) can differ per player.'));
  }

  function lkSyncBody() {
    const s = (lk && lk.settings) || { delay: 0, hashEvery: 30, cpu: 'recompiler' };
    const host = lk && lk.role === 'host' && !lkRunning();
    const lock = !host ? { disabled: true } : {};
    return h('div', { class: 'cp-opts' },
      h('div', null, h('span', { class: 'hint' }, 'Input delay'),
        seg([[0, 'Auto'], [2, '2 frames'], [3, '3'], [4, '4'], [6, '6'], [8, '8']], s.delay, v => host && lkPost('host/settings', { delay: +v })),
        note('Frames of delay between pressing a button and the game seeing it, the same for everyone. Auto uses the slowest connection in the session. Lower feels better; too low causes stalls.')),
      h('div', null, h('span', { class: 'hint' }, 'CPU mode'),
        seg([['recompiler', 'Recompiler (faster)'], ['interpreter', 'Interpreter (safest)']], s.cpu, v => host && lkPost('host/settings', { cpu: v })),
        note('Lockstep always runs on a single emulated core so both PCs execute exactly the same steps. The interpreter is much slower but removes one possible source of drift.')),
      h('div', null, h('span', { class: 'hint' }, 'State check every'),
        seg([[15, '0.25 s'], [30, '0.5 s'], [60, '1 s']], s.hashEvery, v => host && lkPost('host/settings', { hashEvery: +v })),
        note('How often players compare a fingerprint of the game’s memory. A mismatch means the games drifted apart (a desync).')),
      !host ? h('p', { class: 'lead dim' }, 'The host chooses these. They are locked while a game is running.') : null);
  }

  function lkSaveBody() {
    const s = (lk && lk.settings) || { shareSave: true };
    const host = lk && lk.role === 'host' && !lkRunning();
    return h('div', null,
      h('div', { class: 'trow' }, h('div', null, h('b', null, 'Share the host’s save'), h('span', { class: 'hint' }, 'Everyone starts from the same save so the games match.')),
        toggle(s.shareSave !== false, v => host && lkPost('host/settings', { shareSave: v }))),
      note('When the game starts, each guest’s own save for this game is backed up and replaced by the host’s. Because every PC runs the same steps, all of them end the session with the same save. Your backup is kept in your NEBULATOR data folder under lockstep/backups.'),
      lk && lk.backupDir ? h('p', { class: 'lead mono' }, 'Last backup: ' + lk.backupDir) : null,
      note('Skylanders figures are not shared yet. Each player’s portal is left as it is for now.'));
  }

  function lkLabBody() {
    const lab = (lk && lk.lab) || { phase: 'none' };
    const idle = lk && !lkRunning();
    const sel = h('select', { class: 'cp-select', disabled: !idle, onchange: e => { form.pickId = e.target.value; } },
      h('option', { value: '' }, 'Choose a game…'),
      games().map(g => h('option', { value: g.titleId, selected: g.titleId === (lab.titleId || form.pickId) }, NEB.firstLine(g.name) + ' · v' + g.version)));
    const res = lab.result;
    return h('div', null,
      note('This runs a game twice on this PC with the exact same button presses and checks that both runs match, frame by frame. It tells us whether lockstep can work for that game and, if not, roughly where it drifts. Your save is backed up and restored for you.'),
      h('div', { class: 'cp-row' }, sel),
      h('div', { class: 'cp-opts' }, h('div', null, h('span', { class: 'hint' }, 'Record for'), seg([[30, '30 s'], [60, '1 min'], [120, '2 min']], lab.seconds || 60, v => { form.labSeconds = +v; }))),
      h('div', { class: 'cp-row' },
        h('button', { class: 'btn primary', disabled: !idle, onclick: () => { const id = form.pickId || lab.titleId; if (!id) return NEB.toast('Choose a game first'); lkPost('lab/record', { titleId: id, seconds: form.labSeconds || lab.seconds || 60 }); } }, '1 · Record a run'),
        h('button', { class: 'btn', disabled: !idle || lab.phase === 'none', onclick: () => lkPost('lab/replay') }, '2 · Replay and compare'),
        h('button', { class: 'btn', disabled: !idle || lab.phase === 'none', onclick: () => lkPost('lab/reset') }, 'Clear')),
      lab.phase !== 'none' ? h('p', { class: 'lead' }, lab.phase === 'recorded'
        ? 'Recorded ' + (lab.ticks || 0) + ' frames of ' + gameName(lab.titleId) + '. Press “Replay and compare” next.'
        : 'Replayed ' + gameName(lab.titleId) + '.') : null,
      res ? h('div', { class: 'cp-result ' + (res.identical ? 'ok' : 'bad') },
        h('b', null, res.identical ? 'Identical: both runs matched on every check.' : 'The runs drifted apart.'),
        h('span', null, res.identical
          ? res.checked + ' checks over ' + res.ticks + ' frames. This game looks safe for lockstep.'
          : 'First difference at frame ' + res.firstTick + ' (' + res.region + '), after ' + res.checked + ' matching checks.')) : null,
      note('While a lab run is going, play normally: your presses are recorded and replayed. Close the game when the time is up.'));
  }

  function lkDiagBody() {
    if (!lk) return note('Not available.');
    const lv = lk.live || {};
    const rows = [
      ['State', lk.state || 'idle'], ['Frame', lv.tick != null ? lv.tick : '—'], ['Waiting for', lv.waitingFor || '—'],
      ['Stalls', lv.stalls != null ? lv.stalls : '—'], ['Impure windows', lv.impure != null ? lv.impure : '—'], ['Ping', lv.pingMs >= 0 && lv.pingMs != null ? lv.pingMs + ' ms' : '—'],
    ];
    const d = lk.desync;
    return h('div', null,
      h('div', { class: 'cp-kv', 'data-live': '1' }, rows.map(([k, v]) => h('div', null, h('span', { class: 'hint' }, k), h('span', { 'data-lkv': k }, String(v))))),
      d ? h('div', { class: 'cp-result bad' }, h('b', null, 'Desync detected'), h('span', null, 'Frame ' + d.tick + ' (' + d.region + '). The players’ games stopped matching here.')) : null,
      lk.log && lk.log.length ? h('pre', { class: 'notes' }, lk.log.join('\n')) : note('Nothing logged yet.'),
      h('button', { class: 'btn', onclick: () => { const t = JSON.stringify(lk, null, 2); try { navigator.clipboard.writeText(t); NEB.toast('Report copied'); } catch { NEB.toast('Could not copy'); } } }, 'Copy report'));
  }

  function lockstepGroup() {
    const sum = !lk ? 'Core too old' : lk.role === 'host' ? 'Hosting · ' + (lk.players || []).length + ' player' + ((lk.players || []).length === 1 ? '' : 's') : lk.role === 'guest' ? 'In a session' : 'Not in a session';
    const body = h('div', { class: 'cp-subs' },
      acc('lk-session', 'Session', lk && lk.role ? (KIND_LABEL[lk.role] + (lk.code ? ' · ' + lk.code : '')) : 'Host or join', lkSessionBody(), { sub: true, open: true }),
      acc('lk-players', 'Players & game', lk && lk.titleId ? gameName(lk.titleId) : 'Who is here and what to play', lkPlayersBody(), { sub: true }),
      acc('lk-sync', 'Sync & delay', 'Input delay, CPU mode, state checks', lkSyncBody(), { sub: true }),
      acc('lk-save', 'Shared save', 'Start from the host’s save', lkSaveBody(), { sub: true }),
      acc('lk-lab', 'Determinism lab', lk && lk.lab && lk.lab.result ? (lk.lab.result.identical ? 'Last test: identical' : 'Last test: drifted') : 'Test a game on this PC', lkLabBody(), { sub: true }),
      acc('lk-diag', 'Diagnostics', lk && lk.desync ? 'Desync detected' : 'Frame counter, stalls, log', lkDiagBody(), { sub: true }));
    return acc('grp-lock', 'Lockstep co-op', sum + ' · everyone runs the game', body, { badge: 'Experimental', open: true });
  }

  /* ───────── screen-share ───────── */
  function hostBody() {
    const hs = st.host;
    if (!hs.running) {
      return h('div', null,
        note('Friends on your Wi-Fi join your game as player 2, 3 or 4. The game runs on this PC; they only need NEBULATOR.'),
        field('Your name (shown to friends)', textIn('hostName', 'e.g. Harrold', { max: 24 })),
        h('button', { class: 'btn primary', onclick: () => post('host/start', { name: form.hostName }) }, 'Start hosting'),
        note('The first time, Windows may ask to allow NEBULATOR on your network. Choose Private networks.'));
    }
    const guests = hs.guests || [];
    return h('div', null,
      note('Tell your friends this code. Then start a game from the Wii U shelf; they appear as the next player.'),
      h('div', { class: 'cp-code', title: 'Join code' }, [...hs.code].map(c => h('b', null, c))),
      h('p', { class: 'lead mono' }, 'This PC: ' + (st.ip || 'unknown') + (hs.test ? '   (test pattern mode)' : '')),
      h('h3', { class: 'cp-h3' }, 'Players'),
      h('div', { class: 'cp-guests' },
        h('div', { class: 'cp-g' }, h('b', null, 'Player 1'), h('span', null, 'You (host)'), h('span', { class: 'hint' }, ' ')),
        guests.length ? guests.map(g => h('div', { class: 'cp-g' }, h('b', null, 'Player ' + (g.slot + 1)), h('span', null, g.name),
          h('span', { class: 'hint', 'data-ping': g.slot }, '— ms'), h('button', { class: 'x', title: 'Remove', onclick: () => post('host/kick', { slot: g.slot }) }, '×')))
          : h('p', { class: 'lead dim' }, 'Waiting for friends to join…')),
      h('button', { class: 'btn danger', style: 'margin-top:12px', onclick: () => post('host/stop') }, 'Stop hosting'));
  }

  function qualityBody() {
    const hs = st.host;
    return h('div', null,
      h('div', { class: 'cp-opts' },
        h('div', null, h('span', { class: 'hint' }, 'Picture size'), seg([[480, 'Small'], [640, 'Normal'], [854, 'Sharp']], hs.maxWidth, v => post('host/settings', { maxWidth: +v }))),
        h('div', null, h('span', { class: 'hint' }, 'Smoothness'), seg([[20, '20 fps'], [30, '30 fps'], [60, '60 fps']], hs.fps, v => post('host/settings', { fps: +v }))),
        h('div', null, h('span', { class: 'hint' }, 'Compression'), seg([[40, 'Light'], [60, 'Balanced'], [80, 'Crisp']], hs.quality, v => post('host/settings', { quality: +v })))),
      note('Lower the size or smoothness if a friend’s picture stutters. Your own game is never affected by these.'));
  }

  function joinBody() {
    const g = st.guest;
    const hostList = scanning ? note('Looking for games on your Wi-Fi…')
      : found.length ? h('div', { class: 'cp-found' }, found.map(f => h('button', { class: 'cp-host' + (form.ip === f.ip ? ' on' : ''), onclick: () => { SFX.select(); form.ip = f.ip; render(); } },
        h('b', null, f.name || 'NEBULATOR host'), h('span', null, f.title ? NEB.firstLine(f.title) : 'In the menu'), h('span', { class: 'hint' }, f.ip + ' · ' + f.freeSlots + ' open'))))
      : note(scanned ? 'No games found. Check that you are on the same Wi-Fi and that your friend is hosting, or type their address below.' : 'Press Search to look for friends hosting on your Wi-Fi.');
    const joining = g.state === 'connecting';
    return h('div', null,
      note('You do not need the game. You will see and hear your friend’s game and play with your keyboard or controller.'),
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

  function shareGroup() {
    if (!st) return acc('grp-share', 'Screen-share co-op', 'Needs the NEBULATOR core', note('Open NEBULATOR from the launcher.'), { open: false });
    const hosting = st.host.running, joined = st.role === 'guest' && st.guest.state === 'connected';
    const sum = hosting ? 'Hosting · ' + (st.host.guests || []).length + ' friend' + ((st.host.guests || []).length === 1 ? '' : 's') : joined ? 'Watching a friend' : 'Same Wi-Fi · host or join';
    const subs = [];
    if (hosting || !joined) subs.push(acc('ss-host', 'Host a game', hosting ? 'Code ' + st.host.code : 'Friends watch your PC', hostBody(), { sub: true, open: hosting }));
    if (hosting) subs.push(acc('ss-quality', 'Stream quality', st.host.maxWidth + ' px · ' + st.host.fps + ' fps', qualityBody(), { sub: true }));
    if (!hosting) subs.push(acc('ss-join', 'Join a friend', st.guest.state === 'connecting' ? 'Connecting…' : 'Watch and play on their PC', joinBody(), { sub: true }));
    return acc('grp-share', 'Screen-share co-op', sum + ' · one PC runs the game', h('div', { class: 'cp-subs' }, subs), { open: hosting || joined });
  }

  function render() {
    if (!root) return;
    root.replaceChildren(h('div', { class: 'pg coop' },
      h('div', { class: 'ph-row' }, h('div', null, h('div', { class: 'eyebrow' }, 'Play together'), h('h1', { class: 'ph' }, 'Co-op'))),
      h('p', { class: 'lead' }, 'Two ways to play together. Lockstep lets every player run the game on their own PC with their own graphics settings. Screen-share streams one PC’s game to friends on the same Wi-Fi.'),
      h('div', { class: 'cp-stack' }, lockstepGroup(), shareGroup())));
    paintLive();
  }

  function paintLive() {
    if (!root) return;
    if (st) (st.host.guests || []).forEach(g => { const el = root.querySelector(`[data-ping="${g.slot}"]`); if (el) el.textContent = g.pingMs >= 0 ? g.pingMs + ' ms' : '— ms'; });
    if (lk) {
      (lk.players || []).forEach(p => { const el = root.querySelector(`[data-lkping="${p.slot}"]`); if (el) el.textContent = p.pingMs >= 0 ? p.pingMs + ' ms' : '— ms'; });
      const lv = lk.live || {};
      const set = (k, v) => { const el = root.querySelector(`[data-lkv="${k}"]`); if (el) el.textContent = String(v); };
      set('Frame', lv.tick != null ? lv.tick : '—'); set('Waiting for', lv.waitingFor || '—');
      set('Stalls', lv.stalls != null ? lv.stalls : '—'); set('Impure windows', lv.impure != null ? lv.impure : '—');
      set('Ping', lv.pingMs != null && lv.pingMs >= 0 ? lv.pingMs + ' ms' : '—');
    }
    if (view.on && view.hud && st && st.guest) view.hud.textContent = `Player ${st.guest.slot + 1} · ${st.guest.pingMs >= 0 ? st.guest.pingMs + ' ms' : '… ms'} · ${st.guest.fps} fps`;
  }

  /* ───────── guest live view (screen-share) ───────── */
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

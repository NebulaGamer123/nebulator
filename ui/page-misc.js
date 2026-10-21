/* Graphics packs page, Updates & DLC page, and the settings sheet sections. */
(() => {
  'use strict';
  const { h, S, save } = NEB;

  const seg = (opts, val, fn) => h('div', { class: 'seg' }, opts.map(([v, label]) =>
    h('button', { class: String(v) === String(val) ? 'on' : '', onclick: e => { SFX.select(); fn(v); const sb = e.currentTarget.parentNode; [...sb.children].forEach(c => c.classList.toggle('on', c === e.currentTarget)); } }, label)));
  const grp = (title, ...kids) => h('div', { class: 'grp' }, h('h3', null, title), ...kids);
  const note = t => h('p', { class: 'lead dim' }, t);
  const toggle = (val, fn) => {
    const b = h('button', { class: 'tog' + (val ? ' on' : ''), role: 'switch', 'aria-checked': String(!!val), onclick: () => {
      val = !val; b.classList.toggle('on', val); b.setAttribute('aria-checked', String(val)); SFX.select(); fn(val);
    } }, h('i'));
    return b;
  };
  const rowTog = (label, val, fn, sub) => h('div', { class: 'trow' }, h('div', null, h('b', null, label), sub ? h('span', { class: 'hint' }, sub) : null), toggle(val, fn));
  const fmtBytes = n => n;

  /* ══════════════ settings sections ══════════════ */
  let cfg = null;
  async function getCfg() { cfg = await NEB.api('settings'); return cfg; }
  let pushT = 0;
  const push = patch => { Object.assign(cfg, patch); clearTimeout(pushT); pushT = setTimeout(() => NEB.api('settings', patch).catch(e => NEB.toast(e.message)), 250); };
  const pushNow = patch => { Object.assign(cfg, patch); return NEB.api('settings', patch).catch(e => NEB.toast(e.message)); };

  // sections return nodes synchronously; data-backed ones fill in once /api/settings answers
  const lazy = (render, rerender) => {
    const host = h('div', null, h('p', { class: 'lead dim' }, 'Loading…'));
    getCfg().then(() => host.replaceChildren(...render(rerender))).catch(e => host.replaceChildren(h('p', { class: 'lead' }, 'Core not reachable: ' + e.message)));
    return [host];
  };

  NEB.settingsSections = {
    appearance() {
      return [
        grp('Theme', h('div', { class: 'themes' }, NEB.THEME_ORDER.map(id => {
          const [bg, cart, acc] = NEB.PALETTE[id];
          return h('button', { class: 'theme' + (id === S.theme ? ' on' : ''), onclick: e => NEB.setTheme(id, e) },
            h('div', { class: 'sw', style: `background:${bg}` }, h('i', { style: `background:${cart}` }), h('b', { style: `background:${acc}` })),
            h('span', null, NEB.THEME_NAMES[id]));
        }))),
        grp('Motion', seg([['full', 'Full'], ['reduced', 'Reduced']], S.motion, v => { S.motion = v; save(); })),
        grp('Animated background', seg([['true', 'On'], ['false', 'Off']], String(S.dust), v => { S.dust = v === 'true'; save(); })),
        grp('Interface sounds', seg([['true', 'On'], ['false', 'Off']], String(S.sound), v => { S.sound = v === 'true'; save(); SFX.bind(); })),
        grp('Cartridge size', h('input', { type: 'range', min: .8, max: 1.2, step: .05, value: S.size, oninput: e => { S.size = +e.target.value; save(); NEB.layout(); } })),
      ];
    },

    display(rerender) {
      return lazy(() => [
        rowTog('Fullscreen on launch', S.fullscreen, v => { S.fullscreen = v; save(); }, 'F11 toggles it in a game'),
        rowTog('V-Sync', cfg.vsync > 0, v => push({ vsync: v ? 1 : 0 }), 'Stops tearing, can add input lag'),
        rowTog('Compile shaders in the background', cfg.asyncCompile, v => push({ asyncCompile: v }), 'Fewer stutters, brief missing effects'),
        rowTog('Show FPS overlay', cfg.overlayFps, v => push({ overlayFps: v })),
        grp('Upscale filter', seg([[0, 'Bilinear'], [1, 'Bicubic'], [2, 'Hermite'], [3, 'Nearest']], cfg.upscaleFilter, v => push({ upscaleFilter: +v }))),
        grp('Downscale filter', seg([[0, 'Bilinear'], [1, 'Bicubic'], [2, 'Hermite'], [3, 'Nearest']], cfg.downscaleFilter, v => push({ downscaleFilter: +v }))),
        grp('Fullscreen scaling', seg([[0, 'Keep aspect'], [1, 'Stretch']], cfg.fullscreenScaling, v => push({ fullscreenScaling: +v }))),
        grp('CPU mode', seg([[4, 'Auto'], [3, 'Multicore'], [1, 'Recompiler'], [0, 'Interpreter']], cfg.cpuMode, v => push({ cpuMode: +v })),
          note('Auto is right for nearly everyone. Interpreter is for debugging and is very slow.')),
        grp('Console language', h('select', { onchange: e => push({ language: +e.target.value }) },
          ['Japanese', 'English', 'French', 'German', 'Italian', 'Spanish', 'Chinese', 'Korean', 'Dutch', 'Portuguese', 'Russian', 'Taiwanese'].map((n, i) => h('option', { value: i, selected: i === cfg.language }, n)))),
        note('Display settings are read when a game starts.'),
      ], rerender);
    },

    audio(rerender) {
      return lazy(() => {
        const dev = h('select', { onchange: e => push({ tvDevice: e.target.value }) }, h('option', null, 'Loading devices…'));
        const fillDevices = async api => {
          try {
            const a = await NEB.api('audio?api=' + api);
            dev.replaceChildren(h('option', { value: 'default', selected: cfg.tvDevice === 'default' }, 'System default'),
              ...a.devices.map(d => h('option', { value: d.id, selected: d.id === cfg.tvDevice }, d.name)));
            return a;
          } catch { dev.replaceChildren(h('option', null, 'No devices found')); }
        };
        const apiHost = h('div');
        NEB.api('audio').then(a => {
          apiHost.replaceChildren(seg(a.apis.filter(x => x.available).map(x => [x.id, x.name]), cfg.audioApi, v => { push({ audioApi: +v }); fillDevices(+v); }));
          fillDevices(cfg.audioApi);
        }).catch(() => {});
        const vol = (label, key) => h('div', { class: 'row vol' }, h('label', null, label),
          h('input', { type: 'range', min: 0, max: 100, step: 1, value: cfg[key], oninput: e => { e.target.nextSibling.textContent = e.target.value; push({ [key]: +e.target.value }); } }),
          h('span', { class: 'hint' }, String(cfg[key])));
        return [
          grp('Audio backend', apiHost),
          grp('TV output device', dev),
          grp('Volume', vol('TV', 'tvVolume'), vol('GamePad', 'padVolume'), vol('Portal', 'portalVolume'), note('Portal is the Skylanders portal speaker.')),
          grp('Channels', seg([[0, 'Mono'], [1, 'Stereo'], [2, 'Surround']], cfg.tvChannels, v => push({ tvChannels: +v }))),
          note('Audio settings are read when a game starts.'),
        ];
      }, rerender);
    },

    paths(rerender) {
      return lazy(() => [
        grp('Folders scanned for games, updates and DLC',
          cfg.gamePaths.length ? cfg.gamePaths.map(p => h('div', { class: 'prow' }, h('span', null, p),
            h('button', { class: 'x', title: 'Remove', onclick: async () => { SFX.clear(); await pushNow({ gamePaths: cfg.gamePaths.filter(x => x !== p) }); await NEB.api('library/rescan', {}); NEB.loadLibrary(); rerender(); } }, '×')))
            : note('No folders yet.'),
          h('div', { style: 'margin-top:12px' },
            h('button', { class: 'btn primary', onclick: async () => { await NEB.addFolder(); rerender(); } }, 'Add folder'),
            h('button', { class: 'btn', onclick: async () => { await NEB.api('library/rescan', {}); NEB.loadLibrary(); NEB.toast('Scanning…'); } }, 'Rescan'))),
        note('Put each game, its update and its DLC anywhere under these folders. Supported: .wua, .wud/.wux, .wup folders, loose game folders (code/content/meta) and .rpx.'),
      ], rerender);
    },

    about(rerender) {
      return lazy(() => {
        const st = NEB.status || {};
        return [
          h('div', { class: 'about-mark', innerHTML: NEB.$('.mark').outerHTML }),
          h('p', { class: 'lead' }, 'NEBULATOR runs Wii U games with the emulation core taken from Cemu (MPL-2.0) under a new interface. It is not an official Cemu build, so fixes made to Cemu later are not picked up automatically.'),
          grp('Version', h('p', { class: 'lead' }, st.version || ''),
            h('button', { class: 'btn', onclick: e => { SFX.select(); e.currentTarget.blur(); NEB.checkForUpdates(false); } }, 'Check for updates')),
          grp('Data folder', h('p', { class: 'lead mono' }, st.dataPath || '')),
          note('Switch, Wii and GameCube are planned. Only Wii U runs today.'),
        ];
      }, rerender);
    },
  };

  /* ══════════════ graphics packs page ══════════════ */
  (() => {
    let root = null, data = null, alive = false, q = '', all = false, dl = null, dlTimer = 0, flipped = new Set();

    const baseIds = () => {
      const s = new Set();
      for (const g of NEB.library.games) {
        s.add(g.titleId);
        s.add(g.titleId.replace(/^00050000/, '0005000e'));
      }
      return s;
    };

    async function load() {
      try { data = await NEB.api('gfx'); } catch (e) { data = null; NEB.toast('Graphics: ' + e.message); }
      render();
    }

    async function setPack(id, patch) {
      try { data = await NEB.api('gfx/set', Object.assign({ id }, patch)); SFX.select(); render(); }
      catch (e) { SFX.error(); NEB.toast(e.message); }
    }

    async function startDownload() {
      try { await NEB.api('gfx/download', {}); SFX.arm(); pollDl(); } catch (e) { SFX.error(); NEB.toast(e.message); }
    }
    async function pollDl() {
      clearTimeout(dlTimer);
      try { dl = await NEB.api('gfx/download'); } catch { dl = null; }
      paintDl();
      if (dl && dl.running) dlTimer = setTimeout(pollDl, 500);
      else if (dl && dl.stage === 'done') { SFX.bind(); NEB.toast('Graphic packs updated ' + (dl.message || '')); load(); }
      else if (dl && dl.stage === 'error') { SFX.error(); NEB.toast(dl.message); }
    }
    function paintDl() {
      const el = root && root.querySelector('.dlbar'); if (!el) return;
      if (!dl || dl.stage === 'idle' || (!dl.running && dl.stage !== 'error')) { el.classList.remove('on'); return; }
      el.classList.add('on');
      const t = { checking: 'Checking for the latest pack…', downloading: 'Downloading…', extracting: 'Installing…', error: dl.message };
      el.querySelector('span').textContent = t[dl.stage] || '';
      el.querySelector('i').style.width = (dl.stage === 'checking' ? 8 : dl.percent) + '%';
    }

    function render() {
      if (!root) return;
      if (!data) { root.replaceChildren(h('div', { class: 'pg' }, h('div', { class: 'empty' }, h('h2', null, 'Core not reachable')))); return; }
      const ids = baseIds();
      const term = q.trim().toLowerCase();
      let packs = data.packs.filter(p => {
        if (term) return (p.name + ' ' + p.path).toLowerCase().includes(term);
        if (all) return true;
        return p.enabled || p.titleIds.some(t => ids.has(t));
      });
      const total = packs.length;
      const groups = new Map();
      for (const p of packs.slice(0, 400)) {
        const key = p.path.split('/')[0] || 'Other';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p);
      }
      const list = h('div', { class: 'gl' });
      for (const [name, ps] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
        const onCount = ps.filter(p => p.enabled).length;
        const isOpen = !!term || ((groups.size <= 6) !== flipped.has(name));
        list.append(h('div', { class: 'gg' + (isOpen ? ' open' : '') },
          h('button', { class: 'gh', onclick: () => { if (!term) { flipped.has(name) ? flipped.delete(name) : flipped.add(name); } SFX.tick(); render(); } },
            h('span', null, name), h('span', { class: 'hint' }, onCount ? onCount + ' on · ' + ps.length : ps.length), h('i', { class: 'chev' })),
          isOpen ? h('div', { class: 'gb' }, ps.map(p => h('div', { class: 'gp' + (p.enabled ? ' on' : '') },
            h('div', { class: 'gpm' },
              h('b', null, p.name.split('/').pop()),
              p.description ? h('span', { class: 'gd' }, p.description.length > 220 ? p.description.slice(0, 220) + '…' : p.description) : null,
              p.enabled && p.presets.length ? h('div', { class: 'gpresets' }, p.presets.map(pr => h('label', null,
                pr.category ? h('span', null, pr.category) : null,
                h('select', { onchange: e => setPack(p.id, { category: pr.category, preset: e.target.value }) },
                  pr.options.map(o => h('option', { value: o, selected: o === pr.active }, o)))))) : null),
            toggle(p.enabled, v => setPack(p.id, { enabled: v }))))) : null));
      }

      const empty = !total ? h('div', { class: 'empty small' },
        h('h2', null, data.packs.length ? 'Nothing here for your games' : 'No graphics packs installed'),
        h('p', { class: 'lead' }, data.packs.length ? 'Search, or show every pack.' : 'Download the community collection to get resolution, FPS and widescreen packs.')) : null;

      root.replaceChildren(h('div', { class: 'pg gfxpg' },
        h('div', { class: 'ph-row' },
          h('div', null, h('div', { class: 'eyebrow' }, data.downloadedVersion ? 'Community packs ' + data.downloadedVersion : 'Community packs'), h('h1', { class: 'ph' }, 'Graphics')),
          h('div', { class: 'sky-tools' },
            h('button', { class: 'btn primary', onclick: startDownload }, data.packs.length ? 'Update packs' : 'Download packs'),
            h('button', { class: 'btn', onclick: async () => { try { data = await NEB.api('gfx/reload', {}); render(); } catch (e) { NEB.toast(e.message); } } }, 'Rescan folder'))),
        h('div', { class: 'dlbar' }, h('span'), h('em', null, h('i'))),
        h('div', { class: 'gtools' },
          h('input', { type: 'text', class: 'search', placeholder: 'Search packs…', value: q, spellcheck: 'false', oninput: e => { q = e.target.value; const pos = e.target.selectionStart; render(); const inp = root.querySelector('.search'); inp.focus(); inp.setSelectionRange(pos, pos); } }),
          h('div', { class: 'seg' }, [[false, 'My games'], [true, 'All packs']].map(([v, l]) => h('button', { class: all === v ? 'on' : '', onclick: () => { all = v; SFX.select(); render(); } }, l))),
          h('span', { class: 'hint' }, total + ' pack' + (total === 1 ? '' : 's') + (total > 400 ? ' (first 400 shown, search to narrow)' : ''))),
        empty, list));
      paintDl();
    }

    NEB.registerPage('gfx', {
      show(el) { root = el; alive = true; el.replaceChildren(h('div', { class: 'pg' })); load(); pollDl(); },
      hide() { alive = false; root = null; clearTimeout(dlTimer); },
    });
    NEB.on('library', () => { if (alive && data) render(); });
  })();

  /* ══════════════ updates & dlc page ══════════════ */
  (() => {
    let root = null, alive = false;
    const fmtRow = (label, v, path, fmt) => h('div', { class: 'ur' }, h('b', null, label), h('span', null, v), h('span', { class: 'hint', title: path }, fmt + ' · ' + path));

    function render() {
      if (!root) return;
      const games = NEB.library.games;
      const withUp = games.filter(g => g.update).length, withDlc = games.filter(g => g.dlc.length).length;
      const cards = games.map(g => h('div', { class: 'ucard' },
        h('div', { class: 'uh' }, NEB.gameIcon(g.titleId), h('h3', null, NEB.firstLine(g.name)), h('span', { class: 'hint' }, g.region + ' · ' + g.titleId)),
        fmtRow('Game', 'v' + g.base.version, g.base.path, g.base.format),
        g.update ? fmtRow('Update', 'v' + g.update.version, g.update.path, g.update.format) : h('div', { class: 'ur none' }, h('b', null, 'Update'), h('span', null, 'none found')),
        g.dlc.length ? g.dlc.map((d, i) => fmtRow(i ? '' : 'DLC', 'v' + d.version, d.path, d.format)) : h('div', { class: 'ur none' }, h('b', null, 'DLC'), h('span', null, 'none found')),
        h('div', { class: 'ufoot' }, h('button', { class: 'btn', onclick: () => NEB.launchGame(g) }, 'Play'))));

      root.replaceChildren(h('div', { class: 'pg updpg' },
        h('div', { class: 'ph-row' },
          h('div', null, h('div', { class: 'eyebrow' }, NEB.library.scanning ? 'Scanning…' : games.length + ' games · ' + withUp + ' updated · ' + withDlc + ' with DLC'), h('h1', { class: 'ph' }, 'Updates & DLC')),
          h('div', { class: 'sky-tools' },
            h('button', { class: 'btn primary', onclick: () => NEB.addFolder() }, '+ Add folder'),
            h('button', { class: 'btn', onclick: async () => { await NEB.api('library/rescan', {}); NEB.loadLibrary(); SFX.arm(); } }, 'Rescan'),
            h('button', { class: 'btn', onclick: () => NEB.openSettingsSection('paths') }, 'Folders'))),
        h('p', { class: 'lead' }, 'A game\'s update and DLC are picked up automatically when they sit in any scanned folder. The newest update found is the one that runs. NEBULATOR does not download titles from Nintendo; add the files you already own.'),
        games.length ? h('div', { class: 'ugrid' }, cards) : h('div', { class: 'empty small' }, h('h2', null, 'No games yet'), h('p', { class: 'lead' }, 'Add a folder that holds your games.'))));
    }

    NEB.registerPage('updates', {
      show(el) { root = el; alive = true; render(); NEB.loadLibrary(); },
      hide() { alive = false; root = null; },
    });
    NEB.on('library', () => { if (alive) render(); });
  })();
})();

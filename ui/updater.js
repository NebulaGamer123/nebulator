/* Updates: asks the core once at launch (and on demand from Settings → About) whether a newer NEBULATOR exists. */
(() => {
  'use strict';
  const { h } = NEB;
  let busy = false, announced = false;

  const bar = () => { const i = h('i'); const e = h('em', null, i); return { e, set: p => { i.style.width = p + '%'; } }; };

  function offlineDialog() {
    NEB.modal(h('div', { class: 'mbox' },
      h('h2', null, 'You\'re offline'),
      h('p', { class: 'lead' }, 'Your games and everything else in NEBULATOR work fine without a connection. You just can\'t check for or download updates until you\'re back online.'),
      h('div', { class: 'mfoot' }, h('button', { class: 'btn primary', onclick: () => NEB.closeModal() }, 'OK'))));
  }

  function offerDialog(r) {
    const notes = (r.notes || '').trim();
    NEB.modal(h('div', { class: 'mbox' },
      h('h2', null, 'Update available'),
      h('p', { class: 'lead' }, `NEBULATOR ${r.latest.replace(/^v/i, '')} is ready. You have ${r.current}.`),
      notes ? h('pre', { class: 'notes' }, notes) : null,
      r.canInstall ? null : h('p', { class: 'lead dim' }, 'Automatic install is only available in the Windows build. Download the new version from GitHub.'),
      h('div', { class: 'mfoot' },
        h('button', { class: 'btn', onclick: () => NEB.closeModal() }, 'Later'),
        r.canInstall ? h('button', { class: 'btn primary', onclick: () => install() }, 'Update now') : null)));
  }

  async function install() {
    const b = bar(), msg = h('p', { class: 'lead' }, 'Downloading…');
    NEB.modal(h('div', { class: 'mbox' }, h('h2', null, 'Updating NEBULATOR'), msg, h('div', { class: 'dlbar on' }, b.e),
      h('p', { class: 'lead dim' }, 'Keep this window open. NEBULATOR restarts by itself when it\'s done.')), { dismiss: false });
    try {
      await NEB.api('update/install', {});
      for (;;) {
        await new Promise(r => setTimeout(r, 500));
        const s = await NEB.api('update/status');
        b.set(s.percent || 0);
        if (s.stage === 'verifying') msg.textContent = 'Checking the download…';
        if (s.stage === 'error') throw new Error(s.message || 'update failed');
        if (s.stage === 'ready') break;
      }
      msg.textContent = 'Installing — NEBULATOR will reopen in a moment…';
      await NEB.api('update/apply', {});
    } catch (e) {
      if (e && e.status === undefined && /fetch|network/i.test(String(e.message))) return; // the core closed itself: expected
      NEB.closeModal();
      SFX.error(); NEB.toast('Update failed: ' + e.message);
    }
  }

  // silent=true is the launch check: stays quiet when up to date, tells you when offline
  async function check(silent) {
    if (busy) return null;
    busy = true;
    try {
      const r = await NEB.api('update/check');
      if (r.offline) { if (silent) offlineDialog(); else NEB.toast('Offline: can\'t check for updates right now'); }
      else if (r.error && !silent) NEB.toast('Couldn\'t check for updates: ' + r.error);
      else if (r.available) offerDialog(r);
      else if (!silent) NEB.toast('NEBULATOR is up to date (' + r.current + ')');
      return r;
    } catch (e) { if (!silent) NEB.toast('Couldn\'t check for updates'); return null; }
    finally { busy = false; }
  }
  NEB.checkForUpdates = check;

  NEB.on('online', () => {
    if (announced) return; announced = true;
    setTimeout(() => { if (NEB.state === 'ui' && !document.body.classList.contains('modal-open')) check(true); }, 1200);
  });
})();

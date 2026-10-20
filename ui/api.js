/* NEBULATOR UI <-> core bridge. The core serves this folder and a JSON API on 127.0.0.1. */
(() => {
  'use strict';
  const NEB = window.NEB = { token: null, online: false, state: 'ui', status: {}, _ev: {}, mods: [] };

  try {
    const q = new URLSearchParams(location.search).get('t');
    if (q) { localStorage.setItem('neb.token', q); history.replaceState(null, '', location.pathname); }
    NEB.token = localStorage.getItem('neb.token');
  } catch { /* storage blocked */ }

  NEB.on = (name, fn) => { (NEB._ev[name] = NEB._ev[name] || []).push(fn); };
  NEB.emit = (name, ...a) => (NEB._ev[name] || []).forEach(fn => { try { fn(...a); } catch (e) { console.error(e); } });

  NEB.api = async (path, body) => {
    const opt = { headers: { 'X-Nebulator-Token': NEB.token || '' } };
    if (body !== undefined) { opt.method = 'POST'; opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const r = await fetch('/api/' + path, opt);
    let j = null;
    try { j = await r.json(); } catch { /* empty */ }
    if (!r.ok) throw Object.assign(new Error((j && j.error) || 'HTTP ' + r.status), { status: r.status });
    return j;
  };


  /* ───────── game icons: the core hands over each game's own iconTex.tga; we decode it here ───────── */
  function decodeTga(buf) {
    const d = new Uint8Array(buf);
    if (d.length < 18) return null;
    const idLen = d[0], cmap = d[1], type = d[2], w = d[12] | (d[13] << 8), h = d[14] | (d[15] << 8), bpp = d[16], desc = d[17];
    if (cmap !== 0 || (type !== 2 && type !== 10) || (bpp !== 24 && bpp !== 32) || !w || !h || w > 1024 || h > 1024) return null;
    const bytes = bpp >> 3, out = new Uint8ClampedArray(w * h * 4), topLeft = (desc & 0x20) !== 0;
    let i = 18 + idLen, px = 0;
    const put = (b, g, r, a) => {
      const row = Math.floor(px / w), col = px % w, y = topLeft ? row : h - 1 - row, o = (y * w + col) * 4;
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a; px++;
    };
    if (type === 2) {
      while (px < w * h && i + bytes <= d.length) { put(d[i], d[i + 1], d[i + 2], bytes === 4 ? d[i + 3] : 255); i += bytes; }
    } else {
      while (px < w * h && i < d.length) {
        const c = d[i++], n = (c & 0x7f) + 1;
        if (c & 0x80) { const b = d[i], g = d[i + 1], r = d[i + 2], a = bytes === 4 ? d[i + 3] : 255; i += bytes; for (let k = 0; k < n && px < w * h; k++) put(b, g, r, a); }
        else for (let k = 0; k < n && px < w * h; k++) { put(d[i], d[i + 1], d[i + 2], bytes === 4 ? d[i + 3] : 255); i += bytes; }
      }
    }
    return { w, h, data: out };
  }
  NEB.decodeTga = decodeTga;
  const iconCache = new Map(); let iconBusy = 0; const iconQ = [];
  function pumpIcons() {
    while (iconBusy < 3 && iconQ.length) {
      const job = iconQ.shift(); iconBusy++;
      (async () => {
        try {
          const r = await fetch('/api/icon?id=' + job.id, { headers: { 'X-Nebulator-Token': NEB.token || '' } });
          if (!r.ok) return job.done(null);
          const img = decodeTga(await r.arrayBuffer());
          if (!img) return job.done(null);
          const c = document.createElement('canvas'); c.width = img.w; c.height = img.h;
          c.getContext('2d').putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
          c.toBlob(b => job.done(b ? URL.createObjectURL(b) : null), 'image/png');
        } catch { job.done(null); }
      })().finally(() => { iconBusy--; pumpIcons(); });
    }
  }
  // resolves to an object URL, or null when the game has no readable icon
  NEB.icon = id => {
    if (!id) return Promise.resolve(null);
    if (!iconCache.has(id)) iconCache.set(id, new Promise(res => { iconQ.push({ id, done: res }); pumpIcons(); }));
    return iconCache.get(id);
  };

  let polling = false, fails = 0;
  async function poll() {
    if (polling) return; polling = true;
    try {
      const st = await NEB.api('status');
      fails = 0;
      const wasOnline = NEB.online;
      NEB.online = true; NEB.status = st;
      if (!wasOnline) NEB.emit('online');
      if (st.state !== NEB.state) { const prev = NEB.state; NEB.state = st.state; NEB.emit('state', st.state, prev); }
      NEB.emit('status', st);
    } catch (e) {
      fails++;
      if (e.status === 401) { NEB.emit('badtoken'); }
      else if (fails >= 2 && NEB.online) { NEB.online = false; NEB.emit('offline'); }
      else if (fails >= 2) NEB.emit('offline');
    } finally { polling = false; }
  }
  NEB.startPolling = () => { poll(); setInterval(poll, 800); };
  NEB.pollNow = poll;
})();

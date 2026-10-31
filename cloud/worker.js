// NEBULATOR Shared Saves server: one small Cloudflare Worker + one KV namespace (both free).
// Each shared save has a random id and a secret key (both live inside the code you hand to friends).
// The server keeps the current and the previous version of every save.

const MAX_BYTES = 20 * 1024 * 1024;

const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...headers } });

async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// KV does not like empty values, so every stored blob gets a one byte prefix
const wrap = buf => { const o = new Uint8Array(buf.byteLength + 1); o[0] = 1; o.set(new Uint8Array(buf), 1); return o.buffer; };
const unwrap = buf => (buf ? buf.slice(1) : null);

const publicMeta = m => ({ name: m.name, titleId: m.titleId, version: m.version, updatedAt: m.updatedAt, by: m.by, size: m.size });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ping') return new Response('nebulator-saves ok', { headers: { 'content-type': 'text/plain' } });

    const m = url.pathname.match(/^\/s\/([a-z0-9]{8,24})(?:\/(create|meta|data|prev))?$/);
    if (!m) return json({ error: 'not found' }, 404);
    const id = m[1], action = m[2] || '';
    const key = request.headers.get('x-key') || '';
    if (key.length < 8) return json({ error: 'missing key' }, 401);
    const keyHash = await sha256(key);
    const meta = await env.SAVES.get('m:' + id, 'json');
    const now = Math.floor(Date.now() / 1000);
    const by = decodeURIComponent(request.headers.get('x-by') || '') || 'someone';

    if (action === 'create' && request.method === 'POST') {
      if (meta) return json({ error: 'exists' }, 409);
      let body = {};
      try { body = await request.json(); } catch { /* no body */ }
      const fresh = { keyHash, name: String(body.name || 'Shared save').slice(0, 60), titleId: String(body.titleId || '').slice(0, 16), version: 0, updatedAt: now, by: String(body.by || 'someone').slice(0, 60), size: 0 };
      await env.SAVES.put('m:' + id, JSON.stringify(fresh));
      return json({ ok: true }, 201);
    }

    if (!meta) return json({ error: 'not found' }, 404);
    if (meta.keyHash !== keyHash) return json({ error: 'wrong key' }, 401);

    if (action === 'meta' && request.method === 'GET') return json(publicMeta(meta));

    if (action === 'data' && request.method === 'GET') {
      if (meta.version === 0) return new Response(new ArrayBuffer(0), { headers: { 'x-version': '0' } });
      const buf = unwrap(await env.SAVES.get('d:' + id, 'arrayBuffer'));
      if (!buf) return json({ error: 'data missing' }, 404);
      return new Response(buf, { headers: { 'content-type': 'application/octet-stream', 'x-version': String(meta.version) } });
    }

    if (action === 'prev' && request.method === 'GET') {
      const buf = unwrap(await env.SAVES.get('p:' + id, 'arrayBuffer'));
      if (!buf) return json({ error: 'no previous version' }, 404);
      return new Response(buf, { headers: { 'content-type': 'application/octet-stream', 'x-version': String(meta.prevVersion || 0) } });
    }

    if (action === 'data' && request.method === 'PUT') {
      const base = parseInt(request.headers.get('x-base-version') || '-1', 10);
      if (base !== meta.version) return json({ error: 'newer version exists', ...publicMeta(meta) }, 409);
      const buf = await request.arrayBuffer();
      if (buf.byteLength > MAX_BYTES) return json({ error: 'too big' }, 413);
      if (meta.version > 0) {
        const cur = await env.SAVES.get('d:' + id, 'arrayBuffer');
        if (cur) await env.SAVES.put('p:' + id, cur);
        meta.prevVersion = meta.version;
      }
      await env.SAVES.put('d:' + id, wrap(buf));
      meta.version += 1;
      meta.updatedAt = now;
      meta.by = by.slice(0, 60);
      meta.size = buf.byteLength;
      await env.SAVES.put('m:' + id, JSON.stringify(meta));
      return json({ version: meta.version });
    }

    if (!action && request.method === 'DELETE') {
      await Promise.all([env.SAVES.delete('m:' + id), env.SAVES.delete('d:' + id), env.SAVES.delete('p:' + id)]);
      return json({ ok: true });
    }

    return json({ error: 'bad request' }, 400);
  },
};

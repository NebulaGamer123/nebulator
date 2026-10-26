// NEBULATOR shared-saves server: a Cloudflare Worker that stores save packs in Workers KV (free plan is enough).
// Anyone who knows a save's code can read and write it, so the code is the password: share it only with friends.
const MAX = 20 * 1024 * 1024;
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const err = (status, error) => json({ error }, status);

function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(b, x => ALPHA[x & 31]).join('');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'v1') return json({ nebulatorSharedSaves: 1 });
    const kv = env.SAVES;
    if (!kv) return err(500, 'the KV binding SAVES is missing: see shared-saves/README.md');

    if (parts[1] === 'create' && req.method === 'POST') {
      const body = await req.arrayBuffer();
      if (body.byteLength === 0 || body.byteLength > MAX) return err(413, 'save is empty or larger than 20 MB');
      const code = newCode();
      const meta = { name: (url.searchParams.get('name') || 'Shared save').slice(0, 60), title: (url.searchParams.get('title') || '').slice(0, 20), version: 1, updated: Math.floor(Date.now() / 1000), size: body.byteLength, by: '' };
      await kv.put('s:' + code, body, { metadata: meta });
      return json({ code, version: 1 });
    }

    const code = (parts[1] || '').toUpperCase();
    if (!/^[A-Z0-9]{8,16}$/.test(code)) return err(400, 'bad code');
    const sub = parts[2] || '';

    if (sub === '' && req.method === 'GET') {
      const r = await kv.getWithMetadata('s:' + code, { type: 'arrayBuffer' });
      if (!r.metadata) return err(404, 'that code doesn\'t exist');
      return json(r.metadata);
    }
    if (sub === 'data' && req.method === 'GET') {
      const r = await kv.get('s:' + code, { type: 'arrayBuffer' });
      if (!r) return err(404, 'that code doesn\'t exist');
      return new Response(r, { headers: { 'content-type': 'application/octet-stream' } });
    }
    if (sub === '' && req.method === 'PUT') {
      const cur = await kv.getWithMetadata('s:' + code, { type: 'arrayBuffer' });
      if (!cur.metadata) return err(404, 'that code doesn\'t exist');
      const body = await req.arrayBuffer();
      if (body.byteLength === 0 || body.byteLength > MAX) return err(413, 'save is empty or larger than 20 MB');
      const base = parseInt(url.searchParams.get('base') || '0', 10);
      const conflict = base !== cur.metadata.version;
      const meta = { ...cur.metadata, version: cur.metadata.version + 1, updated: Math.floor(Date.now() / 1000), size: body.byteLength, by: (url.searchParams.get('by') || '').slice(0, 40) };
      // keep what was there as the previous version so a bad overwrite can be undone
      await kv.put('p:' + code, cur.value, { metadata: cur.metadata });
      await kv.put('s:' + code, body, { metadata: meta });
      return json({ version: meta.version, conflict });
    }
    if (sub === 'restore' && req.method === 'POST') {
      const prev = await kv.getWithMetadata('p:' + code, { type: 'arrayBuffer' });
      const cur = await kv.getWithMetadata('s:' + code, { type: 'arrayBuffer' });
      if (!prev.metadata || !cur.metadata) return err(404, 'there is no previous version');
      const meta = { ...prev.metadata, version: cur.metadata.version + 1, updated: Math.floor(Date.now() / 1000) };
      await kv.put('p:' + code, cur.value, { metadata: cur.metadata });
      await kv.put('s:' + code, prev.value, { metadata: meta });
      return json({ version: meta.version });
    }
    return err(404, 'unknown route');
  },
};

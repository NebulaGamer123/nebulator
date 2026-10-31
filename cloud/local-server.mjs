// Runs the Worker on your own machine with an in-memory store, for testing NEBULATOR without Cloudflare:
//   node cloud/local-server.mjs [port]
// Data is lost when it stops. Not for real use.
import http from 'node:http';
import worker from './worker.js';

const store = new Map();
const kv = {
  async get(k, type) {
    const v = store.get(k);
    if (v === undefined) return null;
    if (type === 'json') return JSON.parse(v);
    if (type === 'arrayBuffer') return v.slice(0);
    return v;
  },
  async put(k, v) { store.set(k, typeof v === 'string' ? v : v.slice(0)); },
  async delete(k) { store.delete(k); },
};

const port = +process.argv[2] || 8787;
http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const r = new Request('http://' + req.headers.host + req.url, { method: req.method, headers: req.headers, body: hasBody ? body : undefined });
  const out = await worker.fetch(r, { SAVES: kv });
  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(Buffer.from(await out.arrayBuffer()));
}).listen(port, '127.0.0.1', () => console.log('nebulator-saves test server on', port));

// Local test server: node dev-server.mjs  (no database or blob store needed)
import http from 'node:http';
import fs from 'node:fs';
import { setSetting } from './lib/store.js';
import { hashPw } from './lib/auth.js';
import { memBlobs } from './lib/blob.js';

await setSetting('vote_pw', hashPw({}, 'vote1234'));
await setSetting('admin_pw', hashPw({}, 'admin1234'));
await setSetting('vote_pw_plain', 'vote1234');

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  try {
    if (u.pathname.startsWith('/api/')) {
      const mod = await import('./api/' + u.pathname.slice(5).replace(/[^a-z]/g, '') + '.js');
      const fn = mod[req.method];
      if (!fn) { res.writeHead(405); return res.end(); }
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
      const r = await fn(new Request(u.href, { method: req.method, headers: req.headers, body }));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    if (u.pathname.startsWith('/_local/blob/')) {
      const b = memBlobs.get(decodeURIComponent(u.pathname.split('/').pop()));
      if (!b) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': b.type }); return res.end(b.buf);
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync('index.html'));
  } catch (e) { console.error(e); res.writeHead(500); res.end(String(e)); }
}).listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000)));

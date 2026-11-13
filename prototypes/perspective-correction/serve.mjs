// Static server for the prototype: node serve.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || 5201);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg' };
const aliases = { '/opencv.js': 'node_modules/@techstark/opencv-js/dist/opencv.js' };

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = aliases[url] ?? (url === '/' ? 'index.html' : url.slice(1));
  const file = path.join(root, rel);
  if (!file.startsWith(root) || rel.includes('..')) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, {
      'content-type': types[path.extname(file)] || 'application/octet-stream',
      'content-length': st.size,
      'cache-control': url.startsWith('/samples/') || url === '/opencv.js' ? 'max-age=3600' : 'no-store',
    });
    fs.createReadStream(file).pipe(res);
  });
}).listen(port, '0.0.0.0', () => console.log(`perspective prototype on :${port}`));

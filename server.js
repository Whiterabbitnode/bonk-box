/* Bonk Box - the little server that hands the page to a browser.
   Zero dependencies on purpose: the toy is static files, and the whole point
   of it is that it runs from anywhere without a build step. This exists only
   so the same folder can also live at a URL. */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

/* Only these live at the URL. Anything else in the repo stays home. */
const SERVABLE = ['css', 'js', 'vendor', 'docs'];

function resolveRequest(pathname) {
  let clean;
  try {
    clean = decodeURIComponent(pathname);
  } catch (err) {
    return null; // malformed percent-encoding
  }
  const rel = clean === '/' ? 'index.html' : clean.replace(/^\/+/, '');
  const full = path.resolve(ROOT, rel);

  /* Keep everything inside the folder: a request may not climb out of it. */
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null;

  const first = path.relative(ROOT, full).split(path.sep)[0];
  if (first !== 'index.html' && SERVABLE.indexOf(first) === -1) return null;

  return full;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end('method not allowed');
  }

  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('ok');
  }

  const file = resolveRequest(new URL(req.url, 'http://localhost').pathname);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('nothing drawn here');
  }

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('nothing drawn here');
    }
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    /* The toy is tiny and changes when it changes; let the browser keep the
       vendored physics and the art, but always re-check the page itself. */
    const cache = path.basename(file) === 'index.html' ? 'no-cache' : 'public, max-age=3600';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Cache-Control': cache });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log('Bonk Box is on http://localhost:' + PORT);
});

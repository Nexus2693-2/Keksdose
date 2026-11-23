// Cloudflare Worker: liefert die Keksdose-Website aus dem öffentlichen Repo
// (raw.githubusercontent.com) aus und cached jede Datei am Edge.
const ORIGIN = 'https://raw.githubusercontent.com/Nexus2693-2/Keksdose/main/public';

const TYPES = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  webmanifest: 'application/manifest+json; charset=utf-8',
  png: 'image/png',
  svg: 'image/svg+xml',
  apk: 'application/vnd.android.package-archive',
  txt: 'text/plain; charset=utf-8',
  sha256sums: 'text/plain; charset=utf-8',
};

// Erlaubte Kandidaten für einen Pfad: eine Datei direkt, sonst die Ordner-Index.
function assetKeys(pathname) {
  const rel = pathname.replace(/^\/+/, '');
  if (rel === '') return ['index.html'];
  if (rel.endsWith('/')) return [rel + 'index.html'];
  if (/\.[a-z0-9]+$/i.test(rel)) return [rel];
  return [rel, rel + '/index.html'];
}

function typeFor(key) {
  const ext = key.split('/').pop().split('.').pop().toLowerCase();
  return TYPES[ext] || 'application/octet-stream';
}

async function load(key) {
  const upstream = await fetch(`${ORIGIN}/${key}`, {
    cf: { cacheEverything: true, cacheTtl: 3600 },
  });
  if (!upstream.ok) return null;
  const body = await upstream.arrayBuffer();
  return new Response(body, {
    headers: {
      'content-type': typeFor(key),
      'cache-control': 'public, max-age=300',
    },
  });
}

async function serve(key, cache, ctx) {
  const cacheKey = new Request(`https://keksdose.internal/${key}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const res = await load(key);
  if (!res) return null;
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/__health') return new Response('ok');

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    }

    const cache = caches.default;
    let res = null;
    for (const key of assetKeys(url.pathname)) {
      res = await serve(key, cache, ctx);
      if (res) break;
    }
    if (!res) {
      return new Response('Nicht gefunden', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    if (request.method === 'HEAD') {
      return new Response(null, { status: res.status, headers: res.headers });
    }
    return res;
  },
};

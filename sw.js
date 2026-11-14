// Service worker de El Castillo Food Mgta (PWA).
// - Los datos (/api/*) NUNCA se guardan: siempre van a internet para ver pedidos y menú al día.
// - Páginas y scripts: primero internet; si no hay conexión, la última copia guardada.
// - Imágenes, íconos y librerías externas: copia guardada y se actualiza en segundo plano.
const VERSION = 'v12';
const SHELL = 'castillo-shell-' + VERSION;
const RUNTIME = 'castillo-runtime-' + VERSION;
const MAX_RUNTIME = 120;
const PRECACHE = ['/offline.html', '/favicon.ico', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/favicon-32.png', '/manifest.webmanifest', '/manifest-personal.webmanifest'];
const HOSTS_EXTERNOS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'cdn.tailwindcss.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'unpkg.com'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(SHELL).then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== RUNTIME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function recortar(cache) {
    const ks = await cache.keys();
    if (ks.length > MAX_RUNTIME) await Promise.all(ks.slice(0, ks.length - MAX_RUNTIME).map(k => cache.delete(k)));
}
// 'copia' debe ser un res.clone() hecho ANTES de entregar la respuesta a la página
async function guardar(req, copia) {
    try {
        if (!copia || !(copia.ok || copia.type === 'opaque')) return;
        const c = await caches.open(RUNTIME); await c.put(req, copia); recortar(c);
    } catch (e) {}
}
async function internetPrimero(req, esPagina) {
    try {
        const res = await fetch(req);
        const copia = res.clone();
        guardar(req, copia);
        return res;
    } catch (err) {
        const copia = await caches.match(req, { ignoreSearch: true });
        if (copia) return copia;
        if (esPagina) { const off = await caches.match('/offline.html'); if (off) return off; }
        return Response.error();
    }
}
async function copiaYActualiza(req) {
    const copia = await caches.match(req);
    const red = fetch(req).then(res => { const copia = res.clone(); guardar(req, copia); return res; }).catch(() => null);
    return copia || (await red) || Response.error();
}

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin === self.location.origin) {
        if (url.pathname.startsWith('/api/')) return;               // datos: siempre en vivo
        if (url.pathname === '/sw.js') return;
        if (req.mode === 'navigate') { e.respondWith(internetPrimero(req, true)); return; }
        if (/\.(png|jpe?g|webp|svg|ico|gif|woff2?)$/i.test(url.pathname)) { e.respondWith(copiaYActualiza(req)); return; }
        e.respondWith(internetPrimero(req, false)); return;         // js, css, json
    }
    if (HOSTS_EXTERNOS.includes(url.hostname) || (url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/'))) {
        e.respondWith(copiaYActualiza(req));
    }
});

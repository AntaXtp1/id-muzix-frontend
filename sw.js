// ─── Id Muzix Service Worker ───────────────────────────────────────────────────
const SW_VERSION   = 'v1.0.0';
const CACHE_STATIC = `muzix-static-${SW_VERSION}`;
const CACHE_IMG    = `muzix-img-${SW_VERSION}`;

// Asset statis yang selalu di-cache saat install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/js/app.js',
  '/css/style.css',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ─── Install: pre-cache static assets ─────────────────────────────────────────
self.addEventListener('install', event => {
  console.log(`[SW] Install ${SW_VERSION}`);
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()) // aktif langsung tanpa tunggu tab lama tutup
  );
});

// ─── Activate: buang cache versi lama ─────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log(`[SW] Activate ${SW_VERSION}`);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_IMG)
          .map(k => {
            console.log(`[SW] Hapus cache lama: ${k}`);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim()) // ambil kontrol semua tab aktif
  );
});

// ─── Fetch: strategi per tipe request ─────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // ── 1. Skip non-GET dan browser extension ──────────────────────────────────
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // ── 2. Skip request ke backend API (streaming, search, dll) ───────────────
  // Jangan cache audio stream atau API response — biarkan langsung ke network
  const isBackend = url.hostname.includes('clawcloudrun.com')
    || url.hostname.includes('api-faa.my.id')
    || url.hostname.includes('ap-southeast-1');
  if (isBackend) return;

  // ── 3. Thumbnail & gambar eksternal → Cache then network ──────────────────
  const isImage = request.destination === 'image'
    || url.hostname.includes('ytimg.com')
    || url.hostname.includes('googleusercontent.com')
    || url.hostname.includes('aceimg.com');

  if (isImage) {
    event.respondWith(cacheFirst(request, CACHE_IMG));
    return;
  }

  // ── 4. Static assets (HTML, JS, CSS) → Stale-while-revalidate ─────────────
  const isStatic = STATIC_ASSETS.some(a => url.pathname === a || url.pathname.endsWith(a));
  if (isStatic || url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, CACHE_STATIC));
    return;
  }
});

// ─── Strategi: Cache First (untuk gambar) ─────────────────────────────────────
// Ambil dari cache kalau ada, kalau tidak ada fetch dari network lalu simpan
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Gambar gagal → return placeholder (kosong, biarkan onerror handler handle)
    return new Response('', { status: 408 });
  }
}

// ─── Strategi: Stale While Revalidate (untuk JS/CSS/HTML) ─────────────────────
// Return cache dulu (cepat), sambil update cache di background
async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  // Kalau ada cache → return langsung + update background
  // Kalau tidak ada cache → tunggu network
  return cached || await networkFetch || offlineFallback();
}

// ─── Offline fallback ─────────────────────────────────────────────────────────
function offlineFallback() {
  return new Response(
    `<!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Id Muzix — Offline</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          background: #080810; color: #e0e0e8;
          font-family: 'DM Sans', sans-serif;
          display: flex; align-items: center; justify-content: center;
          min-height: 100vh; text-align: center; padding: 24px;
        }
        .icon { font-size: 64px; margin-bottom: 16px; }
        h1 { font-size: 22px; margin-bottom: 8px; }
        p  { color: #666; font-size: 14px; line-height: 1.6; }
        button {
          margin-top: 24px; padding: 12px 28px;
          background: #c3f53c; color: #080810;
          border: none; border-radius: 24px;
          font-size: 14px; font-weight: 600; cursor: pointer;
        }
      </style>
    </head>
    <body>
      <div>
        <div class="icon">🎵</div>
        <h1>Lagi Offline nih</h1>
        <p>Koneksi internet lo putus.<br>Reconnect dulu ya baru bisa streaming lagi.</p>
        <button onclick="location.reload()">Coba Lagi</button>
      </div>
    </body>
    </html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// ─── Push Notification handler ─────────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'Id Muzix', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Id Muzix', {
      body:    data.body    || '',
      icon:    data.icon    || '/icons/icon-192.png',
      badge:   data.badge   || '/icons/icon-96.png',
      image:   data.image   || '',
      tag:     data.tag     || 'muzix-notif',
      data:    data.url     ? { url: data.url } : {},
      actions: data.actions || [],
      vibrate: [100, 50, 100],
      renotify: true,
    })
  );
});

// Klik notifikasi → buka/focus tab app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Kalau tab app sudah terbuka, focus aja
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Kalau belum ada, buka baru
      return clients.openWindow(targetUrl);
    })
  );
});

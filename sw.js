const CACHE_NAME = 'al-hasan-v1';
const RUNTIME_CACHE = 'al-hasan-runtime-v1';
const PRECACHE_URLS = [
    './',
    './index.html',
    './icon.png',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    console.log('🔧 SW: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_URLS).catch(err => console.warn('⚠️ SW cache:', err)))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    console.log('✅ SW: Activated');
    event.waitUntil(
        caches.keys().then((names) => Promise.all(
            names.map((name) => {
                if (name !== CACHE_NAME && name !== RUNTIME_CACHE) {
                    console.log('🗑️ SW: Deleting old cache:', name);
                    return caches.delete(name);
                }
            })
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;
    if (url.protocol === 'chrome-extension:') return;
    if (url.hostname.includes('firebaseio.com')) return;
    if (url.hostname.includes('googleapis.com')) return;
    if (url.hostname.includes('gstatic.com')) return;
    if (url.hostname.includes('cloudflare.com')) return;
    if (url.hostname.includes('jsdelivr.net')) return;
    if (url.hostname.includes('unpkg.com')) return;
    if (url.hostname.includes('tailwindcss.com')) return;

    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
                    return response;
                })
                .catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
        );
        return;
    }

    if (request.destination === 'image') {
        event.respondWith(
            caches.match(request).then((cached) => {
                if (cached) return cached;
                return fetch(request).then((response) => {
                    const clone = response.clone();
                    caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
                    return response;
                }).catch(() => cached);
            })
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            const fetchPromise = fetch(request).then((response) => {
                const clone = response.clone();
                caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
                return response;
            }).catch(() => cached);
            return cached || fetchPromise;
        })
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        caches.keys().then(names => names.forEach(name => caches.delete(name)));
    }
});
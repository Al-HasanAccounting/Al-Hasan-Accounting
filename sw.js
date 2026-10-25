const CACHE_NAME = 'al-hasan-v3';
const RUNTIME_CACHE = 'al-hasan-runtime-v3';
const PRECACHE_URLS = [
    './',
    './index.html',
    './icon.png',
    './manifest.json'
];
// مكتبات خارجية يحتاجها التطبيق ليعمل بدون إنترنت
const CDN_URLS = [
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js',
    'https://unpkg.com/html5-qrcode',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;900&display=swap',
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js'
];
const CDN_HOSTS = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await Promise.all([
            ...PRECACHE_URLS.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(err => console.warn('⚠️ SW cache:', u, err))),
            ...CDN_URLS.map(u => fetch(new Request(u, { mode: 'no-cors' })).then(r => cache.put(u, r)).catch(() => {}))
        ]);
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => Promise.all(
            names.map((name) => {
                if (name !== CACHE_NAME && name !== RUNTIME_CACHE) return caches.delete(name);
            })
        )).then(() => self.clients.claim())
    );
});

function putRuntime(request, response) {
    if (response && (response.ok || response.type === 'opaque')) {
        const clone = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone)).catch(() => {});
    }
    return response;
}

async function findCached(request) {
    return (await caches.match(request)) || null;
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;
    if (url.protocol === 'chrome-extension:') return;
    if (url.hostname.includes('firebaseio.com')) return;
    if (url.hostname.includes('googleapis.com') && url.hostname !== 'fonts.googleapis.com') return;
    const sameOrigin = url.origin === self.location.origin;
    if (!sameOrigin && !CDN_HOSTS.includes(url.hostname)) return;
    if (sameOrigin && url.pathname.endsWith('/sw.js')) return;

    // الصفحة: الشبكة أولاً (حد أقصى 3.5 ثانية) ثم النسخة المحفوظة عند انقطاع الإنترنت
    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith((async () => {
            try {
                const response = await Promise.race([
                    fetch(request),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3500))
                ]);
                putRuntime(request, response);
                return response;
            } catch (e) {
                const cached = (await findCached(request)) || (await caches.match('./index.html')) || (await caches.match('./'));
                if (cached) return cached;
                return new Response('<meta charset="utf-8"><body style="font-family:sans-serif;text-align:center;padding:40px;direction:rtl">لا يوجد اتصال بالإنترنت. افتح التطبيق مرة واحدة وأنت متصل ثم سيعمل بدون إنترنت.</body>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
            }
        })());
        return;
    }

    // الصور: من الكاش أولاً
    if (request.destination === 'image') {
        event.respondWith(
            caches.match(request).then((cached) => {
                if (cached) return cached;
                return fetch(request).then((response) => putRuntime(request, response)).catch(() => cached);
            })
        );
        return;
    }

    // باقي الملفات والمكتبات: من الكاش فوراً مع تحديثها بالخلفية
    event.respondWith(
        caches.match(request).then((cached) => {
            const fetchPromise = fetch(request).then((response) => putRuntime(request, response)).catch(() => cached);
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

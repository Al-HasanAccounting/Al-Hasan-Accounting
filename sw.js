/* sw.js — يجعل التطبيق يعمل بدون إنترنت.
   - صفحة التطبيق: تُجلب من الشبكة أولاً (لتصلك التحديثات)، وعند عدم توفر الإنترنت تُقدَّم النسخة المخزنة.
   - المكتبات الخارجية (Tailwind, FontAwesome, Chart.js, Firebase...): تُخزَّن وتُقدَّم من الكاش فوراً.
   لإجبار الأجهزة على تجديد المكتبات المخزنة غيّر رقم CACHE أدناه. */
const CACHE = 'alhasan-offline-v1';
const CORE = ['./', './index.html', './manifest.json', './icon.png'];
const CDN = [
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
const CDN_HOSTS = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com', 'www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all([
      ...CORE.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})),
      ...CDN.map((u) => fetch(new Request(u, { mode: 'no-cors' })).then((r) => cache.put(u, r)).catch(() => {}))
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirst(event, req) {
  const cache = await caches.open(CACHE);
  // 'no-cache' يجبر المتصفح على التحقق من الخادم فيصلك التحديث فوراً حتى لو كانت الاستضافة تخزن الملف مؤقتاً
  const netPromise = fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
    if (res && res.ok && !res.redirected) {
      cache.put(req, res.clone());
      if (req.mode === 'navigate') cache.put('./index.html', res.clone());
    }
    return res;
  });
  event.waitUntil(netPromise.catch(() => {}));   // إن تأخرت الشبكة نكمل التحميل ونحدّث الكاش في الخلفية
  try {
    return await Promise.race([netPromise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]);
  } catch (err) {
    const hit = (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./index.html')) || (await cache.match('./'));
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const net = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  if (hit) { event.waitUntil(net); return hit; }
  return (await net) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    const isPage = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/') || url.pathname.endsWith('sw.js');
    if (url.pathname.endsWith('sw.js')) return;           // المتصفح يتولى تحديث sw.js بنفسه
    event.respondWith(isPage ? networkFirst(event, req) : staleWhileRevalidate(event, req));
  } else if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(event, req));
  }
  // غير ذلك (Firebase وغيره): يمرّ مباشرة بلا تدخل
});

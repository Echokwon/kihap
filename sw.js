// 기합 — 오프라인 저장. 파일을 고치면 VERSION 을 올려 주세요.
const VERSION = 'kihap-v4';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon.svg',
  './shared/base.css', './shared/core.js', './shared/icons.js', './shared/db.js',
  './tools/', './tools/tools.css', './tools/tools.js',
  './manage/', './manage/manage.js', './attend/', './attend/attend.js',
  './planner/', './planner/planner.js', './bus/', './bus/bus.js',
  './tower/', './dodgeball/', './charades/', './ladder/', './run/', './run/run.js',
  './scoreboard/', './scoreboard/scoreboard.js', './poomsae/', './poomsae/poomsae.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('kihap-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 네트워크 먼저, 안 되면 저장본 (수업 중 와이파이가 끊겨도 동작)
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(fetch(req).then(r => {
    if (r && r.ok && (new URL(req.url).origin === location.origin || /fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net\/gh\/orioncactus\/pretendard/.test(req.url))) {
      const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy));
    }
    return r;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});

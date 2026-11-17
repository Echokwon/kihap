// 기합 — 오프라인 저장. 파일을 고치면 VERSION 을 올려 주세요.
const VERSION = 'kihap-v5';
// 바깥에서 받아 오는 큰 파일(글꼴 · 인식 프로그램 · 모델). 주소에 버전이 들어 있어 내용이 바뀌지 않으므로
// 따로 오래 보관한다 (VERSION 을 올려도 다시 받지 않음).
const LIBS = 'kihap-libs-1';
const LIB_RE = /^https:\/\/(fonts\.(googleapis|gstatic)\.com\/|cdn\.jsdelivr\.net\/(gh\/orioncactus\/pretendard@|npm\/(@vladmandic\/human@|jsqr@|qrcode-generator@|@mediapipe\/tasks-vision@))|cdnjs\.cloudflare\.com\/ajax\/libs\/html2canvas\/|storage\.googleapis\.com\/mediapipe-models\/)/;
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
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('kihap-') && k !== VERSION && k !== LIBS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // 바깥 파일: 저장본 먼저, 없으면 받아서 저장 (한 번 써 본 카메라 기능은 인터넷이 끊겨도 동작)
  if (LIB_RE.test(req.url)) {
    e.respondWith(caches.open(LIBS).then(c => c.match(req).then(hit => hit || fetch(req).then(r => {
      if (r && r.ok) c.put(req, r.clone());
      return r;
    }))));
    return;
  }
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  // 우리 파일: 네트워크 먼저, 안 되면 저장본 (수업 중 와이파이가 끊겨도 동작).
  // 브라우저가 잠깐 보관해 둔 옛 파일을 그대로 쓰지 않고 서버에 새 버전이 있는지 매번 확인한다(no-cache).
  // 그래야 고친 뒤에 '새 화면 + 옛 스크립트'가 섞여 열리는 일이 없다.
  const mine = new URL(req.url).origin === location.origin;
  const fresh = mine
    ? fetch(req.url, { cache: 'no-cache' }).then(r => (req.mode === 'navigate' && r.redirected) ? Response.redirect(r.url, 302) : r)
    : fetch(req);
  e.respondWith(fresh.then(r => {
    if (r && r.ok && mine) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return r;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});

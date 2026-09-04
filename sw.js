/* 医療診療録作成 — Service Worker
 *
 * 目的は「圏外でもアプリが開くこと」だけ。
 * 画面のファイルだけをキャッシュし、Claude API の通信には一切触れない。
 *
 * 更新手順: アプリのファイルを変更したら VERSION を上げる。
 */
var VERSION = 'v17';
var CACHE = 'medical-voice-' + VERSION;

var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (event) {
  // 待機状態に入り、利用者が「再読み込み」を選ぶまで切り替えない
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(SHELL);
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        if (name !== CACHE) return caches.delete(name);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;

  // 同一オリジンの GET 以外は素通し。api.anthropic.com はここに入らない
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) {
        // 見つかっても裏で取り直しておく（次回起動時に新しくなる）
        fetch(req).then(function (res) {
          if (res && res.ok) {
            caches.open(CACHE).then(function (c) { c.put(req, res.clone()); });
          }
        }).catch(function () { /* オフラインなら何もしない */ });
        return hit;
      }
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        // 画面遷移の要求で通信できないときは、キャッシュした本体を返す
        if (req.mode === 'navigate') return caches.match('./index.html');
        throw new Error('offline');
      });
    })
  );
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* 오프라인 재생용 서비스 워커: 화면 파일은 최신 우선, 음성은 저장해 둔 것을 우선 사용 */
var SHELL = 'ep-shell-v2';
var AUDIO = 'ep-audio-v1';
var SHELL_FILES = ['./', 'index.html', 'style.css', 'app.js', 'data.js', 'icons.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(SHELL_FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('ep-shell') === 0 && k !== SHELL; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (/\.mp3$/.test(url.pathname)) { e.respondWith(audioResponse(req)); return; }
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(SHELL).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match('index.html'); });
    })
  );
});

function audioResponse(req) {
  return caches.match(req.url, { cacheName: AUDIO }).then(function (hit) {
    if (!hit) return fetch(req);
    var range = req.headers.get('range');
    if (!range) return hit;
    return hit.arrayBuffer().then(function (buf) {
      var m = /bytes=(\d*)-(\d*)/.exec(range) || [];
      var start = m[1] ? parseInt(m[1], 10) : 0;
      var end = m[2] ? parseInt(m[2], 10) : buf.byteLength - 1;
      end = Math.min(end, buf.byteLength - 1);
      return new Response(buf.slice(start, end + 1), {
        status: 206,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Range': 'bytes ' + start + '-' + end + '/' + buf.byteLength,
          'Content-Length': String(end - start + 1),
          'Accept-Ranges': 'bytes'
        }
      });
    });
  });
}

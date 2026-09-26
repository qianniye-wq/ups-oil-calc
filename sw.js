/* UPS油量填单计算器 —— Service Worker
 *
 * 策略说明（重要，改之前先读）：
 *  - 页面导航：网络优先。这样你重新上传 index.html 后，下一次打开就是新版，
 *    不用手动清缓存；断网时回落缓存，装完就能离线用。
 *  - 同源静态资源：缓存优先 + 后台静默刷新，图标之类的更新下次生效。
 *  - 跨域请求：不拦截，直接走网络。
 *
 * 首页 HTML 被写进 './index.html' 这个固定键，配合网络优先，
 * 所以只改页面内容时不需要动 CACHE 版本号。
 * 若以后改了图标等静态资源想强制刷新，把 CACHE 的版本号 +1 即可。
 */

var CACHE = 'ups-oil-v1';

var CORE = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

/* ---------- 安装：预缓存核心资源 ---------- */

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // 逐个缓存，个别文件缺失（比如 PNG 图标还没生成）也不能让整个安装失败
      return Promise.all(CORE.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

/* ---------- 激活：清掉旧版本缓存 ---------- */

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        return key === CACHE ? null : caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* ---------- 取用 ---------- */

self.addEventListener('fetch', function (event) {
  var req = event.request;

  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }

  // 只处理同源，跨域交给浏览器
  if (url.origin !== self.location.origin) return;

  // 1) 页面导航：网络优先，保证改完立刻生效；断网回落缓存
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put('./index.html', copy);
          });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // 2) 其它同源资源：缓存优先 + 后台刷新
  event.respondWith(
    caches.match(req).then(function (hit) {
      var fresh = fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(req, copy);
          });
        }
        return res;
      }).catch(function () {
        return hit;
      });

      return hit || fresh;
    })
  );
});

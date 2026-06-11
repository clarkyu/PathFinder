/* 航向 PathFinder · Service Worker
 * 页面导航：网络优先（4 秒超时回退缓存壳），断网回退应用壳；
 *   只有真正的同源 HTML 成功响应才会写入应用壳缓存，
 *   防止强制门户（机场/酒店 Wi-Fi 登录页）污染离线能力。
 * 静态资源：stale-while-revalidate —— 先回缓存保证速度与离线，
 *   后台拉取新版本写入缓存，下次访问生效（部署后无需手动清缓存）。 */
"use strict";

var CACHE = "pathfinder-v2.5.0";
var NAV_TIMEOUT_MS = 4000;
var ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/data.js",
  "./js/store.js",
  "./js/app.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // cache: "reload" 绕过 HTTP 缓存，避免把 CDN 里的旧资源预缓存进新版本
      return c.addAll(ASSETS.map(function (u) { return new Request(u, { cache: "reload" }); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

// 只有「同源 + 200 + 非重定向 + HTML」的导航响应才允许覆盖应用壳缓存
function isTrustworthyShell(res) {
  return res && res.ok && !res.redirected && res.type === "basic" &&
    (res.headers.get("content-type") || "").indexOf("text/html") >= 0;
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return; // 外部链接不拦截

  // 页面导航：网络优先 + 超时竞速（弱网时别让用户干等，缓存壳就在手边）
  if (req.mode === "navigate") {
    var networkNav = fetch(req).then(function (res) {
      if (isTrustworthyShell(res)) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put("./index.html", copy); });
      }
      return res;
    });
    var timeoutShell = new Promise(function (resolve) {
      setTimeout(function () {
        caches.match("./index.html").then(resolve);
      }, NAV_TIMEOUT_MS);
    });
    e.respondWith(
      Promise.race([networkNav, timeoutShell])
        .then(function (res) { return res || networkNav; })
        .catch(function () { return caches.match("./index.html"); })
    );
    e.waitUntil(networkNav.catch(function () { /* 离线时静默 */ }));
    return;
  }

  // 静态资源：stale-while-revalidate
  e.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        var network = fetch(req).then(function (res) {
          if (res && res.ok) c.put(req, res.clone());
          return res;
        });
        if (hit) {
          e.waitUntil(network.catch(function () { /* 离线时静默 */ }));
          return hit;
        }
        return network;
      });
    })
  );
});

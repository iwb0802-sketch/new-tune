// Minimal service worker to satisfy PWA installability (홈 화면에 추가).
// Network-first for navigations so the app always loads the freshest build;
// no aggressive precaching to avoid serving stale tuner logic.
//
// VERSION 을 올리면 activate 시 기존 캐시(오래된 "/" 셸 포함)를 모두 비운다.
// iOS 홈화면 앱이 예전 번들을 계속 물고 있는 문제를 끊기 위한 것.
const VERSION = "v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 오래된 캐시(구버전 "/" 셸 등) 전부 삭제 → 최신 빌드만 남긴다.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // For page navigations: always try network first (fresh build), fall back to
  // the cached shell only when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put("/", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/").then((r) => r || Response.error())),
    );
    return;
  }
});

// Entry point referenced by index.html — composition only, real bootstrap
// lives in __main.tsx (template-managed).
import "./__main";

// PWA 서비스 워커 등록 — 홈 화면에 추가(설치) 가능하게 함.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

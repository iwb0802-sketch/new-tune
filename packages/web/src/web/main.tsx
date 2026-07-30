// Entry point referenced by index.html — composition only, real bootstrap
// lives in __main.tsx (template-managed).
import "./__main";

// PWA 서비스 워커 등록 — 홈 화면에 추가(설치) 가능하게 함.
// 새 빌드가 배포되면 SW를 즉시 갱신하고, 새 워커가 제어를 넘겨받는 순간
// 한 번만 새로고침해 최신 번들을 강제로 물게 한다(iOS 홈화면 앱 stale 방지).
if ("serviceWorker" in navigator) {
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // 실행 중 최신 SW로 갱신 확인
        reg.update().catch(() => {});
      })
      .catch(() => {});
  });
}

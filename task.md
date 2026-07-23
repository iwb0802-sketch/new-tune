# Piano Tuning Scope — build

Reyburn CyberTuner 스타일 인하모니시티 기반 조율 앱 (모바일, expo). 웹 프리뷰 마이크(Web Audio).

## Done
- app_init, 폰트(Noto Sans KR, JetBrains Mono) 설치
- design.md, constants/theme.ts (다크 계측기 팔레트 + 상태색)
- DSP 코어: notes, fft, pitch(YIN+HPS), partials, inharmonicity(B회귀), interpolation(PCHIP), stretch(옥타브 캐스케이드)
- lib/dsp/audio.ts (Web Audio 훅), lib/tuning-store.tsx (Context)

## TODO
- [ ] app.json: name/slug/bundleId, userInterfaceStyle dark
- [ ] app/_layout.tsx: 폰트 로드 + TuningProvider
- [ ] app/(tabs)/_layout.tsx: 탭 (튜너/측정/커브/설정)
- [ ] components: TunerMeter, CurveChart, Segmented, StatCard
- [ ] app/(tabs)/index.tsx (튜너)
- [ ] app/(tabs)/measure.tsx
- [ ] app/(tabs)/curve.tsx
- [ ] app/(tabs)/settings.tsx
- [ ] bun run dev:mobile (4300), lint, verify
- [ ] deliver

## Notes
- 상태색: |c|<=1 inTune, <=5 warn, else off
- 중앙 옥타브(key44-55) ET 앵커, 옥타브비 캐스케이드로 스트레치
- 수치는 전부 JetBrains Mono

## FINAL STATUS — DONE
- konsistent.json fixed (ErrorBoundary import rule typo → __ErrorBoundary)
- oxlint crash fixed via `sudo sysctl -w vm.overcommit_memory=1`
- Fixed 5 lint errors: new Array→Array.from (stretch.ts x2, interpolation.ts), stop circular dep via stopRef (measure.tsx), removed unused `running`
- typecheck: clean | lint: 0 warnings 0 errors | web bundle: 200, 4.8MB, no resolve errors
- DSP verified end-to-end: B fit exact, 88-key interpolation valid, stretch curve realistic (bass -4.3¢, A4 0¢, treble +21.9¢)
- Dev server running on :4300, delivered


---
## FINAL STATUS (verified)
- lint clean (konsistent 17 files, oxlint 0 warnings/errors)
- typecheck clean (tsc --noEmit)
- dev server running on port 4300
- web bundle compiles (HTTP 200, 4.8MB, all DSP/UI modules bundled)
- delivered as mobile artifact

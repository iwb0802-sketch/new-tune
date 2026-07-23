# Piano Tuning Scope — Web Port (packages/web)

Goal: client-side web version of the mobile tuner, deployable to Vercel from the monorepo.

## Done
- Copied pure DSP files → src/web/lib/dsp/ (notes, stretch, pitch, fft, inharmonicity, partials, interpolation, tuning-curve-data)
- src/web/lib/theme.ts (dark palette + Fonts + useColors)
- src/web/lib/status.ts
- src/web/lib/audio.ts (web-only Web Audio API)
- src/web/lib/tuning-store.tsx (copied, imports already relative)
- components/tuner/Segmented.tsx
- components/tuner/TunerMeter.tsx

## TODO components
- [ ] StrobeDisplay.tsx (rAF rotation)
- [ ] PianoKeyboard.tsx
- [ ] CurveChart.tsx
- [ ] ManualTuneChart.tsx (with PNG capture via captureWeb)
- [ ] Layout / tab nav (Link from wouter, 5 tabs: 튜너/수동/측정/커브/설정)

## TODO pages (src/web/pages/)
- [ ] index.tsx (튜너)
- [ ] manual.tsx (수동)
- [ ] measure.tsx (측정)
- [ ] curve.tsx (커브)
- [ ] settings.tsx (설정)

## TODO wiring
- [ ] app.tsx routes + Layout, keep AgentFeedback/RunableBadge
- [ ] provider.tsx: wrap TuningProvider inside QueryClientProvider
- [ ] index.html: Google Fonts (Noto Sans KR + JetBrains Mono), title, dark bg
- [ ] typecheck + lint + dev server verify + mic test
- [ ] vercel.json for monorepo import
- [ ] deliver (website), then ask about pushing to GitHub

## Notes
- Single dark theme (precision instrument). Use `colors` const, not useColors hook necessarily.
- Tabs: index=튜너, manual=수동, measure=측정, curve=커브, settings=설정
- Never edit __main.tsx. Keep AgentFeedback + RunableBadge in app.tsx.

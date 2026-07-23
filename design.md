# Piano Tuning Scope — Design

Reyburn CyberTuner 스타일의 인하모니시티 기반 피아노 조율 모바일 앱. 실시간 피치 감지(YIN+HPS)로 대표 건반의 배음을 측정해 각 현의 인하모니시티 계수(B)를 산출하고, 88건반 전체에 보간한 뒤 스트레치 커브(cents 오프셋)를 계산해 정밀 튜너 화면에서 실시간으로 조율을 돕는다. 다크 기반의 "정밀 계측기(precision instrument)" 미학, 기술적 미니멀리즘.

## Brand & Colors

다크 우선. 근검은 배경, 어두운 카드, 얇은 헤어라인, 모노 타이포, 채도 높은 상태 색으로 조율 상태를 표현.

Mobile: `Colors.light` / `Colors.dark` in `packages/mobile/constants/theme.ts` (read via `useColors()`). `userInterfaceStyle: "dark"`.

| Token | Dark | Use |
|-------|------|-----|
| background | #0B0D10 | 화면 배경 (near-black) |
| card | #14171C | 카드/서피스 |
| cardElevated | #1B1F26 | 강조 서피스, 미터 패널 |
| foreground | #F2F4F7 | 기본 텍스트 |
| mutedForeground | #8A929E | 보조 텍스트 |
| border | #232830 | 헤어라인 |
| primary | #6366F1 | 인디고 — 버튼/활성 탭/액센트 |
| inTune | #10B981 | 에메랄드 — 정확히 맞음 (±1c) |
| warn | #F59E0B | 앰버 — 근접 (±5c) |
| off | #EF4444 | 레드 — 벗어남 |
| precision | #8B5CF6 | 보라 — 커브/측정 데이터 |
| destructive | #EF4444 | 삭제/오류 |

상태 색 로직: |cents| ≤ 1 → inTune, ≤ 5 → warn, 그 외 → off.

## Typography

- **Display / Body**: Noto Sans KR (400/500/700) — 한국어 UI 전체
- **Mono / 수치**: JetBrains Mono (400/700) — 주파수, cents, Hz, B계수, 건반번호 등 모든 수치는 모노로 표기해 계측기 느낌

`expo-font`의 `useFonts`로 로드, `Fonts.sans` / `Fonts.mono`로 참조.

## Screens (mobile, expo-router tabs)

- **튜너** (`app/(tabs)/index.tsx`) — 메인. 감지된 음, 주파수, 목표 대비 cents 편차를 스트로브/니들 미터로 실시간 표시. 커브가 계산돼 있으면 그 오프셋을 목표로 사용.
- **측정** (`app/(tabs)/measure.tsx`) — 대표 건반 목록(A0,C2,F3,A4,C6,C8 등)을 하나씩 스트라이크해 배음 추출 → B계수·f0 산출. 측정 진행/재측정.
- **커브** (`app/(tabs)/curve.tsx`) — 88건반 보간된 B곡선과 스트레치 cents 커브(Railsback) 그래프. 스타일 변경 시 재계산.
- **설정** (`app/(tabs)/settings.tsx`) — A4 기준(415–445Hz), 옥타브 스타일(2:1/4:2/6:3/8:4), 마이크 상태, 데이터 초기화.

## Key User Flows

1. 설정에서 A4·옥타브 스타일 확인 → 측정 탭에서 대표 건반 순차 스트라이크 → 각 건반 B계수 산출.
2. 커브 탭에서 88건반 보간 곡선·스트레치 커브 자동 계산 및 확인.
3. 튜너 탭에서 임의 건반을 치면 커브 기반 목표 주파수 대비 실시간 편차 표시 → 정확히 맞으면 에메랄드.

## Architecture

- **DSP 코어** (`lib/dsp/`): 순수 TypeScript, 플랫폼 무관. `notes`(88건반/주파수), `fft`, `pitch`(YIN+HPS), `partials`(배음 추출), `inharmonicity`(B 회귀), `interpolation`(PCHIP), `stretch`(커브 계산).
- **오디오** (`lib/dsp/audio.ts`): 웹 프리뷰는 Web Audio API(getUserMedia+AudioContext)로 실시간 캡처. 네이티브 마이크 스트리밍은 후속.
- **상태**: `lib/tuning-store.tsx` React Context — 설정, 측정값(keyIndex→{B,f0}), 계산된 커브를 보관.
- **State/sync**: 로컬 상태 우선(v1 인메모리). 세션 저장/내보내기는 후속.

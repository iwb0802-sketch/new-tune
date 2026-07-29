/**
 * pitchEngine.ts — v3
 * 파트별 최적 피치 분석 엔진
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ 저음 (keyIndex  0~26, A0~D3)                                    │
 * │  - 버퍼 8192 필수 (27Hz = 주기 1633샘플, 최소 2주기 필요)        │
 * │  - YIN: fMin=20, fMax=200, threshold 적응형                     │
 * │  - 동적 배음 선택 (6/4/2 중 Goertzel magnitude 최강)            │
 * │  - Coarse(1¢) → Fine(0.2¢) 2단계 Goertzel 스캔                 │
 * │  - 옥타브 폴딩 마진 넓게 (×2 이내)                              │
 * │  - 안정화: RMS decay + 센트 표준편차 < 1.5¢ 동시 충족           │
 * │                                                                 │
 * │ 중음 (keyIndex 27~51, D#3~B4)                                   │
 * │  - 버퍼 4096                                                    │
 * │  - YIN: fMin=140, fMax=600, threshold 0.10                     │
 * │  - Goertzel: 2배음 기준, Coarse(2¢) → Fine(0.5¢)              │
 * │  - YIN + Goertzel 교차검증 ±6¢ 이내 → 가중평균                 │
 * │  - 안정화: RMS decay + 표준편차 < 1.0¢                         │
 * │                                                                 │
 * │ 고음 (keyIndex 52~87, C5~C8)                                    │
 * │  - 버퍼 4096 (고음은 주기 짧아서 충분)                          │
 * │  - YIN: fMin=500, fMax=5000, threshold 적응형(0.08~0.13)        │
 * │  - Goertzel: 기본음 기준, Coarse(2¢) → Fine(0.5¢)             │
 * │  - HPS 보정 비활성화 (배음 희박 → 오탐 위험)                    │
 * │  - 안정화: 표준편차 < 1.5¢, 짧은 decay(500ms)                  │
 * └─────────────────────────────────────────────────────────────────┘
 */

export const A0_FREQ = 27.5;
export const A4_FREQ = 440;
export const C8_FREQ = 4186.01;

// ─── 음역대 판별 ────────────────────────────────────────────────────
export type Zone = "low" | "mid" | "high";

export function getZone(keyIndex: number): Zone {
  if (keyIndex <= 26) return "low";
  if (keyIndex <= 51) return "mid";
  return "high";
}

// 음역대별 권장 FFT 버퍼 사이즈
export function getBufferSize(zone: Zone): 4096 | 8192 {
  return zone === "low" ? 8192 : 4096;
}

// ─── 기본 유틸 ──────────────────────────────────────────────────────
export function applyHannWindow(buf: Float32Array): Float32Array {
  const N = buf.length;
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    out[i] = buf[i] * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
  }
  return out;
}

export function getRMS(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

export function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
}

// ─── YIN (파트별 파라미터) ───────────────────────────────────────────
export interface YINParams {
  fMin: number;
  fMax: number;
  threshold: number;
}

export function getYINParams(zone: Zone, rms: number): YINParams {
  // threshold를 RMS 기반으로 적응형으로 조절
  // 신호가 약할수록 threshold 낮춰서 민감도 높임 (단, 최솟값 제한)
  switch (zone) {
    case "low":
      return {
        fMin: 20,
        fMax: 200,
        // 저음: 배음이 강해 기본음 감지 어려움 → threshold 낮게
        threshold: Math.max(0.08, Math.min(0.12, 0.15 - rms * 0.5)),
      };
    case "mid":
      return {
        fMin: 140,
        fMax: 600,
        threshold: 0.10,
      };
    case "high":
      return {
        fMin: 450,
        fMax: 6000,
        // 고음: 배음 희박하고 decay 빠름 → 약한 신호도 잡아야 함
        threshold: Math.max(0.07, Math.min(0.12, 0.16 - rms * 0.8)),
      };
  }
}

export function detectPitchYIN(
  buf: Float32Array,
  sr: number,
  params: YINParams
): number {
  const { fMin, fMax, threshold } = params;
  const half = Math.floor(buf.length / 2);
  const tauMin = Math.max(2, Math.floor(sr / fMax));
  const tauMax = Math.min(half - 1, Math.ceil(sr / fMin));
  const yin = new Float32Array(half);

  for (let tau = tauMin; tau <= tauMax; tau++) {
    let s = 0;
    for (let i = 0; i < half; i++) {
      const d = buf[i] - buf[i + tau];
      s += d * d;
    }
    yin[tau] = s;
  }

  // cumulative mean normalized difference
  yin[0] = 1;
  let rs = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    rs += yin[tau];
    if (rs > 0) yin[tau] *= tau / rs;
  }

  // 최소값 탐색
  let tau = tauMin;
  while (tau <= tauMax) {
    if (yin[tau] < threshold) {
      while (tau + 1 <= tauMax && yin[tau + 1] < yin[tau]) tau++;
      break;
    }
    tau++;
  }
  if (tau > tauMax || yin[tau] >= threshold) return -1;

  // parabolic interpolation
  let bt = tau;
  if (tau > tauMin && tau < tauMax) {
    const s0 = yin[tau - 1], s1 = yin[tau], s2 = yin[tau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) bt = tau + (s2 - s0) / denom;
  }
  return sr / bt;
}

// ─── 옥타브 폴딩 (파트별 마진) ──────────────────────────────────────
export function foldToBaseOctave(
  fYin: number,
  baseFreq: number,
  zone: Zone
): number {
  let f = fYin;
  // 저음은 배음이 강해서 기본음을 2~6배음으로 잡기 쉬움 → 넓은 마진
  const upperMargin = zone === "low" ? 3.5 : 1.5;
  const lowerMargin = zone === "low" ? 0.4 : 0.67;
  while (f > baseFreq * upperMargin) f /= 2;
  while (f < baseFreq * lowerMargin) f *= 2;
  return f;
}

// ─── Goertzel ────────────────────────────────────────────────────────
export function goertzel(
  buf: Float32Array,
  sr: number,
  targetFreq: number
): { real: number; imag: number; magnitude: number; phase: number } {
  const N = buf.length;
  const k = (N * targetFreq) / sr;
  const w = (2 * Math.PI * k) / N;
  const cosW = Math.cos(w);
  const sinW = Math.sin(w);
  const coeff = 2 * cosW;
  let q0 = 0, q1 = 0, q2 = 0;
  for (let i = 0; i < N; i++) {
    q0 = coeff * q1 - q2 + buf[i];
    q2 = q1;
    q1 = q0;
  }
  const real = q1 - q2 * cosW;
  const imag = q2 * sinW;
  return {
    real, imag,
    magnitude: Math.sqrt(real * real + imag * imag) / N,
    phase: Math.atan2(imag, real),
  };
}

// ─── 2단계 Goertzel 스캔 (Coarse → Fine) ────────────────────────────
// 1단계: 넓은 범위를 굵은 스텝으로 피크 탐색
// 2단계: 피크 ±(coarseStep×2) 구간을 fineStep으로 정밀 탐색
export interface GoertzelScanResult {
  bestFreq: number;       // 측정된 실제 주파수 (배음 포함)
  bestMagnitude: number;
  centsOffset: number;    // 기본음 기준 cent 오프셋
}

export function goertzelTwoPassScan(
  buf: Float32Array,
  sr: number,
  targetFreq: number,   // 기본음 × partial (배음 주파수)
  baseFreq: number,     // 건반 기본음
  partial: number,
  zone: Zone
): GoertzelScanResult {
  // 파트별 스캔 파라미터
  const coarseStep = zone === "low" ? 1.0 : 2.0;   // ¢
  const fineStep   = zone === "low" ? 0.2 : 0.5;   // ¢
  const scanRange  = zone === "high" ? 80 : 50;     // ±¢

  // 1단계: Coarse scan
  const coarseSteps = Math.round(scanRange / coarseStep);
  let bestFreq = targetFreq;
  let bestMag  = -1;
  for (let i = -coarseSteps; i <= coarseSteps; i++) {
    const f = targetFreq * Math.pow(2, (i * coarseStep) / 1200);
    const mag = goertzel(buf, sr, f).magnitude;
    if (mag > bestMag) { bestMag = mag; bestFreq = f; }
  }

  // 2단계: Fine scan (coarse 피크 ±coarseStep×2 구간)
  const fineRange = coarseStep * 2;
  const fineSteps = Math.round(fineRange / fineStep);
  let fineBestFreq = bestFreq;
  let fineBestMag  = -1;
  for (let i = -fineSteps; i <= fineSteps; i++) {
    const f = bestFreq * Math.pow(2, (i * fineStep) / 1200);
    const mag = goertzel(buf, sr, f).magnitude;
    if (mag > fineBestMag) { fineBestMag = mag; fineBestFreq = f; }
  }

  const measuredBase = fineBestFreq / partial;
  const centsOffset  = 1200 * Math.log2(measuredBase / baseFreq);

  return {
    bestFreq: fineBestFreq,
    bestMagnitude: fineBestMag,
    centsOffset: Math.round(centsOffset * 10) / 10,
  };
}

// ─── PT-100식 타겟 배음 (고정 fallback) ─────────────────────────────
export function targetPartial(keyIndex: number): number {
  if (keyIndex < 12) return 6;   // A0–G#1
  if (keyIndex < 24) return 4;   // A1–G#2
  if (keyIndex < 36) return 2;   // A2–G#3
  return 1;
}

// ─── 동적 배음 선택 (저음 전용) ─────────────────────────────────────
// 실제 버퍼에서 후보 배음의 Goertzel magnitude를 비교해 가장 강한 배음 선택
const MIN_GAIN_RATIO = 1.25; // 후보가 25% 이상 강해야 교체

export function selectBestPartial(
  buf: Float32Array,
  sr: number,
  keyIndex: number,
  baseFreq: number
): number {
  const fallback = targetPartial(keyIndex);
  if (keyIndex > 26) return fallback; // 저음 전용

  const candidates = [2, 4, 6].filter(
    p => baseFreq * p < sr / 2 && baseFreq * p > 40
  );
  if (!candidates.length) return fallback;

  let best = fallback;
  let bestMag = goertzel(buf, sr, baseFreq * fallback).magnitude;

  for (const p of candidates) {
    if (p === fallback) continue;
    const mag = goertzel(buf, sr, baseFreq * p).magnitude;
    if (mag > bestMag * MIN_GAIN_RATIO) { bestMag = mag; best = p; }
  }
  return best;
}

// ─── HPS 옥타브 보정 (중음 이하만) ─────────────────────────────────
// 고음(keyIndex >= 52)은 HPS 비활성화
export function correctOctaveByHPS(
  fYin: number,
  spectrumDb: Float32Array,
  sr: number,
  fftSize: number,
  keyIndex: number
): number {
  if (keyIndex >= 52 || fYin <= 0) return fYin;

  const numHarmonics = keyIndex <= 26 ? 6 : 4; // 저음은 6배음까지
  const binHz = sr / fftSize;
  const N = spectrumDb.length;

  const magAt = (freq: number): number => {
    const bin = Math.round(freq / binHz);
    if (bin < 1 || bin >= N) return 0;
    let maxDb = -Infinity;
    for (let d = -1; d <= 1; d++) {
      const b = bin + d;
      if (b >= 1 && b < N && spectrumDb[b] > maxDb) maxDb = spectrumDb[b];
    }
    if (maxDb < -90) return 0;
    return Math.pow(10, maxDb / 20);
  };

  const candidates: number[] = [];
  const maxDiv = keyIndex <= 26 ? 6 : 3;
  for (let div = 1; div <= maxDiv; div++) {
    const c = fYin / div;
    if (c >= A0_FREQ * 0.97) candidates.push(c);
  }

  const score = (c: number) => {
    let s = 0;
    for (let k = 1; k <= numHarmonics; k++) {
      if (k * c > sr / 2) break;
      s += magAt(k * c);
    }
    return s;
  };

  let bestC = fYin;
  let bestS = score(fYin);
  for (const c of candidates) {
    if (c === fYin) continue;
    const s = score(c);
    // 저음은 서브하모닉 교체 마진 낮춤 (배음 오탐 빈번)
    const margin = keyIndex <= 26 ? 1.10 : 1.15;
    if (s > bestS * margin) { bestS = s; bestC = c; }
  }
  return bestC;
}

// ─── 안정화 판정 (RMS decay + 센트 표준편차) ───────────────────────
export interface StabilityConfig {
  peakRatio: number;      // rms < peak * peakRatio 이면 decay 구간
  peakThreshold: number;  // 최소 피크 RMS
  maxStddev: number;      // 센트 표준편차 한계
  durationMs: number;     // 안정 유지 시간
  minSamples: number;     // 최소 샘플 수
}

export function getStabilityConfig(zone: Zone): StabilityConfig {
  switch (zone) {
    case "low":
      return {
        peakRatio:     0.60,  // 저음: 긴 sustain, 천천히 decay
        peakThreshold: 0.012,
        maxStddev:     1.5,   // ¢
        durationMs:    1100,
        minSamples:    10,
      };
    case "mid":
      return {
        peakRatio:     0.55,
        peakThreshold: 0.015,
        maxStddev:     1.0,
        durationMs:    900,
        minSamples:    8,
      };
    case "high":
      return {
        peakRatio:     0.40,  // 고음: 빠른 decay 허용
        peakThreshold: 0.006,
        maxStddev:     2.0,
        durationMs:    450,
        minSamples:    5,
      };
  }
}

// ─── 위상차 → cent ───────────────────────────────────────────────────

// --- FFT Peak freq (rough zone detection before YIN) ---
export function getFFTPeakFreq(
  spec: Float32Array,
  sr: number,
  fftSize: number,
  fMin = 200,
  fMax = 8000
): number {
  const binHz = sr / fftSize;
  const binMin = Math.max(1, Math.floor(fMin / binHz));
  const binMax = Math.min(spec.length - 1, Math.ceil(fMax / binHz));
  let peakBin = binMin;
  let peakVal = -Infinity;
  for (let i = binMin; i <= binMax; i++) {
    if (spec[i] > peakVal) { peakVal = spec[i]; peakBin = i; }
  }
  return peakBin * binHz;
}

export function centsFromPhaseDelta(
  prevPhase: number,
  currPhase: number,
  dtSec: number,
  targetFreq: number
): number {
  let dp = currPhase - prevPhase;
  while (dp > Math.PI)  dp -= 2 * Math.PI;
  while (dp < -Math.PI) dp += 2 * Math.PI;
  const actual = targetFreq + dp / (2 * Math.PI * dtSec);
  if (actual <= 0) return 0;
  return 1200 * Math.log2(actual / targetFreq);
}

// ─────────────────────────────────────────────────────────────────────
// ─── TWM (Two-Way Mismatch) — 인하모니시티 반영 f0+B 동시 추정 ───────
// Maher & Beauchamp (1994) 방식의 단순화 구현.
// 피아노 현의 강성 때문에 배음이 fn = n·f0·√(1+B·n²) 로 늘어나는 걸
// 후보(f0, B) 그리드서치로 동시에 찾아냄 → YIN 사후보정보다 원리적으로 정확.
// ─────────────────────────────────────────────────────────────────────

interface SpectralPeak { freq: number; mag: number; }

// dB 스펙트럼에서 로컬 피크 추출 (파라볼릭 보간으로 서브빈 정밀도 확보)
function extractPeaks(
  spectrumDb: Float32Array,
  sr: number,
  fftSize: number,
  fMin: number,
  fMax: number,
  maxPeaks = 12
): SpectralPeak[] {
  const binHz = sr / fftSize;
  const binMin = Math.max(1, Math.floor(fMin / binHz));
  const binMax = Math.min(spectrumDb.length - 2, Math.ceil(fMax / binHz));
  const peaks: SpectralPeak[] = [];

  for (let i = binMin; i <= binMax; i++) {
    const c = spectrumDb[i];
    if (c < -85) continue;
    if (c > spectrumDb[i - 1] && c >= spectrumDb[i + 1]) {
      const l = spectrumDb[i - 1], r = spectrumDb[i + 1];
      const denom = l - 2 * c + r;
      const delta = denom !== 0 ? 0.5 * (l - r) / denom : 0;
      const freq = (i + delta) * binHz;
      const mag = Math.pow(10, c / 20);
      peaks.push({ freq, mag });
    }
  }
  peaks.sort((a, b) => b.mag - a.mag);
  return peaks.slice(0, maxPeaks);
}

// 후보 (f0, B)에 대한 양방향 불일치 오차 (cents 단위, 진폭 가중)
function twmError(peaks: SpectralPeak[], f0: number, B: number, numPartials: number): number {
  const maxMag = peaks.reduce((m, p) => Math.max(m, p.mag), 1e-9);
  const predicted: number[] = [];
  for (let n = 1; n <= numPartials; n++) {
    predicted.push(n * f0 * Math.sqrt(1 + B * n * n));
  }
  const pMax = predicted[predicted.length - 1] * 1.5;

  // 예측 → 최근접 측정 피크
  let err1 = 0;
  for (const pf of predicted) {
    let best = Infinity;
    for (const pk of peaks) {
      const d = Math.abs(pk.freq - pf);
      if (d < best) best = d;
    }
    err1 += Math.abs(1200 * Math.log2(Math.max(pf + best, 1) / pf));
  }
  err1 /= predicted.length;

  // 측정 → 최근접 예측 배음 (진폭 가중)
  let err2 = 0, wsum = 0;
  for (const pk of peaks) {
    if (pk.freq > pMax) continue;
    let best = Infinity, bestPf = pk.freq;
    for (const pf of predicted) {
      const d = Math.abs(pk.freq - pf);
      if (d < best) { best = d; bestPf = pf; }
    }
    const w = pk.mag / maxMag;
    err2 += Math.abs(1200 * Math.log2(Math.max(pk.freq, 1) / Math.max(bestPf, 1))) * w;
    wsum += w;
  }
  if (wsum > 0) err2 /= wsum;

  return err1 + err2;
}

export interface TWMResult {
  f0: number;
  B: number;
  error: number;
  nPartials?: number;   // 회귀에 실제 사용된 배음 개수 (refineByPartialFitV2 전용)
  confidence?: number;  // 0~1, 적합오차 + 사용배음수 기반 신뢰도 (refineByPartialFitV2 전용)
}


/**
 * f0Guess(YIN+HPS 보정 이후 값) 근방 ±40¢, B는 구간별 범위에서
 * 그리드서치로 (f0, B) 동시 추정. 배음이 2개 미만이면 무의미하므로 null.
 */
export function refineByTWM(
  spectrumDb: Float32Array,
  sr: number,
  fftSize: number,
  f0Guess: number,
  zone: Zone
): TWMResult | null {
  if (f0Guess <= 0) return null;

  const numPartials = zone === "low" ? 8 : zone === "mid" ? 6 : 4;
  const bMax = zone === "low" ? 0.0020 : zone === "mid" ? 0.0006 : 0.0002;
  const bSteps = 6;
  const centsRange = 40;
  const f0Steps = 8;

  const peaks = extractPeaks(spectrumDb, sr, fftSize, f0Guess * 0.5, f0Guess * numPartials * 1.6);
  if (peaks.length < 2) return null;

  let bestF0 = f0Guess, bestB = 0, bestErr = Infinity;
  for (let bi = 0; bi <= bSteps; bi++) {
    const B = (bi / bSteps) * bMax;
    for (let fi = -f0Steps; fi <= f0Steps; fi++) {
      const f0 = f0Guess * Math.pow(2, (fi * (centsRange / f0Steps)) / 1200);
      const err = twmError(peaks, f0, B, numPartials);
      if (err < bestErr) { bestErr = err; bestF0 = f0; bestB = B; }
    }
  }

  return { f0: bestF0, B: bestB, error: bestErr };
}

// ─────────────────────────────────────────────────────────────────────
// ─── 건반별 이론적 인하모니시티(B) 상한 곡선 ─────────────────────────
// 실측 캘리브레이션 없이도, 일반적인 피아노의 B 분포 경향(저음일수록 크고
// 중고음으로 갈수록 작아짐, Fletcher & Rossing 등 음향학 문헌 기준 근사치)을
// 반영해 건반별로 다른 탐색창 상한을 줌. zone 전체에 고정값 하나 쓰던 것보다
// 배음-피크 매칭 단계의 오매칭(엉뚱한 배음/이웃음 배음을 주워오는 것)을 줄여줌.
// ─────────────────────────────────────────────────────────────────────
function estimateBUpperBound(keyIndex: number): number {
  // 앵커 포인트 (건반 인덱스 0=A0 ~ 87=C8) — 저음에서 크고 중음 지나며 급격히 작아짐
  if (keyIndex <= 0) return 0.0040;
  if (keyIndex <= 26) {
    // A0(0)→D3(26): 0.0040 → 0.0006 지수적으로 감소
    const t = keyIndex / 26;
    return 0.0040 * Math.pow(0.0006 / 0.0040, t);
  }
  if (keyIndex <= 51) {
    // D#3(27)→B4(51): 0.0006 → 0.00015
    const t = (keyIndex - 27) / (51 - 27);
    return 0.0006 * Math.pow(0.00015 / 0.0006, t);
  }
  // 고음(52~87)은 refineByPartialFitV2 자체가 호출 안 되지만, 안전하게 작은 값 반환
  return 0.0002;
}

// ─────────────────────────────────────────────────────────────────────
// ─── Partial-Fit v2 — Rigaud et al. (2013) 스타일 최소자승 인하모니시티 피팅 ──
// fn = n·f0·√(1+B·n²)  →  (fn/n)² = f0² + (f0²·B)·n²
// 즉 X=n², Y=(fn/n)² 로 두면 Y = a + b·X 인 "1차 선형회귀" 문제로 바뀜.
// 배음 주파수 fn들을 스펙트럼에서 찾아 대입하면 최소자승법으로 f0², f0²B가
// 닫힌 형태(반복 없음)로 바로 나옴 — 격자탐색(grid search)보다 가볍고 정확함.
// Verituner/TuneLab 등 전문 ETD가 쓰는 것과 같은 계열의 방식.
//
// v2.1 개선점:
//  1) 배음-피크 매칭 탐색창을 zone 고정값 대신 건반별 이론적 B곡선으로 결정
//     → 저음 안에서도 A0/D3처럼 실제 B가 크게 다른 건반을 더 정확히 구분
//  2) 1차 회귀 후 잔차(예측 vs 실측, cents)가 큰 이상치 배음을 제외하고
//     1회 재적합(robust refit) → 오매칭된 배음 1~2개가 전체 회귀를 망치는 것 방지
//
// 시험용2 탭 전용 — 기존 refineByTWM/시험용 탭은 변경 없이 그대로 유지.
// ─────────────────────────────────────────────────────────────────────
function fitLine(points: { n: number; freq: number }[]): { f0: number; B: number } | null {
  const N = points.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (const { n, freq } of points) {
    const X = n * n;
    const Y = (freq / n) * (freq / n);
    sumX += X; sumY += Y; sumXY += X * Y; sumXX += X * X;
  }
  const denom = N * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-9) return null;

  const b = (N * sumXY - sumX * sumY) / denom; // = f0² · B
  const a = (sumY - b * sumX) / N;             // = f0²
  if (a <= 0) return null;

  const f0 = Math.sqrt(a);
  let B = b / a;
  if (!isFinite(B) || B < 0) B = 0;
  return { f0, B };
}

export function refineByPartialFitV2(
  spectrumDb: Float32Array,
  sr: number,
  fftSize: number,
  f0Guess: number,
  zone: Zone,
  keyIndex: number,
  bHint?: number // 세션 내 이웃 건반들에서 누적학습된 B 기대값 (있으면 이론곡선보다 우선)
): TWMResult | null {
  if (f0Guess <= 0) return null;

  // 저음일수록 배음이 더 많이 살아있으므로 더 많은 배음을 활용 (나이퀴스트 한도 내)
  const maxPartials = zone === "low" ? 14 : zone === "mid" ? 8 : 5;
  const nyquistCap = Math.floor((sr / 2) / f0Guess);
  const numPartials = Math.max(2, Math.min(maxPartials, nyquistCap));

  // zone 고정값 대신 건반별 이론적 B 상한 사용 (매칭창을 더 정확하게)
  // 세션 내 이웃 건반들에서 학습된 B 기대값이 있으면 그걸 우선 사용 (여유마진 1.8배),
  // 없으면 88건반 이론적 B 상한 곡선으로 폴백
  const bMaxAssumed = bHint !== undefined && bHint > 0
    ? Math.max(bHint * 1.8, estimateBUpperBound(keyIndex) * 0.25)
    : estimateBUpperBound(keyIndex);

  const peaks = extractPeaks(spectrumDb, sr, fftSize, f0Guess * 0.4, f0Guess * numPartials * 1.8, 30);
  if (peaks.length < 3) return null;

  // ── 각 배음 번호(n)마다 스펙트럼에서 실제 피크를 찾아 매칭 ──
  const matched: { n: number; freq: number }[] = [];
  for (let n = 1; n <= numPartials; n++) {
    const lo = n * f0Guess * 0.995;
    const hi = n * f0Guess * Math.sqrt(1 + bMaxAssumed * n * n) * 1.02;
    let best: SpectralPeak | null = null;
    for (const pk of peaks) {
      if (pk.freq < lo || pk.freq > hi) continue;
      if (!best || pk.mag > best.mag) best = pk;
    }
    if (best) matched.push({ n, freq: best.freq });
  }
  if (matched.length < 3) return null; // 매칭된 배음이 부족하면 신뢰 불가 → 폴백

  // ── 1차 선형회귀 ──
  const fit1 = fitLine(matched);
  if (!fit1) return null;

  // ── 잔차 계산 후 이상치 제외 → 1회 robust 재적합 ──
  const residuals = matched.map(({ n, freq }) => {
    const predicted = n * fit1.f0 * Math.sqrt(1 + fit1.B * n * n);
    return { pt: { n, freq }, cents: Math.abs(1200 * Math.log2(freq / predicted)) };
  });
  const avgResidual = residuals.reduce((s, r) => s + r.cents, 0) / residuals.length;
  const inlierThresh = Math.max(8, avgResidual * 2.5); // 최소 8¢ 허용, 평균의 2.5배 넘으면 이상치
  const inliers = residuals.filter(r => r.cents <= inlierThresh).map(r => r.pt);

  let finalF0 = fit1.f0, finalB = fit1.B;
  if (inliers.length >= 3 && inliers.length < matched.length) {
    const fit2 = fitLine(inliers);
    if (fit2) { finalF0 = fit2.f0; finalB = fit2.B; }
  }

  // ── 최종 적합도(오차) 계산 ──
  const usedPoints = inliers.length >= 3 ? inliers : matched;
  let errSum = 0;
  for (const { n, freq } of usedPoints) {
    const predicted = n * finalF0 * Math.sqrt(1 + finalB * n * n);
    errSum += Math.abs(1200 * Math.log2(freq / predicted));
  }
  const error = errSum / usedPoints.length;

  // ── 신뢰도 점수: 적합오차가 작을수록, 사용된 배음이 많을수록 높음 (0~1) ──
  const errorScore = Math.max(0, Math.min(1, 1 - error / 25));
  const partialScore = Math.max(0, Math.min(1, usedPoints.length / maxPartials));
  const confidence = Math.round(errorScore * partialScore * 100) / 100;

  return { f0: finalF0, B: finalB, error, nPartials: usedPoints.length, confidence };
}


/**
 * repeatAverage.ts
 * 같은 건반을 여러 번 타건했을 때의 "반복 측정 가중평균"
 *
 * 배경: 스트로브 시험용 화면은 타건 1회당 엔진이 안정값(finalCents)을 1개 확정한다.
 * 피아노는 타건 세기·터치·배음 위상에 따라 같은 줄이라도 회차마다 ±1~3센트씩 흔들린다.
 * 한 번의 값만 쓰면 그 흔들림이 그대로 조율값이 되므로, 같은 건반을 3회 이상 치면
 * 서로 비슷한 범위에 모인 값들만 골라 가중평균을 내서 조율값으로 확정한다.
 *
 * 중요: 센트값의 절대 크기는 절대 제한하지 않는다. A0가 -30센트, 고음부가 +25센트로
 * 나오는 건 그 피아노의 정상적인 조율 커브다. 걸러내는 대상은 "절대값이 큰 값"이 아니라
 * "그 건반의 다른 회차들과 동떨어진 값"뿐이다. 판정은 전부 중앙값 기준 상대값으로 한다.
 *
 * "비슷한 센트값 범위" 판정 (MAD 기반 자동 적응):
 *  1) 전체 샘플의 중앙값(median)을 기준점으로 잡는다 (평균과 달리 튄 값에 안 끌려감).
 *  2) 허용폭을 고정하지 않고, 그 건반에서 실제로 관측된 산포로부터 계산한다.
 *     MAD(중앙값 절대편차) × 1.4826 = 로버스트 표준편차 추정치 → 그 3배를 허용폭으로.
 *     - A0처럼 회차별로 -28/-30/-34 씩 넓게 흩어지는 저음은 허용폭이 자동으로 넓어져
 *       세 회차 모두 정상 채택된다.
 *     - 중음처럼 -30.1/-30.0/-29.9 로 촘촘하면 허용폭이 좁아져 미세한 이탈도 걸러낸다.
 *     - 허용폭은 MIN_TOLERANCE~MAX_TOLERANCE 사이로만 움직인다(과도한 축소/확대 방지).
 *  3) 중앙값에서 그 허용폭 안에 든 샘플만 채택 = 클러스터.
 *     -28/-30/-32 로 모이던 중에 갑자기 나온 +2 같은 회차는 여기서 자동 제외된다.
 *  4) 클러스터가 최소 회차(기본 3)를 못 채우면 평균을 내지 않는다(null 반환).
 *     아직 값이 안 모였다는 뜻이므로 기존 단발 측정값을 그대로 쓴다.
 *
 * 가중치:
 *  - 엔진 신뢰도(교차검증 통과 여부 + 인하모니시티 적합 신뢰도)를 기본 가중치로 쓰고,
 *  - 중앙값에서 멀수록 1/(1+d²) 로 감쇠시켜 클러스터 가장자리 값의 영향력을 줄인다.
 */

export interface CentSample {
  /** 그 회차에 확정된 센트값 */
  cents: number;
  /** 엔진 신뢰도 기반 가중치 (0~1). 모르면 0.5 */
  weight: number;
  /** 측정 시각(ms) — 표시/디버깅용 */
  t: number;
}

export interface RepeatAverageResult {
  /** 가중평균 센트 (소수 1자리 반올림) */
  value: number;
  /** 평균에 실제로 사용된 회차 수 */
  used: number;
  /** 누적된 전체 회차 수 */
  total: number;
  /** 사용된 샘플의 최대-최소 폭(센트) — 작을수록 일관된 측정 */
  spread: number;
  /** 이번 판정에 실제로 쓰인 허용폭(센트) — 산포에 따라 자동 결정됨 */
  tolerance: number;
}

/** 평균을 내기 시작하는 최소 타건 횟수 */
export const REPEAT_MIN_SAMPLES = 3;
/** 허용폭 하한 — 값이 아주 촘촘해도 이보다 좁게는 안 조인다 */
export const MIN_TOLERANCE = 3;
/** 허용폭 상한 — 값이 아무리 흩어져도 이보다 넓게는 안 벌린다(서로 다른 음 뭉개짐 방지) */
export const MAX_TOLERANCE = 12;
/** MAD → 표준편차 환산 계수 */
const MAD_TO_SIGMA = 1.4826;
/** 허용폭 = 로버스트 시그마 × 이 배수 */
const SIGMA_K = 3;
/** 건반당 보관하는 최대 회차 (오래된 것부터 버림) */
export const MAX_SAMPLES = 12;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * 엔진 결과에서 가중치를 뽑는다.
 * 교차검증(YIN·Goertzel 일치)을 통과한 회차를 우대하고,
 * 인하모니시티 적합 신뢰도를 부드럽게 반영한다.
 */
export function sampleWeight(crossValid: boolean, inharmConfidence: number | null): number {
  const conf = inharmConfidence ?? 0.5;
  const base = crossValid ? 1 : 0.55;
  return Math.max(0.05, Math.min(1, base * (0.5 + 0.5 * conf)));
}

/**
 * 관측된 산포로부터 허용폭을 정한다 (MAD 기반, 절대 센트값과 무관).
 * 값이 넓게 흩어지는 건반은 넓게, 촘촘한 건반은 좁게 자동 적응한다.
 */
export function adaptiveTolerance(centsList: number[]): number {
  const med = median(centsList);
  const mad = median(centsList.map((c) => Math.abs(c - med)));
  const sigma = mad * MAD_TO_SIGMA;
  const tol = sigma * SIGMA_K;
  if (!isFinite(tol) || tol <= 0) return MIN_TOLERANCE;
  return Math.max(MIN_TOLERANCE, Math.min(MAX_TOLERANCE, tol));
}

/**
 * 누적 샘플에서 반복 측정 가중평균을 계산한다.
 * 조건(최소 회차 + 클러스터 형성)을 못 채우면 null.
 * tolerance를 넘기지 않으면 샘플 산포에 맞춰 자동 계산한다.
 */
export function weightedRepeatAverage(
  samples: CentSample[],
  minSamples: number = REPEAT_MIN_SAMPLES,
  tolerance?: number,
): RepeatAverageResult | null {
  if (samples.length < minSamples) return null;

  const centsAll = samples.map((s) => s.cents);
  const med = median(centsAll);
  const tol = tolerance ?? adaptiveTolerance(centsAll);
  const cluster = samples.filter((s) => Math.abs(s.cents - med) <= tol);
  if (cluster.length < minSamples) return null;

  let num = 0;
  let den = 0;
  for (const s of cluster) {
    const d = (s.cents - med) / tol; // 0~1로 정규화된 거리
    const w = s.weight / (1 + d * d);
    num += s.cents * w;
    den += w;
  }
  if (den <= 0) return null;

  const centsList = cluster.map((s) => s.cents);
  return {
    value: Math.round((num / den) * 10) / 10,
    used: cluster.length,
    total: samples.length,
    spread: Math.round((Math.max(...centsList) - Math.min(...centsList)) * 10) / 10,
    tolerance: Math.round(tol * 10) / 10,
  };
}

/** 새 샘플을 누적 버퍼에 밀어 넣고 최대 길이로 자른다. */
export function pushSample(buf: CentSample[], sample: CentSample): CentSample[] {
  const next = [...buf, sample];
  return next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next;
}

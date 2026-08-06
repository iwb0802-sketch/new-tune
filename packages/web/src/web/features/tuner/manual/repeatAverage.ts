/**
 * repeatAverage.ts
 * 같은 건반을 여러 번 타건했을 때의 "반복 측정 가중평균"
 *
 * 배경: 스트로브 시험용 화면은 타건 1회당 엔진이 안정값(finalCents)을 1개 확정한다.
 * 피아노는 타건 세기·터치·배음 위상에 따라 같은 줄이라도 회차마다 ±1~3센트씩 흔들린다.
 * 한 번의 값만 쓰면 그 흔들림이 그대로 조율값이 되므로, 같은 건반을 3회 이상 치면
 * 서로 비슷한 범위에 모인 값들만 골라 가중평균을 내서 조율값으로 확정한다.
 *
 * "비슷한 센트값 범위" 판정:
 *  1) 전체 샘플의 중앙값(median)을 기준점으로 잡는다 (평균과 달리 튄 값에 안 끌려감).
 *  2) 중앙값에서 CLUSTER_TOLERANCE(기본 4센트) 안에 든 샘플만 채택 = 클러스터.
 *     - 옆줄을 잘못 쳤거나, 타건 실수로 크게 벗어난 회차는 여기서 자동 제외된다.
 *  3) 클러스터가 최소 회차(기본 3)를 못 채우면 평균을 내지 않는다(null 반환).
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
}

/** 평균을 내기 시작하는 최소 타건 횟수 */
export const REPEAT_MIN_SAMPLES = 3;
/** "비슷한 센트값 범위"의 폭 — 중앙값 ± 이 값 안쪽만 채택 */
export const CLUSTER_TOLERANCE = 4;
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
 * 누적 샘플에서 반복 측정 가중평균을 계산한다.
 * 조건(최소 회차 + 클러스터 형성)을 못 채우면 null.
 */
export function weightedRepeatAverage(
  samples: CentSample[],
  minSamples: number = REPEAT_MIN_SAMPLES,
  tolerance: number = CLUSTER_TOLERANCE,
): RepeatAverageResult | null {
  if (samples.length < minSamples) return null;

  const med = median(samples.map((s) => s.cents));
  const cluster = samples.filter((s) => Math.abs(s.cents - med) <= tolerance);
  if (cluster.length < minSamples) return null;

  let num = 0;
  let den = 0;
  for (const s of cluster) {
    const d = (s.cents - med) / tolerance; // 0~1로 정규화된 거리
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
  };
}

/** 새 샘플을 누적 버퍼에 밀어 넣고 최대 길이로 자른다. */
export function pushSample(buf: CentSample[], sample: CentSample): CentSample[] {
  const next = [...buf, sample];
  return next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next;
}

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
 * "비슷한 센트값 범위" 판정 (간격 기반 클러스터링):
 *  1) 샘플을 센트 오름차순으로 정렬하고, 이웃한 값 사이의 간격만 본다.
 *  2) 연결 허용거리(link)를 그 건반의 실제 촘촘함에서 뽑는다.
 *     이웃 간격들의 중앙값 × 3 을 쓰되 MIN_TOLERANCE~MAX_TOLERANCE 로 클램프.
 *     - A0처럼 -34/-30/-28 로 넓게 흩어지면 link가 넓어져 세 회차 모두 한 덩어리.
 *     - 중음처럼 -30.1/-30.0/-29.9 로 촘촘하면 link가 좁아져 미세 이탈도 끊어낸다.
 *  3) 간격이 link보다 큰 지점에서 끊어 덩어리(클러스터)를 나눈다.
 *     -32/-30/-28 사이에 튀어나온 +2 는 여기서 자기 혼자 덩어리가 되어 버려진다.
 *  4) 가장 큰 덩어리를 채택한다. 단, 2등 덩어리가 1등과 같은 크기면 = 값이 두 갈래로
 *     갈린 상태이므로 평균을 내지 않는다(null). 예전 방식(중앙값 ± 허용폭)은 이 경우
 *     MAD가 부풀어 허용폭이 넓어지면서 0,0,10,10 → 5.0 처럼 어디에도 없는 중간값을
 *     만들어냈다. 이제는 갈린 채로 보류하고 추가 타건을 기다린다.
 *  5) 채택된 덩어리가 최소 회차(기본 3)를 못 채우면 역시 null.
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
/** 연결 허용거리 = 이웃 간격 중앙값 × 이 배수 */
const SIGMA_K = 3;
/**
 * 핵(core) 판정 반경(센트). 이 반경 안에 가장 많이 모인 구간을 진짜 값으로 본다.
 * 절대 센트값과 무관하게 "값들끼리 얼마나 뭉쳤나"만 보므로 조율 커브에는 영향 없음.
 */
export const TRIM_CORE_HALF = 1.5;
/** 건반당 보관하는 최대 회차 (오래된 것부터 버림) */
export const MAX_SAMPLES = 12;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 선형보간 분위수 */
function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
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
 * 이웃 간격들로부터 "같은 덩어리로 볼 최대 거리"를 정한다.
 * 절대 센트값과 무관하며, 값이 넓게 흩어지는 건반은 넓게, 촘촘하면 좁게 적응한다.
 *
 * MAD를 쓰지 않는 이유: 값이 두 갈래(0,0,10,10)로 갈리면 MAD가 부풀어
 * 허용폭이 넓어지고 결국 양쪽을 다 끌어안아 버린다. 이웃 간격의 중앙값은
 * 그런 경우에도 촘촘한 쪽을 따라가므로 두 갈래를 제대로 끊어준다.
 */
export function adaptiveTolerance(centsList: number[]): number {
  if (centsList.length < 2) return MIN_TOLERANCE;
  const sorted = [...centsList].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);
  // 간격의 하위 25% 분위수를 기준으로 삼는다. 중앙값을 쓰면 회차가 3회뿐일 때
  // (간격 2개) 큰 간격이 절반을 차지해 기준이 부풀고, 튄 값까지 끌어안게 된다.
  const link = quantile(gaps, 0.25) * SIGMA_K;
  if (!isFinite(link) || link <= 0) return MIN_TOLERANCE;
  return Math.max(MIN_TOLERANCE, Math.min(MAX_TOLERANCE, link));
}

/** 정렬 후 link보다 큰 간격에서 끊어 덩어리로 나눈다. */
function splitClusters(samples: CentSample[], link: number): CentSample[][] {
  const sorted = [...samples].sort((a, b) => a.cents - b.cents);
  const out: CentSample[][] = [];
  let cur: CentSample[] = [];
  for (const s of sorted) {
    if (cur.length === 0 || s.cents - cur[cur.length - 1].cents <= link) {
      cur.push(s);
    } else {
      out.push(cur);
      cur = [s];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * 덩어리 안에서 "촘촘한 핵(core)"만 남긴다.
 *
 * 간격 기반 분리(splitClusters)는 값이 1,3,5 처럼 균등한 계단으로 벌어지면
 * 어디가 튄 값인지 판단할 근거가 없어 전부 한 덩어리로 이어버린다.
 * 하지만 회차가 쌓여 1,1,1,3,3,5 처럼 되면 "1 근처가 진짜 값이고 5는 튄 값"이
 * 밀도로 드러난다. 그 지점을 잡아주는 단계다.
 *
 * 방법: 각 샘플값을 중심으로 ±TRIM_CORE_HALF 안에 몇 개가 들어오는지 세어
 * 가장 많이 모인 구간(최빈 구간)을 핵으로 본다. 동수면 중앙값에 가까운 쪽.
 *
 * 안전장치 — 다음 경우엔 아무것도 자르지 않고 원래 덩어리를 그대로 쓴다:
 *  - 핵이 최소 회차를 못 채울 때. 예: A0의 -28/-30/-34 는 셋 다 서로 떨어져 있어
 *    핵이 1개짜리로 잡히므로 트리밍을 건너뛴다. 저음부의 넓은 산포는 보존된다.
 *  - 핵이 덩어리 전체와 같을 때 (자를 게 없음).
 */
function trimToCore(cluster: CentSample[], minSamples: number): CentSample[] {
  if (cluster.length <= minSamples) return cluster;

  const med = median(cluster.map((s) => s.cents));
  let best: CentSample[] = [];
  let bestDist = Infinity;

  for (const c of cluster) {
    const inCore = cluster.filter((s) => Math.abs(s.cents - c.cents) <= TRIM_CORE_HALF);
    const dist = Math.abs(c.cents - med);
    if (inCore.length > best.length || (inCore.length === best.length && dist < bestDist)) {
      best = inCore;
      bestDist = dist;
    }
  }

  // 핵이 최소 회차를 못 채우면(=밀도가 드러나지 않음) 자르지 않는다.
  if (best.length < minSamples || best.length >= cluster.length) return cluster;
  return best;
}

/**
 * 누적 샘플에서 반복 측정 가중평균을 계산한다.
 * 조건(최소 회차 + 단일 우세 덩어리)을 못 채우면 null.
 * tolerance를 넘기지 않으면 샘플 산포에 맞춰 자동 계산한다.
 */
export function weightedRepeatAverage(
  samples: CentSample[],
  minSamples: number = REPEAT_MIN_SAMPLES,
  tolerance?: number,
): RepeatAverageResult | null {
  if (samples.length < minSamples) return null;

  const centsAll = samples.map((s) => s.cents);
  const tol = tolerance ?? adaptiveTolerance(centsAll);

  const clusters = splitClusters(samples, tol).sort((a, b) => b.length - a.length);
  const picked = clusters[0];
  if (!picked || picked.length < minSamples) return null;
  // 값이 두 갈래로 팽팽하게 갈렸으면 평균을 내지 않고 보류한다.
  if (clusters[1] && clusters[1].length >= picked.length) return null;

  // 덩어리 안에서 밀도가 드러나면(1,1,1,3,3,5 → 1 근처) 촘촘한 핵만 남긴다.
  const cluster = trimToCore(picked, minSamples);

  const centsList = cluster.map((s) => s.cents);
  const med = median(centsList);
  // 감쇠 기준 거리: 덩어리 자체가 촘촘하면 작게, 넓으면 넓게 (0 나눗셈 방지)
  const scale = Math.max((Math.max(...centsList) - Math.min(...centsList)) / 2, 0.5);

  let num = 0;
  let den = 0;
  for (const s of cluster) {
    const d = (s.cents - med) / scale;
    const w = s.weight / (1 + d * d);
    num += s.cents * w;
    den += w;
  }
  if (den <= 0) return null;

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

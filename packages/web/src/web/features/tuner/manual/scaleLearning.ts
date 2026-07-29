/**
 * scaleLearning.ts — 세션 내 인하모니시티(B) 누적학습 유틸
 *
 * Verituner류 ETD가 하는 "조율 진행하며 이 피아노의 스케일링 곡선을 학습"하는
 * 개념을 단순화해서 구현. 핵심 아이디어 3가지:
 *
 * 1) B는 건반 인덱스에 대해 지수적으로 변하는 경향이 있어서, 그냥 B를 평균내지 않고
 *    로그(B) 공간에서 가중 선형회귀를 한다 (Y=ln(B), X=keyIndex).
 * 2) 저음부 권선↔단현 전환 같은 브레이크포인트에서는 B가 계단식으로 점프하므로,
 *    이웃을 무한정 넓게 잡지 않고 ln(B) 점프가 큰 지점에서 탐색을 멈춘다
 *    (타겟 건반과 같은 "구간"에 있는 이웃만 사용).
 * 3) 가중치 = 거리가중 × 신뢰도(confidence, 교차검증 오차+사용배음수 기반) — 애매하게
 *    측정된 이웃음이 결과를 오염시키지 않도록.
 */

export interface BPoint {
  keyIndex: number;
  B: number;
  confidence: number; // 0~1
}

const NEIGHBOR_RANGE = 14;
const BREAKPOINT_LN_JUMP = 0.55; // 인접 측정치 사이 ln(B) 차이가 이 이상이면 브레이크포인트로 간주 (약 1.7배 이상 변화)

/** 타겟 건반 주변의 학습된 B 데이터로 예상 B값을 추정. 데이터 없으면 undefined. */
export function predictB(allPoints: BPoint[], targetKeyIndex: number): number | undefined {
  const candidates = allPoints
    .filter(p => Math.abs(p.keyIndex - targetKeyIndex) <= NEIGHBOR_RANGE && p.B > 0)
    .sort((a, b) => a.keyIndex - b.keyIndex);
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0].B;

  // 타겟 기준 좌/우 분리
  let splitIdx = candidates.length;
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].keyIndex > targetKeyIndex) { splitIdx = i; break; }
  }

  // 왼쪽으로 확장하며 브레이크포인트(ln(B) 점프) 나오면 중단
  const leftPts: BPoint[] = [];
  let prevLn: number | null = null;
  for (let i = splitIdx - 1; i >= 0; i--) {
    const lnB = Math.log(candidates[i].B);
    if (prevLn !== null && Math.abs(lnB - prevLn) > BREAKPOINT_LN_JUMP) break;
    leftPts.unshift(candidates[i]);
    prevLn = lnB;
  }
  // 오른쪽으로 확장
  const rightPts: BPoint[] = [];
  prevLn = null;
  for (let i = splitIdx; i < candidates.length; i++) {
    const lnB = Math.log(candidates[i].B);
    if (prevLn !== null && Math.abs(lnB - prevLn) > BREAKPOINT_LN_JUMP) break;
    rightPts.push(candidates[i]);
    prevLn = lnB;
  }

  const segment = [...leftPts, ...rightPts];
  if (segment.length === 0) return undefined;
  if (segment.length === 1) return segment[0].B;

  // 가중 로그-선형회귀: Y=ln(B), X=keyIndex, weight = 거리가중 × 신뢰도
  let sw = 0, swx = 0, swy = 0, swxy = 0, swxx = 0;
  for (const p of segment) {
    const dist = Math.abs(p.keyIndex - targetKeyIndex);
    const w = (1 / (1 + dist)) * Math.max(0.1, p.confidence); // 신뢰도 0이어도 완전히 0가중은 아니게 최소치
    const x = p.keyIndex, y = Math.log(p.B);
    sw += w; swx += w * x; swy += w * y; swxy += w * x * y; swxx += w * x * x;
  }
  if (sw === 0) return undefined;

  const denom = sw * swxx - swx * swx;
  if (Math.abs(denom) < 1e-6) {
    // 회귀 불안정(포인트가 사실상 한 지점에 몰림) → 가중평균으로 폴백
    return Math.exp(swy / sw);
  }
  const slope = (sw * swxy - swx * swy) / denom;
  const intercept = (swy - slope * swx) / sw;
  const predictedLnB = intercept + slope * targetKeyIndex;
  return Math.exp(predictedLnB);
}

/** 예측 B 대비 실측 B가 얼마나 벗어났는지 (0~1+, 상대오차) */
export function anomalyRatio(predicted: number, measured: number): number {
  if (predicted <= 0) return 0;
  return Math.abs(measured - predicted) / predicted;
}

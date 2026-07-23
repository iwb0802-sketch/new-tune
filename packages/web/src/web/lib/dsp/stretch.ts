// Stretch tuning-curve calculation from the 88-key inharmonicity (B) array.
//
// For an octave between lower note L and upper note U = L+12 tuned to an "X:Y" type
// (X = partial of L, Y = partial of U, with X = 2Y), beatless when:
//   X * fL * sqrt(1 + B_L*X^2) = Y * fU * sqrt(1 + B_U*Y^2)
// Since X = 2Y:  fU = 2 * fL * sqrt(1 + B_L*X^2) / sqrt(1 + B_U*Y^2)
// i.e. octave ratio r = 2 * sqrt(1 + B_L*X^2) / sqrt(1 + B_U*Y^2)   (>= 2 => stretch).
//
// We anchor the central octave to equal temperament (deviation ~0) and cascade the
// ratio outward per pitch class, producing the classic Railsback stretch: flat bass,
// sharp treble.

import { NUM_KEYS, keyToFrequency, keyToNoteName } from "./notes";

export interface StretchStyle {
  id: string;
  label: string;
  X: number; // partial of lower note
  Y: number; // partial of upper note
  description: string;
}

export const STRETCH_STYLES: StretchStyle[] = [
  { id: "2:1", label: "2:1 옥타브", X: 2, Y: 1, description: "좁은 스트레치. 클래식/부드러운 음색." },
  { id: "4:2", label: "4:2 옥타브", X: 4, Y: 2, description: "표준. 대부분의 피아노에 권장." },
  { id: "6:3", label: "6:3 옥타브", X: 6, Y: 3, description: "넓은 스트레치. 밝고 화려한 음색." },
  { id: "8:4", label: "8:4 옥타브", X: 8, Y: 4, description: "가장 넓음. 대형 콘서트 그랜드." },
];

export function getStyle(id: string): StretchStyle {
  return STRETCH_STYLES.find((s) => s.id === id) ?? STRETCH_STYLES[1];
}

function octaveRatio(bLower: number, bUpper: number, X: number, Y: number): number {
  return (2 * Math.sqrt(1 + bLower * X * X)) / Math.sqrt(1 + bUpper * Y * Y);
}

export interface CurvePoint {
  keyIndex: number;
  note: string;
  fEqual: number; // equal-temperament target
  fTuned: number; // stretch-tuned target
  cents: number; // deviation from ET
  B: number;
}

const ANCHOR_LO = 44; // E4
const ANCHOR_HI = 55; // D#5 — central octave pinned to ET

/**
 * Compute the full 88-key stretch curve. `bCurve` must have NUM_KEYS entries
 * (index 0 = key 1). Returns per-key targets and cents deviation from ET.
 */
export function computeStretchCurve(
  bCurve: number[],
  a4: number,
  style: StretchStyle,
): CurvePoint[] {
  const fEqual: number[] = Array.from({ length: NUM_KEYS + 1 }, () => 0);
  const fTuned: number[] = Array.from({ length: NUM_KEYS + 1 }, () => 0);
  for (let key = 1; key <= NUM_KEYS; key++) fEqual[key] = keyToFrequency(key, a4);

  const B = (key: number) => bCurve[key - 1] ?? 0;

  // Anchor central octave to ET
  for (let key = ANCHOR_LO; key <= ANCHOR_HI; key++) fTuned[key] = fEqual[key];

  // Cascade upward
  for (let key = ANCHOR_HI + 1; key <= NUM_KEYS; key++) {
    fTuned[key] = fTuned[key - 12] * octaveRatio(B(key - 12), B(key), style.X, style.Y);
  }
  // Cascade downward
  for (let key = ANCHOR_LO - 1; key >= 1; key--) {
    fTuned[key] = fTuned[key + 12] / octaveRatio(B(key), B(key + 12), style.X, style.Y);
  }

  const out: CurvePoint[] = [];
  for (let key = 1; key <= NUM_KEYS; key++) {
    out.push({
      keyIndex: key,
      note: keyToNoteName(key),
      fEqual: fEqual[key],
      fTuned: fTuned[key],
      cents: 1200 * Math.log2(fTuned[key] / fEqual[key]),
      B: B(key),
    });
  }
  return out;
}

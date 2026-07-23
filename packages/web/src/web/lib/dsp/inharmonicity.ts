// Inharmonicity coefficient (B) estimation from measured partials.
//
// Stiff-string partial model:   f_k = k * f0 * sqrt(1 + B*k^2)
// Linearize by squaring:        (f_k / k)^2 = f0^2 + f0^2 * B * k^2
// So with x = k^2, y = (f_k/k)^2 this is a straight line y = a + b*x where
//   a = f0^2  and  b = f0^2 * B  =>  B = b / a,  f0 = sqrt(a).

import type { Partial } from "./partials";

export interface InharmonicityFit {
  B: number; // inharmonicity coefficient
  f0: number; // fitted fundamental (Hz)
  rSquared: number; // fit quality 0..1
  partialsUsed: number;
}

/** Weighted least-squares line fit of (k^2, (f_k/k)^2). Weights by partial magnitude. */
export function fitInharmonicity(partials: Partial[]): InharmonicityFit | null {
  const pts = partials.filter((p) => p.index >= 1 && p.frequency > 0);
  if (pts.length < 2) return null;

  let sw = 0;
  let swx = 0;
  let swy = 0;
  let swxx = 0;
  let swxy = 0;
  for (const p of pts) {
    const x = p.index * p.index;
    const y = Math.pow(p.frequency / p.index, 2);
    const w = Math.max(1e-9, p.magnitude);
    sw += w;
    swx += w * x;
    swy += w * y;
    swxx += w * x * x;
    swxy += w * x * y;
  }

  const denom = sw * swxx - swx * swx;
  if (denom === 0) return null;
  const b = (sw * swxy - swx * swy) / denom; // slope
  const a = (swy - b * swx) / sw; // intercept
  if (a <= 0) return null;

  const f0 = Math.sqrt(a);
  let B = b / a;
  if (!Number.isFinite(B)) return null;
  B = Math.max(0, B); // inharmonicity is non-negative

  // R^2 (weighted)
  const yMean = swy / sw;
  let ssTot = 0;
  let ssRes = 0;
  for (const p of pts) {
    const x = p.index * p.index;
    const y = Math.pow(p.frequency / p.index, 2);
    const yHat = a + b * x;
    const w = Math.max(1e-9, p.magnitude);
    ssTot += w * (y - yMean) * (y - yMean);
    ssRes += w * (y - yHat) * (y - yHat);
  }
  const rSquared = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  return { B, f0, rSquared, partialsUsed: pts.length };
}

// TWA (Tuned Weighted Average) fundamental estimation.
//
// A single YIN fundamental (f1) is fragile on piano tones: the bass fundamental is
// weak while its overtones dominate, and reverberant partials wander. Instead of
// trusting f1 alone, TWA looks at every partial, maps each one back to the effective
// fundamental it implies USING the inharmonicity model, and then combines those
// estimates with a magnitude x loudness (A-weighting) weight.
//
// For partial k of a stiff string:   f_k = k * f1 * sqrt(1 + B*k^2)
// So each partial gives an estimate:  f1_k = f_k / (k * sqrt(1 + B*k^2))
// The weighted geometric mean of the f1_k (in log/cents space) is the TWA fundamental.
// This is exactly what a tuner's ear does — it averages the beating of several
// partials rather than fixating on the (often inaudible) true fundamental.

import { extractPartials } from "./partials";

export interface TwaResult {
  f1: number; // effective fundamental (Hz)
  partialsUsed: number;
  spread: number; // weighted std-dev of per-partial estimates, in cents (lower = cleaner)
}

/**
 * A-weighting (IEC 61672) as a linear gain, normalised to 1.0 at 1 kHz.
 * Approximates how loudly each partial is actually heard, so audible partials pull
 * the estimate more than sub-audible bass energy or hiss. Floored so nothing is
 * fully zeroed out.
 */
function aWeightLinear(f: number): number {
  if (f <= 0) return 0;
  const f2 = f * f;
  const ra =
    (12194 * 12194 * f2 * f2) /
    ((f2 + 20.6 * 20.6) *
      Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) *
      (f2 + 12194 * 12194));
  // Normalise: Ra(1000) ~ 0.7943 -> +2 dB reference. Divide out so w(1kHz)=1.
  const w = ra / 0.7943280907;
  return Math.max(0.02, w);
}

/**
 * Estimate the effective fundamental via TWA. `f0Guess` (from YIN) centres the
 * partial search; `B` is the note's inharmonicity coefficient (from the tuning curve).
 * Returns null when too few partials are found (caller should fall back to f0Guess).
 */
export function estimateTwaFundamental(
  signal: Float32Array,
  sampleRate: number,
  f0Guess: number,
  B: number,
  maxHarmonics = 6,
): TwaResult | null {
  if (f0Guess <= 0) return null;
  const partials = extractPartials(signal, sampleRate, f0Guess, maxHarmonics, Math.max(0, B));
  const est: { logf: number; w: number }[] = [];
  for (const p of partials) {
    if (p.index < 1 || p.frequency <= 0 || p.magnitude <= 0) continue;
    const stiff = Math.sqrt(1 + Math.max(0, B) * p.index * p.index);
    const f1k = p.frequency / (p.index * stiff);
    if (f1k <= 0) continue;
    const w = p.magnitude * aWeightLinear(p.frequency);
    est.push({ logf: Math.log(f1k), w });
  }
  if (est.length < 2) return null;

  const wmean = (arr: { logf: number; w: number }[]) => {
    let sw = 0;
    let swl = 0;
    for (const e of arr) {
      sw += e.w;
      swl += e.w * e.logf;
    }
    return sw > 0 ? swl / sw : 0;
  };

  // First pass mean, then reject partials whose estimate is an outlier (> ~60 cents
  // off — usually a mistaken peak or a neighbouring string), then re-average.
  const m0 = wmean(est);
  const CENTS = 1200 / Math.LN2; // ln-ratio -> cents
  const kept = est.filter((e) => Math.abs((e.logf - m0) * CENTS) < 60);
  const use = kept.length >= 2 ? kept : est;
  const m = wmean(use);

  // Weighted spread (cents) for a confidence readout.
  let sw = 0;
  let sv = 0;
  for (const e of use) {
    const d = (e.logf - m) * CENTS;
    sw += e.w;
    sv += e.w * d * d;
  }
  const spread = sw > 0 ? Math.sqrt(sv / sw) : 0;

  return { f1: Math.exp(m), partialsUsed: use.length, spread };
}

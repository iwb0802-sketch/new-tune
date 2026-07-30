// Interpolate the inharmonicity coefficient B across all 88 keys from a sparse set
// of measured keys. B varies smoothly on a log scale vs key index, so we PCHIP-
// interpolate log(B) (monotone cubic, no overshoot) and extrapolate flat at the ends.

import { NUM_KEYS } from "./notes";

export interface MeasuredB {
  keyIndex: number; // 1..88
  B: number;
  rSquared?: number; // fit quality 0..1; low-quality fits are blended toward the default curve
}

/**
 * PCHIP (Fritsch-Carlson monotone cubic Hermite) interpolation.
 * xs must be strictly increasing. Returns a function f(x).
 */
function pchip(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length;
  if (n === 1) return () => ys[0];

  const h: number[] = [];
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h[i] = xs[i + 1] - xs[i];
    delta[i] = (ys[i + 1] - ys[i]) / h[i];
  }

  const m: number[] = Array.from({ length: n }, () => 0);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] * delta[i] <= 0) {
      m[i] = 0;
    } else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
    }
  }

  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 1 && x > xs[i + 1]) i++;
    const t = x - xs[i];
    const hi = h[i];
    const h00 = (1 + 2 * (t / hi)) * Math.pow(1 - t / hi, 2);
    const h10 = t * Math.pow(1 - t / hi, 2);
    const h01 = Math.pow(t / hi, 2) * (3 - 2 * (t / hi));
    const h11 = Math.pow(t / hi, 2) * (t / hi - 1) * hi;
    return h00 * ys[i] + h10 * m[i] + h01 * ys[i + 1] + h11 * m[i + 1];
  };
}

/**
 * Build a full 88-length array of B values from measured keys. Interpolates log(B)
 * for smoothness; falls back to a typical curve if no measurements exist.
 */
export function interpolateBCurve(measured: MeasuredB[]): number[] {
  const valid = measured
    .filter((m) => m.B > 0 && m.keyIndex >= 1 && m.keyIndex <= NUM_KEYS)
    .sort((a, b) => a.keyIndex - b.keyIndex);

  if (valid.length === 0) {
    return defaultBCurve();
  }

  const base = defaultBCurve();
  const logBase = base.map((b) => Math.log(b));

  // Confidence-blend each measurement toward the default curve BEFORE interpolating.
  // The stiff-string fit returns R² (how linear the (k², (f_k/k)²) points were): a
  // clean fit (R²→1) is fully trusted, a noisy one (low R², common in the bass where
  // upper partials are weak/ambiguous) is pulled back toward the typical curve so a
  // single bad reading can't drag the whole B curve — and hence the stretch — into
  // non-physical territory. w = R²² gives ~0 trust below ≈0.4 and ~full trust above
  // ≈0.9. Missing R² (legacy data) is treated as fully trusted.
  const nodes = valid.map((m) => {
    const r = m.rSquared;
    const w = r == null ? 1 : Math.max(0, Math.min(1, r * r));
    const logB = w * Math.log(m.B) + (1 - w) * logBase[m.keyIndex - 1];
    return { keyIndex: m.keyIndex, logB };
  });

  if (nodes.length === 1) {
    // Shift the typical curve to pass through the single (confidence-blended) point.
    const k = nodes[0].keyIndex;
    const shift = nodes[0].logB - logBase[k - 1];
    return logBase.map((lb) => Math.exp(lb + shift));
  }

  const xs = nodes.map((n) => n.keyIndex);
  const ys = nodes.map((n) => n.logB);
  const f = pchip(xs, ys);

  // Beyond the measured range PCHIP would flat-hold the endpoint, which is
  // physically wrong: treble inharmonicity keeps climbing steeply toward C8 and
  // the extreme bass turns back up. Instead of a flat plateau, follow the SHAPE
  // of the typical curve (its log-slope) anchored to the nearest measured point.
  const loKey = xs[0];
  const hiKey = xs[xs.length - 1];
  const loLogB = ys[0];
  const hiLogB = ys[ys.length - 1];

  const out: number[] = [];
  for (let key = 1; key <= NUM_KEYS; key++) {
    let logB: number;
    if (key < loKey) {
      // Extreme bass: shift the default curve to pass through the lowest measurement.
      logB = loLogB + (logBase[key - 1] - logBase[loKey - 1]);
    } else if (key > hiKey) {
      // Treble above the top measurement: keep rising along the default slope.
      logB = hiLogB + (logBase[key - 1] - logBase[hiKey - 1]);
    } else {
      logB = f(key);
    }
    out.push(Math.exp(logB));
  }
  return out;
}

/**
 * Default inharmonicity curve — tuned to a TYPICAL UPRIGHT piano. Uprights have
 * shorter strings than grands, so B is noticeably higher across the board and
 * especially in the bass (short, thick wound bass strings) and high treble,
 * which yields a more pronounced stretch. Used as the starting curve until the
 * user measures real keys (each measurement then overrides its neighbourhood).
 * Values are order-of-magnitude realistic: bass ~1e-3, mid ~2e-4, treble ~1.5e-2.
 */
export function defaultBCurve(): number[] {
  const anchors: MeasuredB[] = [
    { keyIndex: 1, B: 0.0013 }, // A0  — high bass inharmonicity (short upright bass strings)
    { keyIndex: 13, B: 0.00032 }, // A1
    { keyIndex: 25, B: 0.00016 }, // A2
    { keyIndex: 40, B: 0.0002 }, // C4
    { keyIndex: 49, B: 0.00038 }, // A4
    { keyIndex: 61, B: 0.0012 }, // A5
    { keyIndex: 76, B: 0.0048 }, // C7
    { keyIndex: 88, B: 0.016 }, // C8 — strong treble stretch
  ];
  const xs = anchors.map((a) => a.keyIndex);
  const ys = anchors.map((a) => Math.log(a.B));
  const f = pchip(xs, ys);
  const out: number[] = [];
  for (let key = 1; key <= NUM_KEYS; key++) out.push(Math.exp(f(key)));
  return out;
}

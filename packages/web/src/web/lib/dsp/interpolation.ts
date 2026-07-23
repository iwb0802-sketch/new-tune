// Interpolate the inharmonicity coefficient B across all 88 keys from a sparse set
// of measured keys. B varies smoothly on a log scale vs key index, so we PCHIP-
// interpolate log(B) (monotone cubic, no overshoot) and extrapolate flat at the ends.

import { NUM_KEYS } from "./notes";

export interface MeasuredB {
  keyIndex: number; // 1..88
  B: number;
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
  if (valid.length === 1) {
    // Shift the typical curve to pass through the single measured point.
    const base = defaultBCurve();
    const k = valid[0].keyIndex;
    const scale = valid[0].B / base[k - 1];
    return base.map((b) => b * scale);
  }

  const xs = valid.map((m) => m.keyIndex);
  const ys = valid.map((m) => Math.log(m.B));
  const f = pchip(xs, ys);

  const out: number[] = [];
  for (let key = 1; key <= NUM_KEYS; key++) {
    out.push(Math.exp(f(key)));
  }
  return out;
}

/**
 * Typical piano inharmonicity curve (rough reference). B is large in the bass,
 * dips around the tenor/mid, then rises again into the high treble.
 * Values are order-of-magnitude realistic (bass ~1e-3, mid ~1.5e-4, treble ~1e-2).
 */
export function defaultBCurve(): number[] {
  const anchors: MeasuredB[] = [
    { keyIndex: 1, B: 0.0006 }, // A0
    { keyIndex: 13, B: 0.00018 }, // A1
    { keyIndex: 25, B: 0.00012 }, // A2
    { keyIndex: 40, B: 0.00016 }, // C4
    { keyIndex: 49, B: 0.0003 }, // A4
    { keyIndex: 61, B: 0.0009 }, // A5
    { keyIndex: 76, B: 0.0035 }, // C7
    { keyIndex: 88, B: 0.012 }, // C8
  ];
  const xs = anchors.map((a) => a.keyIndex);
  const ys = anchors.map((a) => Math.log(a.B));
  const f = pchip(xs, ys);
  const out: number[] = [];
  for (let key = 1; key <= NUM_KEYS; key++) out.push(Math.exp(f(key)));
  return out;
}

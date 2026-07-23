// Partial (overtone) extraction from a signal's magnitude spectrum, given an
// approximate fundamental. Returns precise partial frequencies via parabolic
// interpolation, used downstream to fit the inharmonicity coefficient B.

import { magnitudeSpectrum, nextPow2 } from "./fft";

export interface Partial {
  index: number; // harmonic number k (1-based)
  frequency: number; // measured Hz
  magnitude: number;
}

/**
 * Extract up to `maxHarmonics` partials. For each harmonic k, search a window around
 * the *inharmonic-predicted* location k*f0*sqrt(1 + B*k^2) using a rough B guess to
 * keep the window centered for stiff bass strings, then refine to the local peak.
 */
export function extractPartials(
  signal: Float32Array,
  sampleRate: number,
  f0: number,
  maxHarmonics = 8,
  bGuess = 0,
): Partial[] {
  if (f0 <= 0) return [];
  const mag = magnitudeSpectrum(signal);
  const nFft = nextPow2(signal.length);
  const binHz = sampleRate / nFft;
  const len = mag.length;
  const nyquist = sampleRate / 2;

  const partials: Partial[] = [];
  for (let k = 1; k <= maxHarmonics; k++) {
    const predicted = k * f0 * Math.sqrt(1 + bGuess * k * k);
    if (predicted >= nyquist) break;

    // search window ~ +/- half a semitone around predicted
    const lowHz = predicted * Math.pow(2, -0.6 / 12);
    const highHz = predicted * Math.pow(2, 0.6 / 12);
    let lo = Math.max(1, Math.floor(lowHz / binHz));
    let hi = Math.min(len - 1, Math.ceil(highHz / binHz));
    if (hi <= lo) continue;

    let peak = lo;
    for (let i = lo + 1; i <= hi; i++) {
      if (mag[i] > mag[peak]) peak = i;
    }

    // Reject weak partials
    if (mag[peak] <= 0) continue;

    let pos = peak;
    if (peak > 0 && peak < len - 1) {
      const a = mag[peak - 1];
      const b = mag[peak];
      const c = mag[peak + 1];
      const denom = a - 2 * b + c;
      if (denom !== 0) pos = peak + (0.5 * (a - c)) / denom;
    }
    partials.push({ index: k, frequency: pos * binHz, magnitude: mag[peak] });
  }
  return partials;
}

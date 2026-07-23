// Fundamental frequency estimation: YIN (time-domain) refined by HPS (spectral),
// used to resolve octave ambiguity on rich piano tones.

import { magnitudeSpectrum, nextPow2 } from "./fft";

export interface PitchResult {
  frequency: number; // Hz, 0 if no reliable pitch
  probability: number; // 0..1 confidence (1 - yin dip value)
  rms: number; // signal level
}

const YIN_THRESHOLD = 0.15;

/**
 * YIN pitch detection. Returns fundamental frequency in Hz (0 if none found).
 * See de Cheveigné & Kawahara (2002).
 */
export function detectPitchYin(
  signal: Float32Array,
  sampleRate: number,
  minFreq = 25,
  maxFreq = 4500,
): PitchResult {
  const n = signal.length;

  // Signal level
  let sumSq = 0;
  for (let i = 0; i < n; i++) sumSq += signal[i] * signal[i];
  const rms = Math.sqrt(sumSq / n);
  if (rms < 0.003) return { frequency: 0, probability: 0, rms };

  const tauMax = Math.min(Math.floor(sampleRate / minFreq), Math.floor(n / 2));
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));

  const diff = new Float32Array(tauMax);
  for (let tau = 1; tau < tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < n - tauMax; i++) {
      const d = signal[i] - signal[i + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }

  // Cumulative mean normalized difference
  const cmnd = new Float32Array(tauMax);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau < tauMax; tau++) {
    running += diff[tau];
    cmnd[tau] = running === 0 ? 1 : (diff[tau] * tau) / running;
  }

  // Absolute threshold: first local minimum below threshold
  let tauEstimate = -1;
  for (let tau = tauMin; tau < tauMax; tau++) {
    if (cmnd[tau] < YIN_THRESHOLD) {
      while (tau + 1 < tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauEstimate = tau;
      break;
    }
  }
  // Fallback: global minimum in range
  if (tauEstimate === -1) {
    let best = tauMin;
    for (let tau = tauMin + 1; tau < tauMax; tau++) {
      if (cmnd[tau] < cmnd[best]) best = tau;
    }
    tauEstimate = best;
    if (cmnd[best] > 0.6) return { frequency: 0, probability: 0, rms };
  }

  // Parabolic interpolation around tauEstimate
  const t = tauEstimate;
  let betterTau = t;
  if (t > 0 && t < tauMax - 1) {
    const s0 = cmnd[t - 1];
    const s1 = cmnd[t];
    const s2 = cmnd[t + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = t + (s2 - s0) / denom;
  }

  const frequency = sampleRate / betterTau;
  const probability = Math.max(0, Math.min(1, 1 - cmnd[t]));
  return { frequency, probability, rms };
}

/**
 * Harmonic Product Spectrum estimate. Multiplies down-sampled magnitude spectra to
 * reinforce the fundamental; returns its frequency in Hz. Good for octave checks.
 */
export function detectPitchHps(
  signal: Float32Array,
  sampleRate: number,
  harmonics = 5,
  minFreq = 25,
  maxFreq = 4500,
): number {
  const mag = magnitudeSpectrum(signal);
  const nFft = nextPow2(signal.length);
  const binHz = sampleRate / nFft;
  const len = mag.length;

  const hps = Float32Array.from(mag);
  for (let h = 2; h <= harmonics; h++) {
    for (let i = 0; i * h < len; i++) {
      hps[i] *= mag[i * h];
    }
  }

  const minBin = Math.max(1, Math.floor(minFreq / binHz));
  const maxBin = Math.min(len - 1, Math.floor(maxFreq / binHz));
  let peak = minBin;
  for (let i = minBin + 1; i <= maxBin; i++) {
    if (hps[i] > hps[peak]) peak = i;
  }

  // Parabolic interpolation for sub-bin accuracy
  let pos = peak;
  if (peak > 0 && peak < len - 1) {
    const a = hps[peak - 1];
    const b = hps[peak];
    const c = hps[peak + 1];
    const denom = a - 2 * b + c;
    if (denom !== 0) pos = peak + (0.5 * (a - c)) / denom;
  }
  return pos * binHz;
}

/**
 * Combined estimate: YIN for accuracy, HPS to correct octave errors. If HPS lands
 * within ~6% of YIN's value we trust YIN; if HPS is ~half of YIN (octave-too-high
 * error), snap toward HPS.
 */
export function detectPitch(signal: Float32Array, sampleRate: number): PitchResult {
  const yin = detectPitchYin(signal, sampleRate);
  if (yin.frequency <= 0) return yin;

  const hps = detectPitchHps(signal, sampleRate);
  if (hps > 0) {
    const ratio = yin.frequency / hps;
    // YIN reported an octave (or double-octave) too high
    if (Math.abs(ratio - 2) < 0.25 || Math.abs(ratio - 4) < 0.5) {
      return { ...yin, frequency: hps };
    }
  }
  return yin;
}

// 88-key piano note/frequency utilities (platform-agnostic, pure TS).
// Key index 1..88 maps to MIDI 21..108. Key 1 = A0 (MIDI 21), key 49 = A4 (MIDI 69),
// key 88 = C8 (MIDI 108).

export const NUM_KEYS = 88;
export const A4_KEY_INDEX = 49; // A4
export const DEFAULT_A4 = 440;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export function keyToMidi(keyIndex: number): number {
  return keyIndex + 20;
}

export function midiToKey(midi: number): number {
  return midi - 20;
}

/** Scientific pitch name, e.g. A0, C#4, C8. */
export function keyToNoteName(keyIndex: number): string {
  const midi = keyToMidi(keyIndex);
  const name = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

/** True for sharp (black) keys. */
export function isBlackKey(keyIndex: number): boolean {
  return keyToNoteName(keyIndex).includes("#");
}

/** Equal-temperament frequency for a key at reference pitch a4 (Hz). */
export function keyToFrequency(keyIndex: number, a4: number = DEFAULT_A4): number {
  return a4 * Math.pow(2, (keyIndex - A4_KEY_INDEX) / 12);
}

/** Nearest key index for a measured frequency at reference a4. */
export function frequencyToKey(freq: number, a4: number = DEFAULT_A4): number {
  if (freq <= 0) return A4_KEY_INDEX;
  const k = A4_KEY_INDEX + 12 * Math.log2(freq / a4);
  return Math.min(NUM_KEYS, Math.max(1, Math.round(k)));
}

/** Cents difference of freq relative to the equal-temperament target of a key. */
export function centsFromKey(freq: number, keyIndex: number, a4: number = DEFAULT_A4): number {
  const target = keyToFrequency(keyIndex, a4);
  return 1200 * Math.log2(freq / target);
}

/** Signed cents between two frequencies. */
export function centsBetween(freq: number, target: number): number {
  return 1200 * Math.log2(freq / target);
}

/** Representative keys used to seed the inharmonicity curve (A0..C8). */
export const REPRESENTATIVE_KEYS = [1, 13, 25, 33, 40, 49, 61, 64, 76, 88];

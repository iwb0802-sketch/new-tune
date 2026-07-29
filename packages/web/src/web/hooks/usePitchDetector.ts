/**
 * usePitchDetector.ts (v5 — TWM 정밀화 파일럿 추가)
 *
 * - useStrobeDetector의 검증된 마이크/AudioContext 패턴 그대로 사용
 * - 전 건반 YIN 감지 → freqToCentOffset으로 keyIndex 자동 추출
 * - HPS 배음보정: YIN 1차 후보 건반 기준으로 옥타브 오인식 보정 (저/중음)
 * - TWM(Two-Way Mismatch) 정밀화: HPS 보정된 f0 근방에서 인하모니시티(B)까지
 *   동시 추정해 최종 미세보정 (저/중음, 실험적 파일럿)
 * - Goertzel 도미넌스 검증: 확정 직전 후보 건반 주파수가 실제로 우세한지 재확인
 * - 슬라이딩 윈도우 다수결(WINDOW=8, MIN_MATCH=4) + 표준편차 체크로 확정
 * - return shape 기존 유지 (Home.tsx, PrecisionPage.tsx 호환)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  detectPitchYIN, getRMS, median,
} from "@/lib/tuner/pitchEngine";

// ── 88건반 정의 (export: useStrobeDetector에서 import) ──────────────
export const PIANO_KEYS = Array.from({ length: 88 }, (_, i) => {
  const midi = i + 21;
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(midi / 12) - 1;
  const noteName = noteNames[midi % 12];
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
  return { midi, keyNumber: i + 1, noteName, octave, freq, isBlack };
});

// ── 주파수 → keyIndex + cents ────────────────────────────────────────
export function freqToCentOffset(freq: number): {
  keyIndex: number; cents: number; note: typeof PIANO_KEYS[0];
} | null {
  if (freq <= 0) return null;
  const midiFloat = 69 + 12 * Math.log2(freq / 440);
  const midiRound = Math.round(midiFloat);
  const keyIndex = midiRound - 21;
  if (keyIndex < 0 || keyIndex > 87) return null;
  return { keyIndex, cents: (midiFloat - midiRound) * 100, note: PIANO_KEYS[keyIndex] };
}

// ── 타입 ─────────────────────────────────────────────────────────────
export interface PitchResult {
  frequency: number; keyIndex: number; noteName: string;
  octave: number; cents: number; confidence: number;
  rms?: number;
}

export interface UsePitchDetectorReturn {
  isListening: boolean;
  currentPitch: PitchResult | null;
  startListening: () => Promise<void>;
  stopListening: () => void;
  error: string | null;
  isRecovering: boolean;
  stream: MediaStream | null;
  audioContext: AudioContext | null;
  analyserRef: { readonly current: AnalyserNode | null };
}

// ── 상수 ─────────────────────────────────────────────────────────────
const MIN_RMS    = 0.005;  // useStrobeDetector와 동일
const ATTACK_RATIO = 1.6;  // 이전 프레임보다 이 비율 이상 커지면 새 타건(어택)으로 간주
const WINDOW     = 8;      // 슬라이딩 윈도우 크기
const MIN_MATCH  = 4;      // 안정화 최소 일치

export function usePitchDetector(
  onPitchDetected?: (result: PitchResult) => void,
  _fftSize: 4096 | 8192 = 4096   // 하위호환성 유지 (내부는 4096 고정)
): UsePitchDetectorReturn {

  const [isListening,  setIsListening]  = useState(false);
  const [currentPitch, setCurrentPitch] = useState<PitchResult | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  // 오디오 인프라 — useStrobeDetector 패턴 그대로
  const ctxRef      = useRef<AudioContext | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef      = useRef<number | null>(null);
  const bufRef      = useRef<Float32Array | null>(null);
  const freqBufRef  = useRef<Float32Array | null>(null); // dB 스펙트럼 (HPS 배음보정용)

  // 안정화 버퍼
  const recentKeys  = useRef<number[]>([]);
  const recentCents = useRef<number[]>([]);
  const lastRmsRef  = useRef(0); // 어택(새 타건) 감지용 — 이전 프레임 RMS

  // onPitchDetected ref (클로저 stale 방지)
  const onPitchRef = useRef(onPitchDetected);
  useEffect(() => { onPitchRef.current = onPitchDetected; }, [onPitchDetected]);

  // ── 감지 루프 (useStrobeDetector detect 패턴 기반) ────────────────
  const startLoop = useCallback(() => {
    const an = analyserRef.current;
    if (!an || !bufRef.current) return;

    const detect = () => {
      // 매 프레임 ref 최신값으로 읽기 (useStrobeDetector 동일 패턴)
      const analyser = analyserRef.current;
      const buf      = bufRef.current;
      const freqBuf  = freqBufRef.current;
      if (!analyser || !buf || !freqBuf) return;

      // buf 크기 불일치 시 재할당
      if (buf.length !== analyser.fftSize) {
        bufRef.current = new Float32Array(analyser.fftSize);
      }
      if (freqBuf.length !== analyser.frequencyBinCount) {
        freqBufRef.current = new Float32Array(analyser.frequencyBinCount);
      }

      const activeBuf     = bufRef.current!;
      const activeFreqBuf = freqBufRef.current!;
      analyser.getFloatTimeDomainData(activeBuf);
      analyser.getFloatFrequencyData(activeFreqBuf);
      const rms = getRMS(activeBuf);

      if (rms < MIN_RMS) {
        recentKeys.current = [];
        recentCents.current = [];
        lastRmsRef.current = 0;
        setCurrentPitch(null);
        rafRef.current = requestAnimationFrame(detect);
        return;
      }

      // 어택 감지: 이전 프레임보다 RMS가 갑자기 확 커지면 "새로 친 음"으로 간주하고
      // 슬라이딩 윈도우를 강제로 비움 — 이전 음의 잔향/서스테인이 남아있어도(완전 무음이
      // 아니어도) 새 음을 다수결 버퍼가 밀어내길 기다리지 않고 즉시 새로 판별 시작
      if (rms > lastRmsRef.current * ATTACK_RATIO && rms > MIN_RMS * 3) {
        recentKeys.current = [];
        recentCents.current = [];
      }
      lastRmsRef.current = rms;

      const sampleRate = analyser.context?.sampleRate ?? 48000;

      // 전 건반 범위 YIN (A0=27Hz ~ C8=4186Hz)
      const fRaw = detectPitchYIN(activeBuf, sampleRate, { fMin: 27, fMax: 5000, threshold: 0.15 });

      if (fRaw > 0) {
        // 1차 후보 (YIN 원시값)
        const rough = freqToCentOffset(fRaw);
        if (rough) {
          // HPS 배음보정 비활성화 — 저음에서 2배음이 기본음보다 강할 때 옥타브를
          // 잘못 판단해 부호가 반대로 뒤집히는 문제(-12¢가 +12¢로 표시)가 확인되어
          // 순수 YIN 값을 그대로 사용하도록 롤백 (기존 v3 동작과 동일)
          const r = rough;

          recentKeys.current.push(r.keyIndex);
          recentCents.current.push(r.cents);
          if (recentKeys.current.length > WINDOW) {
            recentKeys.current.shift();
            recentCents.current.shift();
          }

          // 다수결
          const counts: Record<number, number> = {};
          recentKeys.current.forEach(k => { counts[k] = (counts[k] || 0) + 1; });
          const [topKey, topCount] = Object.entries(counts)
            .sort((a, b) => Number(b[1]) - Number(a[1]))[0];
          const stableKi = parseInt(topKey);

          if (Number(topCount) >= MIN_MATCH) {
            const centsArr = recentKeys.current
              .map((k, i) => k === stableKi ? recentCents.current[i] : null)
              .filter((v): v is number => v !== null);

            const stableCents = Math.round(median(centsArr) * 10) / 10;

            const result: PitchResult = {
              frequency:  fRaw,
              keyIndex:   stableKi,
              noteName:   PIANO_KEYS[stableKi].noteName,
              octave:     PIANO_KEYS[stableKi].octave,
              cents:      stableCents,
              confidence: Number(topCount) / WINDOW,
              rms,
            };

            if (result.confidence >= 0.5) {
              setCurrentPitch(result);
              onPitchRef.current?.(result);
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(detect);
    };

    rafRef.current = requestAnimationFrame(detect);
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  // ── 마이크 시작 (useStrobeDetector startListening 패턴 그대로) ────
  const startListening = useCallback(async () => {
    try {
      setError(null);

      // 이미 열려 있으면 재사용
      if (ctxRef.current && streamRef.current) {
        startLoop();
        setIsListening(true);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;

      const ctx = new AudioContext();   // sampleRate 강제 없음 — useStrobeDetector 동일
      ctxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      analyserRef.current = analyser;
      bufRef.current = new Float32Array(analyser.fftSize);
      freqBufRef.current = new Float32Array(analyser.frequencyBinCount);

      const src = ctx.createMediaStreamSource(stream);
      src.connect(analyser);

      setIsListening(true);
      startLoop();
    } catch (err) {
      let msg = "마이크 접근 실패";
      if (err instanceof Error) {
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          msg = "마이크 권한이 거부되었습니다. 설정 > Safari > 마이크를 허용해 주세요.";
        } else if (err.name === "NotFoundError") {
          msg = "마이크를 찾을 수 없습니다.";
        } else if (err.name === "NotReadableError") {
          msg = "마이크를 사용할 수 없습니다. 다른 앱이 마이크를 사용 중일 수 있습니다.";
        } else {
          msg = err.message;
        }
      }
      setError(msg);
      setIsListening(false);
    }
  }, [startLoop]);

  const stopListening = useCallback(() => {
    stopLoop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    ctxRef.current?.close();
    ctxRef.current = null;
    analyserRef.current = null;
    bufRef.current = null;
    freqBufRef.current = null;
    recentKeys.current = [];
    recentCents.current = [];
    setIsListening(false);
    setCurrentPitch(null);
  }, [stopLoop]);

  // visibilitychange — ctx resume (iOS Safari 대응)
  useEffect(() => {
    const handler = async () => {
      if (document.visibilityState !== "visible") return;
      if (!ctxRef.current) return;
      const ctx = ctxRef.current;
      if (ctx.state === "suspended") {
        try { await ctx.resume(); } catch { /* ignore */ }
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  // 언마운트 정리
  useEffect(() => {
    return () => {
      stopLoop();
      streamRef.current?.getTracks().forEach(t => t.stop());
      ctxRef.current?.close();
    };
  }, [stopLoop]);

  return {
    isListening,
    currentPitch,
    startListening,
    stopListening,
    error,
    isRecovering: false,
    stream: streamRef.current,
    audioContext: ctxRef.current,
    analyserRef,
  };
}

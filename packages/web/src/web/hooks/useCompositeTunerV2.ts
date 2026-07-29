/**
 * useCompositeTuner.ts — v3
 * 파트별 최적 복합 피치 감지 훅
 *
 * 저음 (0~26):  8192 버퍼 + YIN 적응형 + 동적 배음 + 2단계 Goertzel + HPS 보정
 * 중음 (27~51): 4096 버퍼 + YIN 고정 + 2배음 Goertzel + 교차검증 ±6¢ 가중평균
 * 고음 (52~87): 4096 버퍼 + YIN 적응형 + 기본음 Goertzel + 단독 신뢰, 빠른 확정
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PIANO_KEYS } from "./usePitchDetector";
import {
  getZone,
  getBufferSize,
  getYINParams,
  getStabilityConfig,
  applyHannWindow,
  detectPitchYIN,
  foldToBaseOctave,
  goertzel,
  goertzelTwoPassScan,
  selectBestPartial,
  targetPartial,
  correctOctaveByHPS,
  refineByPartialFitV2,
  getRMS,
  median,
  stddev,
} from "@/lib/tuner/pitchEngine";

export interface CompositeResult {
  keyIndex: number;
  noteName: string;
  octave: number;
  frequency: number;
  yinCents: number | null;
  goertzelCents: number;
  liveCents: number;
  finalCents: number | null;
  crossValid: boolean;
  signalOk: boolean;
  isCapturing: boolean;
  captureProgress: number;
  zone: "low" | "mid" | "high";
  partial: number;
  inharmonicityB: number | null; // 이 프레임에서 추정된 인하모니시티 계수 (세션 누적학습용)
  inharmonicityConfidence: number | null; // 0~1, 이 B추정치의 신뢰도 (적합오차+사용배음수 기반)
  nPartialsUsed: number | null;           // 회귀에 실제 사용된 배음 개수
}

export interface UseCompositeTunerReturn {
  isListening: boolean;
  result: CompositeResult | null;
  startListening: () => Promise<void>;
  stopListening: () => void;
  error: string | null;
  analyserRef: { readonly current: AnalyserNode | null };
}

// 교차검증 허용 편차 (파트별)
const CROSS_THRESH: Record<string, number> = {
  low:  15,  // 저음: 배음 혼재로 YIN 오차 큼 → 관대하게
  mid:   6,  // 중음: 가장 안정적 → 엄격하게
  high: 12,  // 고음: decay 빠름 → 중간
};

// YIN cent 변환: 폴딩 후 기본음 기준 cent 계산
function yinToCents(
  fYin: number,
  baseFreq: number,
  zone: "low" | "mid" | "high"
): number | null {
  if (fYin <= 0 || baseFreq <= 0) return null;
  const folded = foldToBaseOctave(fYin, baseFreq, zone);
  return Math.round(1200 * Math.log2(folded / baseFreq) * 10) / 10;
}

// 가중평균: 신뢰도 기반으로 YIN과 Goertzel 혼합
// 중음에서 교차검증 통과 시 Goertzel 편향 (더 정밀한 2단계 스캔 결과)
function weightedCents(
  yinCents: number | null,
  goertzelCents: number,
  zone: "low" | "mid" | "high",
  crossValid: boolean
): number {
  if (yinCents === null) return goertzelCents;
  if (!crossValid) return goertzelCents;

  const weights = {
    low:  { yin: 0.35, goertzel: 0.65 }, // 저음: Goertzel 신뢰 더 높음
    mid:  { yin: 0.40, goertzel: 0.60 }, // 중음: Goertzel 2단계 스캔이 정밀
    high: { yin: 0.55, goertzel: 0.45 }, // 고음: YIN이 상대적으로 안정적
  };
  const w = weights[zone];
  return Math.round((yinCents * w.yin + goertzelCents * w.goertzel) * 10) / 10;
}

export function useCompositeTunerV2(
  targetKeyIndex: number,
  onConfirmed?: (result: CompositeResult) => void,
  externalAnalyserRef?: { readonly current: AnalyserNode | null },
  getBHint?: (keyIndex: number) => number | undefined, // 세션 내 이웃건반 누적학습 B 조회 콜백
): UseCompositeTunerReturn {
  const [isListening, setIsListening] = useState(false);
  const [result, setResult]           = useState<CompositeResult | null>(null);
  const [error, setError]             = useState<string | null>(null);

  // 오디오 컨텍스트 refs
  const ctxRef        = useRef<AudioContext | null>(null);
  const analyserRef   = useRef<AnalyserNode | null>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const rafRef        = useRef<number | null>(null);
  const isRunningRef  = useRef(false);

  // 버퍼 (음역대별로 크기 다름)
  const timeBufRef    = useRef<Float32Array | null>(null);
  const freqBufRef    = useRef<Float32Array | null>(null); // dB 스펙트럼 (HPS용)

  // 안정화 상태
  const peakRmsRef        = useRef(0);
  const captureStartRef   = useRef<number | null>(null);
  const captureBufferRef  = useRef<number[]>([]);
  const confirmedRef      = useRef(false); // 확정 후 lockout

  // stale closure 방지
  const targetKeyRef = useRef(targetKeyIndex);
  useEffect(() => { targetKeyRef.current = targetKeyIndex; }, [targetKeyIndex]);

  // 건반 변경 시 캡처 상태 리셋
  useEffect(() => {
    peakRmsRef.current       = 0;
    captureStartRef.current  = null;
    captureBufferRef.current = [];
    confirmedRef.current     = false;
    setResult(null);
  }, [targetKeyIndex]);

  const resetCapture = useCallback(() => {
    peakRmsRef.current       = 0;
    captureStartRef.current  = null;
    captureBufferRef.current = [];
    confirmedRef.current     = false;
  }, []);

  const stopListening = useCallback(() => {
    isRunningRef.current = false;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (!externalAnalyserRef) {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = analyserRef.current = null;
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    }
    timeBufRef.current = freqBufRef.current = null;
    resetCapture();
    setIsListening(false);
    setResult(null);
  }, [resetCapture, externalAnalyserRef]);

  const startListening = useCallback(async () => {
    try {
      setError(null);

      // ── 외부 analyser 공유 모드 (마이크를 다른 훅이 이미 열고 있음, 예: 수동탭 AUTO) ──
      if (externalAnalyserRef) {
        isRunningRef.current = true;
        setIsListening(true);

        const detectExternal = () => {
          if (!isRunningRef.current) return;
          const analyser = externalAnalyserRef.current;
          if (!analyser || !analyser.context) {
            rafRef.current = requestAnimationFrame(detectExternal);
            return;
          }
          if (analyser.context.state === "suspended") analyser.context.resume().catch(() => {});

          const ki   = targetKeyRef.current;
          const zone = getZone(ki);
          const size = analyser.fftSize; // 외부 소유 — 리사이즈하지 않고 그대로 사용

          if (!timeBufRef.current || timeBufRef.current.length !== size) {
            timeBufRef.current = new Float32Array(size);
            freqBufRef.current = new Float32Array(analyser.frequencyBinCount);
          }
          const timeBuf = timeBufRef.current!;
          const freqBuf = freqBufRef.current!;

          analyser.getFloatTimeDomainData(timeBuf as Float32Array<ArrayBuffer>);
          analyser.getFloatFrequencyData(freqBuf as Float32Array<ArrayBuffer>);

          const rms      = getRMS(timeBuf);
          const stabConf = getStabilityConfig(zone);
          const sr       = analyser.context.sampleRate;

          if (rms < stabConf.peakThreshold * 0.3) {
            resetCapture();
            setResult(null);
            rafRef.current = requestAnimationFrame(detectExternal);
            return;
          }

          const key      = PIANO_KEYS[ki];
          const baseFreq = key.freq;

          // 1. YIN + HPS 배음보정 + TWM 정밀화
          const yinParams = getYINParams(zone, rms);
          const winBuf    = applyHannWindow(timeBuf);
          const fYinRaw   = detectPitchYIN(winBuf, sr, yinParams);
          const fHps = fYinRaw > 0 ? correctOctaveByHPS(fYinRaw, freqBuf, sr, size, ki) : fYinRaw;
          let fFinal = fHps;
          let twmB: number | null = null;
          let twmConfidence: number | null = null;
          let twmNPartials: number | null = null;
          if (fHps > 0 && zone !== "high") {
            const bHint = getBHint?.(ki);
            const twm = refineByPartialFitV2(freqBuf, sr, size, fHps, zone, ki, bHint);
            if (twm && twm.error < 15) { fFinal = twm.f0; twmB = twm.B; twmConfidence = twm.confidence ?? null; twmNPartials = twm.nPartials ?? null; }
          }
          const yinCents = fFinal > 0 ? yinToCents(fFinal, baseFreq, zone) : null;

          // 2. Goertzel 2단계 스캔
          const partial    = zone === "low" ? selectBestPartial(timeBuf, sr, ki, baseFreq) : targetPartial(ki);
          const targetFreq = baseFreq * partial;
          const gTarget = goertzel(timeBuf, sr, targetFreq);
          const magLo   = goertzel(timeBuf, sr, targetFreq * Math.pow(2, -1.5 / 12)).magnitude;
          const magHi   = goertzel(timeBuf, sr, targetFreq * Math.pow(2,  1.5 / 12)).magnitude;
          const domThresh = zone === "high" ? 1.05 : zone === "low" ? 1.15 : 1.3;
          const signalOk  = gTarget.magnitude > Math.max(magLo, magHi, 1e-9) * domThresh;
          const scanResult    = goertzelTwoPassScan(timeBuf, sr, targetFreq, baseFreq, partial, zone);
          const goertzelCents = scanResult.centsOffset;

          // 3. 교차검증 & liveCents
          const crossThresh = CROSS_THRESH[zone];
          let crossValid: boolean;
          if (zone === "high") {
            crossValid = signalOk || yinCents !== null;
          } else {
            crossValid = signalOk && yinCents !== null && Math.abs(yinCents - goertzelCents) <= crossThresh;
          }
          const liveCents = weightedCents(yinCents, goertzelCents, zone, crossValid);

          // 4. 안정화 판정 (RMS decay + 표준편차)
          if (rms > peakRmsRef.current * 1.5 && rms > 0.02) {
            peakRmsRef.current = rms;
            captureStartRef.current = null;
            captureBufferRef.current = [];
            confirmedRef.current = false;
          } else if (rms > peakRmsRef.current) {
            peakRmsRef.current = rms;
          }

          const isDecaying = rms < peakRmsRef.current * stabConf.peakRatio && peakRmsRef.current > stabConf.peakThreshold;

          let finalCents: number | null = null;
          let isCapturing = false;
          let captureProgress = 0;

          if (isDecaying && !confirmedRef.current) {
            if (captureStartRef.current === null) {
              captureStartRef.current = Date.now();
              captureBufferRef.current = [];
            }
            captureBufferRef.current.push(liveCents);
            const elapsed = Date.now() - captureStartRef.current;
            isCapturing = true;
            captureProgress = Math.min(elapsed / stabConf.durationMs, 1);
            const sd = stddev(captureBufferRef.current);
            const isStable = sd <= stabConf.maxStddev;

            if (elapsed >= stabConf.durationMs && captureBufferRef.current.length >= stabConf.minSamples && isStable) {
              finalCents = Math.round(median(captureBufferRef.current) * 10) / 10;
              confirmedRef.current = true;
              captureStartRef.current = null;
              captureBufferRef.current = [];
              peakRmsRef.current = 0;
            }
          } else if (!isDecaying) {
            captureStartRef.current = null;
            captureBufferRef.current = [];
          }

          const newResult: CompositeResult = {
            keyIndex: ki,
            noteName: key.noteName,
            octave: key.octave,
            frequency: scanResult.bestFreq / partial,
            yinCents,
            goertzelCents,
            liveCents,
            finalCents,
            crossValid,
            signalOk,
            isCapturing,
            captureProgress,
            zone,
            partial,
            inharmonicityB: twmB,
            inharmonicityConfidence: twmConfidence,
            nPartialsUsed: twmNPartials,
          };

          setResult(newResult);
          if (finalCents !== null) onConfirmed?.(newResult);

          rafRef.current = requestAnimationFrame(detectExternal);
        };
        rafRef.current = requestAnimationFrame(detectExternal);
        return;
      }

      // 마이크 스트림 획득 (DSP 처리 없이 raw 신호)
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            autoGainControl: false,
            noiseSuppression: false,
            sampleRate: 44100,
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false },
        });
      }
      streamRef.current = stream;

      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 44100 });
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});

      // AnalyserNode: 초기 크기는 8192로 (저음 대비)
      // 음역대가 바뀌면 detect 루프 안에서 동적 재설정
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0;
      analyserRef.current = analyser;
      ctx.createMediaStreamSource(stream).connect(analyser);

      timeBufRef.current = new Float32Array(8192);
      freqBufRef.current = new Float32Array(analyser.frequencyBinCount);

      isRunningRef.current = true;
      setIsListening(true);

      // ── 메인 감지 루프 ──────────────────────────────────────────────
      const detect = () => {
        if (!isRunningRef.current) return;
        const ctx      = ctxRef.current;
        const analyser = analyserRef.current;
        if (!ctx || !analyser) return;
        if (ctx.state === "suspended") ctx.resume().catch(() => {});

        const ki       = targetKeyRef.current;
        const zone     = getZone(ki);
        const needSize = getBufferSize(zone);

        // 음역대 변경 시 analyser 버퍼 사이즈 재설정
        if (analyser.fftSize !== needSize) {
          analyser.fftSize = needSize;
          timeBufRef.current = new Float32Array(needSize);
          freqBufRef.current = new Float32Array(analyser.frequencyBinCount);
        }

        const timeBuf = timeBufRef.current!;
        const freqBuf = freqBufRef.current!;

        analyser.getFloatTimeDomainData(timeBuf as Float32Array<ArrayBuffer>);
        analyser.getFloatFrequencyData(freqBuf as Float32Array<ArrayBuffer>);

        const rms      = getRMS(timeBuf);
        const stabConf = getStabilityConfig(zone);

        // 최소 RMS 미달 → 신호 없음
        if (rms < stabConf.peakThreshold * 0.3) {
          resetCapture();
          setResult(null);
          rafRef.current = requestAnimationFrame(detect);
          return;
        }

        const key      = PIANO_KEYS[ki];
        const baseFreq = key.freq;
        const sr       = ctx.sampleRate;

        // ────────────────────────────────────────────────────────────
        // 1. YIN 피치 감지
        // ────────────────────────────────────────────────────────────
        const yinParams = getYINParams(zone, rms);
        const winBuf    = applyHannWindow(timeBuf);
        const fYinRaw   = detectPitchYIN(winBuf, sr, yinParams);

        // HPS 옥타브 보정 (저음/중음만)
        const fYinCorrected = fYinRaw > 0
          ? correctOctaveByHPS(fYinRaw, freqBuf, sr, analyser.fftSize, ki)
          : fYinRaw;

        // TWM(Two-Way Mismatch) 정밀화 — f0+인하모니시티 동시 재추정 (고음 제외)
        let fFinal = fYinCorrected;
        let twmB: number | null = null;
        let twmConfidence: number | null = null;
        let twmNPartials: number | null = null;
        if (fYinCorrected > 0 && zone !== "high") {
          const bHint = getBHint?.(ki);
          const twm = refineByPartialFitV2(freqBuf, sr, analyser.fftSize, fYinCorrected, zone, ki, bHint);
          if (twm && twm.error < 15) { fFinal = twm.f0; twmB = twm.B; twmConfidence = twm.confidence ?? null; twmNPartials = twm.nPartials ?? null; }
        }

        const yinCents = fFinal > 0
          ? yinToCents(fFinal, baseFreq, zone)
          : null;

        // ────────────────────────────────────────────────────────────
        // 2. Goertzel 2단계 스캔
        // ────────────────────────────────────────────────────────────
        // 저음만 동적 배음 선택, 그 외는 고정 partial
        const partial    = zone === "low"
          ? selectBestPartial(timeBuf, sr, ki, baseFreq)
          : targetPartial(ki);
        const targetFreq = baseFreq * partial;

        // 도미넌스 체크: 목표 주파수가 인접 주파수보다 충분히 강한지
        const gTarget = goertzel(timeBuf, sr, targetFreq);
        const magLo   = goertzel(timeBuf, sr, targetFreq * Math.pow(2, -1.5 / 12)).magnitude;
        const magHi   = goertzel(timeBuf, sr, targetFreq * Math.pow(2,  1.5 / 12)).magnitude;
        // 고음은 도미넌스 기준 완화 (배음 희박)
        const domThresh = zone === "high" ? 1.05 : zone === "low" ? 1.15 : 1.3;
        const signalOk  = gTarget.magnitude > Math.max(magLo, magHi, 1e-9) * domThresh;

        // 2단계 Coarse → Fine 스캔
        const scanResult   = goertzelTwoPassScan(timeBuf, sr, targetFreq, baseFreq, partial, zone);
        const goertzelCents = scanResult.centsOffset;

        // ────────────────────────────────────────────────────────────
        // 3. 교차검증 & liveCents 계산
        // ────────────────────────────────────────────────────────────
        const crossThresh = CROSS_THRESH[zone];

        let crossValid: boolean;
        if (zone === "high") {
          // 고음: YIN 또는 Goertzel 둘 중 하나라도 신뢰 가능하면 통과
          // 단, 완전히 신호가 없는 경우(signalOk=false & yinCents=null)는 실패
          crossValid = signalOk || yinCents !== null;
        } else {
          // 저음/중음: 둘 다 있어야 하고 편차 이내여야 통과
          crossValid = signalOk
            && yinCents !== null
            && Math.abs(yinCents - goertzelCents) <= crossThresh;
        }

        const liveCents = weightedCents(yinCents, goertzelCents, zone, crossValid);

        // ────────────────────────────────────────────────────────────
        // 4. 안정화 판정 (RMS decay + 센트 표준편차)
        // ────────────────────────────────────────────────────────────

        // 건반을 새로 칠 때 피크 리셋 (급격한 RMS 상승)
        if (rms > peakRmsRef.current * 1.5 && rms > 0.02) {
          peakRmsRef.current      = rms;
          captureStartRef.current = null;
          captureBufferRef.current = [];
          confirmedRef.current    = false;
        } else if (rms > peakRmsRef.current) {
          peakRmsRef.current = rms;
        }

        const isDecaying = rms < peakRmsRef.current * stabConf.peakRatio
          && peakRmsRef.current > stabConf.peakThreshold;

        let finalCents: number | null = null;
        let isCapturing  = false;
        let captureProgress = 0;

        if (isDecaying && !confirmedRef.current) {
          if (captureStartRef.current === null) {
            captureStartRef.current  = Date.now();
            captureBufferRef.current = [];
          }
          captureBufferRef.current.push(liveCents);

          const elapsed = Date.now() - captureStartRef.current;
          isCapturing     = true;
          captureProgress = Math.min(elapsed / stabConf.durationMs, 1);

          // 센트 표준편차 체크 — 흔들리는 동안은 확정하지 않음
          const sd = stddev(captureBufferRef.current);
          const isStable = sd <= stabConf.maxStddev;

          if (
            elapsed >= stabConf.durationMs &&
            captureBufferRef.current.length >= stabConf.minSamples &&
            isStable
          ) {
            finalCents              = Math.round(median(captureBufferRef.current) * 10) / 10;
            confirmedRef.current    = true;
            captureStartRef.current = null;
            captureBufferRef.current = [];
            peakRmsRef.current      = 0;
          }
        } else if (!isDecaying) {
          // decay 구간이 아니면 버퍼 리셋 (공격음 구간)
          captureStartRef.current  = null;
          captureBufferRef.current = [];
        }

        const newResult: CompositeResult = {
          keyIndex: ki,
          noteName: key.noteName,
          octave:   key.octave,
          frequency: scanResult.bestFreq / partial,
          yinCents,
          goertzelCents,
          liveCents,
          finalCents,
          crossValid,
          signalOk,
          isCapturing,
          captureProgress,
          zone,
          partial,
          inharmonicityB: twmB,
          inharmonicityConfidence: twmConfidence,
          nPartialsUsed: twmNPartials,
        };

        setResult(newResult);
        if (finalCents !== null) onConfirmed?.(newResult);

        rafRef.current = requestAnimationFrame(detect);
      };

      rafRef.current = requestAnimationFrame(detect);
    } catch (err) {
      let msg = "마이크 접근 실패";
      if (err instanceof Error) {
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
          msg = "마이크 권한이 거부되었습니다.";
        else if (err.name === "NotFoundError")    msg = "마이크를 찾을 수 없습니다.";
        else if (err.name === "NotReadableError") msg = "마이크를 사용할 수 없습니다.";
        else msg = err.message;
      }
      setError(msg);
      setIsListening(false);
    }
  }, [onConfirmed, resetCapture]);

  // 화면 복귀 시 오디오 컨텍스트 복구 (자체 마이크 모드에서만 — 외부 analyser는 소유자가 관리)
  useEffect(() => {
    if (externalAnalyserRef) return;
    const handler = async () => {
      if (document.visibilityState !== "visible" || !isRunningRef.current) return;
      const ctx = ctxRef.current;
      if (!ctx || ctx.state === "closed") {
        isRunningRef.current = false;
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = ctxRef.current = analyserRef.current = null;
        timeBufRef.current = freqBufRef.current = null;
        resetCapture();
        setResult(null);
        try { await startListening(); } catch {}
      } else if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [startListening, resetCapture, externalAnalyserRef]);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  return { isListening, result, startListening, stopListening, error, analyserRef };
}

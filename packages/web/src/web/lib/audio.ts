// Microphone capture via the Web Audio API (getUserMedia + AnalyserNode).

import { useCallback, useEffect, useRef, useState } from "react";

export type FrameCallback = (buffer: Float32Array, sampleRate: number) => void;

const FFT_SIZE = 16384; // ~0.37s at 44.1kHz — enough for low bass notes

export function isMicSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof (globalThis as { AudioContext?: unknown }).AudioContext !== "undefined"
  );
}

export function useAudioAnalyzer(onFrame: FrameCallback) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cbRef = useRef<FrameCallback>(onFrame);
  useEffect(() => {
    cbRef.current = onFrame;
  }, [onFrame]);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const bufRef = useRef<Float32Array | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      ctxRef.current.close().catch(() => {});
    }
    ctxRef.current = null;
    analyserRef.current = null;
    setRunning(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!isMicSupported()) {
      setError("이 브라우저는 마이크 접근을 지원하지 않습니다.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const Ctx =
        (globalThis as { AudioContext: typeof AudioContext }).AudioContext ||
        (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      analyserRef.current = analyser;
      bufRef.current = new Float32Array(analyser.fftSize);

      const loop = () => {
        const a = analyserRef.current;
        const buf = bufRef.current;
        if (a && buf) {
          a.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
          cbRef.current(buf, ctx.sampleRate);
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
      setRunning(true);
    } catch (e) {
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "마이크 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요."
          : "마이크를 시작할 수 없습니다.",
      );
      stop();
    }
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  return { start, stop, running, error, supported: isMicSupported() };
}

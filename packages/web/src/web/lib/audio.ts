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
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const bufRef = useRef<Float32Array | null>(null);
  const visRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (visRef.current) {
      document.removeEventListener("visibilitychange", visRef.current);
      visRef.current = null;
    }
    try { sourceRef.current?.disconnect(); } catch { /* ignore */ }
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    // iOS(홈화면 앱): ctx.close() 하면 오디오가 잠겨 재시작 시 무음이 되는 사례가 있어
    // 닫지 않고 suspend만 한다. 다음 start()에서 resume() 해 재사용한다.
    if (ctxRef.current && ctxRef.current.state === "running") {
      ctxRef.current.suspend().catch(() => {});
    }
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
      // iOS(홈화면 앱/standalone PWA) 안전 순서: getUserMedia 를 "가장 먼저" 호출한다.
      // AudioContext 를 먼저 만들어 resume 하면 InvalidStateError(Failed to start the
      // audio device) 가 나며 오디오 세션이 망가져 마이크 트랙이 곧바로 ended 되는
      // 사례가 확인됨. 반드시 마이크 스트림 확보 → ctx 생성 → 연결 → 마지막에 resume.
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
      let ctx = ctxRef.current;
      if (!ctx || ctx.state === "closed") {
        ctx = new Ctx();
        ctxRef.current = ctx;
      }

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      analyserRef.current = analyser;
      bufRef.current = new Float32Array(analyser.fftSize);

      // 입력 경로가 모두 연결된 "뒤"에 resume 한다 (iOS standalone 안전 순서).
      if (ctx.state === "suspended") {
        try { await ctx.resume(); } catch { /* ignore */ }
      }

      // 화면 복귀(백그라운드→포그라운드) 시 iOS는 ctx를 suspend 하므로 다시 resume.
      const onVis = () => {
        if (document.visibilityState === "visible" && ctxRef.current?.state === "suspended") {
          ctxRef.current.resume().catch(() => {});
        }
      };
      document.addEventListener("visibilitychange", onVis);
      visRef.current = onVis;

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

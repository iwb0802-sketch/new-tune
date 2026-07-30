// Microphone capture via the Web Audio API (getUserMedia + AnalyserNode).
//
// iOS(홈화면 앱/standalone PWA) 대응: 검증된 usePitchDetector 마이크 패턴을 그대로 따른다.
// getUserMedia → new AudioContext() → analyser → source.connect → (연결 후) resume.
// 트랙 readyState 를 미리 검사해 차단하지 않는다 — iOS 는 getUserMedia 직후 순간적으로
// ended 로 보고했다가 곧 live 로 돌아오는 경우가 있어, 차단하면 정상 마이크까지 막힌다.

import { useCallback, useEffect, useRef, useState } from "react";

export type FrameCallback = (buffer: Float32Array, sampleRate: number) => void;

const FFT_SIZE = 16384; // ~0.37s at 44.1kHz — enough for low bass notes

export function isMicSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    (typeof (globalThis as { AudioContext?: unknown }).AudioContext !== "undefined" ||
      typeof (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext !== "undefined")
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

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const stop = useCallback(() => {
    stopLoop();
    try { sourceRef.current?.disconnect(); } catch { /* ignore */ }
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try { ctxRef.current?.close(); } catch { /* ignore */ }
    ctxRef.current = null;
    analyserRef.current = null;
    bufRef.current = null;
    setRunning(false);
  }, [stopLoop]);

  const start = useCallback(async () => {
    setError(null);
    if (!isMicSupported()) {
      setError("이 브라우저는 마이크 접근을 지원하지 않습니다.");
      return;
    }
    try {
      // 이미 열려 있으면 재사용
      if (ctxRef.current && streamRef.current && analyserRef.current) {
        if (ctxRef.current.state === "suspended") {
          try { await ctxRef.current.resume(); } catch { /* ignore */ }
        }
        startLoop();
        setRunning(true);
        return;
      }

      // usePitchDetector 와 동일한 검증된 순서
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;

      const Ctx =
        (globalThis as { AudioContext: typeof AudioContext }).AudioContext ||
        (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx(); // sampleRate 강제 없음
      ctxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0;
      analyserRef.current = analyser;
      bufRef.current = new Float32Array(analyser.fftSize);

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      source.connect(analyser);

      // 입력 경로 연결 "뒤"에 resume. iOS standalone 에서는 여기서 resume 하지 않으면
      // 마이크는 열려도 analyser 에 무음만 들어온다.
      if (ctx.state === "suspended") {
        try { await ctx.resume(); } catch { /* ignore */ }
      }

      setRunning(true);
      startLoop();
    } catch (e) {
      let msg = "마이크를 시작할 수 없습니다.";
      if (e instanceof Error) {
        if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
          msg = "마이크 권한이 거부되었습니다. 설정 > Safari > 마이크를 허용해 주세요.";
        } else if (e.name === "NotFoundError") {
          msg = "마이크를 찾을 수 없습니다.";
        } else if (e.name === "NotReadableError") {
          msg = "마이크를 사용할 수 없습니다. 다른 앱이 마이크를 사용 중일 수 있습니다.";
        } else {
          msg = e.message;
        }
      }
      setError(msg);
      stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop]);

  // 감지 루프 (start 안에서 참조되므로 위에서 선언)
  function startLoop() {
    stopLoop();
    const loop = () => {
      const a = analyserRef.current;
      const buf = bufRef.current;
      const ctx = ctxRef.current;
      if (a && buf && ctx) {
        a.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
        cbRef.current(buf, ctx.sampleRate);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }

  // 화면 복귀(백그라운드→포그라운드) 시 iOS는 ctx를 suspend 하므로 다시 resume.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && ctxRef.current?.state === "suspended") {
        ctxRef.current.resume().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { start, stop, running, error, supported: isMicSupported() };
}

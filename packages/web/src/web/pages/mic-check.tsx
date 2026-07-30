import { useCallback, useMemo, useRef, useState } from "react";
import { colors, Fonts } from "../lib/theme";

/**
 * 마이크 진단 페이지 (임시).
 * iOS 홈화면 앱(standalone PWA)에서 마이크가 안 잡히는 원인을 눈으로 확인하기 위한 도구.
 * 모든 단계를 화면에 로그로 남기고, 실시간 입력 레벨(RMS)을 표시한다.
 */
export default function MicCheckPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [running, setRunning] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const peakRef = useRef(0);

  const log = useCallback((m: string) => {
    setLogs((prev) => [...prev, `${new Date().toLocaleTimeString()}  ${m}`]);
  }, []);

  const env = useMemo(() => {
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    const standalone =
      (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)")?.matches) ||
      // iOS Safari 전용 플래그
      (nav as unknown as { standalone?: boolean } | undefined)?.standalone === true;
    return {
      standalone,
      secure: typeof window !== "undefined" ? window.isSecureContext : false,
      hasMediaDevices: !!nav?.mediaDevices,
      hasGetUserMedia: !!nav?.mediaDevices?.getUserMedia,
      hasAudioCtx:
        typeof (window as unknown as { AudioContext?: unknown }).AudioContext !== "undefined" ||
        typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !== "undefined",
      ua: nav?.userAgent ?? "",
    };
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (ctxRef.current && ctxRef.current.state === "running") {
      ctxRef.current.suspend().catch(() => {});
    }
    setRunning(false);
    log("■ 정지");
  }, [log]);

  const start = useCallback(async () => {
    setLogs([]);
    peakRef.current = 0;
    setPeak(0);
    log(`env standalone=${env.standalone} secure=${env.secure} mediaDevices=${env.hasMediaDevices} getUserMedia=${env.hasGetUserMedia} AudioContext=${env.hasAudioCtx}`);

    if (!env.hasGetUserMedia) {
      log("✗ getUserMedia 미지원 — 이 컨텍스트에서 마이크 접근 불가");
      return;
    }

    try {
      const Ctx =
        (window as unknown as { AudioContext: typeof AudioContext }).AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      log(`AudioContext 생성됨 state=${ctx.state} sampleRate=${ctx.sampleRate}`);

      if (ctx.state === "suspended") {
        await ctx.resume().catch((e) => log(`resume 실패: ${e}`));
        log(`resume 후 state=${ctx.state}`);
      }

      log("getUserMedia 요청… (권한 팝업이 떠야 정상)");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      log(`✓ 스트림 확보: track="${track?.label || "(라벨없음)"}" enabled=${track?.enabled} state=${track?.readyState}`);

      if (ctx.state === "suspended") {
        await ctx.resume().catch(() => {});
        log(`getUserMedia 후 resume → state=${ctx.state}`);
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      log(`분석기 연결 완료. 이제 마이크에 소리를 내보세요.`);
      setRunning(true);

      const loop = () => {
        analyser.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        setLevel(rms);
        if (rms > peakRef.current) {
          peakRef.current = rms;
          setPeak(rms);
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      const err = e as Error;
      log(`✗ 실패: ${err.name} — ${err.message}`);
    }
  }, [env, log]);

  const pct = Math.min(100, Math.round(level * 100 * 4));
  const peakPct = Math.min(100, Math.round(peak * 100 * 4));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16, paddingBottom: 80 }}>
      <h1 style={{ fontFamily: Fonts.sansBold, fontWeight: 700, fontSize: 20, color: colors.foreground, margin: 0 }}>
        마이크 진단
      </h1>
      <p style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.mutedForeground, margin: 0, lineHeight: "20px" }}>
        아래 버튼을 누르고 마이크에 소리를 내보세요. 입력 레벨 막대가 움직이면 마이크는 정상입니다. 로그와 막대를
        스크린샷으로 보내주세요.
      </p>

      {/* 환경 요약 */}
      <div style={card()}>
        <Row k="홈화면 앱(standalone)" v={String(env.standalone)} bad={false} />
        <Row k="보안 컨텍스트(https)" v={String(env.secure)} bad={!env.secure} />
        <Row k="mediaDevices" v={String(env.hasMediaDevices)} bad={!env.hasMediaDevices} />
        <Row k="getUserMedia" v={String(env.hasGetUserMedia)} bad={!env.hasGetUserMedia} />
        <Row k="AudioContext" v={String(env.hasAudioCtx)} bad={!env.hasAudioCtx} />
      </div>

      {/* 레벨 미터 */}
      <div style={card()}>
        <span style={{ fontFamily: Fonts.mono, fontSize: 12, color: colors.mutedForeground }}>
          입력 레벨 (RMS): {level.toFixed(4)}  ·  최대: {peak.toFixed(4)}
        </span>
        <Bar pct={pct} color={pct > 2 ? colors.inTune : colors.border} />
        <Bar pct={peakPct} color={colors.primary} />
        <span style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.mutedForeground }}>
          막대가 0에서 안 움직이면 → 마이크는 열렸지만 신호가 무음(iOS 오디오 잠김/권한). 로그가 "✗"면 → 접근 자체 실패.
        </span>
      </div>

      <button
        type="button"
        onClick={running ? stop : start}
        style={{
          padding: "14px 16px",
          borderRadius: 14,
          border: "none",
          backgroundColor: running ? colors.off : colors.primary,
          color: "#fff",
          fontFamily: Fonts.sansBold,
          fontWeight: 700,
          fontSize: 15,
          cursor: "pointer",
        }}
      >
        {running ? "정지" : "마이크 테스트 시작"}
      </button>

      {/* 로그 */}
      <div style={{ ...card(), gap: 4 }}>
        <span style={{ fontFamily: Fonts.sansMedium, fontWeight: 500, fontSize: 12, color: colors.mutedForeground }}>로그</span>
        <pre
          style={{
            fontFamily: Fonts.mono,
            fontSize: 11,
            color: colors.foreground,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            margin: 0,
            lineHeight: "17px",
          }}
        >
          {logs.length ? logs.join("\n") : "아직 로그 없음"}
        </pre>
      </div>

      <p style={{ fontFamily: Fonts.mono, fontSize: 10, color: colors.mutedForeground, wordBreak: "break-all", margin: 0 }}>
        UA: {env.ua}
      </p>
    </div>
  );
}

function Row({ k, v, bad }: { k: string; v: string; bad: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.mutedForeground }}>{k}</span>
      <span style={{ fontFamily: Fonts.monoBold, fontWeight: 700, fontSize: 13, color: bad ? colors.off : colors.inTune }}>{v}</span>
    </div>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ width: "100%", height: 12, borderRadius: 6, backgroundColor: colors.secondary, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", backgroundColor: color, transition: "width 60ms linear" }} />
    </div>
  );
}

function card(): React.CSSProperties {
  return {
    borderRadius: 16,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.card,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };
}

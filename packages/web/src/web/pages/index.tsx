import { useCallback, useRef, useState } from "react";
import { Mic, Square, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { colors, Fonts } from "../lib/theme";
import { useTuning } from "../lib/tuning-store";
import { useAudioAnalyzer } from "../lib/audio";
import { detectPitch } from "../lib/dsp/pitch";
import { estimateTwaFundamental } from "../lib/dsp/twa";
import { frequencyToKey, centsBetween, keyToNoteName } from "../lib/dsp/notes";
import { TunerMeter } from "../components/tuner/TunerMeter";
import { StrobeDisplay } from "../components/tuner/StrobeDisplay";
import { PianoKeyboard } from "../components/tuner/PianoKeyboard";
import { statusColor, statusLabel } from "../lib/status";
import { useAuth } from "../hooks/useAuth";
import { useUserRole } from "../hooks/useUserRole";

interface Reading {
  freq: number;
  keyIndex: number;
  note: string;
  target: number;
  targetCents: number; // 목표 건반의 ET 대비 스트레치 센트(커브값)
  cents: number;
}

const ANALYZE_INTERVAL = 110; // ms

export default function TunerPage() {
  const { a4, curve, styleId } = useTuning();
  const { user } = useAuth();
  const { isPro } = useUserRole(user?.id);

  // `reading` is LATCHED: it holds the last confirmed note and stays on screen
  // even after the sound fades, until a new note is played or the mic is stopped.
  const [reading, setReading] = useState<Reading | null>(null);
  // `live` is true only while sound is actually being heard right now.
  const [live, setLive] = useState(false);
  const lastRun = useRef(0);
  const smoothCents = useRef(0);
  const wasLive = useRef(false);
  const lastKey = useRef<number | null>(null);
  const curveRef = useRef(curve);
  curveRef.current = curve;

  // Manual key override: when the low-register detection is wrong, the user can
  // pin the note with the arrows. While pinned, tuning is computed against THIS
  // key regardless of what the algorithm guesses. null = automatic detection.
  const [manualKey, setManualKey] = useState<number | null>(null);
  const manualKeyRef = useRef<number | null>(null);
  const lastFreqRef = useRef(0);

  const onFrame = useCallback(
    (buffer: Float32Array, sampleRate: number) => {
      const now = Date.now();
      if (now - lastRun.current < ANALYZE_INTERVAL) return;
      lastRun.current = now;

      const { frequency, rms } = detectPitch(buffer, sampleRate);
      if (frequency <= 0 || rms < 0.004) {
        // Sound gone: mark as not-live but KEEP the last reading latched.
        wasLive.current = false;
        setLive(false);
        return;
      }
      // TWA: use the measured B curve to refine the raw YIN fundamental into the
      // partial-weighted effective pitch (inharmonicity-corrected). First pass a
      // provisional key from the raw frequency to look up its B, then re-derive
      // the key from the refined f1 so bass notes (large inharmonicity) don't get
      // mis-recognized by an octave. Falls back to raw f1 when partials are sparse.
      const provKey = frequencyToKey(frequency, a4);
      const bGuess = curveRef.current[provKey - 1]?.B ?? 0;
      const twa = estimateTwaFundamental(buffer, sampleRate, frequency, bGuess, 10);
      const f1 = twa ? twa.f1 : frequency;

      lastFreqRef.current = f1;
      // If the user pinned a key with the arrows, tune against that; otherwise
      // use the auto-detected key.
      const keyIndex = manualKeyRef.current ?? frequencyToKey(f1, a4);
      const point = curveRef.current[keyIndex - 1];
      const target = point?.fTuned ?? f1;
      const targetCents = point?.cents ?? 0;
      const rawCents = centsBetween(f1, target);
      // Reset the smoothing when a fresh note starts (after silence or a note change)
      // so the meter snaps to the new note instead of sweeping from the old one.
      if (!wasLive.current || lastKey.current !== keyIndex) {
        smoothCents.current = rawCents;
      } else {
        smoothCents.current = smoothCents.current * 0.6 + rawCents * 0.4;
      }
      wasLive.current = true;
      lastKey.current = keyIndex;
      setLive(true);
      setReading({
        freq: f1,
        keyIndex,
        note: keyToNoteName(keyIndex),
        target,
        targetCents,
        cents: smoothCents.current,
      });
    },
    [a4],
  );

  const { start, stop, running, error, supported } = useAudioAnalyzer(onFrame);

  const stopAll = useCallback(() => {
    stop();
    setReading(null);
    setLive(false);
    wasLive.current = false;
    lastKey.current = null;
    manualKeyRef.current = null;
    setManualKey(null);
  }, [stop]);

  // Recompute the latched reading immediately for a pinned key using the last
  // detected frequency, so the meter/cents update even when the sound has faded.
  const applyManualKey = useCallback((key: number) => {
    const clamped = Math.min(88, Math.max(1, key));
    manualKeyRef.current = clamped;
    setManualKey(clamped);
    const f = lastFreqRef.current;
    const point = curveRef.current[clamped - 1];
    const target = point?.fTuned ?? f;
    const targetCents = point?.cents ?? 0;
    const rawCents = f > 0 ? centsBetween(f, target) : 0;
    smoothCents.current = rawCents;
    lastKey.current = clamped;
    setReading({
      freq: f,
      keyIndex: clamped,
      note: keyToNoteName(clamped),
      target,
      targetCents,
      cents: rawCents,
    });
  }, []);

  const nudgeKey = useCallback(
    (delta: number) => {
      const base = manualKeyRef.current ?? lastKey.current ?? reading?.keyIndex ?? 49;
      applyManualKey(base + delta);
    },
    [applyManualKey, reading],
  );

  const clearManual = useCallback(() => {
    manualKeyRef.current = null;
    setManualKey(null);
  }, []);

  // Colored/state view stays as long as we have a latched reading and the mic runs.
  const active = running && reading != null;
  const cents = reading?.cents ?? null;
  const color = active && cents != null ? statusColor(cents, colors) : colors.mutedForeground;

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h1 style={{ fontFamily: Fonts.sansBold, fontWeight: 700, fontSize: 20, color: colors.foreground, margin: 0 }}>
          실시간 튜너
        </h1>
        <span style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.5, color: colors.mutedForeground }}>
          {styleId} · A4 {a4}Hz
        </span>
      </div>

      {/* Main readout: strobe + note/cents side by side */}
      <Card elevated style={{ paddingTop: 14, paddingBottom: 14, paddingLeft: 14, paddingRight: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <StrobeDisplay cents={cents} active={active} spinning={live} size={150} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <button
                type="button"
                aria-label="이전 건반"
                disabled={!running}
                onClick={() => nudgeKey(-1)}
                style={arrowBtnStyle(running)}
              >
                <ChevronLeft size={22} color={running ? colors.foreground : colors.mutedForeground} />
              </button>
              <span style={{ fontFamily: Fonts.monoBold, fontWeight: 700, fontSize: 46, lineHeight: "50px", minWidth: 74, textAlign: "center", color: active ? color : colors.mutedForeground }}>
                {reading?.note ?? "—"}
              </span>
              <button
                type="button"
                aria-label="다음 건반"
                disabled={!running}
                onClick={() => nudgeKey(1)}
                style={arrowBtnStyle(running)}
              >
                <ChevronRight size={22} color={running ? colors.foreground : colors.mutedForeground} />
              </button>
              {manualKey != null ? (
                <button
                  type="button"
                  onClick={clearManual}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontFamily: Fonts.mono,
                    fontSize: 9,
                    letterSpacing: 1,
                    color: colors.warn,
                    backgroundColor: "transparent",
                    border: `1px solid ${colors.warn}`,
                    borderRadius: 999,
                    padding: "2px 7px",
                    cursor: "pointer",
                  }}
                >
                  <RotateCcw size={10} color={colors.warn} /> 수동 · 자동복귀
                </button>
              ) : (
                active && !live && (
                  <span
                    style={{
                      fontFamily: Fonts.mono,
                      fontSize: 9,
                      letterSpacing: 1,
                      color: colors.mutedForeground,
                      border: `1px solid ${colors.border}`,
                      borderRadius: 999,
                      padding: "2px 7px",
                    }}
                  >
                    HOLD
                  </span>
                )
              )}
            </div>
            <span style={{ fontFamily: Fonts.monoBold, fontWeight: 700, fontSize: 30, lineHeight: "34px", color }}>
              {active && cents != null ? `${cents > 0 ? "+" : ""}${cents.toFixed(1)}` : "––.–"}
              <span style={{ fontFamily: Fonts.mono, fontSize: 13, color: colors.mutedForeground }}> cents</span>
            </span>
            <span style={{ fontFamily: Fonts.sansMedium, fontWeight: 500, fontSize: 13, color }}>
              {active && cents != null
                ? live
                  ? statusLabel(cents)
                  : `${statusLabel(cents)} · 유지됨`
                : running
                  ? "소리를 감지하는 중…"
                  : "정지됨"}
            </span>
          </div>
        </div>
        <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
          <TunerMeter cents={cents} active={active} width={320} />
        </div>
      </Card>

      {/* Piano keyboard */}
      <div
        style={{
          borderRadius: 14,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.cardElevated,
          paddingTop: 10,
          paddingBottom: 10,
          paddingLeft: 8,
          paddingRight: 8,
          overflow: "hidden",
        }}
      >
        <PianoKeyboard activeKey={active ? (reading?.keyIndex ?? null) : null} color={color} />
      </div>

      {/* Detail rows */}
      <div style={{ display: "flex", gap: 8 }}>
        <Detail label="감지 주파수" value={reading ? `${reading.freq.toFixed(2)} Hz` : "— Hz"} />
        <Detail label="목표 주파수" value={reading ? `${reading.target.toFixed(2)} Hz` : "— Hz"} />
        <Detail
          label="목표 센트(ET)"
          value={reading ? `${reading.targetCents > 0 ? "+" : ""}${reading.targetCents.toFixed(1)}c` : "— c"}
        />
      </div>

      {error && <p style={{ fontFamily: Fonts.sans, fontSize: 13, textAlign: "center", color: colors.off, margin: 0 }}>{error}</p>}
      {!supported && !error && (
        <p style={{ fontFamily: Fonts.sans, fontSize: 12, textAlign: "center", lineHeight: "18px", color: colors.mutedForeground, margin: 0 }}>
          이 브라우저에서 마이크를 사용할 수 없습니다. HTTPS 환경과 마이크 권한을 확인해 주세요.
        </p>
      )}

      <button
        type="button"
        onClick={!isPro ? undefined : running ? stopAll : start}
        disabled={!isPro}
        title={!isPro ? "Pro 이상 등급에서 사용 가능합니다" : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingTop: 13,
          paddingBottom: 13,
          borderRadius: 14,
          border: "none",
          cursor: isPro ? "pointer" : "not-allowed",
          marginTop: 2,
          backgroundColor: !isPro ? colors.muted : running ? colors.off : colors.primary,
          color: !isPro ? colors.mutedForeground : "#FFFFFF",
          fontFamily: Fonts.sansBold,
          fontWeight: 700,
          fontSize: 16,
        }}
      >
        {!isPro ? "🔒 마이크 시작" : running ? <Square size={20} color="#FFF" fill="#FFF" /> : <Mic size={20} color="#FFF" />}
        {isPro && (running ? "정지" : "마이크 시작")}
      </button>
      {!isPro && (
        <p
          style={{
            fontSize: 12,
            textAlign: "center",
            color: colors.mutedForeground,
            fontFamily: Fonts.sans,
            marginTop: 6,
          }}
        >
          Pro 등급으로 변경하면 마이크를 사용할 수 있습니다.
        </p>
      )}
    </div>
  );
}

function arrowBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 34,
    flexShrink: 0,
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.card,
    cursor: enabled ? "pointer" : "default",
    opacity: enabled ? 1 : 0.4,
    padding: 0,
  };
}

function Card({
  children,
  elevated,
  align,
  style,
}: {
  children: React.ReactNode;
  elevated?: boolean;
  align?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: `1px solid ${colors.border}`,
        backgroundColor: elevated ? colors.cardElevated : colors.card,
        paddingTop: 20,
        paddingBottom: 16,
        display: "flex",
        flexDirection: "column",
        alignItems: align ? "center" : "stretch",
        gap: 6,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        flex: 1,
        borderRadius: 12,
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.card,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.mutedForeground }}>{label}</span>
      <span style={{ fontFamily: Fonts.monoBold, fontWeight: 700, fontSize: 16, color: colors.foreground }}>{value}</span>
    </div>
  );
}

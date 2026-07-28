import { useCallback, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { colors, Fonts } from "../lib/theme";
import { useTuning } from "../lib/tuning-store";
import { useAudioAnalyzer } from "../lib/audio";
import { detectPitch } from "../lib/dsp/pitch";
import { frequencyToKey, centsBetween, keyToNoteName } from "../lib/dsp/notes";
import { TunerMeter } from "../components/tuner/TunerMeter";
import { StrobeDisplay } from "../components/tuner/StrobeDisplay";
import { PianoKeyboard } from "../components/tuner/PianoKeyboard";
import { statusColor, statusLabel } from "../lib/status";

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
      const keyIndex = frequencyToKey(frequency, a4);
      const point = curveRef.current[keyIndex - 1];
      const target = point?.fTuned ?? frequency;
      const targetCents = point?.cents ?? 0;
      const rawCents = centsBetween(frequency, target);
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
        freq: frequency,
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
  }, [stop]);

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
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: Fonts.monoBold, fontWeight: 700, fontSize: 46, lineHeight: "50px", color: active ? color : colors.mutedForeground }}>
                {reading?.note ?? "—"}
              </span>
              {active && !live && (
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
        onClick={running ? stopAll : start}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingTop: 13,
          paddingBottom: 13,
          borderRadius: 14,
          border: "none",
          cursor: "pointer",
          marginTop: 2,
          backgroundColor: running ? colors.off : colors.primary,
          color: "#FFFFFF",
          fontFamily: Fonts.sansBold,
          fontWeight: 700,
          fontSize: 16,
        }}
      >
        {running ? <Square size={20} color="#FFF" fill="#FFF" /> : <Mic size={20} color="#FFF" />}
        {running ? "정지" : "마이크 시작"}
      </button>
    </div>
  );
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

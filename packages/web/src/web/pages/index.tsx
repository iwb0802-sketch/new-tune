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
  cents: number;
}

const ANALYZE_INTERVAL = 110; // ms

export default function TunerPage() {
  const { a4, curve, styleId } = useTuning();

  const [reading, setReading] = useState<Reading | null>(null);
  const lastRun = useRef(0);
  const smoothCents = useRef(0);
  const curveRef = useRef(curve);
  curveRef.current = curve;

  const onFrame = useCallback(
    (buffer: Float32Array, sampleRate: number) => {
      const now = Date.now();
      if (now - lastRun.current < ANALYZE_INTERVAL) return;
      lastRun.current = now;

      const { frequency, rms } = detectPitch(buffer, sampleRate);
      if (frequency <= 0 || rms < 0.004) {
        setReading(null);
        return;
      }
      const keyIndex = frequencyToKey(frequency, a4);
      const point = curveRef.current[keyIndex - 1];
      const target = point?.fTuned ?? frequency;
      const rawCents = centsBetween(frequency, target);
      smoothCents.current = smoothCents.current * 0.6 + rawCents * 0.4;
      setReading({
        freq: frequency,
        keyIndex,
        note: keyToNoteName(keyIndex),
        target,
        cents: smoothCents.current,
      });
    },
    [a4],
  );

  const { start, stop, running, error, supported } = useAudioAnalyzer(onFrame);

  const active = running && reading != null;
  const cents = reading?.cents ?? null;
  const color = active && cents != null ? statusColor(cents, colors) : colors.mutedForeground;

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 2, color: colors.mutedForeground }}>
          PIANO TUNING SCOPE
        </span>
        <h1 style={{ fontFamily: Fonts.sansBold, fontWeight: 700, fontSize: 24, color: colors.foreground, margin: 0 }}>
          실시간 튜너
        </h1>
      </div>

      {/* Note readout */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, marginTop: 4 }}>
        <span style={{ fontFamily: Fonts.monoBold, fontWeight: 700, fontSize: 64, lineHeight: "72px", color: active ? color : colors.mutedForeground }}>
          {reading?.note ?? "—"}
        </span>
        <span style={{ fontFamily: Fonts.sansMedium, fontWeight: 500, fontSize: 15, color }}>
          {active && cents != null ? statusLabel(cents) : running ? "소리를 감지하는 중…" : "정지됨"}
        </span>
      </div>

      {/* Strobe */}
      <Card elevated align>
        <StrobeDisplay cents={cents} active={active} size={250} />
        <span style={{ fontFamily: Fonts.monoBold, fontWeight: 700, fontSize: 34, color }}>
          {active && cents != null ? `${cents > 0 ? "+" : ""}${cents.toFixed(1)}` : "––.–"}
          <span style={{ fontFamily: Fonts.mono, fontSize: 14, color: colors.mutedForeground }}>  cents</span>
        </span>
        <span style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.mutedForeground, textAlign: "center" }}>
          {active
            ? Math.abs(cents ?? 0) <= 1
              ? "정지 = 정확히 맞음"
              : (cents ?? 0) > 0
                ? "시계방향 회전 → 음이 높음(♯)"
                : "반시계방향 회전 → 음이 낮음(♭)"
            : "휠이 멈추면 정확히 맞은 것"}
        </span>
      </Card>

      {/* Fine-tune needle */}
      <Card align style={{ paddingTop: 14 }}>
        <TunerMeter cents={cents} active={active} width={280} />
      </Card>

      {/* Piano keyboard */}
      <div
        style={{
          borderRadius: 16,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.cardElevated,
          paddingTop: 12,
          paddingBottom: 12,
          paddingLeft: 10,
          paddingRight: 10,
          overflow: "hidden",
        }}
      >
        <PianoKeyboard activeKey={active ? (reading?.keyIndex ?? null) : null} color={color} />
      </div>

      {/* Detail rows */}
      <div style={{ display: "flex", gap: 12 }}>
        <Detail label="감지 주파수" value={reading ? `${reading.freq.toFixed(2)} Hz` : "— Hz"} />
        <Detail label="목표 주파수" value={reading ? `${reading.target.toFixed(2)} Hz` : "— Hz"} />
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <Detail label="건반" value={reading ? `#${reading.keyIndex}` : "—"} />
        <Detail label="스타일 · A4" value={`${styleId} · ${a4}Hz`} />
      </div>

      {error && <p style={{ fontFamily: Fonts.sans, fontSize: 13, textAlign: "center", color: colors.off, margin: 0 }}>{error}</p>}
      {!supported && !error && (
        <p style={{ fontFamily: Fonts.sans, fontSize: 12, textAlign: "center", lineHeight: "18px", color: colors.mutedForeground, margin: 0 }}>
          이 브라우저에서 마이크를 사용할 수 없습니다. HTTPS 환경과 마이크 권한을 확인해 주세요.
        </p>
      )}

      <button
        type="button"
        onClick={running ? stop : start}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingTop: 15,
          paddingBottom: 15,
          borderRadius: 14,
          border: "none",
          cursor: "pointer",
          marginTop: 4,
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

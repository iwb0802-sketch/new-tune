import { useCallback, useRef, useState } from "react";
import { CheckCircle2, Camera, Activity, Trash2 } from "lucide-react";
import { colors, Fonts } from "../lib/theme";
import { useTuning } from "../lib/tuning-store";
import { useAudioAnalyzer } from "../lib/audio";
import { detectPitch } from "../lib/dsp/pitch";
import { extractPartials } from "../lib/dsp/partials";
import { fitInharmonicity } from "../lib/dsp/inharmonicity";
import { REPRESENTATIVE_KEYS, keyToNoteName, keyToFrequency, frequencyToKey } from "../lib/dsp/notes";

const STABLE_FRAMES_TO_CAPTURE = 4;

export default function MeasurePage() {
  const { a4, bCurve, measurements, addMeasurement, removeMeasurement } = useTuning();

  const [selectedKey, setSelectedKey] = useState(REPRESENTATIVE_KEYS[0]);
  const [capturing, setCapturing] = useState(false);
  const [live, setLive] = useState<{ note: string; freq: number } | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const bufRef = useRef<{ buf: Float32Array; sr: number } | null>(null);
  const stableCount = useRef(0);
  const selectedRef = useRef(selectedKey);
  selectedRef.current = selectedKey;
  const capturingRef = useRef(capturing);
  capturingRef.current = capturing;
  const stopRef = useRef<() => void>(() => {});

  const doFit = useCallback(
    (buffer: Float32Array, sr: number, key: number) => {
      const { frequency } = detectPitch(buffer, sr);
      if (frequency <= 0) {
        setLastResult("피치를 감지하지 못했습니다. 건반을 다시 강하게 쳐 주세요.");
        return false;
      }
      const bGuess = bCurve[key - 1] ?? 0;
      const partials = extractPartials(buffer, sr, frequency, 8, bGuess);
      const fit = fitInharmonicity(partials);
      if (!fit || fit.partialsUsed < 3) {
        setLastResult("배음이 충분히 잡히지 않았습니다. 조용한 곳에서 다시 시도하세요.");
        return false;
      }
      addMeasurement({
        keyIndex: key,
        B: fit.B,
        f0: fit.f0,
        rSquared: fit.rSquared,
        partialsUsed: fit.partialsUsed,
        measuredAt: Date.now(),
      });
      setLastResult(
        `${keyToNoteName(key)} 측정 완료 · B=${fit.B.toExponential(2)} · R²=${fit.rSquared.toFixed(3)} · 배음 ${fit.partialsUsed}개`,
      );
      return true;
    },
    [bCurve, addMeasurement],
  );

  const onFrame = useCallback(
    (buffer: Float32Array, sr: number) => {
      bufRef.current = { buf: buffer.slice(), sr };
      const { frequency, rms } = detectPitch(buffer, sr);
      if (frequency <= 0 || rms < 0.004) {
        setLive(null);
        stableCount.current = 0;
        return;
      }
      const key = frequencyToKey(frequency, a4);
      setLive({ note: keyToNoteName(key), freq: frequency });

      if (capturingRef.current) {
        const expected = selectedRef.current;
        if (key === expected && rms > 0.02) {
          stableCount.current += 1;
          if (stableCount.current >= STABLE_FRAMES_TO_CAPTURE) {
            stableCount.current = 0;
            const ok = doFit(buffer, sr, expected);
            if (ok) {
              setCapturing(false);
              stopRef.current();
            }
          }
        } else {
          stableCount.current = Math.max(0, stableCount.current - 1);
        }
      }
    },
    [a4, doFit],
  );

  const { start, stop, error, supported } = useAudioAnalyzer(onFrame);
  stopRef.current = stop;

  const startCapture = useCallback(async () => {
    setLastResult(null);
    stableCount.current = 0;
    setCapturing(true);
    await start();
  }, [start]);

  const cancelCapture = useCallback(() => {
    setCapturing(false);
    stop();
  }, [stop]);

  const manualCapture = useCallback(() => {
    const b = bufRef.current;
    if (!b) {
      setLastResult("먼저 마이크를 시작하고 건반을 쳐 주세요.");
      return;
    }
    const ok = doFit(b.buf, b.sr, selectedRef.current);
    if (ok) {
      setCapturing(false);
      stop();
    }
  }, [doFit, stop]);

  const measuredCount = Object.keys(measurements).length;

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 2, color: colors.mutedForeground }}>INHARMONICITY MEASURE</span>
        <h1 style={{ fontFamily: Fonts.sansBold, fontWeight: 700, fontSize: 24, color: colors.foreground, margin: 0 }}>대표 건반 측정</h1>
        <p style={{ fontFamily: Fonts.sans, fontSize: 13, lineHeight: "19px", color: colors.mutedForeground, margin: 0 }}>
          건반별 배음을 분석해 인하모니시티 계수(B)를 산출합니다. {measuredCount}/{REPRESENTATIVE_KEYS.length} 측정됨
        </p>
      </div>

      {/* Key selector */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {REPRESENTATIVE_KEYS.map((key) => {
          const m = measurements[key];
          const selected = key === selectedKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedKey(key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                paddingTop: 8,
                paddingBottom: 8,
                paddingLeft: 12,
                paddingRight: 12,
                borderRadius: 10,
                cursor: "pointer",
                border: `1px solid ${selected ? colors.primary : colors.border}`,
                backgroundColor: selected ? colors.primary : colors.card,
              }}
            >
              <span style={{ fontFamily: Fonts.monoBold, fontWeight: 700, fontSize: 14, color: selected ? colors.primaryForeground : colors.foreground }}>
                {keyToNoteName(key)}
              </span>
              {m ? (
                <CheckCircle2 size={13} color={selected ? colors.primaryForeground : colors.inTune} />
              ) : (
                <span style={{ fontFamily: Fonts.mono, fontSize: 11, color: selected ? colors.primaryForeground : colors.mutedForeground }}>
                  #{key}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Measure panel */}
      <div
        style={{
          borderRadius: 18,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.cardElevated,
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontFamily: Fonts.monoBold, fontWeight: 700, fontSize: 30, color: colors.foreground }}>{keyToNoteName(selectedKey)}</span>
          <span style={{ fontFamily: Fonts.mono, fontSize: 13, color: colors.mutedForeground }}>목표 {keyToFrequency(selectedKey, a4).toFixed(2)} Hz</span>
        </div>

        <p style={{ fontFamily: Fonts.sans, fontSize: 13, lineHeight: "19px", color: colors.mutedForeground, margin: 0 }}>
          {capturing
            ? "선택한 건반을 강하게 치세요. 안정되면 자동으로 캡처됩니다."
            : "측정 시작을 누른 뒤 해당 건반을 강하게 치세요."}
        </p>

        <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
          <span style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.mutedForeground }}>실시간 감지</span>
          <span style={{ fontFamily: Fonts.monoBold, fontWeight: 700, fontSize: 20, color: live ? colors.precision : colors.mutedForeground }}>
            {live ? `${live.note}  ·  ${live.freq.toFixed(1)} Hz` : "—"}
          </span>
        </div>

        {capturing ? (
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={manualCapture} style={btn(colors.primary, "#FFF", { flex: 1 })}>
              <Camera size={18} color="#FFF" />
              지금 캡처
            </button>
            <button type="button" onClick={cancelCapture} style={btn(colors.secondary, colors.foreground)}>
              취소
            </button>
          </div>
        ) : (
          <button type="button" onClick={startCapture} style={btn(colors.primary, "#FFF")}>
            <Activity size={18} color="#FFF" />
            측정 시작
          </button>
        )}

        {measurements[selectedKey] && (
          <button
            type="button"
            onClick={() => removeMeasurement(selectedKey)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingTop: 2,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: colors.off,
              fontFamily: Fonts.sansMedium,
              fontWeight: 500,
              fontSize: 13,
            }}
          >
            <Trash2 size={14} color={colors.off} />
            이 측정 삭제
          </button>
        )}
      </div>

      {lastResult && (
        <p
          style={{
            fontFamily: Fonts.mono,
            fontSize: 12,
            lineHeight: "18px",
            padding: 12,
            borderRadius: 10,
            border: `1px solid ${colors.border}`,
            backgroundColor: colors.card,
            color: colors.foreground,
            margin: 0,
          }}
        >
          {lastResult}
        </p>
      )}
      {error && <p style={{ fontFamily: Fonts.sans, fontSize: 12, textAlign: "center", color: colors.off, margin: 0 }}>{error}</p>}
      {!supported && !error && (
        <p style={{ fontFamily: Fonts.sans, fontSize: 12, textAlign: "center", color: colors.mutedForeground, margin: 0 }}>
          이 브라우저에서 마이크를 사용할 수 없습니다.
        </p>
      )}

      {/* Measured table */}
      {measuredCount > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
          <span style={{ fontFamily: Fonts.sansBold, fontWeight: 700, fontSize: 15, color: colors.foreground, marginBottom: 6 }}>측정 결과</span>
          {Object.values(measurements)
            .sort((a, b) => a.keyIndex - b.keyIndex)
            .map((m) => (
              <div
                key={m.keyIndex}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingTop: 10,
                  paddingBottom: 10,
                  borderTop: `1px solid ${colors.border}`,
                }}
              >
                <span style={{ fontFamily: Fonts.monoBold, fontWeight: 700, fontSize: 14, width: 44, color: colors.foreground }}>{keyToNoteName(m.keyIndex)}</span>
                <span style={{ fontFamily: Fonts.mono, fontSize: 12, color: colors.precision }}>B {m.B.toExponential(2)}</span>
                <span style={{ fontFamily: Fonts.mono, fontSize: 12, color: colors.mutedForeground }}>R² {m.rSquared.toFixed(2)}</span>
                <span style={{ fontFamily: Fonts.mono, fontSize: 12, color: colors.mutedForeground }}>{m.partialsUsed}부분음</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function btn(bg: string, fg: string, extra?: React.CSSProperties): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 18,
    paddingRight: 18,
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    backgroundColor: bg,
    color: fg,
    fontFamily: Fonts.sansBold,
    fontWeight: 700,
    fontSize: 15,
    ...extra,
  };
}

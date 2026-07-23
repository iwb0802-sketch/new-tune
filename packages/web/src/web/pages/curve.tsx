import { useEffect, useRef, useState } from "react";
import { colors, Fonts } from "../lib/theme";
import { useTuning } from "../lib/tuning-store";
import { CurveChart } from "../components/tuner/CurveChart";
import { Segmented } from "../components/tuner/Segmented";
import { getStyle } from "../lib/dsp/stretch";

export default function CurvePage() {
  const { curve, measurements, styleId, a4 } = useTuning();
  const [mode, setMode] = useState<"cents" | "B">("cents");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [chartW, setChartW] = useState(330);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setChartW(Math.max(240, Math.min(560, el.clientWidth - 24)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const measuredKeys = Object.keys(measurements).map(Number);
  const hasMeasurements = measuredKeys.length > 0;

  const bassCents = curve[0]?.cents ?? 0; // A0
  const trebleCents = curve[curve.length - 1]?.cents ?? 0; // C8
  const style = getStyle(styleId);

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 2, color: colors.mutedForeground }}>88-KEY TUNING CURVE</span>
        <h1 style={{ fontFamily: Fonts.sansBold, fontWeight: 700, fontSize: 24, color: colors.foreground, margin: 0 }}>조율 커브</h1>
        <p style={{ fontFamily: Fonts.sans, fontSize: 13, lineHeight: "19px", color: colors.mutedForeground, margin: 0 }}>
          {hasMeasurements
            ? `측정된 ${measuredKeys.length}개 건반을 보간해 계산한 커브입니다.`
            : "측정값이 없어 기본 참조 커브를 표시합니다. 측정 탭에서 건반을 측정하세요."}
        </p>
      </div>

      <Segmented
        options={[
          { value: "cents", label: "스트레치 (cents)" },
          { value: "B", label: "인하모니시티 (B)" },
        ]}
        value={mode}
        onChange={(v) => setMode(v as "cents" | "B")}
      />

      <div
        ref={wrapRef}
        style={{
          borderRadius: 16,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.cardElevated,
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "center",
        }}
      >
        <CurveChart curve={curve} mode={mode} measuredKeys={measuredKeys} width={chartW} height={210} />
        <span style={{ fontFamily: Fonts.sans, fontSize: 11, textAlign: "center", lineHeight: "16px", color: colors.mutedForeground }}>
          {mode === "cents"
            ? "평균율 대비 편차 (Railsback 스트레치). 저음 ♭, 고음 ♯."
            : "건반별 인하모니시티 계수 (로그 스케일). 초록 점 = 실측."}
        </span>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <Stat label="스타일" value={style.label.replace(" 옥타브", "")} />
        <Stat label="A4 기준" value={`${a4} Hz`} />
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <Stat label="A0 스트레치" value={`${bassCents.toFixed(1)}c`} accent={colors.off} />
        <Stat label="C8 스트레치" value={`+${trebleCents.toFixed(1)}c`} accent={colors.inTune} />
      </div>

      {/* Offset table by octave A-notes */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
        <span style={{ fontFamily: Fonts.sansBold, fontWeight: 700, fontSize: 15, color: colors.foreground, marginBottom: 6 }}>옥타브별 편차</span>
        {[1, 13, 25, 37, 49, 61, 73, 85, 88].map((k) => {
          const p = curve[k - 1];
          if (!p) return null;
          const col = Math.abs(p.cents) <= 1 ? colors.inTune : p.cents < 0 ? colors.off : colors.precision;
          return (
            <div
              key={k}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: 10,
                paddingBottom: 10,
                borderTop: `1px solid ${colors.border}`,
              }}
            >
              <span style={{ fontFamily: Fonts.monoBold, fontWeight: 700, fontSize: 14, width: 44, color: colors.foreground }}>{p.note}</span>
              <span style={{ fontFamily: Fonts.mono, fontSize: 12, color: colors.mutedForeground }}>{p.fTuned.toFixed(2)} Hz</span>
              <span style={{ fontFamily: Fonts.mono, fontSize: 12, color: col, width: 70, textAlign: "right" }}>
                {p.cents > 0 ? "+" : ""}
                {p.cents.toFixed(1)}c
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
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
      <span style={{ fontFamily: Fonts.monoBold, fontWeight: 700, fontSize: 17, color: accent ?? colors.foreground }}>{value}</span>
    </div>
  );
}

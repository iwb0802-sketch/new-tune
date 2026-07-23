import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Mic, Square, Check, Maximize2, Minimize2, Download } from "lucide-react";
import { colors, Fonts } from "../lib/theme";
import { useTuning } from "../lib/tuning-store";
import { useAudioAnalyzer } from "../lib/audio";
import { detectPitch } from "../lib/dsp/pitch";
import { frequencyToKey, centsBetween, keyToNoteName } from "../lib/dsp/notes";
import { StrobeDisplay } from "../components/tuner/StrobeDisplay";
import { ManualTuneChart, toleranceFor, type ManualChartHandle } from "../components/tuner/ManualTuneChart";
import { statusColor, statusLabel } from "../lib/status";

const RANGES: Record<string, { label: string; sub: string; keys: number[] }> = {
  center: { label: "중앙부", sub: "61→28", keys: range(61, 28) },
  lower: { label: "하부", sub: "27→1", keys: range(27, 1) },
  upper: { label: "상부", sub: "62→88", keys: range(62, 88) },
};

function range(from: number, to: number): number[] {
  const out: number[] = [];
  const step = from <= to ? 1 : -1;
  for (let k = from; step > 0 ? k <= to : k >= to; k += step) out.push(k);
  return out;
}

const ANALYZE_INTERVAL = 110;
const LOCK_MS = 700; // hold in-tune this long to auto-record

interface Live {
  freq: number;
  centsToTarget: number;
  centsFromET: number;
  onTargetKey: boolean;
}

export default function ManualPage() {
  const { a4, curve, tunedCents, recordTuned, clearTuned, resetTuned } = useTuning();

  const [rangeId, setRangeId] = useState<keyof typeof RANGES>("center");
  const [cursor, setCursor] = useState(0);
  const [auto, setAuto] = useState(true);
  const [live, setLive] = useState<Live | null>(null);
  const [fitView, setFitView] = useState(true);
  const [chartW, setChartW] = useState(340);
  const [saving, setSaving] = useState(false);
  const chartRef = useRef<ManualChartHandle>(null);
  const chartWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = chartWrapRef.current;
    if (!el) return;
    const update = () => {
      const w = Math.round(el.clientWidth);
      if (w > 0) setChartW(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const saveChart = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const dataUrl = await chartRef.current?.capture();
      if (!dataUrl) {
        window.alert("그래프 이미지를 만들 수 없습니다.");
        return;
      }
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const filename = `tuning-curve-${stamp}.png`;
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      window.alert("그래프를 저장하는 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }, [saving]);

  const progression = RANGES[rangeId].keys;
  const currentKey = progression[cursor] ?? progression[0];
  const target = curve[currentKey - 1];

  const lastRun = useRef(0);
  const smooth = useRef(0);
  const lockSince = useRef<number | null>(null);
  const ctxRef = useRef({ currentKey, auto });
  ctxRef.current = { currentKey, auto };

  const advance = useCallback(() => {
    setCursor((c) => Math.min(progression.length - 1, c + 1));
  }, [progression.length]);

  const doRecord = useCallback(
    (cents: number, key: number) => {
      recordTuned(key, cents);
    },
    [recordTuned],
  );

  const onFrame = useCallback(
    (buffer: Float32Array, sampleRate: number) => {
      const now = Date.now();
      if (now - lastRun.current < ANALYZE_INTERVAL) return;
      lastRun.current = now;

      const key = ctxRef.current.currentKey;
      const point = curve[key - 1];
      if (!point) return;

      const { frequency, rms } = detectPitch(buffer, sampleRate);
      if (frequency <= 0 || rms < 0.004) {
        setLive(null);
        lockSince.current = null;
        return;
      }
      const detectedKey = frequencyToKey(frequency, a4);
      const onTargetKey = detectedKey === key;
      const rawToTarget = centsBetween(frequency, point.fTuned);
      smooth.current = smooth.current * 0.6 + rawToTarget * 0.4;
      const centsFromET = centsBetween(frequency, point.fEqual);

      setLive({ freq: frequency, centsToTarget: smooth.current, centsFromET, onTargetKey });

      if (ctxRef.current.auto && onTargetKey && Math.abs(smooth.current) <= 1) {
        if (lockSince.current == null) lockSince.current = now;
        else if (now - lockSince.current >= LOCK_MS) {
          doRecord(centsFromET, key);
          lockSince.current = null;
          setCursor((c) => Math.min(progression.length - 1, c + 1));
        }
      } else {
        lockSince.current = null;
      }
    },
    [a4, curve, doRecord, progression.length],
  );

  const { start, stop, running, error, supported } = useAudioAnalyzer(onFrame);

  const onTarget = running && live != null && live.onTargetKey;
  const cents = onTarget ? live!.centsToTarget : null;
  const color = cents != null ? statusColor(cents, colors) : colors.mutedForeground;

  const doneCount = Object.keys(tunedCents).length;
  const tol = target ? toleranceFor(target.cents) : 3;

  const switchRange = (id: string) => {
    setRangeId(id as keyof typeof RANGES);
    setCursor(0);
    lockSince.current = null;
  };

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 2, color: colors.mutedForeground }}>MANUAL TUNING</span>
        <h1 style={{ fontFamily: Fonts.sansBold, fontWeight: 700, fontSize: 24, color: colors.foreground, margin: 0 }}>수동 정밀 조율</h1>
      </div>

      {/* range presets */}
      <div style={{ display: "flex", gap: 8 }}>
        {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((id) => {
          const r = RANGES[id];
          const active = id === rangeId;
          return (
            <button
              key={id}
              type="button"
              onClick={() => switchRange(id)}
              style={{
                flex: 1,
                borderRadius: 12,
                border: `1px solid ${active ? colors.primary : colors.border}`,
                backgroundColor: active ? colors.primary : colors.card,
                paddingTop: 10,
                paddingBottom: 10,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                cursor: "pointer",
              }}
            >
              <span style={{ fontFamily: Fonts.sansBold, fontWeight: 700, fontSize: 14, color: active ? colors.primaryForeground : colors.foreground }}>{r.label}</span>
              <span style={{ fontFamily: Fonts.mono, fontSize: 11, color: active ? colors.primaryForeground : colors.mutedForeground }}>{r.sub}</span>
            </button>
          );
        })}
      </div>

      {/* note navigator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          borderRadius: 14,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.cardElevated,
          padding: 12,
          gap: 10,
        }}
      >
        <button type="button" onClick={() => setCursor((c) => Math.max(0, c - 1))} style={navBtn()}>
          <ChevronLeft size={22} color={colors.foreground} />
        </button>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <span style={{ fontFamily: Fonts.monoBold, fontWeight: 700, fontSize: 38, lineHeight: "44px", color }}>{keyToNoteName(currentKey)}</span>
          <span style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.mutedForeground }}>
            건반 {currentKey} · 진행 {cursor + 1} / {progression.length}
          </span>
          <div style={{ height: 4, borderRadius: 2, width: "100%", overflow: "hidden", backgroundColor: colors.border }}>
            <div style={{ height: 4, borderRadius: 2, backgroundColor: colors.primary, width: `${((cursor + 1) / progression.length) * 100}%` }} />
          </div>
        </div>
        <button type="button" onClick={advance} style={navBtn()}>
          <ChevronRight size={22} color={colors.foreground} />
        </button>
      </div>

      {/* strobe + cents */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          borderRadius: 16,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.cardElevated,
          padding: 14,
          gap: 8,
        }}
      >
        <StrobeDisplay cents={cents} active={onTarget} size={160} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontFamily: Fonts.monoBold, fontWeight: 700, fontSize: 30, color }}>
            {cents != null ? `${cents > 0 ? "+" : ""}${cents.toFixed(1)}` : "––.–"}
            <span style={{ fontFamily: Fonts.mono, fontSize: 14, color: colors.mutedForeground }}> ¢</span>
          </span>
          <span style={{ fontFamily: Fonts.sansMedium, fontWeight: 500, fontSize: 14, color }}>
            {onTarget ? statusLabel(cents!) : running ? (live ? "다른 음이 감지됨" : "목표 음을 치세요") : "정지됨"}
          </span>
          <span style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.mutedForeground }}>
            목표 {target ? target.fTuned.toFixed(2) : "—"} Hz · 스트레치 {target ? `${target.cents > 0 ? "+" : ""}${target.cents.toFixed(1)}¢` : "—"}
          </span>
          <span style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.mutedForeground }}>허용 ±{tol.toFixed(1)}¢</span>
        </div>
      </div>

      {/* chart */}
      <div
        style={{
          borderRadius: 16,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.card,
          paddingTop: 12,
          paddingBottom: 12,
          paddingLeft: 6,
          paddingRight: 6,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingLeft: 6, paddingRight: 6, flexWrap: "wrap" }}>
          <span style={{ fontFamily: Fonts.sans, fontSize: 11, flexShrink: 1, color: colors.mutedForeground }}>
            {fitView ? "88건반 전체 조율 커브" : "← 좌우로 밀어 자세히 보기"}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => setFitView((v) => !v)} style={toolBtn(colors.border, "transparent", colors.foreground)}>
              {fitView ? <Maximize2 size={14} color={colors.foreground} /> : <Minimize2 size={14} color={colors.foreground} />}
              {fitView ? "확대" : "전체보기"}
            </button>
            <button
              type="button"
              onClick={saveChart}
              disabled={saving}
              style={{ ...toolBtn(colors.primary, colors.primary, colors.primaryForeground), opacity: saving ? 0.6 : 1 }}
            >
              <Download size={14} color={colors.primaryForeground} />
              {saving ? "저장 중…" : "그래프 저장"}
            </button>
          </div>
        </div>
        <div ref={chartWrapRef} style={{ width: "100%" }}>
          <ManualTuneChart
            ref={chartRef}
            curve={curve}
            currentKey={currentKey}
            tunedCents={tunedCents}
            fit={fitView}
            width={fitView ? chartW : 900}
          />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
          <Legend color={colors.foreground} label="허용범위(PT-100)" dim />
          <Legend color={colors.off} label="기준음(스트레치 중앙값)" />
          <Legend color={colors.primary} label="자동감지" />
          <Legend color={colors.precision} label="A 옥타브" />
        </div>
      </div>

      {/* auto-advance toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderRadius: 12,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.card,
          paddingTop: 8,
          paddingBottom: 8,
          paddingLeft: 14,
          paddingRight: 14,
        }}
      >
        <span style={{ fontFamily: Fonts.sansMedium, fontWeight: 500, fontSize: 13, color: colors.foreground }}>자동 진행 (맞으면 다음 음으로)</span>
        <Toggle value={auto} onChange={setAuto} />
      </div>

      {error && <p style={{ fontFamily: Fonts.sans, fontSize: 13, textAlign: "center", color: colors.off, margin: 0 }}>{error}</p>}
      {!supported && !error && (
        <p style={{ fontFamily: Fonts.sans, fontSize: 12, textAlign: "center", lineHeight: "18px", color: colors.mutedForeground, margin: 0 }}>
          이 브라우저에서 마이크를 사용할 수 없습니다.
        </p>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" onClick={running ? stop : start} style={btn(running ? colors.off : colors.primary, "#FFF", { flex: 1 })}>
          {running ? <Square size={18} color="#FFF" fill="#FFF" /> : <Mic size={18} color="#FFF" />}
          {running ? "정지" : "마이크"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (cents != null) {
              recordTuned(currentKey, live!.centsFromET);
              advance();
            }
          }}
          disabled={cents == null}
          style={btn(cents != null ? colors.inTune : colors.secondary, cents != null ? "#FFF" : colors.mutedForeground, { flex: 1.4, cursor: cents != null ? "pointer" : "default" })}
        >
          <Check size={18} color={cents != null ? "#FFF" : colors.mutedForeground} />
          이 음 기록
        </button>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" onClick={advance} style={btnGhost({ flex: 1 })}>건너뛰기</button>
        <button type="button" onClick={() => clearTuned(currentKey)} style={btnGhost({ flex: 1 })}>현재 지우기</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
        <span style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.mutedForeground }}>기록 {doneCount} / 88</span>
        <button type="button" onClick={resetTuned} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: Fonts.sansMedium, fontWeight: 500, fontSize: 13, color: colors.off }}>
          전체 초기화
        </button>
      </div>
    </div>
  );
}

function Legend({ color, label, dim }: { color: string; label: string; dim?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, opacity: dim ? 0.55 : 1 }} />
      <span style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.mutedForeground }}>{label}</span>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      aria-label="자동 진행 토글"
      aria-pressed={value}
      onClick={() => onChange(!value)}
      style={{
        width: 48,
        height: 28,
        borderRadius: 14,
        border: "none",
        cursor: "pointer",
        backgroundColor: value ? colors.primary : colors.border,
        position: "relative",
        transition: "background-color 0.15s",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: value ? 23 : 3,
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: "#FFF",
          transition: "left 0.15s",
        }}
      />
    </button>
  );
}

function btn(bg: string, fg: string, extra?: React.CSSProperties): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 13,
    paddingBottom: 13,
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

function btnGhost(extra?: React.CSSProperties): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: 12,
    border: `1px solid ${colors.border}`,
    backgroundColor: "transparent",
    cursor: "pointer",
    color: colors.foreground,
    fontFamily: Fonts.sansMedium,
    fontWeight: 500,
    fontSize: 14,
    ...extra,
  };
}

function navBtn(): React.CSSProperties {
  return {
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    padding: 8,
    backgroundColor: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

function toolBtn(border: string, bg: string, fg: string): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 4,
    border: `1px solid ${border}`,
    borderRadius: 8,
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 9,
    paddingRight: 9,
    backgroundColor: bg,
    cursor: "pointer",
    color: fg,
    fontFamily: Fonts.sansMedium,
    fontWeight: 500,
    fontSize: 11,
  };
}

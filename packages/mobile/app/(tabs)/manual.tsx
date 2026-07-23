import { useCallback, useRef, useState } from "react";
import {
  Alert,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";
import { Fonts } from "@/constants/theme";
import { useTuning } from "@/lib/tuning-store";
import { useAudioAnalyzer } from "@/lib/dsp/audio";
import { detectPitch } from "@/lib/dsp/pitch";
import { frequencyToKey, centsBetween, keyToNoteName } from "@/lib/dsp/notes";
import { StrobeDisplay } from "@/components/StrobeDisplay";
import { ManualTuneChart, toleranceFor, type ManualChartHandle } from "@/components/ManualTuneChart";
import { statusColor, statusLabel } from "@/lib/status";

// Tuning progressions per section (matches classic manual-tuning order).
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
  centsToTarget: number; // vs stretch target of current key
  centsFromET: number; // vs equal temperament (for chart)
  onTargetKey: boolean; // detected note is the current target key
}

export default function ManualScreen() {
  const colors = useColors();
  const { a4, curve, tunedCents, recordTuned, clearTuned, resetTuned } = useTuning();

  const [rangeId, setRangeId] = useState<keyof typeof RANGES>("center");
  const [cursor, setCursor] = useState(0);
  const [auto, setAuto] = useState(true);
  const [live, setLive] = useState<Live | null>(null);
  const [fitView, setFitView] = useState(true);
  const [chartW, setChartW] = useState(340);
  const [saving, setSaving] = useState(false);
  const chartRef = useRef<ManualChartHandle>(null);

  const onChartLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && Math.abs(w - chartW) > 1) setChartW(w);
  };

  const saveChart = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const dataUrl = await chartRef.current?.capture();
      if (!dataUrl) {
        Alert.alert("저장 실패", "그래프 이미지를 만들 수 없습니다.");
        return;
      }
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const filename = `tuning-curve-${stamp}.png`;
      if (Platform.OS === "web") {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        const FileSystem = await import("expo-file-system");
        const Sharing = await import("expo-sharing");
        const base64 = dataUrl.split(",")[1] ?? "";
        const file = new FileSystem.File(FileSystem.Paths.cache, filename);
        try {
          file.create({ overwrite: true });
        } catch {
          // file may already exist — writing overwrites it
        }
        file.write(base64, { encoding: "base64" });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, { mimeType: "image/png", dialogTitle: "조율 커브 저장" });
        } else {
          Alert.alert("저장됨", filename);
        }
      }
    } catch {
      Alert.alert("저장 실패", "그래프를 저장하는 중 오류가 발생했습니다.");
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

      setLive({
        freq: frequency,
        centsToTarget: smooth.current,
        centsFromET,
        onTargetKey,
      });

      // auto-record when locked in tune on the correct key
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
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>MANUAL TUNING</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>수동 정밀 조율</Text>
        </View>

        {/* range presets */}
        <View style={styles.rangeRow}>
          {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((id) => {
            const r = RANGES[id];
            const active = id === rangeId;
            return (
              <Pressable
                key={id}
                onPress={() => switchRange(id)}
                style={[
                  styles.rangeCard,
                  {
                    backgroundColor: active ? colors.primary : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[styles.rangeLabel, { color: active ? colors.primaryForeground : colors.foreground }]}>
                  {r.label}
                </Text>
                <Text style={[styles.rangeSub, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                  {r.sub}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* note navigator */}
        <View style={[styles.navCard, { backgroundColor: colors.cardElevated, borderColor: colors.border }]}>
          <Pressable
            onPress={() => setCursor((c) => Math.max(0, c - 1))}
            style={[styles.navBtn, { borderColor: colors.border }]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.foreground} />
          </Pressable>
          <View style={styles.navCenter}>
            <Text style={[styles.navNote, { color: color }]}>{keyToNoteName(currentKey)}</Text>
            <Text style={[styles.navMeta, { color: colors.mutedForeground }]}>
              건반 {currentKey} · 진행 {cursor + 1} / {progression.length}
            </Text>
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: colors.primary, width: `${((cursor + 1) / progression.length) * 100}%` },
                ]}
              />
            </View>
          </View>
          <Pressable
            onPress={advance}
            style={[styles.navBtn, { borderColor: colors.border }]}
          >
            <Ionicons name="chevron-forward" size={22} color={colors.foreground} />
          </Pressable>
        </View>

        {/* strobe + cents for current target */}
        <View style={[styles.strobeCard, { backgroundColor: colors.cardElevated, borderColor: colors.border }]}>
          <StrobeDisplay cents={cents} active={onTarget} size={180} />
          <View style={styles.strobeInfo}>
            <Text style={[styles.centsBig, { color }]}>
              {cents != null ? `${cents > 0 ? "+" : ""}${cents.toFixed(1)}` : "––.–"}
              <Text style={[styles.centsUnit, { color: colors.mutedForeground }]}> ¢</Text>
            </Text>
            <Text style={[styles.statusText, { color }]}>
              {onTarget
                ? statusLabel(cents!)
                : running
                  ? live
                    ? "다른 음이 감지됨"
                    : "목표 음을 치세요"
                  : "정지됨"}
            </Text>
            <Text style={[styles.targetMeta, { color: colors.mutedForeground }]}>
              목표 {target ? target.fTuned.toFixed(2) : "—"} Hz · 스트레치{" "}
              {target ? `${target.cents > 0 ? "+" : ""}${target.cents.toFixed(1)}¢` : "—"}
            </Text>
            <Text style={[styles.targetMeta, { color: colors.mutedForeground }]}>
              허용 ±{tol.toFixed(1)}¢
            </Text>
          </View>
        </View>

        {/* chart */}
        <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.chartToolbar}>
            <Text style={[styles.chartHint, { color: colors.mutedForeground }]}>
              {fitView ? "88건반 전체 조율 커브" : "← 좌우로 밀어 자세히 보기"}
            </Text>
            <View style={styles.chartTools}>
              <Pressable
                onPress={() => setFitView((v) => !v)}
                style={[styles.toolBtn, { borderColor: colors.border }]}
              >
                <Ionicons
                  name={fitView ? "expand-outline" : "contract-outline"}
                  size={14}
                  color={colors.foreground}
                />
                <Text style={[styles.toolBtnText, { color: colors.foreground }]}>
                  {fitView ? "확대" : "전체보기"}
                </Text>
              </Pressable>
              <Pressable
                onPress={saveChart}
                disabled={saving}
                style={[styles.toolBtn, { borderColor: colors.primary, backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
              >
                <Ionicons name="download-outline" size={14} color={colors.primaryForeground} />
                <Text style={[styles.toolBtnText, { color: colors.primaryForeground }]}>
                  {saving ? "저장 중…" : "그래프 저장"}
                </Text>
              </Pressable>
            </View>
          </View>
          <View onLayout={onChartLayout} style={styles.chartInner}>
            <ManualTuneChart
              ref={chartRef}
              curve={curve}
              currentKey={currentKey}
              tunedCents={tunedCents}
              fit={fitView}
              width={fitView ? chartW : 900}
            />
          </View>
          <View style={styles.legend}>
            <Legend color={colors.foreground} label="허용범위(PT-100)" colors={colors} dim />
            <Legend color={colors.off} label="기준음(스트레치 중앙값)" colors={colors} />
            <Legend color={colors.primary} label="자동감지" colors={colors} />
            <Legend color={colors.precision} label="A 옥타브" colors={colors} />
          </View>
        </View>

        {/* auto-advance + record */}
        <View style={[styles.autoRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.autoLabel, { color: colors.foreground }]}>자동 진행 (맞으면 다음 음으로)</Text>
          <Switch value={auto} onValueChange={setAuto} />
        </View>

        {error && <Text style={[styles.error, { color: colors.off }]}>{error}</Text>}
        {!supported && !error && (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            네이티브 마이크 캡처는 준비 중입니다. 웹 프리뷰에서 마이크로 사용해 주세요.
          </Text>
        )}

        <View style={styles.btnRow}>
          <Pressable
            onPress={running ? stop : start}
            style={[styles.btn, { flex: 1, backgroundColor: running ? colors.off : colors.primary }]}
          >
            <Ionicons name={running ? "stop" : "mic"} size={18} color="#FFFFFF" />
            <Text style={styles.btnText}>{running ? "정지" : "마이크"}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (cents != null) {
                recordTuned(currentKey, live!.centsFromET);
                advance();
              }
            }}
            disabled={cents == null}
            style={[styles.btn, { flex: 1.4, backgroundColor: cents != null ? colors.inTune : colors.secondary }]}
          >
            <Ionicons name="checkmark" size={18} color={cents != null ? "#FFFFFF" : colors.mutedForeground} />
            <Text style={[styles.btnText, { color: cents != null ? "#FFFFFF" : colors.mutedForeground }]}>이 음 기록</Text>
          </Pressable>
        </View>

        <View style={styles.btnRow}>
          <Pressable
            onPress={advance}
            style={[styles.btnGhost, { flex: 1, borderColor: colors.border }]}
          >
            <Text style={[styles.btnGhostText, { color: colors.foreground }]}>건너뛰기</Text>
          </Pressable>
          <Pressable
            onPress={() => clearTuned(currentKey)}
            style={[styles.btnGhost, { flex: 1, borderColor: colors.border }]}
          >
            <Text style={[styles.btnGhostText, { color: colors.foreground }]}>현재 지우기</Text>
          </Pressable>
        </View>

        <View style={styles.footerRow}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            기록 {doneCount} / 88
          </Text>
          <Pressable onPress={resetTuned}>
            <Text style={[styles.resetText, { color: colors.off }]}>전체 초기화</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Legend({
  color,
  label,
  colors,
  dim,
}: {
  color: string;
  label: string;
  colors: ReturnType<typeof useColors>;
  dim?: boolean;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color, opacity: dim ? 0.55 : 1 }]} />
      <Text style={[styles.legendText, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  header: { gap: 4 },
  eyebrow: { fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 2 },
  title: { fontFamily: Fonts.sansBold, fontSize: 24 },
  rangeRow: { flexDirection: "row", gap: 8 },
  rangeCard: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 10, alignItems: "center", gap: 2 },
  rangeLabel: { fontFamily: Fonts.sansBold, fontSize: 14 },
  rangeSub: { fontFamily: Fonts.mono, fontSize: 11 },
  navCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  navBtn: { borderWidth: 1, borderRadius: 10, padding: 8 },
  navCenter: { flex: 1, alignItems: "center", gap: 4 },
  navNote: { fontFamily: Fonts.monoBold, fontSize: 38, lineHeight: 44 },
  navMeta: { fontFamily: Fonts.sans, fontSize: 12 },
  progressTrack: { height: 4, borderRadius: 2, width: "100%", overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2 },
  strobeCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  strobeInfo: { flex: 1, gap: 3 },
  centsBig: { fontFamily: Fonts.monoBold, fontSize: 30 },
  centsUnit: { fontFamily: Fonts.mono, fontSize: 14 },
  statusText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  targetMeta: { fontFamily: Fonts.sans, fontSize: 11 },
  chartCard: { borderRadius: 16, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 6, gap: 8, overflow: "hidden" },
  chartToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 6,
    flexWrap: "wrap",
  },
  chartTools: { flexDirection: "row", gap: 6 },
  toolBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  toolBtnText: { fontFamily: Fonts.sansMedium, fontSize: 11 },
  chartInner: { width: "100%" },
  chartHint: { fontFamily: Fonts.sans, fontSize: 11, flexShrink: 1 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontFamily: Fonts.sans, fontSize: 11 },
  autoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  autoLabel: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  btnRow: { flexDirection: "row", gap: 10 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
  },
  btnText: { fontFamily: Fonts.sansBold, fontSize: 15, color: "#FFFFFF" },
  btnGhost: { alignItems: "center", justifyContent: "center", paddingVertical: 11, borderRadius: 12, borderWidth: 1 },
  btnGhostText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  footerText: { fontFamily: Fonts.sans, fontSize: 12 },
  resetText: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  error: { fontFamily: Fonts.sans, fontSize: 13, textAlign: "center" },
  hint: { fontFamily: Fonts.sans, fontSize: 12, textAlign: "center", lineHeight: 18 },
});

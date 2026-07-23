import { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";
import { Fonts } from "@/constants/theme";
import { useTuning } from "@/lib/tuning-store";
import { useAudioAnalyzer } from "@/lib/dsp/audio";
import { detectPitch } from "@/lib/dsp/pitch";
import { extractPartials } from "@/lib/dsp/partials";
import { fitInharmonicity } from "@/lib/dsp/inharmonicity";
import {
  REPRESENTATIVE_KEYS,
  keyToNoteName,
  keyToFrequency,
  frequencyToKey,
} from "@/lib/dsp/notes";

const STABLE_FRAMES_TO_CAPTURE = 4;

export default function MeasureScreen() {
  const colors = useColors();
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
        // auto-capture when the detected key matches the target and is loud/stable
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
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>INHARMONICITY MEASURE</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>대표 건반 측정</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            건반별 배음을 분석해 인하모니시티 계수(B)를 산출합니다. {measuredCount}/{REPRESENTATIVE_KEYS.length} 측정됨
          </Text>
        </View>

        {/* Key selector */}
        <View style={styles.keyGrid}>
          {REPRESENTATIVE_KEYS.map((key) => {
            const m = measurements[key];
            const selected = key === selectedKey;
            return (
              <Pressable
                key={key}
                onPress={() => setSelectedKey(key)}
                style={[
                  styles.keyChip,
                  {
                    backgroundColor: selected ? colors.primary : colors.card,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.keyNote,
                    { color: selected ? colors.primaryForeground : colors.foreground },
                  ]}
                >
                  {keyToNoteName(key)}
                </Text>
                {m ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={13}
                    color={selected ? colors.primaryForeground : colors.inTune}
                  />
                ) : (
                  <Text
                    style={[
                      styles.keyIdx,
                      { color: selected ? colors.primaryForeground : colors.mutedForeground },
                    ]}
                  >
                    #{key}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Measure panel */}
        <View style={[styles.panel, { backgroundColor: colors.cardElevated, borderColor: colors.border }]}>
          <View style={styles.panelHead}>
            <Text style={[styles.panelNote, { color: colors.foreground }]}>{keyToNoteName(selectedKey)}</Text>
            <Text style={[styles.panelTarget, { color: colors.mutedForeground }]}>
              목표 {keyToFrequency(selectedKey, a4).toFixed(2)} Hz
            </Text>
          </View>

          <Text style={[styles.instruction, { color: colors.mutedForeground }]}>
            {capturing
              ? "선택한 건반을 강하게 치세요. 안정되면 자동으로 캡처됩니다."
              : "측정 시작을 누른 뒤 해당 건반을 강하게 치세요."}
          </Text>

          <View style={[styles.liveBox, { borderColor: colors.border }]}>
            <Text style={[styles.liveLabel, { color: colors.mutedForeground }]}>실시간 감지</Text>
            <Text style={[styles.liveVal, { color: live ? colors.precision : colors.mutedForeground }]}>
              {live ? `${live.note}  ·  ${live.freq.toFixed(1)} Hz` : "—"}
            </Text>
          </View>

          {capturing ? (
            <View style={styles.btnRow}>
              <Pressable
                onPress={manualCapture}
                style={[styles.btn, { backgroundColor: colors.primary, flex: 1 }]}
              >
                <Ionicons name="camera" size={18} color="#FFF" />
                <Text style={styles.btnText}>지금 캡처</Text>
              </Pressable>
              <Pressable
                onPress={cancelCapture}
                style={[styles.btn, { backgroundColor: colors.secondary }]}
              >
                <Text style={[styles.btnText, { color: colors.foreground }]}>취소</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={startCapture}
              style={[styles.btn, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="pulse" size={18} color="#FFF" />
              <Text style={styles.btnText}>측정 시작</Text>
            </Pressable>
          )}

          {measurements[selectedKey] && (
            <Pressable onPress={() => removeMeasurement(selectedKey)} style={styles.clearBtn}>
              <Ionicons name="trash-outline" size={14} color={colors.off} />
              <Text style={[styles.clearText, { color: colors.off }]}>이 측정 삭제</Text>
            </Pressable>
          )}
        </View>

        {lastResult && (
          <Text style={[styles.result, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}>
            {lastResult}
          </Text>
        )}
        {error && <Text style={[styles.err, { color: colors.off }]}>{error}</Text>}
        {!supported && !error && (
          <Text style={[styles.err, { color: colors.mutedForeground }]}>
            네이티브 마이크는 준비 중 — 웹 프리뷰에서 측정을 테스트하세요.
          </Text>
        )}

        {/* Measured table */}
        {measuredCount > 0 && (
          <View style={styles.table}>
            <Text style={[styles.tableTitle, { color: colors.foreground }]}>측정 결과</Text>
            {Object.values(measurements)
              .sort((a, b) => a.keyIndex - b.keyIndex)
              .map((m) => (
                <View
                  key={m.keyIndex}
                  style={[styles.tableRow, { borderColor: colors.border }]}
                >
                  <Text style={[styles.tNote, { color: colors.foreground }]}>{keyToNoteName(m.keyIndex)}</Text>
                  <Text style={[styles.tCell, { color: colors.precision }]}>B {m.B.toExponential(2)}</Text>
                  <Text style={[styles.tCell, { color: colors.mutedForeground }]}>R² {m.rSquared.toFixed(2)}</Text>
                  <Text style={[styles.tCell, { color: colors.mutedForeground }]}>{m.partialsUsed}부분음</Text>
                </View>
              ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  header: { gap: 4 },
  eyebrow: { fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 2 },
  title: { fontFamily: Fonts.sansBold, fontSize: 24 },
  sub: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 19 },
  keyGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  keyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  keyNote: { fontFamily: Fonts.monoBold, fontSize: 14 },
  keyIdx: { fontFamily: Fonts.mono, fontSize: 11 },
  panel: { borderRadius: 18, borderWidth: 1, padding: 18, gap: 14 },
  panelHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  panelNote: { fontFamily: Fonts.monoBold, fontSize: 30 },
  panelTarget: { fontFamily: Fonts.mono, fontSize: 13 },
  instruction: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 19 },
  liveBox: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 4, alignItems: "center" },
  liveLabel: { fontFamily: Fonts.sans, fontSize: 11 },
  liveVal: { fontFamily: Fonts.monoBold, fontSize: 20 },
  btnRow: { flexDirection: "row", gap: 10 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  btnText: { fontFamily: Fonts.sansBold, fontSize: 15, color: "#FFFFFF" },
  clearBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingTop: 2 },
  clearText: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  result: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 18,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  err: { fontFamily: Fonts.sans, fontSize: 12, textAlign: "center" },
  table: { gap: 2, marginTop: 4 },
  tableTitle: { fontFamily: Fonts.sansBold, fontSize: 15, marginBottom: 6 },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  tNote: { fontFamily: Fonts.monoBold, fontSize: 14, width: 44 },
  tCell: { fontFamily: Fonts.mono, fontSize: 12 },
});

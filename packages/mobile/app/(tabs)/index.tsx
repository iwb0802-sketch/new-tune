import { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";
import { Fonts } from "@/constants/theme";
import { useTuning } from "@/lib/tuning-store";
import { useAudioAnalyzer } from "@/lib/dsp/audio";
import { detectPitch } from "@/lib/dsp/pitch";
import { frequencyToKey, centsBetween, keyToNoteName } from "@/lib/dsp/notes";
import { TunerMeter } from "@/components/TunerMeter";
import { statusColor, statusLabel } from "@/lib/status";

interface Reading {
  freq: number;
  keyIndex: number;
  note: string;
  target: number;
  cents: number;
}

const ANALYZE_INTERVAL = 110; // ms

export default function TunerScreen() {
  const colors = useColors();
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
      // exponential smoothing for a steady needle
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
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>PIANO TUNING SCOPE</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>실시간 튜너</Text>
        </View>

        {/* Note readout */}
        <View style={styles.noteBlock}>
          <Text style={[styles.note, { color: active ? color : colors.mutedForeground }]}>
            {reading?.note ?? "—"}
          </Text>
          <Text style={[styles.status, { color }]}>
            {active && cents != null ? statusLabel(cents) : running ? "소리를 감지하는 중…" : "정지됨"}
          </Text>
        </View>

        {/* Meter */}
        <View style={[styles.meterCard, { backgroundColor: colors.cardElevated, borderColor: colors.border }]}>
          <TunerMeter cents={cents} active={active} width={300} />
          <Text style={[styles.centsBig, { color }]}>
            {active && cents != null ? `${cents > 0 ? "+" : ""}${cents.toFixed(1)}` : "––.–"}
            <Text style={[styles.centsUnit, { color: colors.mutedForeground }]}>  cents</Text>
          </Text>
        </View>

        {/* Detail row */}
        <View style={styles.detailRow}>
          <Detail label="감지 주파수" value={reading ? `${reading.freq.toFixed(2)} Hz` : "— Hz"} colors={colors} />
          <Detail label="목표 주파수" value={reading ? `${reading.target.toFixed(2)} Hz` : "— Hz"} colors={colors} />
        </View>
        <View style={styles.detailRow}>
          <Detail label="건반" value={reading ? `#${reading.keyIndex}` : "—"} colors={colors} />
          <Detail label="스타일 · A4" value={`${styleId} · ${a4}Hz`} colors={colors} />
        </View>

        {error && (
          <Text style={[styles.error, { color: colors.off }]}>{error}</Text>
        )}
        {!supported && !error && (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            네이티브 마이크 캡처는 준비 중입니다. 웹 프리뷰에서 마이크로 조율을 테스트할 수 있어요.
          </Text>
        )}

        <Pressable
          onPress={running ? stop : start}
          style={[
            styles.button,
            { backgroundColor: running ? colors.off : colors.primary },
          ]}
        >
          <Ionicons name={running ? "stop" : "mic"} size={20} color="#FFFFFF" />
          <Text style={styles.buttonText}>{running ? "정지" : "마이크 시작"}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Detail({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.detail, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 18, paddingBottom: 40 },
  header: { gap: 4 },
  eyebrow: { fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 2 },
  title: { fontFamily: Fonts.sansBold, fontSize: 24 },
  noteBlock: { alignItems: "center", gap: 2, marginTop: 4 },
  note: { fontFamily: Fonts.monoBold, fontSize: 64, lineHeight: 72 },
  status: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  meterCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingTop: 20,
    paddingBottom: 16,
    alignItems: "center",
    gap: 6,
  },
  centsBig: { fontFamily: Fonts.monoBold, fontSize: 34 },
  centsUnit: { fontFamily: Fonts.mono, fontSize: 14 },
  detailRow: { flexDirection: "row", gap: 12 },
  detail: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, gap: 4 },
  detailLabel: { fontFamily: Fonts.sans, fontSize: 11 },
  detailValue: { fontFamily: Fonts.monoBold, fontSize: 16 },
  error: { fontFamily: Fonts.sans, fontSize: 13, textAlign: "center" },
  hint: { fontFamily: Fonts.sans, fontSize: 12, textAlign: "center", lineHeight: 18 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 4,
  },
  buttonText: { fontFamily: Fonts.sansBold, fontSize: 16, color: "#FFFFFF" },
});

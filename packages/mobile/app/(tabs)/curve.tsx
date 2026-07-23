import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { Fonts } from "@/constants/theme";
import { useTuning } from "@/lib/tuning-store";
import { CurveChart } from "@/components/CurveChart";
import { Segmented } from "@/components/Segmented";
import { getStyle } from "@/lib/dsp/stretch";

export default function CurveScreen() {
  const colors = useColors();
  const { curve, measurements, styleId, a4 } = useTuning();
  const [mode, setMode] = useState<"cents" | "B">("cents");

  const measuredKeys = Object.keys(measurements).map(Number);
  const hasMeasurements = measuredKeys.length > 0;

  const bassCents = curve[0]?.cents ?? 0; // A0
  const trebleCents = curve[curve.length - 1]?.cents ?? 0; // C8
  const style = getStyle(styleId);

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>88-KEY TUNING CURVE</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>조율 커브</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            {hasMeasurements
              ? `측정된 ${measuredKeys.length}개 건반을 보간해 계산한 커브입니다.`
              : "측정값이 없어 기본 참조 커브를 표시합니다. 측정 탭에서 건반을 측정하세요."}
          </Text>
        </View>

        <Segmented
          options={[
            { value: "cents", label: "스트레치 (cents)" },
            { value: "B", label: "인하모니시티 (B)" },
          ]}
          value={mode}
          onChange={(v) => setMode(v as "cents" | "B")}
        />

        <View style={[styles.chartCard, { backgroundColor: colors.cardElevated, borderColor: colors.border }]}>
          <CurveChart curve={curve} mode={mode} measuredKeys={measuredKeys} width={330} height={210} />
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>
            {mode === "cents"
              ? "평균율 대비 편차 (Railsback 스트레치). 저음 ♭, 고음 ♯."
              : "건반별 인하모니시티 계수 (로그 스케일). 초록 점 = 실측."}
          </Text>
        </View>

        <View style={styles.statRow}>
          <Stat label="스타일" value={style.label.replace(" 옥타브", "")} colors={colors} />
          <Stat label="A4 기준" value={`${a4} Hz`} colors={colors} />
        </View>
        <View style={styles.statRow}>
          <Stat label="A0 스트레치" value={`${bassCents.toFixed(1)}c`} colors={colors} accent={colors.off} />
          <Stat label="C8 스트레치" value={`+${trebleCents.toFixed(1)}c`} colors={colors} accent={colors.inTune} />
        </View>

        {/* Offset table by octave A-notes */}
        <View style={styles.table}>
          <Text style={[styles.tableTitle, { color: colors.foreground }]}>옥타브별 편차</Text>
          {[1, 13, 25, 37, 49, 61, 73, 85, 88].map((k) => {
            const p = curve[k - 1];
            if (!p) return null;
            const col = Math.abs(p.cents) <= 1 ? colors.inTune : p.cents < 0 ? colors.off : colors.precision;
            return (
              <View key={k} style={[styles.tableRow, { borderColor: colors.border }]}>
                <Text style={[styles.tNote, { color: colors.foreground }]}>{p.note}</Text>
                <Text style={[styles.tCell, { color: colors.mutedForeground }]}>{p.fTuned.toFixed(2)} Hz</Text>
                <Text style={[styles.tCell, { color: col, width: 70, textAlign: "right" }]}>
                  {p.cents > 0 ? "+" : ""}
                  {p.cents.toFixed(1)}c
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({
  label,
  value,
  colors,
  accent,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
  accent?: string;
}) {
  return (
    <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.statValue, { color: accent ?? colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  header: { gap: 4 },
  eyebrow: { fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 2 },
  title: { fontFamily: Fonts.sansBold, fontSize: 24 },
  sub: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 19 },
  chartCard: { borderRadius: 16, borderWidth: 1, padding: 12, gap: 8, alignItems: "center" },
  caption: { fontFamily: Fonts.sans, fontSize: 11, textAlign: "center", lineHeight: 16 },
  statRow: { flexDirection: "row", gap: 12 },
  stat: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, gap: 4 },
  statLabel: { fontFamily: Fonts.sans, fontSize: 11 },
  statValue: { fontFamily: Fonts.monoBold, fontSize: 17 },
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

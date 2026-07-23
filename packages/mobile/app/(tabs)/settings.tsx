import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";
import { Fonts } from "@/constants/theme";
import { useTuning } from "@/lib/tuning-store";
import { STRETCH_STYLES } from "@/lib/dsp/stretch";
import { isMicSupported } from "@/lib/dsp/audio";

export default function SettingsScreen() {
  const colors = useColors();
  const { a4, setA4, styleId, setStyleId, resetAll, measurements } = useTuning();
  const measuredCount = Object.keys(measurements).length;
  const micOk = isMicSupported();

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>CONFIGURATION</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>설정</Text>
        </View>

        {/* A4 reference */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>A4 기준 피치</Text>
          <View style={styles.stepper}>
            <Pressable
              onPress={() => setA4(Math.max(415, a4 - 1))}
              style={[styles.stepBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
            >
              <Ionicons name="remove" size={20} color={colors.foreground} />
            </Pressable>
            <View style={styles.a4Value}>
              <Text style={[styles.a4Number, { color: colors.foreground }]}>{a4}</Text>
              <Text style={[styles.a4Unit, { color: colors.mutedForeground }]}>Hz</Text>
            </View>
            <Pressable
              onPress={() => setA4(Math.min(445, a4 + 1))}
              style={[styles.stepBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
            >
              <Ionicons name="add" size={20} color={colors.foreground} />
            </Pressable>
          </View>
          <View style={styles.presetRow}>
            {[440, 441, 442, 443].map((v) => (
              <Pressable
                key={v}
                onPress={() => setA4(v)}
                style={[
                  styles.preset,
                  {
                    backgroundColor: a4 === v ? colors.primary : colors.secondary,
                    borderColor: a4 === v ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.presetText,
                    { color: a4 === v ? colors.primaryForeground : colors.mutedForeground },
                  ]}
                >
                  {v}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Octave style */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>옥타브 스트레치 스타일</Text>
          <View style={{ gap: 8 }}>
            {STRETCH_STYLES.map((s) => {
              const active = s.id === styleId;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => setStyleId(s.id)}
                  style={[
                    styles.styleRow,
                    {
                      backgroundColor: active ? colors.cardElevated : "transparent",
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.styleLabel, { color: colors.foreground }]}>{s.label}</Text>
                    <Text style={[styles.styleDesc, { color: colors.mutedForeground }]}>{s.description}</Text>
                  </View>
                  <Ionicons
                    name={active ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={active ? colors.primary : colors.mutedForeground}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Mic status */}
        <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons
            name={micOk ? "mic" : "mic-off"}
            size={18}
            color={micOk ? colors.inTune : colors.warn}
          />
          <Text style={[styles.statusText, { color: colors.foreground }]}>
            {micOk ? "마이크 사용 가능 (웹)" : "네이티브 마이크 준비 중 — 웹 프리뷰에서 사용"}
          </Text>
        </View>

        {/* Reset */}
        <Pressable
          onPress={resetAll}
          style={[styles.resetBtn, { borderColor: colors.off }]}
        >
          <Ionicons name="trash-outline" size={16} color={colors.off} />
          <Text style={[styles.resetText, { color: colors.off }]}>
            측정 데이터 초기화 {measuredCount > 0 ? `(${measuredCount})` : ""}
          </Text>
        </Pressable>

        <Text style={[styles.footer, { color: colors.mutedForeground }]}>
          Piano Tuning Scope · Reyburn CyberTuner 방식의 인하모니시티 기반 조율 엔진
        </Text>
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
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 14 },
  cardLabel: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  a4Value: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  a4Number: { fontFamily: Fonts.monoBold, fontSize: 36 },
  a4Unit: { fontFamily: Fonts.mono, fontSize: 16 },
  presetRow: { flexDirection: "row", gap: 8 },
  preset: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  presetText: { fontFamily: Fonts.mono, fontSize: 13 },
  styleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  styleLabel: { fontFamily: Fonts.sansBold, fontSize: 15 },
  styleDesc: { fontFamily: Fonts.sans, fontSize: 12, marginTop: 2, lineHeight: 16 },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: { fontFamily: Fonts.sans, fontSize: 13, flex: 1 },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  resetText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  footer: { fontFamily: Fonts.sans, fontSize: 11, textAlign: "center", lineHeight: 16, marginTop: 4 },
});

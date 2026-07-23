// Map a cents deviation to a tuning status (color token + label).
import type { ThemeColors } from "@/constants/theme";

export type TuneStatus = "inTune" | "warn" | "off";

export function centsStatus(cents: number): TuneStatus {
  const a = Math.abs(cents);
  if (a <= 1) return "inTune";
  if (a <= 5) return "warn";
  return "off";
}

export function statusColor(cents: number, colors: ThemeColors): string {
  const s = centsStatus(cents);
  return s === "inTune" ? colors.inTune : s === "warn" ? colors.warn : colors.off;
}

export function statusLabel(cents: number): string {
  const s = centsStatus(cents);
  if (s === "inTune") return "정확";
  return cents > 0 ? "높음 ♯" : "낮음 ♭";
}

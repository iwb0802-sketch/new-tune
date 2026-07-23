// Web theme tokens for Piano Tuning Scope — dark-first "precision instrument"
// palette ported from the mobile app (constants/theme.ts). Single dark theme.

export const colors = {
  background: "#0B0D10",
  foreground: "#F2F4F7",
  card: "#14171C",
  cardElevated: "#1B1F26",
  cardForeground: "#F2F4F7",
  primary: "#6366F1",
  primaryForeground: "#FFFFFF",
  secondary: "#1B1F26",
  secondaryForeground: "#F2F4F7",
  muted: "#1B1F26",
  mutedForeground: "#8A929E",
  accent: "#1B1F26",
  accentForeground: "#F2F4F7",
  border: "#232830",
  destructive: "#EF4444",
  success: "#10B981",
  warning: "#F59E0B",
  inTune: "#10B981",
  warn: "#F59E0B",
  off: "#EF4444",
  precision: "#8B5CF6",
} as const;

export type ThemeColors = typeof colors;

export function useColors(): ThemeColors {
  return colors;
}

// Font families. Sans = Noto Sans KR (Korean UI). Mono = JetBrains Mono (numeric
// readouts). Loaded via Google Fonts <link> in index.html. Weight applied via the
// `fontWeight` style/attribute separately.
export const Fonts = {
  sans: "'Noto Sans KR', system-ui, sans-serif",
  sansMedium: "'Noto Sans KR', system-ui, sans-serif",
  sansBold: "'Noto Sans KR', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, 'Noto Sans KR', monospace",
  monoBold: "'JetBrains Mono', ui-monospace, 'Noto Sans KR', monospace",
} as const;

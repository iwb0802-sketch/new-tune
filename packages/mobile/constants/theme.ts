import { Platform } from "react-native";

/**
 * App color tokens — dark-first "precision instrument" palette for the piano tuner.
 * Every screen reads these via `useColors()`. Extra status tokens (inTune/warn/off/
 * precision/cardElevated) support the tuner meter and curve visualizations.
 */
export const Colors = {
  light: {
    background: "#F5F6F8",
    foreground: "#14171C",
    card: "#FFFFFF",
    cardElevated: "#FFFFFF",
    cardForeground: "#14171C",
    primary: "#4F46E5",
    primaryForeground: "#FFFFFF",
    secondary: "#EEF0F3",
    secondaryForeground: "#14171C",
    muted: "#EEF0F3",
    mutedForeground: "#5B636E",
    accent: "#EEF0F3",
    accentForeground: "#14171C",
    border: "#DFE3E8",
    destructive: "#DC2626",
    success: "#059669",
    warning: "#D97706",
    inTune: "#059669",
    warn: "#D97706",
    off: "#DC2626",
    precision: "#7C3AED",
  },
  dark: {
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
  },
} as const;

export type ColorScheme = keyof typeof Colors;
export type ThemeColors = (typeof Colors)[ColorScheme];

/**
 * Font families. Sans = Noto Sans KR (Korean UI). Mono = JetBrains Mono (all numeric
 * readouts). Loaded via `useFonts` in app/_layout.tsx.
 */
export const Fonts = Platform.select({
  default: {
    sans: "NotoSansKR_400Regular",
    sansMedium: "NotoSansKR_500Medium",
    sansBold: "NotoSansKR_700Bold",
    mono: "JetBrainsMono_400Regular",
    monoBold: "JetBrainsMono_700Bold",
  },
  web: {
    sans: "NotoSansKR_400Regular, system-ui, sans-serif",
    sansMedium: "NotoSansKR_500Medium, system-ui, sans-serif",
    sansBold: "NotoSansKR_700Bold, system-ui, sans-serif",
    mono: "JetBrainsMono_400Regular, 'SF Mono', monospace",
    monoBold: "JetBrainsMono_700Bold, 'SF Mono', monospace",
  },
}) as {
  sans: string;
  sansMedium: string;
  sansBold: string;
  mono: string;
  monoBold: string;
};

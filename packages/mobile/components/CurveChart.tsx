import { View } from "react-native";
import Svg, { Path, Line, Circle, Text as SvgText, G } from "react-native-svg";
import { useColors } from "@/hooks/use-colors";
import { Fonts } from "@/constants/theme";
import type { CurvePoint } from "@/lib/dsp/stretch";
import { NUM_KEYS } from "@/lib/dsp/notes";

type Mode = "cents" | "B";

/** Line chart of the 88-key curve: stretch cents (Railsback) or log-B inharmonicity. */
export function CurveChart({
  curve,
  mode,
  measuredKeys = [],
  width = 340,
  height = 200,
}: {
  curve: CurvePoint[];
  mode: Mode;
  measuredKeys?: number[];
  width?: number;
  height?: number;
}) {
  const colors = useColors();
  const padL = 38;
  const padR = 12;
  const padT = 14;
  const padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const xFor = (key: number) => padL + ((key - 1) / (NUM_KEYS - 1)) * plotW;

  const values = curve.map((p) => (mode === "cents" ? p.cents : Math.log10(p.B)));
  let vMin = Math.min(...values);
  let vMax = Math.max(...values);
  if (mode === "cents") {
    const m = Math.max(5, Math.ceil(Math.max(Math.abs(vMin), Math.abs(vMax)) / 5) * 5);
    vMin = -m;
    vMax = m;
  } else {
    vMin = Math.floor(vMin);
    vMax = Math.ceil(vMax);
  }
  const yFor = (v: number) => padT + (1 - (v - vMin) / (vMax - vMin || 1)) * plotH;

  const line = curve
    .map((p, i) => {
      const v = mode === "cents" ? p.cents : Math.log10(p.B);
      return `${i === 0 ? "M" : "L"} ${xFor(p.keyIndex).toFixed(1)} ${yFor(v).toFixed(1)}`;
    })
    .join(" ");

  const stroke = mode === "cents" ? colors.primary : colors.precision;

  // y grid lines
  const yTicks =
    mode === "cents"
      ? [vMin, vMin / 2, 0, vMax / 2, vMax]
      : [vMin, (vMin + vMax) / 2, vMax];

  // x labels at octave A keys
  const xLabels = [1, 13, 25, 37, 49, 61, 73, 85];

  return (
    <View>
      <Svg width={width} height={height}>
        {/* grid */}
        {yTicks.map((t, i) => (
          <G key={`y${i}`}>
            <Line
              x1={padL}
              y1={yFor(t)}
              x2={width - padR}
              y2={yFor(t)}
              stroke={colors.border}
              strokeWidth={t === 0 && mode === "cents" ? 1.5 : 0.5}
              strokeDasharray={t === 0 && mode === "cents" ? undefined : "3 4"}
            />
            <SvgText
              x={padL - 6}
              y={yFor(t) + 3}
              fill={colors.mutedForeground}
              fontSize={9}
              fontFamily={Fonts.mono}
              textAnchor="end"
            >
              {mode === "cents" ? (t > 0 ? `+${t}` : `${t}`) : `1e${t}`}
            </SvgText>
          </G>
        ))}

        {/* curve */}
        <Path d={line} stroke={stroke} strokeWidth={2} fill="none" />

        {/* measured key markers */}
        {measuredKeys.map((k) => {
          const p = curve[k - 1];
          if (!p) return null;
          const v = mode === "cents" ? p.cents : Math.log10(p.B);
          return (
            <Circle
              key={k}
              cx={xFor(k)}
              cy={yFor(v)}
              r={3.5}
              fill={colors.inTune}
              stroke={colors.background}
              strokeWidth={1}
            />
          );
        })}

        {/* x labels */}
        {xLabels.map((k) => (
          <SvgText
            key={`x${k}`}
            x={xFor(k)}
            y={height - 6}
            fill={colors.mutedForeground}
            fontSize={9}
            fontFamily={Fonts.mono}
            textAnchor="middle"
          >
            {curve[k - 1]?.note ?? ""}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

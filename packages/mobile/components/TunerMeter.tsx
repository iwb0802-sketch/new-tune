import { View } from "react-native";
import Svg, { Path, Line, Circle, G, Text as SvgText } from "react-native-svg";
import { useColors } from "@/hooks/use-colors";
import { Fonts } from "@/constants/theme";

const RANGE = 50; // +/- cents shown across the arc
const SWEEP = 100; // total arc degrees (from -50deg to +50deg around vertical)

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const s = polar(cx, cy, r, startDeg);
  const e = polar(cx, cy, r, endDeg);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  const sweep = endDeg > startDeg ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} ${sweep} ${e.x} ${e.y}`;
}

/** Semicircular gauge. cents in [-inf,inf], clamped to +/-RANGE for the needle. */
export function TunerMeter({
  cents,
  active,
  width = 320,
}: {
  cents: number | null;
  active: boolean;
  width?: number;
}) {
  const colors = useColors();
  const w = width;
  const h = width * 0.62;
  const cx = w / 2;
  const cy = h * 0.98;
  const r = w * 0.44;

  const c = cents ?? 0;
  const clamped = Math.max(-RANGE, Math.min(RANGE, c));
  const angle = (clamped / RANGE) * (SWEEP / 2); // degrees from vertical

  const zoneColor =
    !active || cents == null
      ? colors.mutedForeground
      : Math.abs(c) <= 1
        ? colors.inTune
        : Math.abs(c) <= 5
          ? colors.warn
          : colors.off;

  const ticks = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50];

  return (
    <View>
      <Svg width={w} height={h}>
        {/* base arc */}
        <Path
          d={arcPath(cx, cy, r, -SWEEP / 2, SWEEP / 2)}
          stroke={colors.border}
          strokeWidth={3}
          fill="none"
        />
        {/* center in-tune zone (+/-5c) */}
        <Path
          d={arcPath(cx, cy, r, (-5 / RANGE) * (SWEEP / 2), (5 / RANGE) * (SWEEP / 2))}
          stroke={colors.inTune}
          strokeWidth={5}
          strokeOpacity={0.55}
          fill="none"
        />
        {/* ticks */}
        {ticks.map((t) => {
          const a = (t / RANGE) * (SWEEP / 2);
          const major = t % 20 === 0;
          const p1 = polar(cx, cy, r - (major ? 14 : 8), a);
          const p2 = polar(cx, cy, r, a);
          return (
            <G key={t}>
              <Line
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={t === 0 ? colors.inTune : colors.mutedForeground}
                strokeWidth={major ? 2 : 1}
              />
              {major && (
                <SvgText
                  x={polar(cx, cy, r - 30, a).x}
                  y={polar(cx, cy, r - 30, a).y + 4}
                  fill={colors.mutedForeground}
                  fontSize={11}
                  fontFamily={Fonts.mono}
                  textAnchor="middle"
                >
                  {t > 0 ? `+${t}` : t}
                </SvgText>
              )}
            </G>
          );
        })}
        {/* needle */}
        <G rotation={angle} origin={`${cx}, ${cy}`}>
          <Line
            x1={cx}
            y1={cy}
            x2={cx}
            y2={cy - r + 6}
            stroke={zoneColor}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </G>
        <Circle cx={cx} cy={cy} r={7} fill={zoneColor} />
        <Circle cx={cx} cy={cy} r={3} fill={colors.background} />
      </Svg>
    </View>
  );
}

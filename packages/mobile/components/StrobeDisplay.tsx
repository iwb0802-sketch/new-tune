import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";
import { useColors } from "@/hooks/use-colors";

/**
 * Reyburn CyberEar–style strobe wheel.
 *
 * A segmented disk that rotates continuously. Its angular velocity is proportional
 * to the pitch error (cents) and its direction shows sharp vs flat:
 *   - in tune (cents ≈ 0)  → the pattern stands still
 *   - sharp   (cents > 0)  → drifts clockwise, faster the further off
 *   - flat    (cents < 0)  → drifts counter-clockwise
 * This mirrors how a mechanical strobe locks when the beat rate hits zero.
 */

const OUTER_SEGMENTS = 24;
const INNER_SEGMENTS = 16;
// degrees/sec of drift per cent of error (tuned for a readable, not dizzying, spin)
const DEG_PER_CENT = 9;
const MAX_SPEED = 320; // clamp so large errors don't blur completely

function ring(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  segments: number,
) {
  const paths: string[] = [];
  const step = (Math.PI * 2) / segments;
  for (let i = 0; i < segments; i += 2) {
    const a0 = i * step - Math.PI / 2;
    const a1 = a0 + step;
    const x0o = cx + rOuter * Math.cos(a0);
    const y0o = cy + rOuter * Math.sin(a0);
    const x1o = cx + rOuter * Math.cos(a1);
    const y1o = cy + rOuter * Math.sin(a1);
    const x1i = cx + rInner * Math.cos(a1);
    const y1i = cy + rInner * Math.sin(a1);
    const x0i = cx + rInner * Math.cos(a0);
    const y0i = cy + rInner * Math.sin(a0);
    paths.push(
      `M ${x0o} ${y0o} A ${rOuter} ${rOuter} 0 0 1 ${x1o} ${y1o} ` +
        `L ${x1i} ${y1i} A ${rInner} ${rInner} 0 0 0 ${x0i} ${y0i} Z`,
    );
  }
  return paths;
}

export function StrobeDisplay({
  cents,
  active,
  size = 260,
}: {
  cents: number | null;
  active: boolean;
  size?: number;
}) {
  const colors = useColors();
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.46;
  const rMid = size * 0.34;
  const rInner = size * 0.22;
  const rHub = size * 0.16;

  const spin = useRef(new Animated.Value(0)).current;
  const angle = useRef(0);
  const centsRef = useRef(0);
  const activeRef = useRef(active);
  centsRef.current = cents ?? 0;
  activeRef.current = active;

  useEffect(() => {
    let raf: number;
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      const dt = (now - last) / 1000;
      last = now;
      if (activeRef.current) {
        const v = Math.max(
          -MAX_SPEED,
          Math.min(MAX_SPEED, centsRef.current * DEG_PER_CENT),
        );
        angle.current = (angle.current + v * dt) % 360;
        if (angle.current < 0) angle.current += 360;
        spin.setValue(angle.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 360],
    outputRange: ["0deg", "360deg"],
  });

  const c = cents ?? 0;
  const locked = active && Math.abs(c) <= 1;
  const litColor = !active
    ? colors.mutedForeground
    : Math.abs(c) <= 1
      ? colors.inTune
      : Math.abs(c) <= 5
        ? colors.warn
        : colors.off;

  const outerLit = ring(cx, cy, rOuter, rMid + 2, OUTER_SEGMENTS);
  const innerLit = ring(cx, cy, rMid, rInner + 2, INNER_SEGMENTS);

  return (
    <View style={{ width: size, height: size }}>
      {/* static frame */}
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle
          cx={cx}
          cy={cy}
          r={rOuter + 2}
          stroke={colors.border}
          strokeWidth={2}
          fill={colors.card}
        />
      </Svg>

      {/* rotating segmented rings */}
      <Animated.View
        style={{
          width: size,
          height: size,
          transform: [{ rotate }],
        }}
      >
        <Svg width={size} height={size}>
          <G>
            {outerLit.map((d, i) => (
              <Path key={`o${i}`} d={d} fill={litColor} fillOpacity={0.9} />
            ))}
            {innerLit.map((d, i) => (
              <Path key={`i${i}`} d={d} fill={litColor} fillOpacity={0.55} />
            ))}
          </G>
        </Svg>
      </Animated.View>

      {/* center hub with lock indicator */}
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle
          cx={cx}
          cy={cy}
          r={rHub}
          fill={colors.background}
          stroke={litColor}
          strokeWidth={locked ? 3 : 1.5}
          strokeOpacity={locked ? 1 : 0.5}
        />
        {locked && (
          <Circle cx={cx} cy={cy} r={rHub * 0.45} fill={litColor} fillOpacity={0.9} />
        )}
      </Svg>
    </View>
  );
}

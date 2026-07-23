import { useEffect, useRef } from "react";
import { colors } from "../../lib/theme";

/**
 * Reyburn CyberEar–style strobe wheel. A segmented disk that rotates continuously;
 * angular velocity is proportional to pitch error (cents), direction shows sharp/flat.
 *   - in tune (cents ≈ 0)  → pattern stands still
 *   - sharp   (cents > 0)  → drifts clockwise
 *   - flat    (cents < 0)  → drifts counter-clockwise
 */

const OUTER_SEGMENTS = 24;
const INNER_SEGMENTS = 16;
const DEG_PER_CENT = 9;
const MAX_SPEED = 320; // clamp so large errors don't blur completely

function ring(cx: number, cy: number, rOuter: number, rInner: number, segments: number) {
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
  spinning,
  size = 260,
}: {
  cents: number | null;
  active: boolean;
  /** whether the wheel should keep rotating (live sound). Defaults to `active`. */
  spinning?: boolean;
  size?: number;
}) {
  const spin = spinning ?? active;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.46;
  const rMid = size * 0.34;
  const rInner = size * 0.22;
  const rHub = size * 0.16;

  const rotRef = useRef<SVGGElement>(null);
  const angle = useRef(0);
  const centsRef = useRef(0);
  const spinRef = useRef(spin);
  centsRef.current = cents ?? 0;
  spinRef.current = spin;

  useEffect(() => {
    let raf: number;
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      const dt = (now - last) / 1000;
      last = now;
      if (spinRef.current) {
        const v = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, centsRef.current * DEG_PER_CENT));
        angle.current = (angle.current + v * dt) % 360;
        if (angle.current < 0) angle.current += 360;
        if (rotRef.current) {
          rotRef.current.setAttribute("transform", `rotate(${angle.current} ${cx} ${cy})`);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cx, cy]);

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
    <svg width={size} height={size} style={{ maxWidth: "100%" }}>
      {/* static frame */}
      <circle cx={cx} cy={cy} r={rOuter + 2} stroke={colors.border} strokeWidth={2} fill={colors.card} />

      {/* rotating segmented rings */}
      <g ref={rotRef}>
        {outerLit.map((d, i) => (
          <path key={`o${i}`} d={d} fill={litColor} fillOpacity={0.9} />
        ))}
        {innerLit.map((d, i) => (
          <path key={`i${i}`} d={d} fill={litColor} fillOpacity={0.55} />
        ))}
      </g>

      {/* center hub with lock indicator */}
      <circle
        cx={cx}
        cy={cy}
        r={rHub}
        fill={colors.background}
        stroke={litColor}
        strokeWidth={locked ? 3 : 1.5}
        strokeOpacity={locked ? 1 : 0.5}
      />
      {locked && <circle cx={cx} cy={cy} r={rHub * 0.45} fill={litColor} fillOpacity={0.9} />}
    </svg>
  );
}

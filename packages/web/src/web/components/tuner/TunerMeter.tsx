import { colors, Fonts } from "../../lib/theme";

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

/** Semicircular gauge. cents clamped to +/-RANGE for the needle. */
export function TunerMeter({
  cents,
  active,
  width = 320,
}: {
  cents: number | null;
  active: boolean;
  width?: number;
}) {
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
    <svg width={w} height={h} style={{ maxWidth: "100%" }}>
      <path d={arcPath(cx, cy, r, -SWEEP / 2, SWEEP / 2)} stroke={colors.border} strokeWidth={3} fill="none" />
      <path
        d={arcPath(cx, cy, r, (-5 / RANGE) * (SWEEP / 2), (5 / RANGE) * (SWEEP / 2))}
        stroke={colors.inTune}
        strokeWidth={5}
        strokeOpacity={0.55}
        fill="none"
      />
      {ticks.map((t) => {
        const a = (t / RANGE) * (SWEEP / 2);
        const major = t % 20 === 0;
        const p1 = polar(cx, cy, r - (major ? 14 : 8), a);
        const p2 = polar(cx, cy, r, a);
        const lbl = polar(cx, cy, r - 30, a);
        return (
          <g key={t}>
            <line
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={t === 0 ? colors.inTune : colors.mutedForeground}
              strokeWidth={major ? 2 : 1}
            />
            {major && (
              <text
                x={lbl.x}
                y={lbl.y + 4}
                fill={colors.mutedForeground}
                fontSize={11}
                fontFamily={Fonts.mono}
                textAnchor="middle"
              >
                {t > 0 ? `+${t}` : t}
              </text>
            )}
          </g>
        );
      })}
      <g transform={`rotate(${angle} ${cx} ${cy})`}>
        <line x1={cx} y1={cy} x2={cx} y2={cy - r + 6} stroke={zoneColor} strokeWidth={3} strokeLinecap="round" />
      </g>
      <circle cx={cx} cy={cy} r={7} fill={zoneColor} />
      <circle cx={cx} cy={cy} r={3} fill={colors.background} />
    </svg>
  );
}

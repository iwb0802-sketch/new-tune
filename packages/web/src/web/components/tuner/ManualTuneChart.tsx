import { forwardRef, useImperativeHandle } from "react";
import { colors, Fonts } from "../../lib/theme";
import type { CurvePoint } from "../../lib/dsp/stretch";
import { NUM_KEYS, isBlackKey, keyToNoteName } from "../../lib/dsp/notes";
import { LOWER_ABS, UPPER_ABS, inBandIndex } from "../../lib/dsp/tuning-curve-data";

/** Display tolerance (cents) around the target curve for the manual readout. */
export function toleranceFor(targetCents: number): number {
  return 3 + Math.abs(targetCents) * 0.18;
}

/** Imperative handle so the screen can export the rendered chart as a PNG data URL. */
export interface ManualChartHandle {
  capture: () => Promise<string | null>;
}

const CONTAINER_ID = "manual-tune-chart-svg";

const DESIGN_W = 900;
const DESIGN_H = 330;
const PAD = { top: 26, right: 42, bottom: 100, left: 42 };
const PW = DESIGN_W - PAD.left - PAD.right;
const PH = DESIGN_H - PAD.top - PAD.bottom;
const Y_MIN = -40;
const Y_MAX = 40;
const Y_RANGE = Y_MAX - Y_MIN;

const xOf = (ki: number) => (ki / (NUM_KEYS - 1)) * PW;
const yOf = (c: number) => PH - ((Math.max(Y_MIN, Math.min(Y_MAX, c)) - Y_MIN) / Y_RANGE) * PH;

const Y_MAJOR = [-40, -30, -20, -10, 0, 10, 20, 30, 40];
const Y_MINOR: number[] = [];
for (let c = -40; c <= 40; c += 2) if (!Y_MAJOR.includes(c)) Y_MINOR.push(c);
const X_LABELS = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 88];

const A_INDICES = Array.from({ length: NUM_KEYS }, (_, i) => i).filter((ki) => {
  const n = keyToNoteName(ki + 1);
  return n[0] === "A" && n[1] !== "#";
});

const WHITE_KEYS: number[] = [];
const BLACK_KEYS: number[] = [];
for (let ki = 0; ki < NUM_KEYS; ki++) {
  if (isBlackKey(ki + 1)) BLACK_KEYS.push(ki);
  else WHITE_KEYS.push(ki);
}
const WHITE_COUNT = WHITE_KEYS.length; // 52

function buildBand() {
  const upper: string[] = [];
  const lower: string[] = [];
  for (let i = 0; i < NUM_KEYS; i++) {
    const x0 = xOf(i);
    const x1 = i < NUM_KEYS - 1 ? xOf(i + 1) : xOf(NUM_KEYS - 1);
    const yu = yOf(UPPER_ABS[i]);
    const yl = yOf(LOWER_ABS[i]);
    if (i === 0) {
      upper.push(`M ${x0.toFixed(1)} ${yu.toFixed(1)}`);
      lower.push(`M ${x0.toFixed(1)} ${yl.toFixed(1)}`);
    } else {
      upper.push(`L ${x0.toFixed(1)} ${yOf(UPPER_ABS[i - 1]).toFixed(1)} L ${x0.toFixed(1)} ${yu.toFixed(1)}`);
      lower.push(`L ${x0.toFixed(1)} ${yOf(LOWER_ABS[i - 1]).toFixed(1)} L ${x0.toFixed(1)} ${yl.toFixed(1)}`);
    }
    upper.push(`L ${x1.toFixed(1)} ${yu.toFixed(1)}`);
    lower.push(`L ${x1.toFixed(1)} ${yl.toFixed(1)}`);
  }
  return { upper: upper.join(" "), lower: lower.join(" ") };
}
const BAND = buildBand();

const KB_H = 26;
const KB_TOP = PH + 14;
const WK_W = PW / WHITE_COUNT;
const WHITE_POS = WHITE_KEYS.map((ki, idx) => ({ ki, x: idx * WK_W }));
const BLACK_POS = BLACK_KEYS.map((ki) => {
  const prev = [...WHITE_POS].reverse().find((w) => w.ki < ki);
  return { ki, x: (prev ? prev.x : 0) + WK_W * 0.65 };
});

/** Serialize the on-screen <svg> DOM into a PNG data URL via canvas. */
function captureWeb(background: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const host = document.getElementById(CONTAINER_ID);
      const svgEl = host?.querySelector("svg") as SVGSVGElement | null;
      if (!svgEl) return resolve(null);
      const w = svgEl.width.baseVal.value || DESIGN_W;
      const h = svgEl.height.baseVal.value || DESIGN_H;
      const xml = new XMLSerializer().serializeToString(svgEl);
      const src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
      const img = new Image();
      img.onload = () => {
        const scale = Math.max(2, 1800 / w);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.scale(scale, scale);
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => resolve(null);
      img.src = src;
    } catch {
      resolve(null);
    }
  });
}

/**
 * Full 88-key tuning-curve chart: stepped PT-100 tolerance band, red stretch-target
 * reference curve, dual left/right cent axes, A-octave guides, recorded-pitch dots,
 * and a bottom piano keyboard. Authored at a fixed design size and scaled via viewBox.
 */
export const ManualTuneChart = forwardRef<
  ManualChartHandle,
  {
    curve: CurvePoint[];
    currentKey: number | null;
    tunedCents: Record<number, number>;
    /** Real-time (latched) pitch marker: detected key + cents-from-ET. */
    liveMarker?: { key: number; cents: number } | null;
    width?: number;
    fit?: boolean;
  }
>(function ManualTuneChart({ curve, currentKey, tunedCents, liveMarker, width = 360, fit = true }, ref) {
  useImperativeHandle(ref, () => ({
    capture: async () => captureWeb(colors.card),
  }));

  const svgW = fit ? width : DESIGN_W;
  const svgH = Math.round(svgW * (DESIGN_H / DESIGN_W));

  const activeKi = currentKey != null ? currentKey - 1 : null;

  const refPath = curve
    .slice(0, NUM_KEYS)
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(i).toFixed(1)} ${yOf(p.cents).toFixed(1)}`)
    .join(" ");

  const chart = (
    <div id={CONTAINER_ID} style={{ width: svgW }}>
      <svg width={svgW} height={svgH} viewBox={`0 0 ${DESIGN_W} ${DESIGN_H}`} style={{ display: "block" }}>
        <rect x={PAD.left} y={PAD.top} width={PW} height={PH} fill={colors.card} stroke={colors.border} strokeWidth={1} />

        <g transform={`translate(${PAD.left} ${PAD.top})`}>
          {/* minor horizontal grid */}
          {Y_MINOR.map((c) => (
            <line key={`ym${c}`} x1={0} y1={yOf(c)} x2={PW} y2={yOf(c)} stroke={colors.border} strokeWidth={0.4} opacity={0.5} />
          ))}
          {/* minor vertical grid */}
          {Array.from({ length: NUM_KEYS }, (_, i) => (
            <line key={`xm${i}`} x1={xOf(i)} y1={0} x2={xOf(i)} y2={PH} stroke={colors.border} strokeWidth={0.3} opacity={0.3} />
          ))}
          {/* major horizontal grid */}
          {Y_MAJOR.map((c) => (
            <line
              key={`yM${c}`}
              x1={0}
              y1={yOf(c)}
              x2={PW}
              y2={yOf(c)}
              stroke={c === 0 ? colors.mutedForeground : colors.border}
              strokeWidth={c === 0 ? 1.2 : 0.7}
              opacity={c === 0 ? 0.9 : 0.8}
            />
          ))}

          {/* A-note vertical guide lines */}
          {A_INDICES.map((ki) => (
            <line
              key={`av${ki}`}
              x1={xOf(ki)}
              y1={0}
              x2={xOf(ki)}
              y2={PH}
              stroke={colors.precision}
              strokeWidth={0.9}
              strokeDasharray="4 3"
              opacity={0.5}
            />
          ))}

          {/* stepped PT-100 tolerance band */}
          <path d={BAND.upper} fill="none" stroke={colors.foreground} strokeWidth={1.4} opacity={0.85} />
          <path d={BAND.lower} fill="none" stroke={colors.foreground} strokeWidth={1.4} opacity={0.85} />

          {/* red stretch-target reference curve */}
          <path d={refPath} fill="none" stroke={colors.off} strokeWidth={1.8} strokeLinejoin="round" opacity={0.95} />

          {/* left Y axis */}
          {Y_MAJOR.map((c) => (
            <g key={`yl${c}`}>
              <line x1={-4} y1={yOf(c)} x2={0} y2={yOf(c)} stroke={colors.mutedForeground} strokeWidth={1} />
              <text x={-7} y={yOf(c) + 3} textAnchor="end" fontSize={9} fontFamily={Fonts.mono} fill={colors.mutedForeground}>
                {c > 0 ? `+${c}` : `${c}`}
              </text>
            </g>
          ))}
          {Y_MINOR.map((c) => (
            <line key={`ylt${c}`} x1={-2} y1={yOf(c)} x2={0} y2={yOf(c)} stroke={colors.mutedForeground} strokeWidth={0.6} opacity={0.7} />
          ))}

          {/* right Y axis */}
          {Y_MAJOR.map((c) => (
            <g key={`yr${c}`}>
              <line x1={PW} y1={yOf(c)} x2={PW + 4} y2={yOf(c)} stroke={colors.mutedForeground} strokeWidth={1} />
              <text x={PW + 7} y={yOf(c) + 3} textAnchor="start" fontSize={9} fontFamily={Fonts.mono} fill={colors.mutedForeground}>
                {c > 0 ? `+${c}` : `${c}`}
              </text>
            </g>
          ))}
          {Y_MINOR.map((c) => (
            <line key={`yrt${c}`} x1={PW} y1={yOf(c)} x2={PW + 2} y2={yOf(c)} stroke={colors.mutedForeground} strokeWidth={0.6} opacity={0.7} />
          ))}

          {/* X-axis key-number labels */}
          {X_LABELS.map((kn) => (
            <text key={`xl${kn}`} x={xOf(kn - 1)} y={PH + 12} textAnchor="middle" fontSize={8} fontFamily={Fonts.mono} fill={colors.mutedForeground}>
              {kn}
            </text>
          ))}

          {/* top A markers */}
          {A_INDICES.map((ki) => (
            <g key={`a${ki}`}>
              <line x1={xOf(ki)} y1={-14} x2={xOf(ki)} y2={0} stroke={colors.precision} strokeWidth={1.2} />
              <text x={xOf(ki)} y={-16} textAnchor="middle" fontSize={9} fontFamily={Fonts.monoBold} fontWeight={700} fill={colors.precision}>
                A
              </text>
            </g>
          ))}

          {/* active-key vertical line */}
          {activeKi != null && (
            <line
              x1={xOf(activeKi)}
              y1={0}
              x2={xOf(activeKi)}
              y2={PH}
              stroke={colors.off}
              strokeWidth={1.2}
              strokeDasharray="4 3"
              opacity={0.85}
            />
          )}

          {/* recorded pitch dots */}
          {Object.entries(tunedCents).map(([k, cents]) => {
            const key = Number(k);
            const ki = key - 1;
            const isActive = ki === activeKi;
            const inRange = inBandIndex(ki, cents);
            const fill = isActive ? colors.off : inRange ? colors.primary : colors.off;
            return (
              <circle
                key={`dot${k}`}
                cx={xOf(ki)}
                cy={yOf(cents)}
                r={isActive ? 4.5 : 3.4}
                fill={fill}
                stroke={colors.background}
                strokeWidth={isActive ? 1.4 : 0.8}
                opacity={0.95}
              />
            );
          })}

          {/* real-time (latched) live pitch marker */}
          {liveMarker != null && liveMarker.key >= 1 && liveMarker.key <= NUM_KEYS && (() => {
            const ki = liveMarker.key - 1;
            const cx = xOf(ki);
            const cy = yOf(liveMarker.cents);
            const col = inBandIndex(ki, liveMarker.cents) ? colors.inTune : colors.warn;
            return (
              <g key="livemarker" opacity={0.95}>
                <line x1={cx - 9} y1={cy} x2={cx + 9} y2={cy} stroke={col} strokeWidth={1.6} />
                <line x1={cx} y1={cy - 9} x2={cx} y2={cy + 9} stroke={col} strokeWidth={1.6} />
                <circle cx={cx} cy={cy} r={6} fill="none" stroke={col} strokeWidth={2.2} />
                <circle cx={cx} cy={cy} r={6} fill="none" stroke={colors.background} strokeWidth={0.8} />
              </g>
            );
          })()}

          {/* bottom piano keyboard */}
          <g transform={`translate(0 ${KB_TOP})`}>
            {WHITE_POS.map(({ ki, x }) => {
              const on = ki === activeKi;
              const done = tunedCents[ki + 1] != null;
              return (
                <rect
                  key={`wk${ki}`}
                  x={x + 0.3}
                  y={0}
                  width={Math.max(1, WK_W - 0.6)}
                  height={KB_H}
                  fill={on ? colors.primary : done ? colors.inTune : colors.cardElevated}
                  opacity={on ? 1 : done ? 0.85 : 1}
                  stroke={colors.border}
                  strokeWidth={0.5}
                />
              );
            })}
            {BLACK_POS.map(({ ki, x }) => {
              const on = ki === activeKi;
              const done = tunedCents[ki + 1] != null;
              return (
                <rect
                  key={`bk${ki}`}
                  x={x}
                  y={0}
                  width={Math.max(0.5, WK_W * 0.58)}
                  height={KB_H * 0.62}
                  rx={0.8}
                  fill={on ? colors.primary : done ? colors.inTune : "#05070A"}
                  stroke={colors.background}
                  strokeWidth={0.6}
                />
              );
            })}
            {A_INDICES.map((ki) => {
              const wk = WHITE_POS.find((w) => w.ki === ki);
              if (!wk) return null;
              const cx = wk.x + WK_W / 2;
              const note = keyToNoteName(ki + 1);
              return (
                <g key={`ab${ki}`}>
                  <text x={cx} y={KB_H + 16} textAnchor="middle" fontSize={9} fontFamily={Fonts.monoBold} fontWeight={700} fill={colors.precision}>
                    {note}
                  </text>
                  <text x={cx} y={KB_H + 27} textAnchor="middle" fontSize={7.5} fontFamily={Fonts.mono} fill={colors.mutedForeground}>
                    {ki + 1}
                  </text>
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );

  if (fit) return chart;

  return <div style={{ overflowX: "auto", paddingLeft: 2, paddingRight: 2 }}>{chart}</div>;
});

import { forwardRef, useImperativeHandle, useRef } from "react";
import { Platform, ScrollView, View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { useColors } from "@/hooks/use-colors";
import { Fonts } from "@/constants/theme";
import type { CurvePoint } from "@/lib/dsp/stretch";
import { NUM_KEYS, isBlackKey, keyToNoteName } from "@/lib/dsp/notes";
import { LOWER_ABS, UPPER_ABS, inBandIndex } from "@/lib/dsp/tuning-curve-data";

/** Display tolerance (cents) around the target curve — kept for the readout in the
 *  manual screen. The chart itself uses the PT-100 absolute band (UPPER/LOWER_ABS). */
export function toleranceFor(targetCents: number): number {
  return 3 + Math.abs(targetCents) * 0.18;
}

/** Imperative handle so the screen can export the rendered chart as a PNG data URL. */
export interface ManualChartHandle {
  capture: () => Promise<string | null>;
}

const CONTAINER_ID = "manual-tune-chart-svg";

// Fixed design canvas. The <Svg> is scaled to the container via viewBox so the
// whole 88-key compass fits at a glance while every label stays crisp and
// collision-free (no per-size font hacks).
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

// Precompute keyboard layout (0-based key indices).
const WHITE_KEYS: number[] = [];
const BLACK_KEYS: number[] = [];
for (let ki = 0; ki < NUM_KEYS; ki++) {
  if (isBlackKey(ki + 1)) BLACK_KEYS.push(ki);
  else WHITE_KEYS.push(ki);
}
const WHITE_COUNT = WHITE_KEYS.length; // 52

// Stepped (staircase) PT-100 tolerance band from the absolute bounds.
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

// Keyboard geometry.
const KB_H = 26;
const KB_TOP = PH + 14;
const WK_W = PW / WHITE_COUNT;
const WHITE_POS = WHITE_KEYS.map((ki, idx) => ({ ki, x: idx * WK_W }));
const BLACK_POS = BLACK_KEYS.map((ki) => {
  const prev = [...WHITE_POS].reverse().find((w) => w.ki < ki);
  return { ki, x: (prev ? prev.x : 0) + WK_W * 0.65 };
});

/** Serialize the on-screen <svg> DOM (web) into a PNG data URL via canvas. */
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
 * Full 88-key tuning-curve chart ported from the CyberTuner web build:
 * stepped PT-100 tolerance band, red stretch-target reference curve, dual
 * left/right cent axes, A-octave guide lines, recorded-pitch dots, and a bottom
 * piano keyboard.
 *
 * The vector is authored at a fixed design size and scaled to the container via
 * `viewBox`, so in `fit` mode the entire compass is visible at a glance with
 * proportional, non-overlapping labels; otherwise it renders 1:1 inside a
 * horizontal scroller for finer inspection.
 */
export const ManualTuneChart = forwardRef<
  ManualChartHandle,
  {
    curve: CurvePoint[];
    currentKey: number | null;
    tunedCents: Record<number, number>;
    width?: number;
    fit?: boolean;
  }
>(function ManualTuneChart({ curve, currentKey, tunedCents, width = 360, fit = true }, ref) {
  const colors = useColors();
  const svgRef = useRef<Svg>(null);

  useImperativeHandle(ref, () => ({
    capture: async () => {
      if (Platform.OS === "web") return captureWeb(colors.card);
      return new Promise<string | null>((resolve) => {
        const node = svgRef.current as unknown as {
          toDataURL?: (cb: (b64: string) => void) => void;
        } | null;
        if (!node?.toDataURL) return resolve(null);
        node.toDataURL((b64) => resolve("data:image/png;base64," + b64));
      });
    },
  }));

  const svgW = fit ? width : DESIGN_W;
  const svgH = Math.round(svgW * (DESIGN_H / DESIGN_W));

  const activeKi = currentKey != null ? currentKey - 1 : null;

  // Red stretch-target reference curve (기준음 · 스트레치 중앙값).
  const refPath = curve
    .slice(0, NUM_KEYS)
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(i).toFixed(1)} ${yOf(p.cents).toFixed(1)}`)
    .join(" ");

  const chart = (
    <View nativeID={CONTAINER_ID}>
      <Svg ref={svgRef} width={svgW} height={svgH} viewBox={`0 0 ${DESIGN_W} ${DESIGN_H}`}>
        {/* chart panel */}
        <Rect
          x={PAD.left}
          y={PAD.top}
          width={PW}
          height={PH}
          fill={colors.card}
          stroke={colors.border}
          strokeWidth={1}
        />

        <G x={PAD.left} y={PAD.top}>
          {/* minor horizontal grid */}
          {Y_MINOR.map((c) => (
            <Line key={`ym${c}`} x1={0} y1={yOf(c)} x2={PW} y2={yOf(c)} stroke={colors.border} strokeWidth={0.4} opacity={0.5} />
          ))}
          {/* minor vertical grid (per key) */}
          {Array.from({ length: NUM_KEYS }, (_, i) => (
            <Line key={`xm${i}`} x1={xOf(i)} y1={0} x2={xOf(i)} y2={PH} stroke={colors.border} strokeWidth={0.3} opacity={0.3} />
          ))}
          {/* major horizontal grid */}
          {Y_MAJOR.map((c) => (
            <Line
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
            <Line
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
          <Path d={BAND.upper} fill="none" stroke={colors.foreground} strokeWidth={1.4} opacity={0.85} />
          <Path d={BAND.lower} fill="none" stroke={colors.foreground} strokeWidth={1.4} opacity={0.85} />

          {/* red stretch-target reference curve */}
          <Path d={refPath} fill="none" stroke={colors.off} strokeWidth={1.8} strokeLinejoin="round" opacity={0.95} />

          {/* left Y axis */}
          {Y_MAJOR.map((c) => (
            <G key={`yl${c}`}>
              <Line x1={-4} y1={yOf(c)} x2={0} y2={yOf(c)} stroke={colors.mutedForeground} strokeWidth={1} />
              <SvgText x={-7} y={yOf(c) + 3} textAnchor="end" fontSize={9} fontFamily={Fonts.mono} fill={colors.mutedForeground}>
                {c > 0 ? `+${c}` : `${c}`}
              </SvgText>
            </G>
          ))}
          {Y_MINOR.map((c) => (
            <Line key={`ylt${c}`} x1={-2} y1={yOf(c)} x2={0} y2={yOf(c)} stroke={colors.mutedForeground} strokeWidth={0.6} opacity={0.7} />
          ))}

          {/* right Y axis */}
          {Y_MAJOR.map((c) => (
            <G key={`yr${c}`}>
              <Line x1={PW} y1={yOf(c)} x2={PW + 4} y2={yOf(c)} stroke={colors.mutedForeground} strokeWidth={1} />
              <SvgText x={PW + 7} y={yOf(c) + 3} textAnchor="start" fontSize={9} fontFamily={Fonts.mono} fill={colors.mutedForeground}>
                {c > 0 ? `+${c}` : `${c}`}
              </SvgText>
            </G>
          ))}
          {Y_MINOR.map((c) => (
            <Line key={`yrt${c}`} x1={PW} y1={yOf(c)} x2={PW + 2} y2={yOf(c)} stroke={colors.mutedForeground} strokeWidth={0.6} opacity={0.7} />
          ))}

          {/* X-axis key-number labels */}
          {X_LABELS.map((kn) => (
            <SvgText key={`xl${kn}`} x={xOf(kn - 1)} y={PH + 12} textAnchor="middle" fontSize={8} fontFamily={Fonts.mono} fill={colors.mutedForeground}>
              {kn}
            </SvgText>
          ))}

          {/* top A markers */}
          {A_INDICES.map((ki) => (
            <G key={`a${ki}`}>
              <Line x1={xOf(ki)} y1={-14} x2={xOf(ki)} y2={0} stroke={colors.precision} strokeWidth={1.2} />
              <SvgText x={xOf(ki)} y={-16} textAnchor="middle" fontSize={9} fontFamily={Fonts.monoBold} fill={colors.precision}>
                A
              </SvgText>
            </G>
          ))}

          {/* active-key vertical line */}
          {activeKi != null && (
            <Line
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
              <Circle
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

          {/* bottom piano keyboard */}
          <G y={KB_TOP}>
            {WHITE_POS.map(({ ki, x }) => {
              const on = ki === activeKi;
              const done = tunedCents[ki + 1] != null;
              return (
                <Rect
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
                <Rect
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
            {/* A-octave labels below keyboard */}
            {A_INDICES.map((ki) => {
              const wk = WHITE_POS.find((w) => w.ki === ki);
              if (!wk) return null;
              const cx = wk.x + WK_W / 2;
              const note = keyToNoteName(ki + 1);
              return (
                <G key={`ab${ki}`}>
                  <SvgText x={cx} y={KB_H + 16} textAnchor="middle" fontSize={9} fontFamily={Fonts.monoBold} fill={colors.precision}>
                    {note}
                  </SvgText>
                  <SvgText x={cx} y={KB_H + 27} textAnchor="middle" fontSize={7.5} fontFamily={Fonts.mono} fill={colors.mutedForeground}>
                    {ki + 1}
                  </SvgText>
                </G>
              );
            })}
          </G>
        </G>
      </Svg>
    </View>
  );

  if (fit) return chart;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingHorizontal: 2 }}>
      {chart}
    </ScrollView>
  );
});

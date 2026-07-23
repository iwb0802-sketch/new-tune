import { useEffect, useRef } from "react";
import { colors, Fonts } from "../../lib/theme";
import { NUM_KEYS, isBlackKey, keyToNoteName } from "../../lib/dsp/notes";

const WHITE_W = 24;
const WHITE_H = 92;
const BLACK_W = 15;
const BLACK_H = 58;

/**
 * Horizontal 88-key piano. Highlights the active key and auto-scrolls to keep it
 * centered. White keys flow in a row; black keys are overlaid between them.
 */
export function PianoKeyboard({
  activeKey,
  color,
}: {
  activeKey: number | null;
  color: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const whites: { key: number; x: number }[] = [];
  const blacks: { key: number; x: number }[] = [];
  let wx = 0;
  for (let k = 1; k <= NUM_KEYS; k++) {
    if (isBlackKey(k)) {
      blacks.push({ key: k, x: wx - BLACK_W / 2 });
    } else {
      whites.push({ key: k, x: wx });
      wx += WHITE_W;
    }
  }
  const totalW = wx;

  useEffect(() => {
    if (activeKey == null) return;
    const white = whites.find((w) => w.key === activeKey);
    const near = white ? white.x : (blacks.find((b) => b.key === activeKey)?.x ?? 0);
    scrollRef.current?.scrollTo({ left: Math.max(0, near - 150), behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  return (
    <div
      ref={scrollRef}
      style={{ overflowX: "auto", overflowY: "hidden", width: "100%" }}
    >
      <div style={{ position: "relative", width: totalW, height: WHITE_H }}>
        {whites.map(({ key, x }) => {
          const on = key === activeKey;
          const name = keyToNoteName(key);
          const isC = name.startsWith("C") && !name.includes("#");
          return (
            <div
              key={key}
              style={{
                position: "absolute",
                top: 0,
                left: x,
                width: WHITE_W,
                height: WHITE_H,
                border: `1px solid ${colors.border}`,
                borderRadius: "2px 2px 4px 4px",
                backgroundColor: on ? color : "#F4F5F7",
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                flexDirection: "column",
                paddingBottom: 4,
                boxSizing: "border-box",
              }}
            >
              {isC && (
                <span style={{ fontFamily: Fonts.mono, fontSize: 7, color: on ? "#FFFFFF" : "#8A929E" }}>
                  {name}
                </span>
              )}
            </div>
          );
        })}
        {blacks.map(({ key, x }) => {
          const on = key === activeKey;
          return (
            <div
              key={key}
              style={{
                position: "absolute",
                top: 0,
                left: x,
                width: BLACK_W,
                height: BLACK_H,
                borderRadius: "0 0 3px 3px",
                backgroundColor: on ? color : "#16191F",
                zIndex: 2,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

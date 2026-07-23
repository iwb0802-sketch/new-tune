import { useEffect, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { Fonts } from "@/constants/theme";
import { NUM_KEYS, isBlackKey, keyToNoteName } from "@/lib/dsp/notes";

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
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);

  // Precompute layout: assign each white key an x slot, place black keys at seams.
  const whites: { key: number; x: number }[] = [];
  const blacks: { key: number; x: number }[] = [];
  let wx = 0;
  for (let k = 1; k <= NUM_KEYS; k++) {
    if (isBlackKey(k)) {
      // sits at the seam before the current white slot
      blacks.push({ key: k, x: wx - BLACK_W / 2 });
    } else {
      whites.push({ key: k, x: wx });
      wx += WHITE_W;
    }
  }
  const totalW = wx;

  // center the active key
  useEffect(() => {
    if (activeKey == null) return;
    const white = whites.find((w) => w.key === activeKey);
    const near = white
      ? white.x
      : (blacks.find((b) => b.key === activeKey)?.x ?? 0);
    scrollRef.current?.scrollTo({ x: Math.max(0, near - 150), animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ width: totalW, height: WHITE_H }}
    >
      <View style={{ width: totalW, height: WHITE_H }}>
        {/* white keys */}
        {whites.map(({ key, x }) => {
          const on = key === activeKey;
          const isC = keyToNoteName(key).startsWith("C") && !keyToNoteName(key).includes("#");
          return (
            <View
              key={key}
              style={[
                styles.white,
                {
                  left: x,
                  backgroundColor: on ? color : "#F4F5F7",
                  borderColor: colors.border,
                },
              ]}
            >
              {isC && (
                <Text style={[styles.label, { color: on ? "#FFFFFF" : "#8A929E" }]}>
                  {keyToNoteName(key)}
                </Text>
              )}
            </View>
          );
        })}
        {/* black keys */}
        {blacks.map(({ key, x }) => {
          const on = key === activeKey;
          return (
            <View
              key={key}
              style={[
                styles.black,
                { left: x, backgroundColor: on ? color : "#16191F" },
              ]}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  white: {
    position: "absolute",
    top: 0,
    width: WHITE_W,
    height: WHITE_H,
    borderWidth: 1,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 4,
  },
  black: {
    position: "absolute",
    top: 0,
    width: BLACK_W,
    height: BLACK_H,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    zIndex: 2,
  },
  label: { fontFamily: Fonts.mono, fontSize: 7 },
});

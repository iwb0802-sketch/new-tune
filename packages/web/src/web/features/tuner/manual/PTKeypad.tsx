/**
 * PTKeypad.tsx — PT-100/PT-A1 다이얼식 키패드 재현 (v2, 실기기 화면 그대로)
 *
 * 5열 그리드:
 *  [7/B] [8]  [9]  [RES]     [AUTO]
 *  [4/F] [5/G][6/A][-10]     [+10]
 *  [1/C] [2/D][3/E][–]       [+]
 *  [0/OCT]    [REVERSE ♭]    [STEP ♯]
 */

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface PTKeypadProps {
  onJumpToNote: (noteBase: string, octave: number, semitoneShift: number) => void;
  onAutoToggle: (enabled: boolean) => void;
  onReset: () => void;
  onNudge: (deltaCents: number) => void;
  autoMode: boolean;
  /** true면 빨강/회색 구분 없이 전부 빨강 톤으로 통일 (오리지널 PT-100 스타일) */
  monochromeRed?: boolean;
}

function DigitKey({ digit, letter, onClick, active }: { digit: string; letter?: string; onClick?: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "aspect-square flex flex-col items-center justify-center border border-black/60 transition-colors",
        active ? "bg-off/30 ring-1 ring-inset ring-off/60" : "bg-[#1c1c1c] hover:bg-[#262626]",
        !onClick && "cursor-default opacity-70"
      )}
    >
      <span className="text-lg font-semibold text-white/90 leading-none">{digit}</span>
      {letter && <span className="text-[11px] font-bold text-off mt-1 leading-none">{letter}</span>}
    </button>
  );
}

function FuncKey({ label, sub, onClick, active, span, tone }: {
  label: string; sub?: string; onClick?: () => void; active?: boolean; span?: number;
  tone?: "red" | "gray";
}) {
  const toneClass = tone === "red"
    ? "bg-off/20 hover:bg-off/30 border-off/50"
    : tone === "gray"
    ? "bg-white/10 hover:bg-white/15 border-white/30"
    : active ? "bg-in-tune/25" : "bg-[#1c1c1c] hover:bg-[#262626]";
  const textClass = tone === "red" ? "text-off" : tone === "gray" ? "text-white/80" : "text-off";
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center border border-black/60 transition-colors aspect-square",
        toneClass,
        span === 2 && "col-span-2 aspect-auto"
      )}
    >
      <span className={cn("text-sm font-extrabold leading-none", textClass)}>{label}</span>
      {sub && <span className={cn("text-[11px] font-bold mt-1 leading-none", tone ? textClass + "/80" : "text-off/80")}>{sub}</span>}
    </button>
  );
}

export default function PTKeypad({ onJumpToNote, onAutoToggle, onReset, onNudge, autoMode, monochromeRed = false }: PTKeypadProps) {
  const [pendingNote, setPendingNote] = useState<string | null>(null);
  const [shift, setShift] = useState<0 | 1 | -1>(0);
  const [octaveMode, setOctaveMode] = useState(false);

  const handleNoteKey = useCallback((letter: string) => {
    setPendingNote(prev => (prev === letter ? null : letter));
    setShift(0);
  }, []);

  const applyShift = useCallback((s: 1 | -1) => {
    if (!pendingNote) return;
    setShift(prev => (prev === s ? 0 : s));
  }, [pendingNote]);

  const openOctave = useCallback(() => {
    if (!pendingNote) return;
    setOctaveMode(true);
  }, [pendingNote]);

  const handleOctave = useCallback((oct: number) => {
    if (!pendingNote) return;
    onJumpToNote(pendingNote, oct, shift);
    setOctaveMode(false);
    setPendingNote(null);
    setShift(0);
  }, [pendingNote, shift, onJumpToNote]);

  const noteLabel = pendingNote ? `${pendingNote}${shift === 1 ? "#" : shift === -1 ? "b" : ""}` : null;

  if (octaveMode) {
    return (
      <div className="bg-[#111]">
        <div className="px-3 py-2 flex items-center justify-between border-b border-black/60">
          <span className="text-xs font-semibold text-white/70">
            음 <span className="text-off font-bold">{noteLabel}</span> → 옥타브 선택
          </span>
          <button onClick={() => { setOctaveMode(false); setPendingNote(null); setShift(0); }} className="text-xs text-white/50 hover:text-off">취소</button>
        </div>
        <div className="grid grid-cols-5">
          {Array.from({ length: 9 }, (_, oct) => (
            <button
              key={oct}
              onClick={() => handleOctave(oct)}
              className="aspect-square flex flex-col items-center justify-center border border-black/60 bg-[#1c1c1c] hover:bg-off/20 transition-colors"
            >
              <span className="text-[9px] text-white/40">옥타브</span>
              <span className="text-xl font-bold text-off">{oct}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#111]">
      {pendingNote && (
        <div className="px-3 py-1.5 flex items-center justify-between border-b border-black/60">
          <span className="text-xs font-semibold text-white/70">
            선택: <span className="text-off font-bold">{noteLabel}</span> — STEP/REVERSE로 반음 조정 후 OCT 눌러 옥타브 선택
          </span>
          <button onClick={() => { setPendingNote(null); setShift(0); }} className="text-xs text-white/50 hover:text-off">취소</button>
        </div>
      )}
      <div className="grid grid-cols-5">
        {/* Row 1: 7/B  8  9  RES  AUTO */}
        <DigitKey digit="7" letter="B" onClick={() => handleNoteKey("B")} active={pendingNote === "B"} />
        <DigitKey digit="8" />
        <DigitKey digit="9" />
        <FuncKey label="RES" onClick={onReset} />
        <FuncKey label="AUTO" active={autoMode} onClick={() => onAutoToggle(!autoMode)} />

        {/* Row 2: 4/F  5/G  6/A  -10  +10 */}
        <DigitKey digit="4" letter="F" onClick={() => handleNoteKey("F")} active={pendingNote === "F"} />
        <DigitKey digit="5" letter="G" onClick={() => handleNoteKey("G")} active={pendingNote === "G"} />
        <DigitKey digit="6" letter="A" onClick={() => handleNoteKey("A")} active={pendingNote === "A"} />
        <FuncKey label="-10" sub={monochromeRed ? undefined : "빨강 누르기"} tone="red" onClick={() => onNudge(-10)} />
        <FuncKey label="+10" sub={monochromeRed ? undefined : "회색 누르기"} tone={monochromeRed ? "red" : "gray"} onClick={() => onNudge(10)} />

        {/* Row 3: 1/C  2/D  3/E  –  + */}
        <DigitKey digit="1" letter="C" onClick={() => handleNoteKey("C")} active={pendingNote === "C"} />
        <DigitKey digit="2" letter="D" onClick={() => handleNoteKey("D")} active={pendingNote === "D"} />
        <DigitKey digit="3" letter="E" onClick={() => handleNoteKey("E")} active={pendingNote === "E"} />
        <FuncKey label="–" sub={monochromeRed ? undefined : "빨강 누르기"} tone="red" onClick={() => onNudge(-1)} />
        <FuncKey label="+" sub={monochromeRed ? undefined : "회색 누르기"} tone={monochromeRed ? "red" : "gray"} onClick={() => onNudge(1)} />

        {/* Row 4: 0/OCT  REVERSE(span2)  STEP(span2) */}
        <DigitKey digit="0" letter="OCT" onClick={pendingNote ? openOctave : undefined} active={false} />
        <FuncKey label="REVERSE" sub="♭" onClick={() => applyShift(-1)} active={shift === -1} span={2} />
        <FuncKey label="STEP" sub="♯" onClick={() => applyShift(1)} active={shift === 1} span={2} />
      </div>
    </div>
  );
}

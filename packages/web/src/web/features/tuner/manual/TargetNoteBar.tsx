import { PIANO_KEYS } from "@/hooks/usePitchDetector";
import { cn } from "@/lib/utils";

interface TargetNoteBarProps {
  keyIndex: number;
  indexInOrder: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** 절반 너비 등 좁은 공간에 넣을 때 사용 — 폰트/버튼 축소 */
  compact?: boolean;
}

export default function TargetNoteBar({
  keyIndex,
  indexInOrder,
  total,
  canPrev,
  canNext,
  onPrev,
  onNext,
  compact = false,
}: TargetNoteBarProps) {
  const key = PIANO_KEYS[keyIndex];

  return (
    <div className={cn("bg-card border border-border rounded-xl shadow-sm h-full", compact ? "px-2 py-2" : "px-3 py-3")}>
      <div className={cn("flex items-center justify-between", compact ? "gap-1.5" : "gap-3")}>
        {/* ◀ */}
        <button
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="이전 음"
          className={cn(
            "flex items-center justify-center rounded-xl border transition-all active:scale-95 shrink-0",
            compact ? "w-8 h-8" : "w-12 h-12",
            canPrev
              ? "bg-muted hover:bg-muted/70 border-border text-foreground"
              : "bg-muted/40 border-border/60 text-muted-foreground/40 cursor-not-allowed"
          )}
        >
          <svg width={compact ? "16" : "22"} height={compact ? "16" : "22"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* 중앙 음 표시 */}
        <div className="flex-1 text-center min-w-0">
          <div
            className={cn("font-bold tabular-nums text-foreground leading-none", compact ? "text-lg" : "text-3xl")}
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {key.noteName}
            <span className={cn("text-muted-foreground ml-0.5", compact ? "text-sm" : "text-xl")}>{key.octave}</span>
          </div>
          <div className={cn("text-muted-foreground mt-1 truncate", compact ? "text-[10px]" : "text-xs")}>
            건반 {key.keyNumber}
            <span className="mx-1 text-muted-foreground/40">·</span>
            {indexInOrder + 1}/{total}
          </div>
        </div>

        {/* ▶ */}
        <button
          onClick={onNext}
          disabled={!canNext}
          aria-label="다음 음"
          className={cn(
            "flex items-center justify-center rounded-xl border transition-all active:scale-95 shrink-0",
            compact ? "w-8 h-8" : "w-12 h-12",
            canNext
              ? "bg-muted hover:bg-muted/70 border-border text-foreground"
              : "bg-muted/40 border-border/60 text-muted-foreground/40 cursor-not-allowed"
          )}
        >
          <svg width={compact ? "16" : "22"} height={compact ? "16" : "22"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* 진행 바 */}
      <div className={cn("bg-muted rounded-full overflow-hidden", compact ? "mt-1.5 h-1" : "mt-2 h-1.5")}>
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${((indexInOrder + 1) / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

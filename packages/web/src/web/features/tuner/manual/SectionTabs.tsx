import { cn } from "@/lib/utils";
import {
  ManualSection,
  SECTION_LABELS,
  SECTION_ORDERS,
} from "./useManualSequence";

interface SectionTabsProps {
  section: ManualSection;
  onChange: (s: ManualSection) => void;
  /** 절반 너비 등 좁은 공간에 넣을 때 사용 */
  compact?: boolean;
}

const ORDER: ManualSection[] = ["middle", "lower", "upper"];

export default function SectionTabs({ section, onChange, compact = false }: SectionTabsProps) {
  return (
    <div className={cn("grid grid-cols-3 h-full", compact ? "gap-1" : "gap-2")}>
      {ORDER.map((s) => {
        const active = s === section;
        const order = SECTION_ORDERS[s];
        const first = order[0] + 1;
        const last = order[order.length - 1] + 1;
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={cn(
              "flex flex-col items-center justify-center rounded-xl border transition-all active:scale-[0.98]",
              compact ? "py-1.5" : "py-2.5",
              active
                ? "bg-primary text-white border-primary shadow-sm"
                : "bg-card text-foreground/85 border-border hover:bg-muted"
            )}
          >
            <span className={cn("font-bold", compact ? "text-xs" : "text-sm")}>{SECTION_LABELS[s]}</span>
            <span
              className={cn(
                "mt-0.5",
                compact ? "text-[9px]" : "text-[10px]",
                active ? "text-white/80" : "text-muted-foreground"
              )}
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {first}→{last}
            </span>
          </button>
        );
      })}
    </div>
  );
}

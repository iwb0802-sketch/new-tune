import { colors, Fonts } from "../../lib/theme";

export interface SegmentedOption {
  value: string;
  label: string;
}

export function Segmented({
  options,
  value,
  onChange,
}: {
  options: SegmentedOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        borderRadius: 10,
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.secondary,
        padding: 3,
        gap: 3,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1,
              paddingTop: 8,
              paddingBottom: 8,
              borderRadius: 7,
              border: "none",
              cursor: "pointer",
              backgroundColor: active ? colors.primary : "transparent",
              color: active ? colors.primaryForeground : colors.mutedForeground,
              fontFamily: Fonts.sansMedium,
              fontWeight: 500,
              fontSize: 13,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

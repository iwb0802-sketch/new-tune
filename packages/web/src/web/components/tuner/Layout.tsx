import { Link, useLocation } from "wouter";
import { Radio, Hand, Activity, LineChart, Settings } from "lucide-react";
import { colors, Fonts } from "../../lib/theme";

const TABS = [
  { path: "/", label: "튜너", Icon: Radio },
  { path: "/manual", label: "수동", Icon: Hand },
  { path: "/measure", label: "측정", Icon: Activity },
  { path: "/curve", label: "커브", Icon: LineChart },
  { path: "/settings", label: "설정", Icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div
      style={{
        minHeight: "100dvh",
        backgroundColor: colors.background,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          minHeight: "100dvh",
          backgroundColor: colors.background,
          borderLeft: `1px solid ${colors.border}`,
          borderRight: `1px solid ${colors.border}`,
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        <div style={{ flex: 1, paddingBottom: 72 }}>{children}</div>

        <nav
          style={{
            position: "sticky",
            bottom: 0,
            display: "flex",
            backgroundColor: colors.card,
            borderTop: `1px solid ${colors.border}`,
          }}
        >
          {TABS.map(({ path, label, Icon }) => {
            const active = location === path;
            const tint = active ? colors.primary : colors.mutedForeground;
            return (
              <Link
                key={path}
                to={path}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                  paddingTop: 9,
                  paddingBottom: 9,
                  textDecoration: "none",
                  color: tint,
                }}
              >
                <Icon size={22} color={tint} strokeWidth={active ? 2.4 : 2} />
                <span style={{ fontFamily: Fonts.sansMedium, fontWeight: 500, fontSize: 11, color: tint }}>
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

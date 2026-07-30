import { Minus, Plus, Mic, MicOff, Trash2, CircleDot, Circle, LogOut, ShieldCheck, BookOpen, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";
import { colors, Fonts } from "../lib/theme";
import { useTuning } from "../lib/tuning-store";
import { STRETCH_STYLES } from "../lib/dsp/stretch";
import { isMicSupported } from "../lib/audio";
import { useAuth } from "../hooks/useAuth";
import { useUserRole } from "../hooks/useUserRole";

const ROLE_LABEL = { free: "무료", pro: "Pro", admin: "관리자" } as const;

export default function SettingsPage() {
  const { a4, setA4, styleId, setStyleId, resetAll, measurements } = useTuning();
  const measuredCount = Object.keys(measurements).length;
  const micOk = isMicSupported();
  const [, navigate] = useLocation();
  const { user, signOut } = useAuth();
  const { role, isAdmin } = useUserRole(user?.id);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 2, color: colors.mutedForeground }}>CONFIGURATION</span>
        <h1 style={{ fontFamily: Fonts.sansBold, fontWeight: 700, fontSize: 24, color: colors.foreground, margin: 0 }}>설정</h1>
      </div>

      {/* Account */}
      {user && (
        <div style={card()}>
          <span style={{ fontFamily: Fonts.sansMedium, fontWeight: 500, fontSize: 13, color: colors.mutedForeground }}>계정</span>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span
              style={{
                fontFamily: Fonts.sans,
                fontSize: 14,
                color: colors.foreground,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                flex: 1,
              }}
            >
              {user.email}
            </span>
            <span
              style={{
                padding: "3px 10px",
                borderRadius: 999,
                fontFamily: Fonts.mono,
                fontSize: 11,
                color: "#FFF",
                backgroundColor: role === "admin" ? colors.primary : role === "pro" ? colors.precision : colors.mutedForeground,
              }}
            >
              {ROLE_LABEL[role]}
            </span>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => navigate("/admin")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                paddingTop: 12,
                paddingBottom: 12,
                borderRadius: 12,
                cursor: "pointer",
                border: `1px solid ${colors.primary}`,
                backgroundColor: colors.cardElevated,
                color: colors.primary,
                fontFamily: Fonts.sansMedium,
                fontWeight: 500,
                fontSize: 14,
              }}
            >
              <ShieldCheck size={16} color={colors.primary} />
              관리자 대시보드
            </button>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingTop: 12,
              paddingBottom: 12,
              borderRadius: 12,
              cursor: "pointer",
              border: `1px solid ${colors.border}`,
              backgroundColor: "transparent",
              color: colors.foreground,
              fontFamily: Fonts.sansMedium,
              fontWeight: 500,
              fontSize: 14,
            }}
          >
            <LogOut size={16} color={colors.foreground} />
            로그아웃
          </button>
        </div>
      )}

      {/* 사용설명서 */}
      <button
        type="button"
        onClick={() => navigate("/help")}
        style={{
          ...card(),
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: colors.secondary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <BookOpen size={20} color={colors.primary} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: Fonts.sansMedium, fontWeight: 500, fontSize: 14, color: colors.foreground }}>사용설명서</span>
            <span style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.mutedForeground }}>스트로브 · 대표건반 · 조율 커브 사용법</span>
          </div>
        </div>
        <ChevronRight size={18} color={colors.mutedForeground} />
      </button>

      {/* 마이크 진단 (임시) */}
      <button
        type="button"
        onClick={() => navigate("/mic-check")}
        style={{
          ...card(),
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: colors.secondary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Mic size={20} color={colors.warn} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: Fonts.sansMedium, fontWeight: 500, fontSize: 14, color: colors.foreground }}>마이크 진단</span>
            <span style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.mutedForeground }}>마이크가 안 잡힐 때 원인 확인</span>
          </div>
        </div>
        <ChevronRight size={18} color={colors.mutedForeground} />
      </button>

      {/* A4 reference */}
      <div style={card()}>
        <span style={{ fontFamily: Fonts.sansMedium, fontWeight: 500, fontSize: 13, color: colors.mutedForeground }}>A4 기준 피치</span>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button type="button" onClick={() => setA4(Math.max(415, a4 - 1))} style={stepBtn()}>
            <Minus size={20} color={colors.foreground} />
          </button>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontFamily: Fonts.monoBold, fontWeight: 700, fontSize: 36, color: colors.foreground }}>{a4}</span>
            <span style={{ fontFamily: Fonts.mono, fontSize: 16, color: colors.mutedForeground }}>Hz</span>
          </div>
          <button type="button" onClick={() => setA4(Math.min(445, a4 + 1))} style={stepBtn()}>
            <Plus size={20} color={colors.foreground} />
          </button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[440, 441, 442, 443].map((v) => {
            const on = a4 === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setA4(v)}
                style={{
                  flex: 1,
                  paddingTop: 8,
                  paddingBottom: 8,
                  borderRadius: 8,
                  cursor: "pointer",
                  border: `1px solid ${on ? colors.primary : colors.border}`,
                  backgroundColor: on ? colors.primary : colors.secondary,
                  color: on ? colors.primaryForeground : colors.mutedForeground,
                  fontFamily: Fonts.mono,
                  fontSize: 13,
                }}
              >
                {v}
              </button>
            );
          })}
        </div>
      </div>

      {/* Octave style */}
      <div style={card()}>
        <span style={{ fontFamily: Fonts.sansMedium, fontWeight: 500, fontSize: 13, color: colors.mutedForeground }}>옥타브 스트레치 스타일</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {STRETCH_STYLES.map((s) => {
            const active = s.id === styleId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStyleId(s.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  borderRadius: 12,
                  cursor: "pointer",
                  textAlign: "left",
                  border: `1px solid ${active ? colors.primary : colors.border}`,
                  backgroundColor: active ? colors.cardElevated : "transparent",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: Fonts.sansBold, fontWeight: 700, fontSize: 15, color: colors.foreground }}>{s.label}</div>
                  <div style={{ fontFamily: Fonts.sans, fontSize: 12, marginTop: 2, lineHeight: "16px", color: colors.mutedForeground }}>
                    {s.description}
                  </div>
                </div>
                {active ? (
                  <CircleDot size={20} color={colors.primary} />
                ) : (
                  <Circle size={20} color={colors.mutedForeground} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mic status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: 14,
          borderRadius: 12,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.card,
        }}
      >
        {micOk ? <Mic size={18} color={colors.inTune} /> : <MicOff size={18} color={colors.warn} />}
        <span style={{ fontFamily: Fonts.sans, fontSize: 13, flex: 1, color: colors.foreground }}>
          {micOk ? "마이크 사용 가능" : "이 브라우저에서 마이크를 사용할 수 없습니다"}
        </span>
      </div>

      {/* Reset */}
      <button
        type="button"
        onClick={resetAll}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingTop: 14,
          paddingBottom: 14,
          borderRadius: 12,
          cursor: "pointer",
          border: `1px solid ${colors.off}`,
          backgroundColor: "transparent",
          color: colors.off,
          fontFamily: Fonts.sansMedium,
          fontWeight: 500,
          fontSize: 14,
        }}
      >
        <Trash2 size={16} color={colors.off} />
        측정 데이터 초기화 {measuredCount > 0 ? `(${measuredCount})` : ""}
      </button>

      <p style={{ fontFamily: Fonts.sans, fontSize: 11, textAlign: "center", lineHeight: "16px", color: colors.mutedForeground, marginTop: 4 }}>
        Piano Tuning Scope · Reyburn CyberTuner 방식의 인하모니시티 기반 조율 엔진
      </p>
    </div>
  );
}

function card(): React.CSSProperties {
  return {
    borderRadius: 16,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.card,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  };
}

function stepBtn(): React.CSSProperties {
  return {
    width: 48,
    height: 48,
    borderRadius: 12,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.secondary,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  };
}

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, RefreshCw, ShieldCheck, ChevronLeft } from "lucide-react";
import { colors, Fonts } from "../lib/theme";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";
import { useUserRole } from "../hooks/useUserRole";

interface UserInfo {
  user_id: string;
  email?: string;
  role: "free" | "pro" | "admin";
  created_at?: string;
}

const ROLES = ["free", "pro", "admin"] as const;
const ROLE_LABEL = { free: "무료", pro: "Pro", admin: "관리자" } as const;
const ROLE_COLOR = { free: colors.mutedForeground, pro: colors.precision, admin: colors.primary } as const;

export default function AdminPage() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useUserRole(user?.id);

  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  // 로그인/권한 가드: 미로그인은 로그인 화면, 관리자 아니면 설정으로
  useEffect(() => {
    if (authLoading) return;
    if (!user) navigate("/auth");
    else if (!isAdmin) navigate("/settings");
  }, [authLoading, user, isAdmin, navigate]);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await (supabase.rpc as any)("get_users_with_roles");
    if (data) setUsers(data as UserInfo[]);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) fetchUsers();
  }, [isAdmin]);

  const updateRole = async (userId: string, newRole: UserInfo["role"]) => {
    setUpdating(userId);
    await supabase.from("user_roles").upsert({ user_id: userId, role: newRole }, { onConflict: "user_id" });
    setUsers((prev) => prev.map((u) => (u.user_id === userId ? { ...u, role: newRole } : u)));
    setUpdating(null);
  };

  if (!isAdmin) return null;

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <button
        type="button"
        onClick={() => navigate("/settings")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: colors.mutedForeground,
          fontFamily: Fonts.sansMedium,
          fontSize: 13,
          padding: 0,
          alignSelf: "flex-start",
        }}
      >
        <ChevronLeft size={16} color={colors.mutedForeground} />
        설정
      </button>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 2, color: colors.mutedForeground }}>ADMIN</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldCheck size={22} color={colors.primary} />
          <h1 style={{ fontFamily: Fonts.sansBold, fontWeight: 700, fontSize: 24, color: colors.foreground, margin: 0 }}>
            관리자 대시보드
          </h1>
        </div>
        <span style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.mutedForeground }}>사용자 권한 관리</span>
      </div>

      <button
        type="button"
        onClick={fetchUsers}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          paddingTop: 10,
          paddingBottom: 10,
          borderRadius: 10,
          cursor: "pointer",
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.secondary,
          color: colors.foreground,
          fontFamily: Fonts.sansMedium,
          fontWeight: 500,
          fontSize: 13,
          alignSelf: "flex-start",
          paddingLeft: 14,
          paddingRight: 14,
        }}
      >
        <RefreshCw size={14} color={colors.foreground} />
        새로고침
      </button>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 40, color: colors.mutedForeground, fontFamily: Fonts.sans, fontSize: 14 }}>
          <Loader2 size={16} color={colors.mutedForeground} style={{ animation: "spin 1s linear infinite" }} />
          불러오는 중...
        </div>
      ) : users.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: colors.mutedForeground, fontFamily: Fonts.sans, fontSize: 14 }}>
          등록된 사용자가 없습니다.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {users.map((u) => (
            <div
              key={u.user_id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: 14,
                borderRadius: 14,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.card,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: Fonts.sansMedium,
                    fontWeight: 500,
                    fontSize: 13,
                    color: colors.foreground,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {u.email || u.user_id}
                </div>
                <span
                  style={{
                    display: "inline-block",
                    marginTop: 6,
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontFamily: Fonts.mono,
                    fontSize: 11,
                    color: "#FFF",
                    backgroundColor: ROLE_COLOR[u.role],
                  }}
                >
                  {ROLE_LABEL[u.role]}
                </span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {ROLES.map((r) => {
                  const active = u.role === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => updateRole(u.user_id, r)}
                      disabled={active || updating === u.user_id}
                      style={{
                        paddingTop: 6,
                        paddingBottom: 6,
                        paddingLeft: 10,
                        paddingRight: 10,
                        borderRadius: 8,
                        cursor: active ? "default" : "pointer",
                        border: `1px solid ${active ? colors.primary : colors.border}`,
                        backgroundColor: active ? colors.primary : "transparent",
                        color: active ? colors.primaryForeground : colors.mutedForeground,
                        fontFamily: Fonts.sans,
                        fontSize: 12,
                        opacity: updating === u.user_id ? 0.5 : 1,
                      }}
                    >
                      {ROLE_LABEL[r]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

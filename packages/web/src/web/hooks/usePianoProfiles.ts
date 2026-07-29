/**
 * usePianoProfiles.ts
 * "피아노별 저장 프로필" — 세션(조율 1회 작업단위)과 별개로, 같은 물리적 피아노에 대해
 * 여러 세션에 걸쳐 인하모니시티(B) 학습 데이터를 영구적으로 누적하기 위한 저장소.
 *
 * - 로그인 시: Supabase 클라우드 저장 시도 (piano_profiles 테이블이 없으면 조용히 로컬로만 폴백)
 * - 비로그인/테이블 없음: localStorage
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PianoScaleEntry {
  keyIndex: number;
  B: number;
  confidence: number;
  nPartialsUsed: number;
  measuredAt: number;
}

export interface PianoProfile {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  scale: Record<number, PianoScaleEntry>; // keyIndex -> 학습된 인하모니시티 데이터
}

const STORAGE_KEY = "piano_profiles_v1";
const MAX_PROFILES = 30;

function loadLocal(): PianoProfile[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function saveLocal(profiles: PianoProfile[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export function usePianoProfiles(userId?: string | null) {
  const [profiles, setProfiles] = useState<PianoProfile[]>(() => loadLocal());
  const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
    const p = loadLocal();
    return p[0]?.id ?? null;
  });
  const cloudAvailableRef = useRef(true); // piano_profiles 테이블이 없으면 false로 내려서 이후 시도 스킵

  const activeProfile = profiles.find(p => p.id === activeProfileId) ?? null;

  // 비로그인: 로컬 저장
  useEffect(() => { if (!userId) saveLocal(profiles); }, [profiles, userId]);

  // 로그인 시 클라우드에서 불러오기 (테이블 없으면 조용히 로컬 폴백)
  useEffect(() => {
    if (!userId) { setProfiles(loadLocal()); return; }
    supabase.from("piano_profiles").select("*").eq("user_id", userId)
      .order("updated_at", { ascending: false }).limit(MAX_PROFILES)
      .then(({ data, error }) => {
        if (error) { cloudAvailableRef.current = false; return; } // 테이블 없음 등 → 로컬만 사용
        if (data && data.length > 0) {
          const loaded: PianoProfile[] = data.map((row: any) => ({
            id: row.id, name: row.name,
            createdAt: new Date(row.created_at).getTime(),
            updatedAt: new Date(row.updated_at).getTime(),
            scale: (row.scale as unknown as Record<number, PianoScaleEntry>) || {},
          }));
          setProfiles(loaded);
          setActiveProfileId(loaded[0]?.id ?? null);
        }
      });
  }, [userId]);

  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncToCloud = useCallback((updated: PianoProfile[], changedId: string) => {
    if (!userId || !cloudAvailableRef.current) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(async () => {
      const p = updated.find(x => x.id === changedId);
      if (!p) return;
      const { error } = await supabase.from("piano_profiles").upsert({
        id: p.id, user_id: userId, name: p.name,
        scale: p.scale as unknown as Record<string, unknown>, updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (error) cloudAvailableRef.current = false; // 테이블 없으면 다음부턴 시도 안 함
    }, 800);
  }, [userId]);

  const createProfile = useCallback((name?: string) => {
    const now = Date.now();
    const profile: PianoProfile = {
      id: `piano_${now}_${Math.random().toString(36).slice(2, 8)}`,
      name: name || `피아노 ${new Date(now).toLocaleDateString("ko-KR")}`,
      createdAt: now, updatedAt: now, scale: {},
    };
    setProfiles(prev => {
      const u = [profile, ...prev].slice(0, MAX_PROFILES);
      if (userId) syncToCloud(u, profile.id);
      return u;
    });
    setActiveProfileId(profile.id);
    return profile;
  }, [userId, syncToCloud]);

  const deleteProfile = useCallback(async (id: string) => {
    setProfiles(prev => {
      const u = prev.filter(p => p.id !== id);
      if (!userId) saveLocal(u);
      return u;
    });
    setActiveProfileId(prev => (prev === id ? null : prev));
    if (userId && cloudAvailableRef.current) {
      await supabase.from("piano_profiles").delete().eq("id", id).eq("user_id", userId);
    }
  }, [userId]);

  const renameProfile = useCallback((id: string, name: string) => {
    setProfiles(prev => {
      const u = prev.map(p => (p.id === id ? { ...p, name, updatedAt: Date.now() } : p));
      if (!userId) saveLocal(u);
      else syncToCloud(u, id);
      return u;
    });
  }, [userId, syncToCloud]);

  // 이 프로필의 특정 건반 B값 학습/갱신 (매 확정마다 호출)
  const updateProfileScale = useCallback((
    profileId: string, keyIndex: number, B: number, confidence: number, nPartialsUsed: number
  ) => {
    setProfiles(prev => {
      const u = prev.map(p => {
        if (p.id !== profileId) return p;
        const entry: PianoScaleEntry = { keyIndex, B, confidence, nPartialsUsed, measuredAt: Date.now() };
        return { ...p, updatedAt: Date.now(), scale: { ...p.scale, [keyIndex]: entry } };
      });
      if (!userId) saveLocal(u);
      else syncToCloud(u, profileId);
      return u;
    });
  }, [userId, syncToCloud]);

  return {
    profiles, activeProfile, activeProfileId, setActiveProfileId,
    createProfile, deleteProfile, renameProfile, updateProfileScale,
  };
}

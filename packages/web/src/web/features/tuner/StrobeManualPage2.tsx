/**
 * StrobeManualPage.tsx — 수동 조율 모드 (v3, PT-100/PT-A1 화면 재현)
 *
 * - 상단: PT-100 스타일 스트로브 바 + 5열 LCD (OCT-NOTE/KEY No./CENT/CURVE/PITCH)
 * - 키패드: 다이얼식 음 선택 (숫자=음이름, OCT=옥타브, AUTO=자동판별, RES=리셋)
 * - AUTO 모드는 usePitchDetector(자동탭과 동일 엔진)를 같은 마이크로 공유해서 현재 음 자동 추적
 * - 그래프/세션/내보내기는 하단으로 이동
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast as sonnerToast } from "sonner";
import { cn } from "@/lib/utils";
import { PIANO_KEYS, usePitchDetector } from "@/hooks/usePitchDetector";
import { useCompositeTunerV2, CompositeResult } from "@/hooks/useCompositeTunerV2";
import { median } from "@/lib/tuner/pitchEngine";
import { useTuningSession } from "@/hooks/useTuningSession";
import { usePianoProfiles } from "@/hooks/usePianoProfiles";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useManualSequence } from "@/features/tuner/manual/useManualSequence";
import SectionTabs from "@/features/tuner/manual/SectionTabs";
import TargetNoteBar from "@/features/tuner/manual/TargetNoteBar";
import PTKeypad from "@/features/tuner/manual/PTKeypad";
import PTStrobePanel from "@/components/tuner/PTStrobePanel";
import SpectrumGraph from "@/components/tuner/SpectrumGraph";
import TuningCurveChart from "@/components/tuner/TuningCurveChart";
import { exportToPdf, exportToImage } from "@/lib/tuner/exportPdf";
import { predictB, anomalyRatio, type BPoint } from "@/features/tuner/manual/scaleLearning";
import {
  weightedRepeatAverage, pushSample, sampleWeight,
  REPEAT_MIN_SAMPLES, CLUSTER_TOLERANCE,
  type CentSample, type RepeatAverageResult,
} from "@/features/tuner/manual/repeatAverage";

const toast = Object.assign(
  (msg: string, opts?: { duration?: number }) => sonnerToast(msg, opts),
  {
    success: (msg: string, opts?: { duration?: number }) => sonnerToast.success(msg, opts),
    error:   (msg: string) => sonnerToast.error(msg),
  }
);

// 음이름(자연음) → 반음 인덱스 (C=0 기준)
const NATURAL_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// letter + octave + shift(#/b) → keyIndex (0~87), 범위 밖이면 null
function noteToKeyIndex(letter: string, octave: number, shift: number): number | null {
  const base = NATURAL_SEMITONE[letter];
  if (base === undefined) return null;
  const midi = (octave + 1) * 12 + base + shift;
  const keyIndex = midi - 21;
  if (keyIndex < 0 || keyIndex > 87) return null;
  return keyIndex;
}

export default function StrobeManualPage2() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { isPro } = useUserRole(user?.id);
  const [, navigate] = useLocation();

  // 로그아웃 상태로 직접 진입/전환되면 로그인 화면(랜딩)으로 이동
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user, navigate]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    navigate("/auth");
  }, [signOut, navigate]);

  const seq = useManualSequence();

  const {
    sessions, activeSession, activeSessionId, setActiveSessionId,
    createSession, recordMeasurement, undoLastMeasurement, undoStack,
    chartData, measuredCount,
  } = useTuningSession(null);

  // ── 피아노별 저장 프로필: 세션(1회 조율)과 별개로, 같은 피아노는 여러 세션에
  // 걸쳐 인하모니시티(B) 학습 데이터가 영구적으로 이어지도록 함 ──
  const {
    profiles, activeProfile, activeProfileId, setActiveProfileId,
    createProfile, renameProfile, updateProfileScale,
  } = usePianoProfiles(null);
  const profileAutoCreatedRef = useRef(false);
  useEffect(() => {
    if (!profileAutoCreatedRef.current && profiles.length === 0) {
      profileAutoCreatedRef.current = true;
      createProfile("피아노 1");
    }
  }, [profiles.length, createProfile]);

  const activeSessionIdRef = useRef(activeSessionId);
  useEffect(() => { activeSessionIdRef.current = activeSessionId; }, [activeSessionId]);

  // ── 피아노 프로필 누적학습: "이 피아노"에 대해 여러 세션에 걸쳐 쌓인 인하모니시티(B)를
  // 인접 건반 참고용으로 씀 (Verituner류 ETD의 "피아노별 스케일 학습"과 같은 개념).
  // 프로필이 아직 없으면(과도기) 현재 세션 자체 측정값으로 폴백. ──
  const measuredBPoints: BPoint[] = useMemo(() => {
    const pts: BPoint[] = [];
    if (activeProfile) {
      for (const entry of Object.values(activeProfile.scale)) {
        if (entry.B > 0) {
          pts.push({ keyIndex: entry.keyIndex, B: entry.B, confidence: entry.confidence });
        }
      }
      return pts;
    }
    if (activeSession) {
      for (const [k, v] of Object.entries(activeSession.measurements)) {
        if (v.inharmonicityB !== undefined && v.inharmonicityB !== null && v.inharmonicityB > 0) {
          pts.push({
            keyIndex: Number(k),
            B: v.inharmonicityB,
            confidence: v.inharmonicityConfidence ?? 0.6, // 옛 데이터(신뢰도 없음)는 중간값 취급
          });
        }
      }
    }
    return pts;
  }, [activeProfile, activeSession]);

  // 엔진 루프(rAF 클로저)는 최신 렌더를 못 보므로 ref로 최신값 유지
  const measuredBPointsRef = useRef<BPoint[]>([]);
  useEffect(() => { measuredBPointsRef.current = measuredBPoints; }, [measuredBPoints]);

  // 타겟 건반 근방의 학습 데이터로 "이 음의 예상 B" 산출
  // (로그공간 가중회귀 + 브레이크포인트 감지 + 신뢰도 가중 — scaleLearning.ts)
  const getBHint = useCallback((keyIndex: number): number | undefined => {
    return predictB(measuredBPointsRef.current, keyIndex);
  }, []);

  const learnedKeyCount = measuredBPoints.length;
  const currentBHint = getBHint(seq.targetKeyIndex);

  // ── 이례적 배음 패턴 감지 (예측 B vs 실측 B가 크게 다른 경우) ──
  const ANOMALY_THRESHOLD = 0.4; // 40% 이상 벗어나면 알림
  const [anomalyCount, setAnomalyCount] = useState(0);

  // ── 마이크는 usePitchDetector가 소유 (자동판별용, 자동탭과 동일 엔진) ──
  const pitchDetector = usePitchDetector();

  // ── pendingCents: 엔진이 안정값(finalCents)을 내면 handleEngineConfirmed에서 직접 갱신 ──
  const [pendingCents, setPendingCents] = useState<number | null>(null);

  // ── 스트로브 정밀 엔진 — 복합엔진(YIN+Goertzel+HPS+TWM) + 같은 analyser 공유 ──
  const [lastEngineMeta, setLastEngineMeta] = useState<CompositeResult | null>(null);
  // ── 반복 측정 가중평균 ────────────────────────────────────────────
  // 같은 건반을 3회 이상 타건하면, 서로 비슷한 센트 범위(중앙값 ±4¢)에 모인
  // 회차만 골라 신뢰도 가중평균을 내고 그 값을 조율값으로 자동 입력한다.
  // 사용자가 +/- 로 직접 만진 뒤에는 자동 입력을 멈춘다(수동 우선).
  const samplesRef = useRef<CentSample[]>([]);
  const [repeatAvg, setRepeatAvg] = useState<RepeatAverageResult | null>(null);
  const [strikeCount, setStrikeCount] = useState(0);
  const userTouchedRef = useRef(false);

  const handleEngineConfirmed = useCallback((r: CompositeResult) => {
    if (r.finalCents === null) return;
    setPendingCents(r.finalCents);
    setLastEngineMeta(r);
  }, []);

  const {
    result: engineResult,
    startListening: startStrobeLoop,
    stopListening: stopStrobeLoop,
    error: engineError,
  } = useCompositeTunerV2(seq.targetKeyIndex, handleEngineConfirmed, pitchDetector.analyserRef, getBHint);

  // 실시간 흐름용 — 교차검증 전이라도 즉시 표시 (YIN 우선, 없으면 Goertzel)
  const liveCentsRaw   = engineResult?.yinCents ?? engineResult?.goertzelCents ?? null;
  const strobeCents    = pendingCents; // 자동 확정된 값 (하위 호환용 별칭)
  const isCapturing    = engineResult?.isCapturing ?? false;
  const captureProgress = engineResult?.captureProgress ?? 0;
  const currentNote     = engineResult ? `${engineResult.noteName}${engineResult.octave}` : null;
  const strobeKeyIndex  = engineResult?.keyIndex ?? null;
  const analysisFreq    = engineResult?.frequency ?? null;
  const partial         = engineResult?.partial ?? lastEngineMeta?.partial ?? null;

  const isListening = pitchDetector.isListening;
  useWakeLock(isListening);

  // ── 스무딩 + 유지: 복합엔진은 프레임마다 값이 흔들려서 영점(null-meter)이 절대 안 멈추고,
  // 소리가 끊기면 값이 사라져서 +/- 로 확인할 대상이 없어짐 → 200ms 스무딩 + 무음에도 마지막 값 유지
  const SMOOTH_WINDOW_MS = 200;
  const smoothWindowRef = useRef<Array<{ t: number; c: number }>>([]);
  const [liveCents, setLiveCents] = useState<number | null>(null);

  useEffect(() => {
    if (!isListening) {
      // 마이크 자체를 끈 경우에만 초기화
      smoothWindowRef.current = [];
      setLiveCents(null);
      return;
    }
    if (liveCentsRaw === null) {
      // 무음 구간 — 마지막 값을 그대로 유지 (+/- 로 계속 확인 가능하도록)
      return;
    }
    const now = Date.now();
    smoothWindowRef.current.push({ t: now, c: liveCentsRaw });
    smoothWindowRef.current = smoothWindowRef.current.filter(s => now - s.t <= SMOOTH_WINDOW_MS);
    const med = Math.round(median(smoothWindowRef.current.map(s => s.c)) * 10) / 10;
    if (isFinite(med)) setLiveCents(med);
  }, [liveCentsRaw, isListening]);

  // ── 타건 감지 → 회차별 샘플 누적 ────────────────────────────────
  // 엔진의 finalCents는 확정 조건이 엄격해서 타건마다 올라오지 않는다.
  // 그래서 화면에 실제로 흐르고 있는 liveCentsRaw를 직접 보고 "이번 타건의 값"을
  // 뽑는다: 값이 STRIKE_WINDOW개 연속으로 STRIKE_MAX_SD 안에 안정되면 그 중앙값을
  // 한 회차로 기록하고, 무음(300ms) 또는 쿨다운(1.5s) 뒤에 다음 회차를 받는다.
  const STRIKE_WINDOW = 6;      // 안정 판정에 쓰는 연속 프레임 수
  const STRIKE_MAX_SD = 6.0;    // 이 표준편차 안이면 "안정된 타건" (실측 신호는 원시 YIN이라 흔들림이 큼)
  const STRIKE_MIN_FRAMES = 4;  // 폴백 기록에 필요한 최소 프레임
  const STRIKE_TIMEOUT_MS = 600;// 안정 판정이 안 나도 이 시간 소리가 이어지면 그 구간 중앙값을 기록
  const REARM_SILENCE_MS = 250;
  const REARM_COOLDOWN_MS = 1200;

  const strikeArmedRef = useRef(true);
  const strikeWinRef = useRef<number[]>([]);
  const silenceSinceRef = useRef<number | null>(null);
  const lastSampleAtRef = useRef(0);
  const winStartRef = useRef<number | null>(null);
  // 진단용 — 지금 신호가 얼마나 흔들리는지 화면에 보여준다
  const [strikeDbg, setStrikeDbg] = useState<{ n: number; sd: number } | null>(null);

  useEffect(() => {
    if (!isListening) {
      strikeArmedRef.current = true;
      strikeWinRef.current = [];
      winStartRef.current = null;
      silenceSinceRef.current = null;
      return;
    }
    const now = Date.now();

    // 한 회차를 확정 기록한다 (세 경로에서 공통 사용)
    const record = (win: number[]) => {
      const cents = Math.round(median(win) * 10) / 10;
      strikeArmedRef.current = false;
      lastSampleAtRef.current = now;
      strikeWinRef.current = [];
      winStartRef.current = null;

      samplesRef.current = pushSample(samplesRef.current, {
        cents,
        weight: sampleWeight(engineResult?.crossValid ?? false, engineResult?.inharmonicityConfidence ?? null),
        t: now,
      });
      setStrikeCount(samplesRef.current.length);

      const avg = weightedRepeatAverage(samplesRef.current);
      setRepeatAvg(avg);
      // 3회 이상 비슷한 범위로 모이면 조율값 칸에 가중평균을 자동 입력
      if (avg && !userTouchedRef.current) setTargetOffset(avg.value);
    };

    if (liveCentsRaw === null) {
      // 소리가 끝났다 — 경로 3: 아직 기록 못 한 구간이 있으면 여기서 확정한다.
      // 흔들림이 커서 안정 판정이 안 났고 길이도 짧았던 타건을 놓치지 않기 위함.
      if (strikeArmedRef.current && strikeWinRef.current.length >= STRIKE_MIN_FRAMES) {
        record(strikeWinRef.current);
      }
      if (silenceSinceRef.current === null) silenceSinceRef.current = now;
      else if (now - silenceSinceRef.current >= REARM_SILENCE_MS) {
        strikeArmedRef.current = true;
        strikeWinRef.current = [];
        winStartRef.current = null;
      }
      return;
    }
    silenceSinceRef.current = null;

    // 완전 무음이 안 와도 쿨다운이 지나면 다음 회차를 받는다 (연타 대응)
    if (!strikeArmedRef.current && now - lastSampleAtRef.current >= REARM_COOLDOWN_MS) {
      strikeArmedRef.current = true;
      strikeWinRef.current = [];
      winStartRef.current = null;
    }
    if (!strikeArmedRef.current) return;

    const win = strikeWinRef.current;
    if (win.length === 0) winStartRef.current = now;
    win.push(liveCentsRaw);
    if (win.length > STRIKE_WINDOW) win.shift();

    const mean = win.reduce((a, b) => a + b, 0) / win.length;
    const sd = Math.sqrt(win.reduce((a, b) => a + (b - mean) ** 2, 0) / win.length);
    setStrikeDbg({ n: win.length, sd: Math.round(sd * 10) / 10 });

    // 경로 1: 값이 충분히 안정됨 → 즉시 기록
    const stableHit = win.length >= STRIKE_WINDOW && sd <= STRIKE_MAX_SD;
    // 경로 2: 흔들림이 커도 소리가 STRIKE_TIMEOUT_MS 이상 이어지면 그 구간 중앙값을 기록
    const timedOut =
      win.length >= STRIKE_MIN_FRAMES &&
      winStartRef.current !== null &&
      now - winStartRef.current >= STRIKE_TIMEOUT_MS;
    if (!stableHit && !timedOut) return;

    record(win);
  }, [liveCentsRaw, isListening, engineResult]);

  // ── AUTO 모드: 현재 연주 중인 음을 자동 추적해서 targetKeyIndex 갱신 ──
  const [autoMode, setAutoMode] = useState(false);
  const lastAutoKeyRef = useRef<number | null>(null);
  useEffect(() => {
    if (!autoMode) { lastAutoKeyRef.current = null; return; }
    if (!pitchDetector.currentPitch) return;
    const ki = pitchDetector.currentPitch.keyIndex;
    if (lastAutoKeyRef.current === ki) return;
    lastAutoKeyRef.current = ki;
    seq.jumpTo(ki);
  }, [autoMode, pitchDetector.currentPitch, seq]);

  // ── targetOffset: 영점(null-meter) 방식 ──────────────────────────
  // 건반 치면 화면엔 0이 뜨고, 실제로는 스트로브가 원시 오차만큼 빠르게 흐름.
  // +/-, -10/+10으로 오프셋을 눌러서 스트로브가 멈추는 지점 = 그 음의 실제 cents.
  // 저장되는 값(pendingCents)은 원음 raw 그대로 — 화면 표시만 분리.
  const [targetOffset, setTargetOffset] = useState(0);

  // 건반 바뀌면 pendingCents + targetOffset + 스무딩 윈도우 리셋
  useEffect(() => {
    setPendingCents(null);
    setTargetOffset(0);
    smoothWindowRef.current = [];
    setLiveCents(null);
    // 건반이 바뀌면 반복 측정 누적도 새로 시작
    samplesRef.current = [];
    setRepeatAvg(null);
    setStrikeCount(0);
    userTouchedRef.current = false;
    strikeArmedRef.current = true;
    strikeWinRef.current = [];
    winStartRef.current = null;
  }, [seq.targetKeyIndex]);

  const handleReset = useCallback(() => {
    setPendingCents(null);
    setTargetOffset(0);
    samplesRef.current = [];
    setRepeatAvg(null);
    setStrikeCount(0);
    userTouchedRef.current = false;
    strikeArmedRef.current = true;
    strikeWinRef.current = [];
    winStartRef.current = null;
  }, []);

  const handleNudge = useCallback((delta: number) => {
    userTouchedRef.current = true; // 손으로 만진 순간부터 평균 자동입력 중단
    setTargetOffset(prev => Math.round((prev + delta) * 10) / 10);
  }, []);

  // 스트로브를 움직이는 값 = 원시 오차 - 오프셋 (0에 가까워질수록 스트로브 정지)
  const strobeDriverCents = liveCents !== null ? Math.round((liveCents - targetOffset) * 10) / 10 : null;
  const strobeLocked = strobeDriverCents !== null && Math.abs(strobeDriverCents) <= 0.5; // 반올림해서 0일 때만 LOCKED
  // 화면/LCD에 표시되는 숫자 = 내가 눌러서 맞춘 오프셋값 (원시값 아님)
  const displayReadout = targetOffset;

  const handleJumpToNote = useCallback((letter: string, octave: number, shift: number) => {
    const ki = noteToKeyIndex(letter, octave, shift);
    if (ki === null) { toast.error("피아노 음역을 벗어났습니다 (A0~C8)"); return; }
    setAutoMode(false);
    seq.jumpTo(ki);
  }, [seq]);

  // ── 세션 ─────────────────────────────────────────────────────────
  const [showSessionList, setShowSessionList] = useState(false);
  const [showProfileList, setShowProfileList] = useState(false);
  const [showLearningPanel, setShowLearningPanel] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [userName, setUserName] = useState("");

  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (activeSessionIdRef.current) return activeSessionIdRef.current;
    const s = await createSession();
    if (s) { activeSessionIdRef.current = s.id; return s.id; }
    return null;
  }, [createSession]);

  // ── 확정 ─────────────────────────────────────────────────────────
  // 매 프레임 갱신되는 engineResult에서 최신 B/신뢰도값을 계속 추적 (엔진 자동확정을 안 기다려도 확정 시점에 바로 씀)
  const latestBRef = useRef<{ keyIndex: number; B: number | null; confidence: number | null; nPartials: number | null }>(
    { keyIndex: -1, B: null, confidence: null, nPartials: null }
  );
  useEffect(() => {
    if (engineResult) {
      latestBRef.current = {
        keyIndex: engineResult.keyIndex,
        B: engineResult.inharmonicityB,
        confidence: engineResult.inharmonicityConfidence,
        nPartials: engineResult.nPartialsUsed,
      };
    }
  }, [engineResult]);

  const handleConfirm = useCallback(async () => {
    if (liveCents === null) return;
    const finalValue = displayReadout; // 내가 +/- 로 맞춘 값을 그대로 확정
    await ensureSession();
    const ki = seq.targetKeyIndex;
    const latest = latestBRef.current.keyIndex === ki ? latestBRef.current : null;
    const bAtConfirm = latest?.B ?? undefined;

    // ── 이례적 배음 패턴 감지: 인접음 예측 B와 실측 B가 크게 다르면 부드럽게 알림 + 기록 ──
    if (bAtConfirm !== undefined) {
      const predicted = getBHint(ki);
      if (predicted !== undefined) {
        const ratio = anomalyRatio(predicted, bAtConfirm);
        if (ratio > ANOMALY_THRESHOLD) {
          setAnomalyCount(c => c + 1);
          toast(
            `⚠ 건반 ${ki + 1}: 예상과 다른 배음 패턴 감지 (예상 B ${predicted.toFixed(5)} vs 측정 B ${bAtConfirm.toFixed(5)})`,
            { duration: 3000 }
          );
        }
      }
    }

    // 확정 시점 엔진의 인하모니시티(B)/신뢰도/사용배음수도 같이 저장 → 세션 내 누적학습(인접음 참조)에 사용
    recordMeasurement(
      ki, finalValue, PIANO_KEYS[ki].freq,
      bAtConfirm ?? undefined,
      latest?.confidence ?? undefined,
      latest?.nPartials ?? undefined
    );
    // 피아노 프로필에도 같이 저장 → 다음에 이 피아노를 다시 조율할 때(새 세션)도 이어서 활용
    if (activeProfileId && bAtConfirm !== undefined) {
      updateProfileScale(activeProfileId, ki, bAtConfirm, latest?.confidence ?? 0.5, latest?.nPartials ?? 0);
    }
    toast.success(
      `${PIANO_KEYS[ki].noteName}${PIANO_KEYS[ki].octave} (건반 ${ki + 1}) → ${finalValue > 0 ? "+" : ""}${finalValue.toFixed(1)}¢`,
      { duration: 1800 }
    );
    setPendingCents(null);
    setTargetOffset(0);
    samplesRef.current = [];
    setRepeatAvg(null);
    setStrikeCount(0);
    userTouchedRef.current = false;
    strikeArmedRef.current = true;
    strikeWinRef.current = [];
    winStartRef.current = null;
    seq.next();
  }, [liveCents, displayReadout, seq, ensureSession, recordMeasurement, getBHint, activeProfileId, updateProfileScale]);

  // ── 마이크 토글 (usePitchDetector가 실제 마이크 소유, 스트로브는 같은 analyser 사용) ──
  const toggleListening = async () => {
    if (isListening) {
      pitchDetector.stopListening();
      stopStrobeLoop();
    } else {
      if (!activeSessionIdRef.current) {
        const s = await createSession();
        if (s) activeSessionIdRef.current = s.id;
      }
      await pitchDetector.startListening();
      startStrobeLoop();
    }
  };

  const targetKey = PIANO_KEYS[seq.targetKeyIndex];

  // cents 색상 — 남은 오차(strobeDriverCents)가 얼마나 0에 가까운지로 판단
  const absC = strobeDriverCents !== null ? Math.abs(strobeDriverCents) : null;
  const centsColor = absC === null
    ? "text-muted-foreground/30"
    : strobeLocked ? "text-in-tune"
    : absC <= 8 ? "text-warn"
    : "text-off";

  return (
    <div className="min-h-screen bg-muted/50 flex flex-col" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>

      {/* 헤더 */}
      <header
        className="bg-card border-b border-border px-4 pb-3 pt-3 flex items-center justify-between shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
              <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground leading-tight">시험용(신버전)</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            <Link href="/manual" className="px-2.5 py-1 text-[11px] font-medium rounded-md text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap leading-none">시험용(구버전)</Link>
            <span                     className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-card text-primary shadow-sm whitespace-nowrap leading-none">시험용(신버전)</span>
          </nav>
          <button
            onClick={handleSignOut}
            title="로그아웃"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-off hover:bg-off/10 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      <main
        className="flex-1 container max-w-3xl mx-auto px-4 pt-4 flex flex-col gap-3"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >

        {/* ── PT-100 스트로브 + 키패드 (하나의 기기 패널로 통합) ── */}
        <div className="rounded-2xl overflow-hidden border border-black/60 shadow-lg">
          <PTStrobePanel
            detectedCents={strobeDriverCents}
            stableCents={null}
            readoutCents={displayReadout}
            isActive={isListening}
            noteName={targetKey.noteName}
            octave={targetKey.octave}
            keyNumber={targetKey.keyNumber}
            curveLabel="FLAT"
            pitchA4={440}
          />
          <PTKeypad
            onJumpToNote={handleJumpToNote}
            onAutoToggle={setAutoMode}
            onReset={handleReset}
            onNudge={handleNudge}
            autoMode={autoMode}
          />
        </div>

        {/* ── 이전/다음(절반) + 구간 전환(절반) ── */}
        <div className="grid grid-cols-2 gap-2 items-stretch">
          <TargetNoteBar
            keyIndex={seq.targetKeyIndex}
            indexInOrder={seq.indexInOrder}
            total={seq.total}
            canPrev={seq.canPrev}
            canNext={seq.canNext}
            onPrev={() => { setAutoMode(false); seq.prev(); }}
            onNext={() => { setAutoMode(false); seq.next(); }}
            compact
          />
          <SectionTabs section={seq.section} onChange={seq.setSection} compact />
        </div>


        {/* ── 확정 패널 (큰 숫자 = 내가 맞춘 오프셋 + 상태 + 확정/리셋) ── */}
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 pt-2 pb-2 flex items-end justify-between">
            <div>
              <span
                className={cn("text-5xl font-black tabular-nums transition-colors duration-100", centsColor)}
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {`${displayReadout > 0 ? "+" : ""}${displayReadout.toFixed(1)}`}
              </span>
              <span className="text-lg text-muted-foreground ml-1">¢</span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={cn(
                "text-xs font-semibold px-2 py-0.5 rounded-full",
                strobeLocked
                  ? "bg-in-tune/15 text-in-tune"
                  : liveCents !== null
                  ? "bg-warn/15 text-warn"
                  : "bg-muted text-muted-foreground"
              )}>
                {strobeLocked ? "● LOCKED (정지)"
                  : liveCents !== null ? "● 스트로브 흐르는 중"
                  : "대기 중"}
              </span>
              <button
                onClick={() => {
                  // 3회 이상 모여 가중평균이 나왔으면 그 값을, 아니면 실시간 예측값을 반영
                  const v = repeatAvg ? repeatAvg.value : liveCents;
                  if (v === null) return;
                  userTouchedRef.current = true;
                  setTargetOffset(Math.round(v * 10) / 10);
                }}
                disabled={liveCents === null && repeatAvg === null}
                className={cn(
                  "flex items-center gap-1 text-right rounded-lg px-1.5 py-0.5 transition-colors",
                  (liveCents !== null || repeatAvg !== null) ? "hover:bg-precision/10 cursor-pointer" : "cursor-not-allowed"
                )}
                title={repeatAvg
                  ? `${repeatAvg.used}회 가중평균 (편차 ${repeatAvg.spread.toFixed(1)}¢) — 눌러서 반영`
                  : "눌러서 이 값을 바로 반영"}
              >
                <span className="text-[9px] text-muted-foreground/60 leading-tight">
                  {repeatAvg
                    ? <>{repeatAvg.used}회 평균<br />자동 반영됨</>
                    : <>예측값<br />클릭 시 반영</>}
                </span>
                <span
                  className={cn(
                    "text-xs font-bold tabular-nums",
                    repeatAvg ? "text-in-tune"
                      : liveCents !== null ? "text-precision"
                      : "text-muted-foreground/40"
                  )}
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {repeatAvg
                    ? `${repeatAvg.value > 0 ? "+" : ""}${repeatAvg.value.toFixed(1)}¢`
                    : liveCents !== null ? `${liveCents > 0 ? "+" : ""}${liveCents.toFixed(1)}¢` : "—"}
                </span>
              </button>
              {/* 타건 회차 / 평균 성립 여부 */}
              {isListening && (
                <span className={cn(
                  "text-[9px] font-bold px-1.5 py-0.5 rounded-full tabular-nums",
                  repeatAvg ? "bg-in-tune/10 text-in-tune" : "bg-precision/10 text-precision"
                )}>
                  {repeatAvg
                    ? `타건 ${repeatAvg.total}회 · 평균 ${repeatAvg.used}회 · 편차 ${repeatAvg.spread.toFixed(1)}¢`
                    : `타건 ${strikeCount}/${REPEAT_MIN_SAMPLES}회 · ±${CLUSTER_TOLERANCE}¢ 모이면 평균${strikeDbg ? ` · 흔들림 ${strikeDbg.sd}¢(${strikeDbg.n})` : ""}`}
                </span>
              )}
              {autoMode && (
                <span className="text-[10px] font-bold text-in-tune bg-in-tune/10 px-1.5 py-0.5 rounded-full">AUTO 추적 중</span>
              )}
            </div>
          </div>

          {isCapturing && (
            <div className="px-5 pb-2">
              <div className="w-full bg-muted rounded-full h-1">
                <div className="bg-warn h-1 rounded-full transition-all duration-100" style={{ width: `${captureProgress * 100}%` }} />
              </div>
            </div>
          )}

          <div className="px-4 py-3 border-t border-border/60 flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={liveCents === null}
              className={cn(
                "flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.98]",
                liveCents !== null
                  ? "bg-in-tune text-white hover:bg-in-tune/90 shadow-sm"
                  : "bg-muted text-muted-foreground/50 cursor-not-allowed"
              )}
            >
              {liveCents !== null
                ? `✓ 확정  ${displayReadout > 0 ? "+" : ""}${displayReadout.toFixed(1)}¢`
                : "측정 후 확정"}
            </button>
          </div>
        </div>

        {/* 마이크 버튼 */}
        <button
          onClick={isPro ? toggleListening : undefined}
          disabled={!isPro}
          title={!isPro ? "Pro 이상 등급에서 사용 가능합니다" : undefined}
          className={cn(
            "w-full py-2.5 rounded-xl font-bold text-sm transition-all",
            isPro && "active:scale-[0.98]",
            !isPro
              ? "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
              : isListening
              ? "bg-off text-white hover:bg-off/90"
              : "bg-primary text-white hover:bg-primary/90"
          )}
        >
          {!isPro ? "🔒 마이크 켜기"
            : isListening ? "■ 마이크 끄기" : "● 마이크 켜기"}
        </button>

        {!isPro && (
          <p className="text-xs text-center text-muted-foreground">Pro 등급으로 변경하면 마이크를 사용할 수 있습니다.</p>
        )}

        {(engineError || pitchDetector.error) && (
          <div className="px-3 py-2 rounded-lg bg-off/10 border border-off/40 text-xs text-off">
            {engineError || pitchDetector.error}
          </div>
        )}

        {/* 되돌리기 */}
        {undoStack.length > 0 && (
          <button
            onClick={() => undoLastMeasurement()}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
          >
            ↩ 마지막 측정 취소
          </button>
        )}

        {/* 조율 커브 */}
        <div className="bg-card border border-border rounded-xl p-2 shadow-sm">
          <TuningCurveChart data={chartData} activeKeyIndex={seq.targetKeyIndex} />
        </div>

        {/* 스펙트럼 그래프 */}
        <SpectrumGraph
          analyserRef={pitchDetector.analyserRef}
          targetKeyIndex={seq.targetKeyIndex}
          isActive={isListening}
        />

        {/* 세션 + 내보내기 */}
        <div className="bg-card border border-border rounded-xl px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="relative flex-1 mr-2">
              <button
                onClick={() => setShowSessionList(v => !v)}
                className="flex items-center gap-1.5 text-sm text-foreground/85 hover:text-foreground"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span className="font-semibold truncate max-w-[180px]">{activeSession?.name || "세션 없음"}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <p className="text-xs text-muted-foreground/80 mt-0.5">측정 {measuredCount} / 88</p>
              {showSessionList && sessions.length > 0 && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-card border border-border rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto">
                  {sessions.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setActiveSessionId(s.id); setShowSessionList(false); }}
                      className={cn(
                        "w-full text-left px-3 py-2.5 text-xs hover:bg-muted/50 border-b border-border/40 last:border-0",
                        s.id === activeSessionId ? "bg-primary/10 text-primary font-bold" : "text-foreground/85"
                      )}
                    >
                      <div className="font-medium truncate">{s.name}</div>
                      <div className="text-muted-foreground/80 mt-0.5">
                        {Object.keys(s.measurements).length}건반 측정
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => { createSession(); setShowSessionList(false); }}
              className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg font-medium whitespace-nowrap"
            >
              + 새 세션
            </button>
          </div>
          <div className="flex flex-col gap-2 pt-2 border-t border-border/60">
            <input
              type="text"
              placeholder="성명 입력 (PDF에 표시)"
              value={userName}
              onChange={e => setUserName(e.target.value)}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 outline-none focus:border-primary/60"
            />
            <div className="flex gap-2">
              <button
                onClick={() => activeSession && exportToPdf(activeSession.name, userName, activeSession.measurements as any)}
                disabled={measuredCount === 0}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold",
                  measuredCount > 0 ? "bg-primary text-white" : "bg-muted text-muted-foreground/60 cursor-not-allowed"
                )}
              >📄 PDF</button>
              <button
                onClick={() => activeSession && exportToImage(activeSession.name, userName, activeSession.measurements as any)}
                disabled={measuredCount === 0}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold",
                  measuredCount > 0 ? "bg-in-tune text-white" : "bg-muted text-muted-foreground/60 cursor-not-allowed"
                )}
              >🖼️ 이미지</button>
            </div>
          </div>
        </div>


        {/* ── 피아노 프로필 선택 (세션과 별개 — 이 피아노의 B 학습이 여러 세션에 걸쳐 유지됨) ── */}
        <div className="relative flex items-center gap-2">
          <button
            onClick={() => setShowProfileList(v => !v)}
            className="flex-1 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-sm text-foreground/85 hover:text-foreground"
          >
            🎹
            <span className="font-semibold truncate">{activeProfile?.name || "피아노 선택 안 됨"}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-auto">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {activeProfile && (
            <button
              onClick={() => { setEditingProfileId(activeProfile.id); setEditingName(activeProfile.name); setShowProfileList(true); }}
              className="p-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-precision hover:bg-precision/10"
              title="피아노 이름 변경"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
            </button>
          )}
          <button
            onClick={() => { createProfile(); setShowProfileList(false); }}
            className="px-3 py-2 text-xs bg-precision text-white rounded-xl font-medium whitespace-nowrap"
          >
            + 새 피아노
          </button>
          {showProfileList && profiles.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-full bg-card border border-border rounded-xl shadow-lg z-20 max-h-56 overflow-y-auto">
              {profiles.map(p => (
                <div
                  key={p.id}
                  className={cn(
                    "w-full flex items-center gap-1 px-3 py-2 text-xs border-b border-border/40 last:border-0",
                    p.id === activeProfileId ? "bg-precision/10" : ""
                  )}
                >
                  {editingProfileId === p.id ? (
                    <>
                      <input
                        autoFocus
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            const name = editingName.trim();
                            if (name) renameProfile(p.id, name);
                            setEditingProfileId(null);
                          } else if (e.key === "Escape") {
                            setEditingProfileId(null);
                          }
                        }}
                        className="flex-1 min-w-0 px-2 py-1 rounded-lg border border-precision/40 bg-background text-xs"
                      />
                      <button
                        onClick={() => {
                          const name = editingName.trim();
                          if (name) renameProfile(p.id, name);
                          setEditingProfileId(null);
                        }}
                        className="p-1 text-precision hover:bg-precision/10 rounded"
                        title="저장"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setActiveProfileId(p.id); setShowProfileList(false); }}
                        className={cn(
                          "flex-1 min-w-0 text-left",
                          p.id === activeProfileId ? "text-precision font-bold" : "text-foreground/85"
                        )}
                      >
                        <div className="font-medium truncate">{p.name}</div>
                        <div className="text-muted-foreground/80 mt-0.5">{Object.keys(p.scale).length}건반 학습됨</div>
                      </button>
                      <button
                        onClick={() => { setEditingProfileId(p.id); setEditingName(p.name); }}
                        className="p-1.5 text-muted-foreground hover:text-precision hover:bg-precision/10 rounded shrink-0"
                        title="이름 변경"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 인접건반 누적학습 상태판 (기본 접힘 — 헤더 눌러서 필요할 때만 펼침) ── */}
        <div className="rounded-xl border border-precision/30 bg-precision/5 px-3 py-2">
          <button
            onClick={() => setShowLearningPanel(v => !v)}
            className="w-full flex items-center justify-between text-[11px] font-bold text-precision"
          >
            <span>🧠 {activeProfile?.name ?? "피아노"} — 인하모니시티(B) 학습</span>
            <span className="flex items-center gap-1">
              {learnedKeyCount} / 88건반 학습됨
              {anomalyCount > 0 && <span className="text-warn">⚠{anomalyCount}</span>}
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={cn("transition-transform", showLearningPanel && "rotate-180")}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </button>
          {showLearningPanel && (
            <div className="space-y-1 mt-2 pt-2 border-t border-precision/20">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-foreground/70 font-mono">
                <div>
                  지금 이 음 실시간 B:{" "}
                  <span className={cn("font-bold", engineResult?.inharmonicityB != null ? "text-precision" : "text-muted-foreground/50")}>
                    {engineResult?.inharmonicityB != null ? engineResult.inharmonicityB.toFixed(6) : "계산 안됨"}
                  </span>
                </div>
                <div>
                  신뢰도:{" "}
                  <span className="font-bold">
                    {engineResult?.inharmonicityConfidence != null ? `${Math.round(engineResult.inharmonicityConfidence * 100)}%` : "—"}
                  </span>
                  {" "}(배음 {engineResult?.nPartialsUsed ?? "—"}개 사용)
                </div>
                <div>
                  인접학습 예상 B:{" "}
                  <span className={cn("font-bold", currentBHint !== undefined ? "text-precision" : "text-muted-foreground/50")}>
                    {currentBHint !== undefined ? currentBHint.toFixed(6) : "데이터 부족"}
                  </span>
                </div>
                <div>
                  이상 배음 감지:{" "}
                  <span className={cn("font-bold", anomalyCount > 0 ? "text-warn" : "")}>
                    {anomalyCount}건
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/60 pt-0.5">
                "지금 이 음 실시간 B"가 계속 값이 나오면 엔진이 정상 작동 중이라는 뜻입니다. 건반을 몇 개 확정할수록 "학습됨" 숫자가 늘고, 그 다음부턴 인접학습 예상 B가 매칭 탐색에 반영됩니다.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

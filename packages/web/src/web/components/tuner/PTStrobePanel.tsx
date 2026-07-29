/**
 * PTStrobePanel.tsx — Yamaha PT-100/PT-A1 화면 참고 재현
 *
 * - 상단: 연속된 단일 LED 스트로브 바 (세그먼트 흐름/정지)
 * - 하단: 5열 LCD 리드아웃 (OCT-NOTE / KEY No. / CENT / CURVE / PITCH)
 */

import { useEffect, useRef } from "react";

interface PTStrobePanelProps {
  detectedCents: number | null;
  stableCents: number | null;
  isActive: boolean;
  noteName: string | null;   // "A"
  octave: number | null;     // 5
  keyNumber: number | null;  // 1~88
  curveLabel?: string;       // "FLAT" 등
  pitchA4?: number;          // 440
  /** LCD의 CENT 칸에 표시할 값 (영점 방식용) — 없으면 detectedCents/stableCents 사용 */
  readoutCents?: number | null;
  /** true면 회색(샾) 구분 없이 전부 빨강으로 통일 (오리지널 PT-100 스타일) */
  monochromeRed?: boolean;
}

const LOCK_THRESHOLD = 0.5; // 반올림해서 0으로 보일 때만 LOCKED(초록)
const SEG_W = 3;
const SEG_GAP = 2;
const SPEED_PX_PER_CENT = 2.4;
// 오리지널 PT-100처럼: 폭이 넓은 덩어리 5개가 "고정된 창을 통해 보이는" 게 아니라
// 덩어리 자체가 통째로 옆으로 흐르며 지나감 (반복주기=한 덩어리+한 여백, 그 반복 전체가 스크롤됨)
const NUM_CHUNKS = 5;      // 화면에 동시에 보이는 덩어리 개수
const CHUNK_FRAC = 0.62;   // 한 주기(덩어리+여백) 중 덩어리가 차지하는 비율 (길게)

export default function PTStrobePanel({
  detectedCents, stableCents, isActive,
  noteName, octave, keyNumber, curveLabel = "FLAT", pitchA4 = 440,
  readoutCents, monochromeRed = false,
}: PTStrobePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const centsRef = useRef<number | null>(null);
  const monochromeRedRef = useRef(monochromeRed);
  const smoothedSpeedRef = useRef(0); // 감지 프레임이 뜸해도(≈매 100ms) 속도가 뚝뚝 끊기지 않게 프레임마다 서서히 수렴

  useEffect(() => {
    monochromeRedRef.current = monochromeRed;
  }, [monochromeRed]);

  useEffect(() => {
    centsRef.current = stableCents ?? detectedCents;
  }, [stableCents, detectedCents]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (ts: number) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = Math.min((ts - lastTsRef.current) / 1000, 0.1);
      lastTsRef.current = ts;

      const cents = isActive ? centsRef.current : null;
      const locked = cents !== null && Math.abs(cents) <= LOCK_THRESHOLD;
      const targetSpeed = cents !== null && !locked ? cents * SPEED_PX_PER_CENT : 0;
      // 목표 속도로 즉시 점프하지 않고 60fps 프레임마다 조금씩 수렴 -> 감지결과가
      // 뜸하게(예: 100ms마다) 들어와도 화면상 스크롤은 매끄럽게 가속/감속하는 것처럼 보임
      const speedLerp = 1 - Math.pow(0.001, dt); // dt에 비례한 수렴율 (프레임레이트 무관하게 일정한 반응속도)
      smoothedSpeedRef.current += (targetSpeed - smoothedSpeedRef.current) * speedLerp;
      const speed = smoothedSpeedRef.current;
      phaseRef.current += speed * dt;

      const w = canvas.width, h = canvas.height, scale = dpr;

      // 배경 (검정)
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, w, h);

      const segFull = (SEG_W + SEG_GAP) * scale;
      // 음이 떨어짐(flat, 음수) = 빨강 / 음이 높음(sharp, 양수) = 회색 / 정확(LOCKED) = 초록
      // monochromeRed 모드(오리지널 PT-100 스타일)에서는 회색 구분 없이 항상 빨강으로 통일
      const isFlat = monochromeRedRef.current ? true : cents !== null && cents < 0;
      const litColor = locked ? "#22d36b" : isFlat ? "#ff2d2d" : "#9ca3af";
      const glowColor = locked ? "rgba(34,211,107,0.6)" : isFlat ? "rgba(255,45,45,0.6)" : "rgba(156,163,175,0.6)";

      // 오리지널 PT-100처럼: 폭 넓은 덩어리(+그 사이 여백)를 하나의 반복주기로 놓고,
      // 그 반복주기 전체가 옆으로 흐름 — 고정된 창을 통해 보는 게 아니라 덩어리 자체가 이동함
      const periodPx = w / NUM_CHUNKS;               // 화면에 5주기가 보이도록
      const periodSegs = Math.max(2, Math.round(periodPx / segFull));
      const litSegs = Math.max(1, Math.round(periodSegs * CHUNK_FRAC));

      const segCount = Math.ceil(w / segFull) + periodSegs;
      const offsetSeg = (phaseRef.current * scale) / segFull;

      for (let i = -periodSegs; i < segCount; i++) {
        const segIndex = Math.floor(i - offsetSeg);
        const mod = (((segIndex % periodSegs) + periodSegs) % periodSegs);
        const lit = mod < litSegs;
        if (!lit) continue; // 여백 구간

        const x = i * segFull - ((offsetSeg % 1) * segFull) - segFull;
        if (x > w || x + SEG_W * scale < 0) continue;

        if (!isActive || cents === null) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = "rgba(140,140,140,0.20)";
        } else {
          ctx.shadowColor = glowColor;
          ctx.shadowBlur = 7 * scale;
          ctx.fillStyle = litColor;
        }
        ctx.fillRect(x, h * 0.15, SEG_W * scale, h * 0.7);
      }
      ctx.shadowBlur = 0;

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      lastTsRef.current = null;
    };
  }, [isActive]);

  // 스트로브 정지 판정용 (내부 애니메이션은 detectedCents/stableCents로 계속 구동)
  const strobeCentsForLock = stableCents ?? detectedCents;
  const locked = isActive && strobeCentsForLock !== null && Math.abs(strobeCentsForLock) <= LOCK_THRESHOLD;

  // LCD CENT 칸: readoutCents가 주어지면 그걸 우선 표시 (영점 방식용, 내가 맞춘 오프셋값)
  const centDisplay = readoutCents !== undefined ? readoutCents : strobeCentsForLock;

  const cols = [
    { label: "OCT-NOTE", value: noteName && octave !== null ? `${octave}-${noteName}` : "--" },
    { label: "KEY No.", value: keyNumber !== null ? String(keyNumber) : "--" },
    { label: "CENT", value: centDisplay !== null ? (centDisplay > 0 ? "+" : "") + String(Math.round(centDisplay)).padStart(centDisplay < 0 ? 3 : 2, "0") : "000" },
    { label: "CURVE", value: curveLabel },
    { label: "PITCH", value: String(pitchA4) },
  ];

  return (
    <div className="bg-[#111]">
      {/* 스트로브 바 */}
      <canvas ref={canvasRef} className="w-full block" style={{ height: 64 }} />
      {/* LCD 리드아웃 5열 */}
      <div className="grid grid-cols-5 divide-x divide-black/50 border-t border-black/50" style={{ background: "linear-gradient(180deg,#9aac93,#7f9279)" }}>
        {cols.map(c => (
          <div key={c.label} className="px-1 py-1.5 text-center">
            <div className="text-[8px] font-bold text-black/55 uppercase tracking-tight leading-tight">{c.label}</div>
            <div
              className={cn(locked && c.label === "CENT" ? "text-emerald-800" : "text-black/85")}
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 800, lineHeight: 1.2 }}
            >
              {c.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function cn(...cls: (string | false | undefined)[]) {
  return cls.filter(Boolean).join(" ");
}

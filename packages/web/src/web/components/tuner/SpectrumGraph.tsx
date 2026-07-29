/**
 * SpectrumGraph.tsx
 *
 * AnalyserNode FFT 데이터 → 주파수 스펙트럼 막대 그래프
 * - 현재 건반의 배음 위치 하이라이트 (주황선)
 * - X축: 피아노 음역 로그 스케일 (27Hz ~ 5000Hz)
 * - Y축: 데시벨 (-100 ~ 0 dB)
 * - 배음 레이블: 1f 2f 3f...
 */

import { useEffect, useRef } from "react";
import { PIANO_KEYS } from "@/hooks/usePitchDetector";

interface SpectrumGraphProps {
  analyserRef: { readonly current: AnalyserNode | null };
  targetKeyIndex: number | null;
  isActive: boolean;
  /** 표시할 최대 배음 수 (기본 8) */
  maxPartials?: number;
}

const FREQ_MIN = 27;
const FREQ_MAX = 5000;
const DB_MIN   = -90;
const DB_MAX   = -10;

function freqToX(freq: number, width: number): number {
  const logMin = Math.log2(FREQ_MIN);
  const logMax = Math.log2(FREQ_MAX);
  const logF   = Math.log2(Math.max(FREQ_MIN, Math.min(FREQ_MAX, freq)));
  return ((logF - logMin) / (logMax - logMin)) * width;
}

export default function SpectrumGraph({
  analyserRef,
  targetKeyIndex,
  isActive,
  maxPartials = 8,
}: SpectrumGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number | null>(null);
  const specRef   = useRef<Float32Array | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const W = canvas.width;
    const H = canvas.height;

    const targetFreq = targetKeyIndex !== null ? PIANO_KEYS[targetKeyIndex].freq : null;
    const noteName   = targetKeyIndex !== null
      ? `${PIANO_KEYS[targetKeyIndex].noteName}${PIANO_KEYS[targetKeyIndex].octave}`
      : null;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // 배경
      ctx.fillStyle = "#080c10";
      ctx.fillRect(0, 0, W, H);

      // 그리드 라인 (주요 음표 위치)
      const gridNotes = [0, 12, 24, 36, 48, 60, 72, 87]; // A0, A1, A2, A3, A4, A5, A6, C8
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      for (const ki of gridNotes) {
        const freq = PIANO_KEYS[ki].freq;
        if (freq < FREQ_MAX) {
          const x = freqToX(freq, W);
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, H);
          ctx.stroke();
        }
      }

      const an = analyserRef.current;
      if (!isActive || !an) {
        // 비활성 상태 — 안내 텍스트 표시
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, H - 1);
        ctx.lineTo(W, H - 1);
        ctx.stroke();

        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.font = "12px 'Noto Sans KR', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("마이크를 시작하면 스펙트럼이 표시됩니다", W / 2, H / 2 + 4);

        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // 스펙트럼 데이터
      const fftSize = an.fftSize;
      const binCount = an.frequencyBinCount;
      if (!specRef.current || specRef.current.length !== binCount) {
        specRef.current = new Float32Array(binCount);
      }
      an.getFloatFrequencyData(specRef.current);
      const spec = specRef.current;
      const sr = an.context.sampleRate;
      const binHz = sr / fftSize;

      // 배경 그라데이션
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0,   "#080c10");
      bgGrad.addColorStop(1,   "#060a0e");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // 스펙트럼 그리기 — 픽셀별 최대값
      const imageData = ctx.createImageData(W, H);
      const data = imageData.data;

      for (let px = 0; px < W; px++) {
        // 이 픽셀이 커버하는 주파수 범위
        const logMin2 = Math.log2(FREQ_MIN);
        const logMax2 = Math.log2(FREQ_MAX);
        const fLo = Math.pow(2, logMin2 + (px / W) * (logMax2 - logMin2));
        const fHi = Math.pow(2, logMin2 + ((px + 1) / W) * (logMax2 - logMin2));

        const binLo = Math.max(0, Math.floor(fLo / binHz));
        const binHi = Math.min(binCount - 1, Math.ceil(fHi / binHz));

        let maxDb = DB_MIN;
        for (let b = binLo; b <= binHi; b++) {
          if (spec[b] > maxDb) maxDb = spec[b];
        }

        const norm = Math.max(0, Math.min(1, (maxDb - DB_MIN) / (DB_MAX - DB_MIN)));
        if (norm < 0.01) continue;

        const barH = Math.round(norm * H);
        const yStart = H - barH;

        // 색상: 강도에 따라 파랑→청록→초록
        const r = Math.round(20  + norm * 30);
        const g = Math.round(80  + norm * 150);
        const b2= Math.round(160 + norm * 60);
        const alpha = Math.round(180 + norm * 75);

        for (let py = yStart; py < H; py++) {
          const idx = (py * W + px) * 4;
          const intensity = 1 - (py - yStart) / barH * 0.3;
          data[idx]     = Math.round(r  * intensity);
          data[idx + 1] = Math.round(g  * intensity);
          data[idx + 2] = Math.round(b2 * intensity);
          data[idx + 3] = alpha;
        }
      }
      ctx.putImageData(imageData, 0, 0);

      // 배음 마커 (현재 건반)
      if (targetFreq !== null) {
        for (let p = 1; p <= maxPartials; p++) {
          const hFreq = targetFreq * p;
          if (hFreq > FREQ_MAX) break;

          const x = freqToX(hFreq, W);

          // 배음 선
          const alpha = Math.max(0.2, 1 - (p - 1) * 0.12);
          ctx.strokeStyle = p === 1
            ? `rgba(255, 160, 30, ${alpha})`
            : `rgba(255, 200, 80, ${alpha * 0.7})`;
          ctx.lineWidth = p === 1 ? 1.5 : 1;
          ctx.setLineDash(p === 1 ? [] : [3, 3]);
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, H - 12);
          ctx.stroke();
          ctx.setLineDash([]);

          // 배음 레이블
          if (p <= 6) {
            ctx.fillStyle = p === 1 ? "rgba(255,160,30,0.9)" : "rgba(255,200,80,0.5)";
            ctx.font = `bold ${p === 1 ? 9 : 8}px 'JetBrains Mono', monospace`;
            ctx.textAlign = "center";
            ctx.fillText(`${p}f`, x, H - 2);
          }
        }

        // 음이름 레이블
        if (noteName) {
          const x = freqToX(targetFreq, W);
          ctx.fillStyle = "rgba(255,160,30,0.9)";
          ctx.font = "bold 10px 'JetBrains Mono', monospace";
          ctx.textAlign = x < W * 0.1 ? "left" : x > W * 0.9 ? "right" : "center";
          ctx.fillText(noteName, Math.max(16, Math.min(W - 16, x)), 11);
        }
      }

      // X축 주파수 레이블
      const freqLabels = [50, 100, 200, 500, 1000, 2000, 4000];
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = "8px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      for (const f of freqLabels) {
        if (f >= FREQ_MIN && f <= FREQ_MAX) {
          const x = freqToX(f, W);
          ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, H - 2);
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [analyserRef, targetKeyIndex, isActive, maxPartials]);

  return (
    <div className="bg-instrument rounded-xl overflow-hidden border border-instrument/60">
      {/* 헤더 */}
      <div className="px-3 py-1.5 flex items-center justify-between border-b border-instrument/40">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">스펙트럼</span>
        {targetKeyIndex !== null && (
          <span className="text-[10px] text-yellow-400/70" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            주황선 = 배음 위치
          </span>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={360}
        height={80}
        className="w-full block"
        style={{ imageRendering: "auto" }}
      />
    </div>
  );
}

// App-wide tuning state: settings, per-key inharmonicity measurements, and the
// derived 88-key stretch curve. Kept in memory for v1 (session save comes later).

import React, { createContext, useContext, useMemo, useState, useCallback } from "react";
import { DEFAULT_A4 } from "./dsp/notes";
import { interpolateBCurve, type MeasuredB } from "./dsp/interpolation";
import { computeStretchCurve, getStyle, type CurvePoint } from "./dsp/stretch";

export interface Measurement {
  keyIndex: number;
  B: number;
  f0: number;
  rSquared: number;
  partialsUsed: number;
  measuredAt: number;
}

interface TuningState {
  a4: number;
  styleId: string;
  measurements: Record<number, Measurement>;
  bCurve: number[];
  curve: CurvePoint[];
  /** Per-key achieved deviation (cents from ET) recorded during manual tuning. */
  tunedCents: Record<number, number>;
  setA4: (v: number) => void;
  setStyleId: (id: string) => void;
  addMeasurement: (m: Measurement) => void;
  removeMeasurement: (keyIndex: number) => void;
  recordTuned: (keyIndex: number, cents: number) => void;
  clearTuned: (keyIndex: number) => void;
  resetTuned: () => void;
  resetAll: () => void;
}

const TuningContext = createContext<TuningState | null>(null);

export function TuningProvider({ children }: { children: React.ReactNode }) {
  const [a4, setA4] = useState(DEFAULT_A4);
  const [styleId, setStyleId] = useState("4:2");
  const [measurements, setMeasurements] = useState<Record<number, Measurement>>({});
  const [tunedCents, setTunedCents] = useState<Record<number, number>>({});

  const addMeasurement = useCallback((m: Measurement) => {
    setMeasurements((prev) => ({ ...prev, [m.keyIndex]: m }));
  }, []);

  const removeMeasurement = useCallback((keyIndex: number) => {
    setMeasurements((prev) => {
      const next = { ...prev };
      delete next[keyIndex];
      return next;
    });
  }, []);

  const recordTuned = useCallback((keyIndex: number, cents: number) => {
    setTunedCents((prev) => ({ ...prev, [keyIndex]: cents }));
  }, []);

  const clearTuned = useCallback((keyIndex: number) => {
    setTunedCents((prev) => {
      const next = { ...prev };
      delete next[keyIndex];
      return next;
    });
  }, []);

  const resetTuned = useCallback(() => setTunedCents({}), []);

  const resetAll = useCallback(() => {
    setMeasurements({});
    setTunedCents({});
  }, []);

  const bCurve = useMemo(() => {
    const measured: MeasuredB[] = Object.values(measurements).map((m) => ({
      keyIndex: m.keyIndex,
      B: m.B,
    }));
    return interpolateBCurve(measured);
  }, [measurements]);

  const curve = useMemo(
    () => computeStretchCurve(bCurve, a4, getStyle(styleId)),
    [bCurve, a4, styleId],
  );

  const value = useMemo<TuningState>(
    () => ({
      a4,
      styleId,
      measurements,
      bCurve,
      curve,
      tunedCents,
      setA4,
      setStyleId,
      addMeasurement,
      removeMeasurement,
      recordTuned,
      clearTuned,
      resetTuned,
      resetAll,
    }),
    [
      a4,
      styleId,
      measurements,
      bCurve,
      curve,
      tunedCents,
      addMeasurement,
      removeMeasurement,
      recordTuned,
      clearTuned,
      resetTuned,
      resetAll,
    ],
  );

  return <TuningContext.Provider value={value}>{children}</TuningContext.Provider>;
}

export function useTuning(): TuningState {
  const ctx = useContext(TuningContext);
  if (!ctx) throw new Error("useTuning must be used within TuningProvider");
  return ctx;
}

// App-wide tuning state. Data is organized into named "piano profiles": each
// piano keeps its own A4, temperament style, per-key inharmonicity measurements,
// the derived 88-key stretch curve, and manual-tuning results. Profiles persist
// to localStorage so a measured piano can be reopened later. The active profile
// drives everything the tuner/measure/curve/manual pages read.

import React, { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef } from "react";
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

export interface PianoProfile {
  id: string;
  name: string;
  a4: number;
  styleId: string;
  measurements: Record<number, Measurement>;
  tunedCents: Record<number, number>;
  createdAt: number;
  updatedAt: number;
}

/** Lightweight summary for pickers/lists (no heavy measurement maps). */
export interface PianoSummary {
  id: string;
  name: string;
  a4: number;
  styleId: string;
  measuredCount: number;
  updatedAt: number;
}

interface TuningState {
  // ── Active piano's derived working state (backward-compatible surface) ──
  a4: number;
  styleId: string;
  measurements: Record<number, Measurement>;
  bCurve: number[];
  curve: CurvePoint[];
  tunedCents: Record<number, number>;
  setA4: (v: number) => void;
  setStyleId: (id: string) => void;
  addMeasurement: (m: Measurement) => void;
  removeMeasurement: (keyIndex: number) => void;
  recordTuned: (keyIndex: number, cents: number) => void;
  clearTuned: (keyIndex: number) => void;
  resetTuned: () => void;
  resetAll: () => void;

  // ── Piano profile management ──
  pianos: PianoSummary[];
  activePianoId: string;
  activePianoName: string;
  createPiano: (name?: string) => string;
  selectPiano: (id: string) => void;
  renamePiano: (id: string, name: string) => void;
  deletePiano: (id: string) => void;
  duplicatePiano: (id: string, name?: string) => string;
}

const TuningContext = createContext<TuningState | null>(null);

const STORAGE_KEY = "piano-tuning:pianos-v2";

function genId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function makePiano(name: string): PianoProfile {
  const now = Date.now();
  return {
    id: genId(),
    name,
    a4: DEFAULT_A4,
    styleId: "4:2",
    measurements: {},
    tunedCents: {},
    createdAt: now,
    updatedAt: now,
  };
}

interface PersistShape {
  pianos: PianoProfile[];
  activePianoId: string;
}

function loadPersisted(): PersistShape | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistShape;
    if (!parsed?.pianos?.length) return null;
    // basic shape guard
    for (const p of parsed.pianos) {
      p.measurements ??= {};
      p.tunedCents ??= {};
      p.a4 ??= DEFAULT_A4;
      p.styleId ??= "4:2";
    }
    if (!parsed.pianos.some((p) => p.id === parsed.activePianoId)) {
      parsed.activePianoId = parsed.pianos[0].id;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function TuningProvider({ children }: { children: React.ReactNode }) {
  const [pianoList, setPianoList] = useState<PianoProfile[]>(() => {
    const persisted = loadPersisted();
    if (persisted) return persisted.pianos;
    return [makePiano("피아노 1")];
  });
  const [activePianoId, setActivePianoId] = useState<string>(() => {
    const persisted = loadPersisted();
    if (persisted) return persisted.activePianoId;
    return "";
  });

  // Ensure activePianoId always points at a real piano (fallback to first).
  const activeId = useMemo(() => {
    if (pianoList.some((p) => p.id === activePianoId)) return activePianoId;
    return pianoList[0]?.id ?? "";
  }, [pianoList, activePianoId]);

  // Persist on any change (debounced to a microtask via effect).
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ pianos: pianoList, activePianoId: activeId } as PersistShape),
        );
      } catch {
        /* storage full or unavailable — ignore */
      }
    }, 150);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [pianoList, activeId]);

  const active = useMemo(
    () => pianoList.find((p) => p.id === activeId) ?? pianoList[0],
    [pianoList, activeId],
  );

  // Helper: patch the active piano immutably and bump updatedAt.
  const patchActive = useCallback(
    (patch: (p: PianoProfile) => PianoProfile) => {
      setPianoList((prev) =>
        prev.map((p) => (p.id === activeId ? { ...patch(p), updatedAt: Date.now() } : p)),
      );
    },
    [activeId],
  );

  const setA4 = useCallback((v: number) => patchActive((p) => ({ ...p, a4: v })), [patchActive]);
  const setStyleId = useCallback((id: string) => patchActive((p) => ({ ...p, styleId: id })), [patchActive]);

  const addMeasurement = useCallback(
    (m: Measurement) =>
      patchActive((p) => ({ ...p, measurements: { ...p.measurements, [m.keyIndex]: m } })),
    [patchActive],
  );

  const removeMeasurement = useCallback(
    (keyIndex: number) =>
      patchActive((p) => {
        const next = { ...p.measurements };
        delete next[keyIndex];
        return { ...p, measurements: next };
      }),
    [patchActive],
  );

  const recordTuned = useCallback(
    (keyIndex: number, cents: number) =>
      patchActive((p) => ({ ...p, tunedCents: { ...p.tunedCents, [keyIndex]: cents } })),
    [patchActive],
  );

  const clearTuned = useCallback(
    (keyIndex: number) =>
      patchActive((p) => {
        const next = { ...p.tunedCents };
        delete next[keyIndex];
        return { ...p, tunedCents: next };
      }),
    [patchActive],
  );

  const resetTuned = useCallback(() => patchActive((p) => ({ ...p, tunedCents: {} })), [patchActive]);

  const resetAll = useCallback(
    () => patchActive((p) => ({ ...p, measurements: {}, tunedCents: {} })),
    [patchActive],
  );

  // ── Profile management ──
  const createPiano = useCallback((name?: string) => {
    const piano = makePiano(name?.trim() || `피아노 ${Date.now().toString().slice(-4)}`);
    setPianoList((prev) => [...prev, piano]);
    setActivePianoId(piano.id);
    return piano.id;
  }, []);

  const selectPiano = useCallback((id: string) => setActivePianoId(id), []);

  const renamePiano = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setPianoList((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name: trimmed, updatedAt: Date.now() } : p)),
    );
  }, []);

  const deletePiano = useCallback(
    (id: string) => {
      setPianoList((prev) => {
        const filtered = prev.filter((p) => p.id !== id);
        if (filtered.length === 0) {
          const fresh = makePiano("피아노 1");
          setActivePianoId(fresh.id);
          return [fresh];
        }
        if (id === activeId) setActivePianoId(filtered[0].id);
        return filtered;
      });
    },
    [activeId],
  );

  const duplicatePiano = useCallback(
    (id: string, name?: string) => {
      const src = pianoList.find((p) => p.id === id);
      const now = Date.now();
      const copy: PianoProfile = src
        ? {
            ...src,
            id: genId(),
            name: name?.trim() || `${src.name} 복사본`,
            measurements: { ...src.measurements },
            tunedCents: { ...src.tunedCents },
            createdAt: now,
            updatedAt: now,
          }
        : makePiano(name?.trim() || "피아노 복사본");
      setPianoList((prev) => [...prev, copy]);
      setActivePianoId(copy.id);
      return copy.id;
    },
    [pianoList],
  );

  const a4 = active?.a4 ?? DEFAULT_A4;
  const styleId = active?.styleId ?? "4:2";
  const measurements = active?.measurements ?? {};
  const tunedCents = active?.tunedCents ?? {};

  const bCurve = useMemo(() => {
    const measured: MeasuredB[] = Object.values(measurements).map((m) => ({
      keyIndex: m.keyIndex,
      B: m.B,
      rSquared: m.rSquared,
    }));
    return interpolateBCurve(measured);
  }, [measurements]);

  const curve = useMemo(
    () => computeStretchCurve(bCurve, a4, getStyle(styleId)),
    [bCurve, a4, styleId],
  );

  const pianos = useMemo<PianoSummary[]>(
    () =>
      pianoList.map((p) => ({
        id: p.id,
        name: p.name,
        a4: p.a4,
        styleId: p.styleId,
        measuredCount: Object.keys(p.measurements).length,
        updatedAt: p.updatedAt,
      })),
    [pianoList],
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
      pianos,
      activePianoId: activeId,
      activePianoName: active?.name ?? "",
      createPiano,
      selectPiano,
      renamePiano,
      deletePiano,
      duplicatePiano,
    }),
    [
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
      pianos,
      activeId,
      active,
      createPiano,
      selectPiano,
      renamePiano,
      deletePiano,
      duplicatePiano,
    ],
  );

  return <TuningContext.Provider value={value}>{children}</TuningContext.Provider>;
}

export function useTuning(): TuningState {
  const ctx = useContext(TuningContext);
  if (!ctx) throw new Error("useTuning must be used within TuningProvider");
  return ctx;
}

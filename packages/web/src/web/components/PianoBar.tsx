import { useState, useRef, useEffect } from "react";
import { Piano, Plus, Pencil, Trash2, Check, X, ChevronDown, Copy } from "lucide-react";
import { colors, Fonts } from "../lib/theme";
import { useTuning } from "../lib/tuning-store";

// Compact piano-profile bar: switch between saved pianos, rename the active one,
// add / duplicate / delete. Selecting a piano swaps the whole tuning working set
// (measurements + stretch curve), so every page reflects the chosen instrument.
export function PianoBar() {
  const {
    pianos,
    activePianoId,
    activePianoName,
    styleId,
    createPiano,
    selectPiano,
    renamePiano,
    deletePiano,
    duplicatePiano,
  } = useTuning();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(activePianoName);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEdit = () => {
    setDraft(activePianoName);
    setEditing(true);
    setOpen(false);
  };
  const commitEdit = () => {
    if (draft.trim()) renamePiano(activePianoId, draft.trim());
    setEditing(false);
  };
  const active = pianos.find((p) => p.id === activePianoId);
  const measuredCount = active?.measuredCount ?? 0;

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        borderRadius: 14,
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.cardElevated,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 30,
          height: 30,
          borderRadius: 9,
          backgroundColor: colors.primary,
          flexShrink: 0,
        }}
      >
        <Piano size={17} color={colors.primaryForeground} />
      </div>

      {editing ? (
        <>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") setEditing(false);
            }}
            maxLength={40}
            style={{
              flex: 1,
              minWidth: 0,
              fontFamily: Fonts.sansBold,
              fontWeight: 700,
              fontSize: 15,
              color: colors.foreground,
              background: colors.card,
              border: `1px solid ${colors.primary}`,
              borderRadius: 8,
              padding: "6px 8px",
              outline: "none",
            }}
          />
          <button type="button" onClick={commitEdit} style={iconBtn(colors.inTune)} aria-label="이름 저장">
            <Check size={16} color={colors.inTune} />
          </button>
          <button type="button" onClick={() => setEditing(false)} style={iconBtn(colors.mutedForeground)} aria-label="취소">
            <X size={16} color={colors.mutedForeground} />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              textAlign: "left",
            }}
          >
            <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
              <span
                style={{
                  fontFamily: Fonts.sansBold,
                  fontWeight: 700,
                  fontSize: 15,
                  color: colors.foreground,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {activePianoName || "피아노"}
              </span>
              <span style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 0.5, color: colors.mutedForeground }}>
                {measuredCount}개 측정 · {styleId}
              </span>
            </div>
            <ChevronDown size={16} color={colors.mutedForeground} style={{ marginLeft: "auto", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
          </button>

          <button type="button" onClick={startEdit} style={iconBtn(colors.foreground)} aria-label="이름 수정">
            <Pencil size={15} color={colors.foreground} />
          </button>
        </>
      )}

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 40,
            borderRadius: 14,
            border: `1px solid ${colors.border}`,
            backgroundColor: colors.cardElevated,
            boxShadow: "0 12px 30px rgba(0,0,0,0.28)",
            padding: 6,
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {pianos.map((p) => {
            const isActive = p.id === activePianoId;
            return (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 8px",
                  borderRadius: 10,
                  backgroundColor: isActive ? colors.primary : "transparent",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    selectPiano(p.id);
                    setOpen(false);
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      fontFamily: Fonts.sansMedium,
                      fontWeight: 600,
                      fontSize: 14,
                      color: isActive ? colors.primaryForeground : colors.foreground,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {p.name}
                  </span>
                  <span
                    style={{
                      fontFamily: Fonts.mono,
                      fontSize: 10,
                      color: isActive ? colors.primaryForeground : colors.mutedForeground,
                    }}
                  >
                    {p.measuredCount}개 측정 · A4 {p.a4} · {p.styleId}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => duplicatePiano(p.id)}
                  style={iconBtn(isActive ? colors.primaryForeground : colors.mutedForeground)}
                  aria-label="복제"
                >
                  <Copy size={14} color={isActive ? colors.primaryForeground : colors.mutedForeground} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (pianos.length <= 1) {
                      if (!confirm(`"${p.name}"의 측정 데이터를 모두 지울까요?`)) return;
                    } else if (!confirm(`"${p.name}" 피아노를 삭제할까요?`)) return;
                    deletePiano(p.id);
                  }}
                  style={iconBtn(isActive ? colors.primaryForeground : colors.off)}
                  aria-label="삭제"
                >
                  <Trash2 size={14} color={isActive ? colors.primaryForeground : colors.off} />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => {
              createPiano();
              setOpen(false);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              width: "100%",
              marginTop: 4,
              padding: "9px 8px",
              borderRadius: 10,
              border: `1px dashed ${colors.border}`,
              background: "none",
              cursor: "pointer",
              fontFamily: Fonts.sansMedium,
              fontWeight: 600,
              fontSize: 13,
              color: colors.primary,
            }}
          >
            <Plus size={15} color={colors.primary} /> 새 피아노 추가
          </button>
        </div>
      )}
    </div>
  );
}

function iconBtn(_color: string): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: 9,
    border: `1px solid ${colors.border}`,
    background: colors.card,
    cursor: "pointer",
    padding: 0,
  };
}

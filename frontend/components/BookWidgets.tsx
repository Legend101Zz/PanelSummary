"use client";

import { useState, useRef, useEffect } from "react";
import { Pencil, Check, Loader2, X } from "lucide-react";
import { updateBookTitle } from "@/lib/api";

// ─── STATUS BADGE ───────────────────────────────────────────
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    pending:     { color: "var(--text-3)",  label: "Pending" },
    parsing:     { color: "var(--amber)",   label: "Parsing…" },
    parsed:      { color: "var(--teal)",    label: "Ready" },
    summarizing: { color: "var(--amber)",   label: "Summarizing…" },
    generating:  { color: "var(--amber)",   label: "Generating…" },
    complete:    { color: "var(--teal)",    label: "Complete" },
    failed:      { color: "var(--red)",     label: "Failed" },
  };
  const { color, label } = map[status] ?? { color: "var(--text-3)", label: status };
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-label border"
      style={{ color, borderColor: color, background: `${color}15`, fontSize: "10px" }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

// ─── INLINE TITLE EDITOR ────────────────────────────────────
export function TitleEditor({
  bookId, initial, onSaved,
}: {
  bookId: string;
  initial: string;
  onSaved: (t: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue]     = useState(initial);
  const [saving, setSaving]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const save = async () => {
    if (!value.trim() || value === initial) { setEditing(false); return; }
    setSaving(true);
    try { await updateBookTitle(bookId, value.trim()); onSaved(value.trim()); } catch {}
    setSaving(false);
    setEditing(false);
  };

  if (!editing) return (
    <div className="flex items-center gap-2 group">
      <h1
        className="font-display leading-tight"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(1.5rem,4vw,2.8rem)",
          color: "var(--text-1)",
        }}
      >
        {initial}
      </h1>
      <button
        onClick={() => setEditing(true)}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: "var(--text-3)" }}
        title="Rename"
      >
        <Pencil size={14} />
      </button>
    </div>
  );

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        className="bg-transparent border-b-2 outline-none font-display"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(1.5rem,4vw,2.8rem)",
          color: "var(--text-1)",
          borderColor: "var(--amber)",
          minWidth: "200px",
        }}
      />
      <button onClick={save} disabled={saving} style={{ color: "var(--teal)" }}>
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
      </button>
      <button onClick={() => { setEditing(false); setValue(initial); }} style={{ color: "var(--text-3)" }}>
        <X size={14} />
      </button>
    </div>
  );
}

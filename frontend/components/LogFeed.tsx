"use client";

import { useRef, useEffect } from "react";
import { motion } from "motion/react";

export interface LogEntry {
  pct: number;
  msg: string;
  done?: boolean;
  error?: boolean;
}

export function LogFeed({ entries }: { entries: LogEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  return (
    <div
      className="border overflow-hidden"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div
        className="flex items-center gap-2 px-3 py-1.5 border-b"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      >
        <div className="flex gap-1.5">
          {["var(--red)", "var(--amber)", "var(--teal)"].map((c, i) => (
            <div key={i} className="w-2 h-2 rounded-full" style={{ background: c }} />
          ))}
        </div>
        <span className="font-label" style={{ color: "var(--text-3)", fontSize: "9px" }}>
          AI GENERATION LOG
        </span>
      </div>
      <div className="p-3 max-h-44 overflow-y-auto space-y-0.5">
        {entries.map((e, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-start gap-2 font-label text-xs"
          >
            <span style={{ color: "var(--text-3)", minWidth: "28px", textAlign: "right" }}>
              {e.pct}%
            </span>
            <span
              style={{
                color: e.error ? "var(--red)" : e.done ? "var(--teal)" : "var(--text-2)",
              }}
            >
              {e.error ? "\u2717 " : e.done ? "\u2713 " : "\u203A "}
              {e.msg}
            </span>
          </motion.div>
        ))}
        <div ref={bottomRef} />
      </div>
      {entries.length > 0 && (
        <div className="xp-bar mx-3 mb-3">
          <motion.div
            className="xp-fill"
            animate={{ width: `${entries.at(-1)?.pct ?? 0}%` }}
            transition={{ duration: 0.35 }}
          />
        </div>
      )}
    </div>
  );
}

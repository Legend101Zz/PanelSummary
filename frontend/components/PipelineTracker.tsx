"use client";

import { motion } from "motion/react";
import { CheckCircle, Loader2, Circle, DollarSign, Layers, Zap } from "lucide-react";

/** Pipeline phases in order. The backend sends one of these as `phase`. */
const PHASES = [
  { key: "compressing", label: "Compress",  icon: "📦", desc: "Compressing chapters" },
  { key: "analysis",    label: "Analyze",   icon: "🔍", desc: "Synopsis + manga bible" },
  { key: "planning",    label: "Plan",      icon: "🧠", desc: "Panel structure" },
  { key: "generating",  label: "Generate",  icon: "⚡", desc: "Living panel DSLs" },
  { key: "assembling",  label: "Assemble",  icon: "🎬", desc: "Final assembly" },
  { key: "images",      label: "Images",    icon: "🖼️", desc: "Splash images" },
  { key: "complete",    label: "Done",      icon: "✓",  desc: "Complete!" },
] as const;

type PhaseKey = typeof PHASES[number]["key"];

interface PipelineTrackerProps {
  phase: string | null;
  progress: number;
  panelsDone: number;
  panelsTotal: number;
  costSoFar: number;
  estimatedCost: number | null;
  message: string;
}

function getPhaseIndex(phase: string | null): number {
  if (!phase) return -1;
  return PHASES.findIndex(p => p.key === phase);
}

function PhaseStep({ phase, currentIndex, stepIndex }: {
  phase: typeof PHASES[number];
  currentIndex: number;
  stepIndex: number;
}) {
  const isDone = stepIndex < currentIndex;
  const isActive = stepIndex === currentIndex;
  const isPending = stepIndex > currentIndex;

  return (
    <div className="flex flex-col items-center gap-1" style={{ minWidth: 52 }}>
      {/* Icon */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all duration-300"
        style={{
          background: isDone
            ? "rgba(42,135,3,0.15)"
            : isActive
            ? "rgba(245,166,35,0.15)"
            : "rgba(168,166,192,0.08)",
          border: `1.5px solid ${isDone ? "#2a8703" : isActive ? "#F5A623" : "rgba(168,166,192,0.2)"}`,
          color: isDone ? "#2a8703" : isActive ? "#F5A623" : "rgba(168,166,192,0.4)",
          boxShadow: isActive ? "0 0 12px rgba(245,166,35,0.2)" : "none",
        }}
      >
        {isDone ? (
          <CheckCircle size={13} />
        ) : isActive ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <span style={{ fontSize: 12 }}>{phase.icon}</span>
        )}
      </div>
      {/* Label */}
      <span
        className="font-label text-center"
        style={{
          fontSize: 9,
          color: isDone ? "#2a8703" : isActive ? "#F5A623" : "rgba(168,166,192,0.4)",
          fontWeight: isActive ? 600 : 400,
        }}
      >
        {phase.label}
      </span>
    </div>
  );
}

export function PipelineTracker({
  phase, progress, panelsDone, panelsTotal, costSoFar, estimatedCost, message,
}: PipelineTrackerProps) {
  const currentIndex = getPhaseIndex(phase);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="border overflow-hidden"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      >
        <div className="flex items-center gap-2">
          <Zap size={11} style={{ color: "#F5A623" }} />
          <span className="font-label" style={{ color: "var(--text-3)", fontSize: 9 }}>
            PIPELINE STATUS
          </span>
        </div>
        <span className="font-label" style={{ color: "var(--text-3)", fontSize: 9 }}>
          {progress}%
        </span>
      </div>

      {/* Phase steps */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-start justify-between gap-1">
          {PHASES.map((p, i) => (
            <PhaseStep key={p.key} phase={p} currentIndex={currentIndex} stepIndex={i} />
          ))}
        </div>

        {/* Progress bar */}
        <div
          className="mt-2 h-1 rounded-full overflow-hidden"
          style={{ background: "rgba(168,166,192,0.1)" }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, #F5A623, #2a8703)" }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Stats row */}
      <div
        className="flex items-center gap-4 px-3 py-2 border-t"
        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.15)" }}
      >
        {/* Panels counter */}
        {panelsTotal > 0 && (
          <div className="flex items-center gap-1.5">
            <Layers size={11} style={{ color: "var(--text-3)" }} />
            <span className="font-label" style={{ fontSize: 10, color: "var(--text-2)" }}>
              <strong style={{ color: "#F5A623" }}>{panelsDone}</strong>
              <span style={{ color: "var(--text-3)" }}> / {panelsTotal} panels</span>
            </span>
          </div>
        )}

        {/* Cost tracker */}
        {costSoFar > 0 && (
          <div className="flex items-center gap-1.5">
            <DollarSign size={11} style={{ color: "var(--text-3)" }} />
            <span className="font-label" style={{ fontSize: 10, color: "var(--text-2)" }}>
              <strong style={{ color: "#2a8703" }}>${costSoFar.toFixed(4)}</strong>
              {estimatedCost && estimatedCost > 0 && (
                <span style={{ color: "var(--text-3)" }}> / ~${estimatedCost.toFixed(4)}</span>
              )}
            </span>
          </div>
        )}

        {/* Current message */}
        <div className="flex-1 text-right">
          <span
            className="font-label truncate block"
            style={{ fontSize: 9, color: "var(--text-3)", maxWidth: 250 }}
          >
            {message}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

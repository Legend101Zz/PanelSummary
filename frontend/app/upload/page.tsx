"use client";

/**
 * UPLOAD PAGE — "MISSION BRIEFING"
 * ==================================
 * Aesthetic: You're about to enter a dungeon. The upload zone is the portal.
 * Left panel = character + mission brief | Right panel = the drop zone
 *
 * Interactions:
 * - Drop zone pulses on hover with amber glow
 * - File accepted → panel borders switch to amber, character celebrates
 * - Parsing → XP bar fills up with chapter labels appearing like unlocked cards
 * - Error → character frowns, red border flash
 * - Complete → "LEVEL CLEARED" animation, redirect
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Upload, CheckCircle, AlertCircle, Loader2, FileText, ChevronRight } from "lucide-react";
import { uploadPdf, pollUntilComplete } from "@/lib/api";
import type { JobStatusResponse } from "@/lib/types";

type Phase = "idle" | "drag" | "uploading" | "parsing" | "done" | "cached" | "error";

// ─── SENSEI ROBOT (reused pattern) ──────────────────────────
function SenseiHead({ expression }: { expression: "idle" | "excited" | "working" | "sad" }) {
  const eyeY = expression === "working" ? 27 : 30;
  const eyeW = expression === "working" ? 10 : 12;
  const mouthPath = expression === "excited"
    ? "M 29 44 Q 40 54 51 44"
    : expression === "sad"
    ? "M 30 48 Q 40 44 50 48"
    : expression === "working"
    ? "M 33 44 Q 40 42 47 44"
    : "M 32 43 Q 40 47 48 43";

  return (
    <svg width="80" height="70" viewBox="0 0 80 70" fill="none">
      <rect x="12" y="8" width="56" height="40" rx="8" fill="#1F1E28" stroke="var(--border-2)" strokeWidth="2"/>
      <rect x="22" y={eyeY} width={eyeW} height="8" rx="2" fill={expression === "sad" ? "var(--text-3)" : "var(--amber)"}/>
      <rect x={80 - 22 - eyeW} y={eyeY} width={eyeW} height="8" rx="2" fill={expression === "sad" ? "var(--text-3)" : "var(--amber)"}/>
      <rect x={26} y={eyeY + 2} width={4} height={4} rx={1} fill="#0F0E17"/>
      <rect x={80 - 26 - 4} y={eyeY + 2} width={4} height={4} rx={1} fill="#0F0E17"/>
      <path d={mouthPath} stroke={expression === "excited" ? "var(--amber)" : expression === "sad" ? "var(--text-3)" : "var(--amber)"} strokeWidth="2" strokeLinecap="round" fill="none"/>
      <line x1="40" y1="8" x2="40" y2="1" stroke="var(--border-2)" strokeWidth="2"/>
      <circle cx="40" cy="0" r="3" fill={expression === "idle" || expression === "excited" ? "var(--red)" : expression === "sad" ? "var(--text-3)" : "var(--amber)"}/>
      <rect x="34" y="46" width="12" height="7" rx="2" fill="#1F1E28" stroke="var(--border-2)" strokeWidth="1.5"/>
    </svg>
  );
}

// ─── CHAPTER CARD (appears during parsing) ───────────────────
function ChapterCard({ title, index, delay }: { title: string; index: number; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 200, damping: 22 }}
      className="panel flex items-center gap-3 px-3 py-2"
    >
      <div
        className="w-6 h-6 shrink-0 flex items-center justify-center text-label"
        style={{ background: "rgba(245,166,35,0.12)", border: "1px solid rgba(245,166,35,0.3)", color: "var(--amber)", fontSize: "9px" }}
      >
        {String(index + 1).padStart(2, "0")}
      </div>
      <p style={{ fontFamily: "var(--font-body)", color: "var(--text-2)", fontSize: "0.8rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {title}
      </p>
      <CheckCircle size={12} style={{ color: "var(--teal)", flexShrink: 0 }} />
    </motion.div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────
export default function UploadPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bookId, setBookId] = useState<string | null>(null);
  const [fakeChapters, setFakeChapters] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCountRef = useRef(0);

  const expression =
    phase === "done" || phase === "cached" ? "excited"
    : phase === "error" ? "sad"
    : phase === "parsing" || phase === "uploading" ? "working"
    : phase === "drag" ? "excited"
    : "idle";

  // Fake chapter names appearing during parse (visual feedback)
  useEffect(() => {
    if (phase !== "parsing") { setFakeChapters([]); return; }
    let i = 0;
    const chapters = ["Introduction", "The Core Framework", "Case Studies", "Applications", "Advanced Concepts", "Synthesis & Review"];
    const t = setInterval(() => {
      if (i < chapters.length && progress > i * 15) {
        setFakeChapters((c) => [...c, chapters[i++]]);
      }
      if (i >= chapters.length) clearInterval(t);
    }, 800);
    return () => clearInterval(t);
  }, [phase, progress]);

  const processFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setPhase("uploading");
    setProgress(5);
    setError(null);
    setFakeChapters([]);

    try {
      const res = await uploadPdf(file);
      setBookId(res.book_id);
      if (res.is_cached) {
        setPhase("cached"); setProgress(100);
        setTimeout(() => router.push(`/books/${res.book_id}`), 1400);
        return;
      }
      setPhase("parsing");
      await pollUntilComplete(res.task_id, (s: JobStatusResponse) => {
        setProgress(s.progress);
        setMessage(s.message);
      });
      setPhase("done"); setProgress(100);
      setTimeout(() => router.push(`/books/${res.book_id}`), 1600);
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  }, [router]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); dragCountRef.current = 0;
    const file = e.dataTransfer.files[0];
    if (file?.name.toLowerCase().endsWith(".pdf")) processFile(file);
    else { setError("PDF files only"); setPhase("error"); }
  }, [processFile]);

  const isProcessing = phase === "uploading" || phase === "parsing";
  const isSuccess = phase === "done" || phase === "cached";

  return (
    <div className="min-h-screen relative" style={{ background: "var(--bg)" }}>
      {/* Background */}
      <div className="fixed inset-0 z-0 opacity-50">
        <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)", backgroundSize: "40px 40px", opacity: 0.4 }} />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 md:px-8 py-12">

        {/* Section header */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <span className="chapter-badge mb-3 inline-flex">CH.01 — THE UPLOAD</span>
          <h1 className="font-display" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.5rem,7vw,5rem)", color: "var(--text-1)", lineHeight: 1 }}>
            UPLOAD YOUR<br /><span className="text-gradient">BOOK.</span>
          </h1>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">

          {/* ── LEFT: Mission briefing panel ─────────────── */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 160, damping: 22 }}
            className="panel p-6 flex flex-col gap-5"
          >
            <div className="panel-label">MISSION BRIEFING</div>

            {/* Character */}
            <div className="flex items-end gap-4 mt-4">
              <motion.div
                animate={isProcessing ? { rotate: [0, -3, 3, 0] } : { y: [-3, 3, -3] }}
                transition={isProcessing ? { repeat: Infinity, duration: 0.5 } : { repeat: Infinity, duration: 2.5 }}
              >
                <SenseiHead expression={expression} />
              </motion.div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={phase}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ type: "spring", stiffness: 300, damping: 22 }}
                  className="bubble bubble--speech text-sm flex-1 mb-6"
                >
                  {phase === "idle" && "「Drop your PDF and let's begin the extraction.」"}
                  {phase === "drag" && "「Release! I'm ready to parse it!」"}
                  {phase === "uploading" && "「Uploading... I can feel the knowledge already.」"}
                  {phase === "parsing" && "「Detecting chapters... this is fascinating.」"}
                  {phase === "done" && "「Parsing complete! Time to summon the manga.」"}
                  {phase === "cached" && "「I remember this one! Already in the library.」"}
                  {phase === "error" && "「Hmm. Something went wrong. Try again?」"}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Info cards */}
            <div className="flex flex-col gap-2.5">
              {[
                { icon: "⚡", label: "Same PDF = instant cache", detail: "SHA-256 hash — never re-parsed" },
                { icon: "🔒", label: "Processed locally", detail: "Nothing sent to cloud until you summarize" },
                { icon: "📦", label: "Max 50MB", detail: "Text PDFs work best; scanned supported" },
              ].map(({ icon, label, detail }) => (
                <div key={label} className="flex gap-3 items-start p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                  <span className="text-base mt-0.5">{icon}</span>
                  <div>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "0.8rem", color: "var(--text-1)", fontWeight: 600 }}>{label}</p>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--text-3)" }}>{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ── RIGHT: Drop zone + progress ──────────────── */}
          <div className="flex flex-col gap-4">

            {/* Drop zone */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
            >
              <input ref={fileInputRef} type="file" accept=".pdf" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
              <div
                className={`drop-zone relative overflow-hidden ${phase === "drag" ? "drop-zone--over" : ""}`}
                style={{ minHeight: 260 }}
                onDragEnter={(e) => { e.preventDefault(); dragCountRef.current++; setPhase("drag"); }}
                onDragLeave={(e) => { e.preventDefault(); if (--dragCountRef.current === 0) setPhase("idle"); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => !isProcessing && fileInputRef.current?.click()}
              >
                {/* Background texture */}
                <div className="halftone" />
                {phase === "drag" && <div className="speed-lines" />}

                <div className="relative z-10 flex flex-col items-center justify-center gap-5 py-14 px-8 text-center">
                  {/* Icon */}
                  <motion.div
                    animate={phase === "drag" ? { scale: 1.15 } : isProcessing ? { rotate: 360, scale: 1 } : { scale: 1 }}
                    transition={isProcessing ? { repeat: Infinity, duration: 2, ease: "linear" } : { type: "spring", stiffness: 300 }}
                    className="w-16 h-16 flex items-center justify-center border-2"
                    style={{
                      borderColor: isSuccess ? "var(--teal)" : phase === "error" ? "var(--red)" : phase === "drag" ? "var(--amber)" : "var(--border-2)",
                      background: isSuccess ? "rgba(0,191,165,0.08)" : phase === "error" ? "rgba(232,25,26,0.08)" : "var(--surface-2)",
                    }}
                  >
                    {isProcessing ? <Loader2 size={26} style={{ color: "var(--amber)" }} />
                      : isSuccess ? <CheckCircle size={26} style={{ color: "var(--teal)" }} />
                      : phase === "error" ? <AlertCircle size={26} style={{ color: "var(--red)" }} />
                      : <Upload size={26} style={{ color: "var(--text-3)" }} />}
                  </motion.div>

                  <div>
                    {phase === "idle" && <>
                      <p className="font-display text-xl mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--text-1)" }}>DROP PDF HERE</p>
                      <p className="text-label">or click to browse</p>
                    </>}
                    {phase === "drag" && <p className="font-display text-xl" style={{ fontFamily: "var(--font-display)", color: "var(--amber)" }}>RELEASE TO UPLOAD</p>}
                    {isProcessing && <>
                      <p className="font-display text-base mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--text-1)" }}>{fileName}</p>
                      <p style={{ fontFamily: "var(--font-body)", color: "var(--amber)", fontSize: "0.85rem" }}>{message || (phase === "uploading" ? "Uploading..." : "Analyzing structure...")}</p>
                    </>}
                    {isSuccess && <>
                      <p className="font-display text-xl mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--teal)" }}>
                        {phase === "cached" ? "ALREADY IN LIBRARY" : "PARSE COMPLETE"}
                      </p>
                      <p style={{ fontFamily: "var(--font-body)", color: "var(--text-2)", fontSize: "0.85rem" }}>Redirecting to your book...</p>
                    </>}
                    {phase === "error" && <>
                      <p className="font-display text-base mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--red)" }}>UPLOAD FAILED</p>
                      <p style={{ fontFamily: "var(--font-body)", color: "var(--text-3)", fontSize: "0.85rem" }}>{error}</p>
                      <button onClick={() => { setPhase("idle"); setError(null); }}
                        style={{ fontFamily: "var(--font-label)", fontSize: "10px", color: "var(--amber)", marginTop: 8, textDecoration: "underline" }}>
                        TRY AGAIN
                      </button>
                    </>}
                  </div>

                  {/* XP Progress bar */}
                  <AnimatePresence>
                    {(isProcessing || isSuccess) && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full max-w-xs">
                        <div className="flex justify-between mb-1.5">
                          <span className="text-label" style={{ fontSize: "9px" }}>{phase === "uploading" ? "UPLOADING" : phase === "parsing" ? "PARSING" : "COMPLETE"}</span>
                          <span className="text-label" style={{ fontSize: "9px", color: "var(--amber)" }}>{progress}%</span>
                        </div>
                        <div className="xp-bar">
                          <motion.div className="xp-fill" animate={{ width: `${progress}%` }} transition={{ duration: 0.35 }} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>

            {/* Chapter discovery cards (appear during parse) */}
            <AnimatePresence>
              {fakeChapters.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-label" style={{ color: "var(--teal)" }}>CHAPTERS DETECTED</span>
                    <div className="h-px flex-1" style={{ background: "var(--border)" }} />
                    <span className="text-label" style={{ color: "var(--teal)" }}>{fakeChapters.length}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {fakeChapters.map((ch, i) => (
                      <ChapterCard key={ch} title={ch} index={i} delay={0} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

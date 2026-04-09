/**
 * /video-reels — Video Reel Hub (v2)
 * =====================================
 * Handles three modes:
 *
 * 1. ?book=<id>  → Show reels for that book + "Generate More" button
 * 2. No params   → Global feed of all video reels from all books
 * 3. No reels    → Empty state with instructions
 *
 * v2 improvements:
 * - Full provider/model selector (matches book detail page UX)
 * - Real-time cost display during generation
 * - Better progress indicators with phase tracking
 */

"use client";

import React, { useEffect, useState, Suspense, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  Video, Loader2, Plus, ArrowLeft, Film,
  Upload, CheckCircle, AlertCircle, Sparkles,
  Lock, Eye, EyeOff, ExternalLink,
  DollarSign, Zap, Hash,
} from "lucide-react";
import Link from "next/link";
import {
  getVideoReels, getVideoReelsForBook, generateVideoReel,
  getReelMemory, getJobStatus, getBook, getBookSummaries,
  deleteVideoReel,
} from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { ReelVideoPlayer } from "@/components/ReelVideoPlayer";
import { ModelSelector } from "@/components/ModelSelector";
import { DeleteReelModal } from "@/components/DeleteReelModal";
import { ReelCard } from "@/components/ReelCard";
import type { VideoReel, LLMProvider } from "@/lib/types";


function VideoReelsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const bookId = searchParams.get("book");

  const [reels, setReels] = useState<VideoReel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookTitle, setBookTitle] = useState<string | null>(null);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [genProgress, setGenProgress] = useState(0);
  const [genCost, setGenCost] = useState<{
    input_tokens?: number;
    output_tokens?: number;
    estimated_cost_usd?: number;
  } | null>(null);
  const [memoryExhausted, setMemoryExhausted] = useState(false);
  const [summaryId, setSummaryId] = useState<string | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<VideoReel | null>(null);
  const [deleting, setDeleting] = useState(false);

  // API key / provider / model — mirroring book detail page UX
  const { apiKey, provider, model, setApiKey } = useAppStore();
  const [localKey, setLocalKey] = useState(apiKey ?? "");
  const [localProv, setLocalProv] = useState<LLMProvider>(
    provider === "openai" ? "openrouter" : provider,
  );
  const [localModel, setLocalModel] = useState(model ?? "google/gemini-2.5-flash");
  const [showKey, setShowKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from store when it changes
  useEffect(() => {
    if (apiKey) setLocalKey(apiKey);
    if (model) setLocalModel(model);
  }, [apiKey, model]);

  // Auto-expand config if no API key is set
  useEffect(() => {
    if (!localKey) setShowConfig(true);
  }, [localKey]);

  const loadReels = useCallback(async () => {
    try {
      if (bookId) {
        try {
          const book = await getBook(bookId);
          setBookTitle(book.title);
        } catch (e) {
          console.warn("[video-reels] Failed to load book info:", e);
        }

        try {
          const sums = await getBookSummaries(bookId);
          // Accept 'complete' or 'generating' (in-progress summaries still have content)
          const best = sums.find((s: any) => s.status === "complete")
            || sums.find((s: any) => s.status === "generating")
            || (sums.length > 0 ? sums[0] : null);
          if (best) setSummaryId(best.id);
        } catch (e) {
          console.warn("[video-reels] Failed to load summaries:", e);
        }

        const data = await getVideoReelsForBook(bookId);
        setReels(data.reels);

        try {
          const mem = await getReelMemory(bookId);
          setMemoryExhausted(mem.exhausted);
        } catch (e) {
          console.warn("[video-reels] Failed to load reel memory:", e);
        }
      } else {
        const data = await getVideoReels(0, 50);
        setReels(data.reels);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load reels");
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => { loadReels(); }, [loadReels]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, []);

  /** Generate a new video reel with full validation */
  const handleGenerate = async () => {
    const key = localKey.trim();
    if (!key) {
      setKeyError("Enter your API key above");
      setShowConfig(true);
      return;
    }
    if (localProv === "openai" && !key.startsWith("sk-")) {
      setKeyError("OpenAI keys start with sk-");
      return;
    }
    if (localProv === "openrouter" && !key.startsWith("sk-or")) {
      setKeyError("OpenRouter keys start with sk-or");
      return;
    }

    if (!summaryId) {
      setError("No completed summary found for this book. Generate a manga summary first!");
      return;
    }

    // Save to store
    setKeyError(null);
    setApiKey(key, localProv, localModel);
    setGenerating(true);
    setGenMsg("Queuing reel generation...");
    setGenProgress(0);
    setGenCost(null);

    try {
      const res = await generateVideoReel(summaryId, key, localProv, localModel);
      if (res.task_id) {
        const poll = async () => {
          try {
            const status = await getJobStatus(res.task_id);
            setGenMsg(status.message || "Generating...");
            setGenProgress(status.progress || 0);

            // Update cost from structured data
            if (status.reel_cost) {
              setGenCost(status.reel_cost);
            } else if (status.cost_so_far > 0) {
              setGenCost({ estimated_cost_usd: status.cost_so_far });
            }

            if (status.status === "success") {
              setGenerating(false);
              setGenMsg(null);
              await loadReels();
            } else if (status.status === "failure") {
              setGenerating(false);
              setGenMsg(null);
              setError(`Generation failed: ${status.error || "Unknown error"}`);
            } else {
              pollingRef.current = setTimeout(poll, 2000);
            }
          } catch {
            pollingRef.current = setTimeout(poll, 3000);
          }
        };
        poll();
      }
    } catch (err: any) {
      setGenerating(false);
      setGenMsg(null);
      setError(err.message);
    }
  };

  /** Delete a reel with confirmation */
  const handleDelete = async () => {
    if (!deleteTarget || !deleteTarget.book?.id) return;
    setDeleting(true);
    try {
      await deleteVideoReel(deleteTarget.book.id, deleteTarget.id);
      setDeleteTarget(null);
      await loadReels();
    } catch (err: any) {
      setError(err.message || "Failed to delete reel");
    } finally {
      setDeleting(false);
    }
  };

  // If we have reels and user wants to watch them
  if (showPlayer && reels.length > 0) {
    return (
      <ReelVideoPlayer
        reels={reels}
        backPath={bookId ? `/video-reels?book=${bookId}` : "/video-reels"}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="text-center">
          <Loader2 size={28} className="animate-spin mx-auto mb-4" style={{ color: "var(--amber)" }} />
          <p className="font-label" style={{ color: "var(--text-3)", fontSize: "10px" }}>LOADING VIDEO REELS…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Grid background */}
      <div className="fixed inset-0 opacity-25 pointer-events-none"
        style={{ backgroundImage: "linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px)", backgroundSize: "40px 40px" }} />

      <div className="relative z-10 max-w-2xl mx-auto px-4 md:px-8 py-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link href={bookId ? `/books/${bookId}` : "/"}>
            <motion.div whileHover={{ x: -3 }} className="flex items-center gap-1" style={{ color: "var(--text-3)" }}>
              <ArrowLeft size={16} />
              <span className="text-label" style={{ fontSize: "9px" }}>BACK</span>
            </motion.div>
          </Link>
          <div className="h-px flex-1" style={{ background: "var(--border)" }} />
          <span className="chapter-badge">VIDEO REELS</span>
        </div>

        {/* Book title if viewing specific book */}
        {bookTitle && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <p className="font-label" style={{ color: "var(--text-3)", fontSize: "9px", letterSpacing: "0.15em" }}>REELS FOR</p>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.4rem, 4vw, 2rem)", color: "var(--text-1)", lineHeight: 1.1 }}>
              {bookTitle}
            </h1>
          </motion.div>
        )}

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="panel p-4 mb-6 flex items-center gap-3"
              style={{ borderColor: "var(--red)" }}
            >
              <AlertCircle size={16} style={{ color: "var(--red)" }} />
              <p className="font-label flex-1" style={{ color: "var(--red)", fontSize: "10px" }}>{error}</p>
              <button onClick={() => setError(null)} style={{ color: "var(--text-3)" }}>✕</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── API Key + Model Configuration ──────────────────── */}
        {bookId && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <button
              onClick={() => setShowConfig((s) => !s)}
              className="w-full panel flex items-center justify-between px-4 py-3 transition-colors"
              style={{
                borderColor: localKey ? "var(--border)" : "rgba(245,166,35,0.4)",
                background: showConfig ? "var(--surface)" : "transparent",
              }}
            >
              <div className="flex items-center gap-2.5">
                <Zap size={14} style={{ color: localKey ? "var(--amber)" : "var(--text-3)" }} />
                <span className="font-label" style={{ fontSize: "11px", color: "var(--text-1)" }}>
                  {localKey ? "AI Configuration" : "Set up AI to generate reels"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {localKey && (
                  <span className="text-label px-2 py-0.5" style={{
                    background: "rgba(245,166,35,0.08)", color: "var(--amber)", fontSize: "8px",
                  }}>
                    {localProv === "openai" ? "OpenAI" : "OpenRouter"} · {localModel.split("/").pop()}
                  </span>
                )}
                <motion.span
                  animate={{ rotate: showConfig ? 180 : 0 }}
                  style={{ color: "var(--text-3)", fontSize: 12 }}
                >
                  ▾
                </motion.span>
              </div>
            </button>

            <AnimatePresence>
              {showConfig && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="panel p-5 flex flex-col gap-4 border-t-0" style={{ borderColor: "var(--border)" }}>
                    {/* Provider tabs */}
                    <div className="flex gap-2">
                      {(["openrouter", "openai"] as LLMProvider[]).map((p) => (
                        <button
                          key={p}
                          onClick={() => !generating && setLocalProv(p)}
                          disabled={generating}
                          className="flex-1 py-1.5 font-label border transition-all"
                          style={{
                            fontSize: "10px",
                            borderColor: localProv === p ? "var(--amber)" : "var(--border)",
                            background: localProv === p ? "rgba(245,166,35,0.08)" : "var(--surface-2)",
                            color: localProv === p ? "var(--amber)" : "var(--text-3)",
                          }}
                        >
                          {p === "openrouter" ? "OpenRouter" : "OpenAI"}
                        </button>
                      ))}
                    </div>

                    {/* API Key */}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Lock size={10} style={{ color: "var(--text-3)" }} />
                        <span className="text-label">API KEY (never stored on server)</span>
                        <a
                          href={localProv === "openai" ? "https://platform.openai.com/api-keys" : "https://openrouter.ai/keys"}
                          target="_blank" rel="noopener noreferrer"
                          className="ml-auto flex items-center gap-1 text-label hover:underline"
                          style={{ color: "var(--blue)", fontSize: "9px" }}
                        >
                          Get key <ExternalLink size={8} />
                        </a>
                      </div>
                      <div className="relative">
                        <input
                          type={showKey ? "text" : "password"}
                          value={localKey}
                          onChange={(e) => { setLocalKey(e.target.value); setKeyError(null); }}
                          disabled={generating}
                          placeholder={localProv === "openai" ? "sk-proj-…" : "sk-or-v1-…"}
                          className="w-full px-3 py-2.5 pr-9 text-sm border outline-none font-label"
                          style={{
                            background: "var(--surface-2)", color: "var(--text-1)", fontSize: "11px",
                            borderColor: keyError ? "var(--red)" : localKey ? "var(--amber)" : "var(--border)",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey((s) => !s)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2"
                          style={{ color: "var(--text-3)" }}
                        >
                          {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                      {keyError && (
                        <p className="font-label mt-1" style={{ color: "var(--red)", fontSize: "9px" }}>{keyError}</p>
                      )}
                    </div>

                    {/* Model selector (OpenRouter only) */}
                    {localProv === "openrouter" && (
                      <div>
                        <p className="text-label mb-1.5">MODEL</p>
                        <ModelSelector
                          apiKey={localKey}
                          value={localModel}
                          onChange={setLocalModel}
                          disabled={generating}
                        />
                      </div>
                    )}

                    <p className="text-label" style={{ fontSize: "8px" }}>
                      Reel generation uses ~1 LLM call. Typical cost: $0.001–$0.01 depending on model.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Existing Reels List */}
        {reels.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-label">{reels.length} VIDEO REEL{reels.length !== 1 ? "S" : ""}</span>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowPlayer(true)}
                className="btn-primary py-2 px-4 text-sm gap-2"
              >
                <Film size={14} /> Watch All
              </motion.button>
            </div>

            <div className="flex flex-col gap-2">
              {reels.map((reel, i) => (
                <ReelCard
                  key={reel.id}
                  reel={reel}
                  index={i}
                  onWatch={() => setShowPlayer(true)}
                  onDelete={() => setDeleteTarget(reel)}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Generation Progress ─────────────────────────── */}
        <AnimatePresence>
          {generating && genMsg && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="panel p-5 mb-6"
              style={{ borderColor: "rgba(245,166,35,0.2)" }}
            >
              <div className="flex items-center gap-3 mb-3">
                <Loader2 size={16} className="animate-spin" style={{ color: "var(--amber)" }} />
                <p className="font-label flex-1" style={{ color: "var(--amber)", fontSize: "10px" }}>
                  GENERATING VIDEO REEL
                </p>
                <span className="font-label" style={{ color: "var(--text-3)", fontSize: "9px" }}>
                  {genProgress}%
                </span>
              </div>

              <p className="font-label" style={{ color: "var(--text-2)", fontSize: "11px" }}>
                {genMsg}
              </p>

              {/* Progress bar */}
              <div className="mt-3 h-1.5 w-full" style={{ background: "var(--border)" }}>
                <motion.div
                  animate={{ width: `${genProgress}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="h-full"
                  style={{ background: "var(--amber)" }}
                />
              </div>

              {/* Cost breakdown */}
              {genCost && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-4 flex items-center gap-4"
                  style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}
                >
                  <div className="flex items-center gap-1.5">
                    <DollarSign size={10} style={{ color: "var(--amber)" }} />
                    <span className="font-label" style={{ color: "var(--text-1)", fontSize: "11px" }}>
                      ${(genCost.estimated_cost_usd || 0).toFixed(4)}
                    </span>
                  </div>
                  {genCost.input_tokens != null && (
                    <div className="flex items-center gap-1.5">
                      <Hash size={9} style={{ color: "var(--text-3)" }} />
                      <span className="text-label" style={{ fontSize: "9px" }}>
                        {((genCost.input_tokens || 0) + (genCost.output_tokens || 0)).toLocaleString()} tokens
                      </span>
                    </div>
                  )}
                  {genCost.input_tokens != null && (
                    <span className="text-label" style={{ fontSize: "8px" }}>
                      ({(genCost.input_tokens || 0).toLocaleString()} in · {(genCost.output_tokens || 0).toLocaleString()} out)
                    </span>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Generate Button */}
        {bookId && !memoryExhausted && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleGenerate}
              disabled={generating}
              className="w-full panel flex items-center justify-center gap-3 px-5 py-4 transition-colors"
              style={{
                borderColor: generating ? "var(--border)" : "rgba(245,166,35,0.3)",
                color: generating ? "var(--text-3)" : "var(--amber)",
                cursor: generating ? "wait" : "pointer",
              }}
            >
              {generating ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Plus size={18} />
              )}
              <span className="font-label" style={{ fontSize: "11px" }}>
                {generating
                  ? "GENERATING..."
                  : reels.length > 0
                    ? "GENERATE ANOTHER REEL"
                    : "GENERATE YOUR FIRST VIDEO REEL"}
              </span>
            </motion.button>
            <p className="text-center mt-2 font-label" style={{ color: "var(--text-3)", fontSize: "8px" }}>
              Each reel uses new content from the book · No repeats until all content is used
            </p>
          </motion.div>
        )}

        {/* Memory exhausted notice */}
        {memoryExhausted && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="panel p-4 flex items-center gap-3"
            style={{ borderColor: "rgba(42,135,3,0.3)" }}
          >
            <CheckCircle size={16} style={{ color: "var(--green, #2a8703)" }} />
            <p className="font-label" style={{ color: "var(--text-2)", fontSize: "10px" }}>
              All book content has been used! {reels.length} reel{reels.length !== 1 ? "s" : ""} generated.
            </p>
          </motion.div>
        )}

        {/* No summary found for this book */}
        {bookId && !summaryId && !loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="panel p-6 text-center">
            <Sparkles size={32} className="mx-auto mb-3" style={{ color: "var(--text-3)" }} />
            <p className="font-label mb-2" style={{ color: "var(--text-1)", fontSize: "12px" }}>
              No summary yet!
            </p>
            <p className="font-label mb-4" style={{ color: "var(--text-3)", fontSize: "10px" }}>
              Generate a manga summary first, then come back here to create video reels.
            </p>
            <Link href={`/books/${bookId}`}>
              <motion.div whileHover={{ scale: 1.03 }} className="btn-primary inline-flex gap-2 py-2.5 px-5 text-sm">
                <ArrowLeft size={14} /> Go to Book
              </motion.div>
            </Link>
          </motion.div>
        )}

        {/* Global empty state */}
        {!bookId && reels.length === 0 && !loading && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center pt-10">
            <motion.div
              animate={{ y: [-6, 6, -6] }}
              transition={{ repeat: Infinity, duration: 3 }}
              className="w-20 h-20 mx-auto mb-6 flex items-center justify-center border-2"
              style={{ borderColor: "var(--border-2)", background: "var(--surface)" }}
            >
              <Video size={32} style={{ color: "var(--text-3)" }} />
            </motion.div>

            <p className="chapter-badge mb-4 inline-flex">VIDEO REELS</p>
            <h1 style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(2rem, 6vw, 3.5rem)",
              color: "var(--text-1)", lineHeight: 1.1, marginBottom: 12,
            }}>
              NO VIDEO REELS YET.
            </h1>
            <p className="mb-8 max-w-sm mx-auto leading-relaxed"
              style={{ fontFamily: "var(--font-body)", color: "var(--text-3)", fontSize: "0.95rem" }}>
              Upload a book → generate a summary → then create video reels.
              Each reel is a 30-60s animated short with catchy insights from the book.
            </p>

            <div className="flex flex-col gap-3 max-w-xs mx-auto mb-8 text-left">
              {[
                { n: "01", label: "Upload a PDF book" },
                { n: "02", label: "Generate a manga summary" },
                { n: "03", label: "Click 🎬 VIDEO on any summary" },
                { n: "04", label: "Video reels appear here ✓" },
              ].map((step) => (
                <div key={step.n} className="flex items-center gap-3 panel px-3 py-2.5">
                  <span className="font-label w-6 flex-shrink-0" style={{ color: "var(--amber)", fontSize: "10px" }}>
                    {step.n}
                  </span>
                  <p className="font-label" style={{ color: "var(--text-2)", fontSize: "11px" }}>{step.label}</p>
                </div>
              ))}
            </div>

            <Link href="/upload">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                className="btn-primary inline-flex mx-auto gap-2">
                <Upload size={16} /> Upload a Book
              </motion.div>
            </Link>
          </motion.div>
        )}
      </div>

      {/* ── Delete Confirmation Modal ─────────────────────── */}
      <DeleteReelModal
        reel={deleteTarget}
        deleting={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default function VideoReelsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: "var(--amber)" }} />
      </div>
    }>
      <VideoReelsContent />
    </Suspense>
  );
}

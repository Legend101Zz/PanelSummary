"use client";

import { useEffect, useState, use, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  BookOpen, Film, Video, Loader2, CheckCircle,
  AlertCircle, Eye,
  Pencil, Check, Trash2,
  ChevronRight, Info, FileText
} from "lucide-react";
import {
  getBook, getBookSummaries,
  getJobStatus, getImageUrl, updateBookTitle, deleteSummary, generateReels,
  generateVideoReel, getVideoReelsForBook,
} from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { STYLE_OPTIONS } from "@/lib/types";
import { StatusBadge, TitleEditor } from "@/components/BookWidgets";
import { MangaV2ProjectPanel } from "@/components/MangaV2ProjectPanel";
import { GeneratePanel } from "@/components/GeneratePanel";
import type { Book, SummaryListItem, LLMProvider } from "@/lib/types";

// ─── SUMMARY ROW ───────────────────────────────────
function SummaryRow({ summary, bookId, onDeleted }: { summary: SummaryListItem; bookId: string; onDeleted: () => void }) {
  const opt = STYLE_OPTIONS.find(s => s.value === summary.style);
  const [deleting, setDeleting] = useState(false);
  const [generatingReels, setGeneratingReels] = useState(false);
  const [generatingVideoReel, setGeneratingVideoReel] = useState(false);
  const [reelTaskId, setReelTaskId] = useState<string | null>(null);
  const [reelDone, setReelDone] = useState(false);
  const [videoReelMsg, setVideoReelMsg] = useState<string | null>(null);
  const { apiKey, provider, model } = useAppStore();
  const router = useRouter();

  /** Get API key — prompt if missing */
  const ensureApiKey = (): string | null => {
    let key = apiKey;
    if (!key) {
      key = prompt("Enter your OpenRouter API key:");
      if (!key) return null;
      const store = useAppStore.getState();
      store.setApiKey(key, store.provider, store.model ?? undefined);
    }
    return key;
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!confirm("Delete this summary?")) return;
    setDeleting(true);
    try { await deleteSummary(summary.id); onDeleted(); } catch {}
    setDeleting(false);
  };

  const handleGenerateReels = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const key = ensureApiKey();
    if (!key) return;
    setGeneratingReels(true);
    try {
      const res = await generateReels(summary.id, { apiKey: key, provider: provider as LLMProvider, model: model ?? undefined });
      if (res.task_id) {
        setReelTaskId(res.task_id);
        const poll = async () => {
          const status = await getJobStatus(res.task_id!);
          if (status.status === "success") { setReelDone(true); setGeneratingReels(false); onDeleted(); }
          else if (status.status === "failure") { setGeneratingReels(false); alert("Reel generation failed"); }
          else setTimeout(poll, 2000);
        };
        poll();
      } else {
        setReelDone(true); setGeneratingReels(false);
      }
    } catch { setGeneratingReels(false); }
  };

  const handleGenerateVideoReel = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const key = ensureApiKey();
    if (!key) return;
    setGeneratingVideoReel(true);
    setVideoReelMsg("Starting...");
    try {
      const res = await generateVideoReel(summary.id, key, provider, model ?? undefined);
      if (res.task_id) {
        const poll = async () => {
          const status = await getJobStatus(res.task_id);
          setVideoReelMsg(status.message || "Generating...");
          if (status.status === "success") {
            setGeneratingVideoReel(false);
            setVideoReelMsg(null);
            router.push(`/video-reels?book=${bookId}`);
          } else if (status.status === "failure") {
            setGeneratingVideoReel(false);
            setVideoReelMsg(null);
            alert(`Video reel failed: ${status.error || "Unknown error"}`);
          } else {
            setTimeout(poll, 2500);
          }
        };
        poll();
      }
    } catch (err: any) {
      setGeneratingVideoReel(false);
      setVideoReelMsg(null);
      alert(`Error: ${err.message}`);
    }
  };

  const hasReels = summary.total_reels > 0 || reelDone;

  return (
    <motion.div whileHover={{ x: 3 }} className="panel px-4 py-3">
      <div className="flex items-center justify-between">
        <Link href={`/books/${bookId}/manga?summary=${summary.id}`} className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-xl">{opt?.emoji}</span>
          <div className="min-w-0">
            <p className="font-label capitalize" style={{ color: "var(--text-1)", fontSize: "11px" }}>{summary.style} Style</p>
            <p className="text-label" style={{ fontSize: "9px" }}>
              {summary.total_chapters} ch · {hasReels ? `${summary.total_reels} reels` : "no reels yet"}
              {summary.estimated_cost_usd > 0 && ` · $${summary.estimated_cost_usd.toFixed(3)}`}
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={summary.status} />
          {summary.status === "complete" && (
            <>
              <Link href={`/books/${bookId}/manga?summary=${summary.id}`} title="Read manga">
                <BookOpen size={14} style={{ color: "var(--amber)" }} />
              </Link>
              {hasReels ? (
                <Link href={`/reels?summary=${summary.id}`} title="View lesson reels">
                  <Film size={14} style={{ color: "var(--red)" }} />
                </Link>
              ) : (
                <button
                  onClick={handleGenerateReels}
                  disabled={generatingReels}
                  title="Generate lesson reels"
                  className="flex items-center gap-1 px-2 py-0.5 border"
                  style={{ borderColor: "var(--red)", color: "var(--red)", fontSize: "8px", fontFamily: "var(--font-label)", opacity: generatingReels ? 0.6 : 1 }}
                >
                  {generatingReels ? <Loader2 size={10} className="animate-spin" /> : <Film size={10} />}
                  {generatingReels ? "..." : "REELS"}
                </button>
              )}
              {/* Video Reel generate button */}
              <button
                onClick={handleGenerateVideoReel}
                disabled={generatingVideoReel}
                title="Generate a video reel from this summary"
                className="flex items-center gap-1 px-2 py-0.5 border"
                style={{
                  borderColor: "var(--amber)",
                  color: "var(--amber)",
                  fontSize: "8px",
                  fontFamily: "var(--font-label)",
                  opacity: generatingVideoReel ? 0.6 : 1,
                  background: generatingVideoReel ? "rgba(245,166,35,0.06)" : "transparent",
                }}
              >
                {generatingVideoReel ? <Loader2 size={10} className="animate-spin" /> : <Video size={10} />}
                {generatingVideoReel ? "..." : "🎬 VIDEO"}
              </button>
            </>
          )}
          <button onClick={handleDelete} disabled={deleting} style={{ color: "var(--text-3)" }} title="Delete">
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        </div>
      </div>
      {/* Progress message for video reel generation */}
      {videoReelMsg && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="mt-2 flex items-center gap-2 px-2 py-1.5"
          style={{ background: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.15)" }}
        >
          <Loader2 size={10} className="animate-spin flex-shrink-0" style={{ color: "var(--amber)" }} />
          <p className="font-label" style={{ color: "var(--amber)", fontSize: "9px" }}>{videoReelMsg}</p>
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────
export default function BookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [book, setBook]           = useState<Book | null>(null);
  const [title, setTitle]         = useState("");
  const [summaries, setSummaries] = useState<SummaryListItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, sums] = await Promise.all([getBook(id), getBookSummaries(id).catch(() => [])]);
      setBook(b); setTitle(b.title); setSummaries(sums);
    } catch { setError("Book not found"); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
      <Loader2 size={28} className="animate-spin" style={{ color: "var(--amber)" }} />
    </div>
  );

  if (error || !book) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4" style={{ background: "var(--bg)" }}>
      <AlertCircle size={40} style={{ color: "var(--red)" }} />
      <p className="font-display text-2xl" style={{ fontFamily: "var(--font-display)" }}>{error}</p>
      <Link href="/" className="text-label" style={{ color: "var(--amber)" }}>← Back</Link>
    </div>
  );

  const coverUrl    = getImageUrl(book.cover_image_id);
  const isParsed    = book.status === "parsed";
  const hasComplete = summaries.some(s => s.status === "complete");
  const firstDone   = summaries.find(s => s.status === "complete");

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="fixed inset-0 opacity-25 pointer-events-none"
        style={{ backgroundImage: "linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px)", backgroundSize: "40px 40px" }} />

      <div className="relative z-10 max-w-5xl mx-auto px-4 md:px-8 py-10">

        {/* ── BOOK HEADER ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex gap-6 mb-10">
          {/* Cover */}
          <div className="flex-shrink-0">
            {coverUrl
              ? <img src={coverUrl} alt={title} className="w-28 h-40 object-cover border-2" style={{ borderColor: "var(--border)" }} />
              : <div className="w-28 h-40 border-2 flex items-center justify-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  <BookOpen size={28} style={{ color: "var(--text-3)" }} />
                </div>
            }
          </div>

          {/* Meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <span className="chapter-badge">CH.02 — BOOK DETAIL</span>
              <StatusBadge status={book.status} />
            </div>

            <TitleEditor bookId={id} initial={title} onSaved={t => setTitle(t)} />

            {book.author && <p className="mt-1 mb-2" style={{ color: "var(--text-3)", fontFamily: "var(--font-body)", fontSize: "0.9rem" }}>by {book.author}</p>}
            <div className="flex flex-wrap gap-4 mb-4 font-label" style={{ color: "var(--text-3)", fontSize: "10px" }}>
              <span>{book.total_pages} pages</span><span>·</span>
              <span>{book.total_chapters} chapters</span>
              {book.total_words > 0 && <><span>·</span><span>~{Math.ceil(book.total_words / 200)} min read</span></>}
            </div>

            <div className="flex flex-wrap gap-3">
              {hasComplete && (
                <>
                  <Link href={`/books/${id}/manga?summary=${firstDone?.id}`}>
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="btn-primary py-2.5 px-5 text-sm gap-2">
                      <Eye size={14} /> Read Manga
                    </motion.div>
                  </Link>
                  <Link href={`/reels?summary=${firstDone?.id}`}>
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="btn-secondary py-2.5 px-5 text-sm gap-2">
                      <Film size={14} /> Watch Reels
                    </motion.div>
                  </Link>
                  <Link href={`/video-reels?book=${id}`}>
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      className="flex items-center gap-2 py-2.5 px-5 border text-sm font-label transition-colors"
                      style={{ borderColor: "var(--red)", color: "var(--red)", background: "var(--surface)", fontSize: "11px" }}>
                      <Video size={14} /> Video Reels
                    </motion.div>
                  </Link>
                </>
              )}
              <Link href={`/books/${id}/read`}>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 py-2.5 px-5 border text-sm font-label transition-colors"
                  style={{ borderColor: "var(--border-2)", color: "var(--text-2)", background: "var(--surface)",
                    fontSize: "11px" }}>
                  <FileText size={14} /> Read PDF
                </motion.div>
              </Link>
            </div>
          </div>
        </motion.div>

        {/* ── MAIN GRID ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6 items-start">

          {/* Left */}
          <div className="flex flex-col gap-4">
            {isParsed && (
              <>
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                  <GeneratePanel book={book} onComplete={sid => router.push(`/books/${id}/manga?summary=${sid}`)} />
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
                  <MangaV2ProjectPanel book={book} />
                </motion.div>
              </>
            )}

            {summaries.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-label">SUMMARIES</span>
                  <div className="h-px flex-1" style={{ background: "var(--border)" }} />
                </div>
                <div className="flex flex-col gap-2">
                  {summaries.map(s => (
                    <SummaryRow key={s.id} summary={s} bookId={id} onDeleted={load} />
                  ))}
                </div>
              </motion.div>
            )}

            {!isParsed && summaries.length === 0 && (
              <div className="panel p-5 flex items-center gap-3">
                <Loader2 size={16} className="animate-spin flex-shrink-0" style={{ color: "var(--amber)" }} />
                <p className="font-label" style={{ color: "var(--text-3)", fontSize: "10px" }}>
                  {book.status === "parsing" ? "Parsing in progress…" : `Status: ${book.status}`}
                </p>
              </div>
            )}
          </div>

          {/* Right: chapters */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-label">SECTIONS DETECTED ({book.total_chapters})</span>
              <div className="h-px flex-1" style={{ background: "var(--border)" }} />
            </div>
            <p className="font-label mb-3" style={{ color: "var(--text-3)", fontSize: "8px", lineHeight: 1.5 }}>
              Each heading/section in your PDF is treated as a chapter.
              Docling detected {book.total_chapters} sections across {book.total_pages} pages.
              Each section gets its own manga chapter + reel lesson.
            </p>
            <div className="flex flex-col gap-1.5">
              {book.chapters.map((ch, i) => (
                <motion.div key={ch.index}
                  initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                  className="panel flex items-center gap-3 px-3 py-2.5">
                  <span className="font-label w-6 text-right flex-shrink-0" style={{ color: "var(--text-3)", fontSize: "10px" }}>
                    {String(ch.index + 1).padStart(2, "0")}
                  </span>
                  <p className="flex-1 truncate text-sm" style={{ fontFamily: "var(--font-body)", color: "var(--text-2)" }}>
                    {ch.title}
                  </p>
                  <div className="flex gap-3 flex-shrink-0 font-label" style={{ color: "var(--text-3)", fontSize: "9px" }}>
                    <span>pp.{ch.page_start}–{ch.page_end}</span>
                    {ch.image_count > 0 && <span>📷{ch.image_count}</span>}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

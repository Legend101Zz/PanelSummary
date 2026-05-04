"use client";

/**
 * Book detail page — v2 manga only.
 *
 * Shows book metadata + chapter list on the right, and the v2 manga
 * project panel on the left. The legacy "summary + reels + video reels"
 * flow has been removed; the only generation entry point is the v2
 * MangaProject pipeline (which will eventually replace summaries entirely).
 */

import { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  BookOpen, Loader2, AlertCircle, FileText,
} from "lucide-react";
import { getBook, getImageUrl } from "@/lib/api";
import { StatusBadge, TitleEditor } from "@/components/BookWidgets";
import { MangaV2ProjectPanel } from "@/components/MangaV2ProjectPanel";
import type { Book } from "@/lib/types";


export default function BookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [book, setBook]       = useState<Book | null>(null);
  const [title, setTitle]     = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const b = await getBook(id);
      setBook(b);
      setTitle(b.title);
    } catch {
      setError("Book not found");
    } finally {
      setLoading(false);
    }
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

  const coverUrl = getImageUrl(book.cover_image_id);
  const isParsed = book.status === "parsed";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div
        className="fixed inset-0 opacity-25 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto px-4 md:px-8 py-10">

        {/* ── BOOK HEADER ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-6 mb-10"
        >
          <div className="flex-shrink-0">
            {coverUrl
              ? <img src={coverUrl} alt={title} className="w-28 h-40 object-cover border-2" style={{ borderColor: "var(--border)" }} />
              : (
                <div className="w-28 h-40 border-2 flex items-center justify-center"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  <BookOpen size={28} style={{ color: "var(--text-3)" }} />
                </div>
              )
            }
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <span className="chapter-badge">CH.02 — BOOK DETAIL</span>
              <StatusBadge status={book.status} />
            </div>

            <TitleEditor bookId={id} initial={title} onSaved={t => setTitle(t)} />

            {book.author && (
              <p className="mt-1 mb-2"
                style={{ color: "var(--text-3)", fontFamily: "var(--font-body)", fontSize: "0.9rem" }}>
                by {book.author}
              </p>
            )}

            <div className="flex flex-wrap gap-4 mb-4 font-label"
              style={{ color: "var(--text-3)", fontSize: "10px" }}>
              <span>{book.total_pages} pages</span>
              <span>·</span>
              <span>{book.total_chapters} chapters</span>
              {book.total_words > 0 && (
                <>
                  <span>·</span>
                  <span>~{Math.ceil(book.total_words / 200)} min read</span>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href={`/books/${id}/read`}>
                <motion.div
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 py-2.5 px-5 border text-sm font-label transition-colors"
                  style={{
                    borderColor: "var(--border-2)", color: "var(--text-2)",
                    background: "var(--surface)", fontSize: "11px",
                  }}>
                  <FileText size={14} /> Read PDF
                </motion.div>
              </Link>
            </div>
          </div>
        </motion.div>

        {/* ── MAIN GRID ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6 items-start">

          {/* Left: v2 manga project panel */}
          <div className="flex flex-col gap-4">
            {isParsed && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
                <MangaV2ProjectPanel book={book} />
              </motion.div>
            )}

            {!isParsed && (
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
            <p className="font-label mb-3"
              style={{ color: "var(--text-3)", fontSize: "8px", lineHeight: 1.5 }}>
              Each heading/section in your PDF is treated as a chapter.
              Docling detected {book.total_chapters} sections across {book.total_pages} pages.
            </p>
            <div className="flex flex-col gap-1.5">
              {book.chapters.map((ch, i) => (
                <motion.div key={ch.index}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="panel flex items-center gap-3 px-3 py-2.5">
                  <span className="font-label w-6 text-right flex-shrink-0"
                    style={{ color: "var(--text-3)", fontSize: "10px" }}>
                    {String(ch.index + 1).padStart(2, "0")}
                  </span>
                  <p className="flex-1 truncate text-sm"
                    style={{ fontFamily: "var(--font-body)", color: "var(--text-2)" }}>
                    {ch.title}
                  </p>
                  <div className="flex gap-3 flex-shrink-0 font-label"
                    style={{ color: "var(--text-3)", fontSize: "9px" }}>
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

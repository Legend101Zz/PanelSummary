"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { Film, Upload, Loader2 } from "lucide-react";
import Link from "next/link";
import { getReels, getSummary } from "@/lib/api";
import type { ReelLesson } from "@/lib/types";
import { ReelsFeed } from "@/components/ReelsFeed";

function ReelsContent() {
  const searchParams  = useSearchParams();
  const summaryId     = searchParams.get("summary");
  const [reels, setReels]   = useState<ReelLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (summaryId) {
          const summary = await getSummary(summaryId);
          if (summary.reels?.length) {
            setReels(summary.reels.map((r, i) => ({
              ...r,
              summary_id: summaryId,
              total_reels_in_book: summary.reels.length,
            })));
            return;
          }
        }
        // Fall back to global reel feed
        const data = await getReels(0, 50);
        setReels(data.reels);
      } catch (e) {
        setError("Could not load reels");
      } finally {
        setLoading(false);
      }
    })();
  }, [summaryId]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
      <div className="text-center">
        <Loader2 size={32} className="animate-spin mx-auto mb-4" style={{ color: "var(--amber)" }} />
        <p className="font-label" style={{ color: "var(--text-3)" }}>LOADING REELS…</p>
      </div>
    </div>
  );

  if (!reels.length) return (
    <div className="min-h-screen flex items-center justify-center text-center px-4" style={{ background: "var(--bg)" }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Floating icon */}
        <motion.div animate={{ y: [-6, 6, -6] }} transition={{ repeat: Infinity, duration: 3 }}
          className="w-20 h-20 mx-auto mb-6 flex items-center justify-center border-2"
          style={{ borderColor: "var(--border-2)", background: "var(--surface)" }}>
          <Film size={32} style={{ color: "var(--text-3)" }} />
        </motion.div>

        <p className="chapter-badge mb-4 inline-flex">CH.02 — REEL FEED</p>
        <h1 className="font-display mb-3"
          style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem,6vw,4rem)", color: "var(--text-1)" }}>
          NO REELS YET.
        </h1>
        <p className="mb-8 max-w-sm mx-auto leading-relaxed"
          style={{ fontFamily: "var(--font-body)", color: "var(--text-3)", fontSize: "0.95rem" }}>
          Upload a book, generate a summary, then come back here to binge-learn chapter by chapter.
        </p>

        {/* Steps */}
        <div className="flex flex-col gap-3 max-w-xs mx-auto mb-8 text-left">
          {[
            { n: "01", label: "Upload a PDF book" },
            { n: "02", label: "Click Generate Summary" },
            { n: "03", label: "Enter your API key" },
            { n: "04", label: "Reels appear here ✓" },
          ].map(step => (
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
            <Upload size={16} />
            Upload Your First Book
          </motion.div>
        </Link>

        {error && <p className="mt-4 text-xs font-label" style={{ color: "var(--red)" }}>{error}</p>}
      </motion.div>
    </div>
  );

  return <ReelsFeed reels={reels} />;
}

export default function ReelsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <Loader2 size={32} className="animate-spin" style={{ color: "var(--amber)" }} />
      </div>
    }>
      <ReelsContent />
    </Suspense>
  );
}

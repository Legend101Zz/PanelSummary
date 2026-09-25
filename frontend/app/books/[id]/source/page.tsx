"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ApiError, getPdfInfo, pdfPageUrl, type PdfInfo } from "@/lib/api";
import { ArrowLeft, ChevronLeft, ChevronRight } from "@/components/Icons";
import styles from "./source.module.css";

export default function SourcePage() {
  return (
    <Suspense fallback={null}>
      <SourceViewer />
    </Suspense>
  );
}

function SourceViewer() {
  const { id: bookId } = useParams<{ id: string }>();
  const params = useSearchParams();
  const urlPage = Math.max(1, Math.floor(Number(params.get("page"))) || 1);
  const fromParam = params.get("from");
  // only ever return to one of our own reader pages
  const from = fromParam && /^\/books\/[0-9a-f]{24}\/read(\?|$)/.test(fromParam) ? fromParam : null;

  const [info, setInfo] = useState<PdfInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(urlPage);
  const [failed, setFailed] = useState<number | null>(null);

  useEffect(() => {
    getPdfInfo(bookId)
      .then(setInfo)
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? "This book's PDF is not available." : "The PDF could not be loaded."));
  }, [bookId]);

  useEffect(() => {
    const onPop = () => setPage(Math.max(1, Math.floor(Number(new URL(window.location.href).searchParams.get("page"))) || 1));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const total = info?.total_pages ?? 0;
  useEffect(() => {
    if (total && page > total) setPage(total);
  }, [total, page]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("page", String(page));
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
    document.title = info ? `${info.title}, PDF page ${page} | PanelSummary` : "Source | PanelSummary";
    for (const n of [page + 1, page - 1]) {
      if (n >= 1 && (!total || n <= total)) new Image().src = pdfPageUrl(bookId, n);
    }
  }, [page, info, bookId, total]);

  const go = useCallback((n: number) => setPage((p) => (n < 1 || (total && n > total) ? p : n)), [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") go(page + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(page - 1);
      else if (e.key === "Home") go(1);
      else if (e.key === "End" && total) go(total);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, page, total]);

  const back = from ?? `/books/${bookId}`;
  return (
    <div className={styles.viewer}>
      <header className={styles.topbar}>
        <Link href={back} className={styles.back}>
          <ArrowLeft />
          <span>{from ? "Back to the manga" : info?.title ?? "Back to the book"}</span>
        </Link>
        <p className={styles.counter}>
          {total ? (
            <>
              PDF page {page} <span className={styles.of}>of {total}</span>
            </>
          ) : (
            " "
          )}
        </p>
        <span />
      </header>

      <main id="main" className={styles.stage}>
        {error ? (
          <p className={styles.message} role="alert">
            {error}
          </p>
        ) : (
          <figure className={styles.figure}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={page}
              src={pdfPageUrl(bookId, page)}
              alt={`Page ${page} of the source PDF${info ? `, ${info.title}` : ""}`}
              className={styles.pdf}
              onError={() => setFailed(page)}
            />
            {failed === page ? <figcaption className={styles.message}>This page could not be shown.</figcaption> : null}
          </figure>
        )}
      </main>

      <footer className={styles.bottombar}>
        <button type="button" className={styles.navBtn} onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous PDF page">
          <ChevronLeft />
        </button>
        <label className={styles.jump}>
          <span className="sr-only">Go to PDF page</span>
          <input
            type="number"
            min={1}
            max={total || undefined}
            value={page}
            inputMode="numeric"
            onChange={(e) => {
              const n = Math.floor(Number(e.target.value));
              if (Number.isFinite(n)) go(n);
            }}
          />
        </label>
        <button type="button" className={styles.navBtn} onClick={() => go(page + 1)} disabled={!!total && page >= total} aria-label="Next PDF page">
          <ChevronRight />
        </button>
      </footer>
    </div>
  );
}

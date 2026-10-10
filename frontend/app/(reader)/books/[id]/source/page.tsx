"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getPdfInfo, pdfPageUrl, type PdfInfo } from "@/lib/api";
import { Button, IconButton, Notice, NumberField, Skeleton, TextLink, ChevronLeftIcon, ChevronRightIcon } from "@/components/ui";
import { pdfViewerTitle } from "@/lib/words";
import styles from "./source.module.css";

export default function SourcePage() {
  return (
    <Suspense fallback={null}>
      <SourceViewer />
    </Suspense>
  );
}

type Load = { page: number; retry: number; state: "loading" | "loaded" | "failed" };
type InfoError = "missing" | "failed";

function SourceViewer() {
  const { id: bookId } = useParams<{ id: string }>();
  const params = useSearchParams();
  const urlPage = Math.max(1, Math.floor(Number(params.get("page"))) || 1);
  const fromParam = params.get("from");
  // only ever return to one of our own reader pages
  const from = fromParam && /^\/books\/[0-9a-f]{24}\/read(\?|$)/.test(fromParam) ? fromParam : null;

  const [info, setInfo] = useState<PdfInfo | null>(null);
  const [infoError, setInfoError] = useState<InfoError | null>(null);
  const [infoTry, setInfoTry] = useState(0);
  const [page, setPage] = useState(urlPage);
  const [retry, setRetry] = useState(0);
  const [load, setLoad] = useState<Load>({ page: urlPage, retry: 0, state: "loading" });
  const [typed, setTyped] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // The server renders the <img>, so the browser can finish loading it before React attaches onLoad. Read its state when the page changes.
  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete) setLoad({ page, retry, state: el.naturalWidth > 0 ? "loaded" : "failed" });
  }, [page, retry]);

  useEffect(() => {
    let live = true;
    setInfoError(null);
    getPdfInfo(bookId)
      .then((i) => live && setInfo(i))
      .catch((e) => live && setInfoError(e instanceof ApiError && e.status === 404 ? "missing" : "failed"));
    return () => {
      live = false;
    };
  }, [bookId, infoTry]);

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
    document.title = `${info ? pdfViewerTitle(info.title, page) : "Source"} | PanelSummary`;
    for (const n of [page + 1, page - 1]) {
      if (n >= 1 && (!total || n <= total)) new Image().src = pdfPageUrl(bookId, n);
    }
  }, [page, info, bookId, total]);

  const go = useCallback(
    (n: number) => {
      setTyped(null);
      setPage((p) => (n < 1 || (total && n > total) ? p : n));
    },
    [total],
  );

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
  const backName = from ? "Back to the manga" : info?.title ? `Back to ${info.title}` : "Back to the book";
  const pageState = load.page === page && load.retry === retry ? load.state : "loading";
  const typedNumber = typed === null ? null : Math.floor(Number(typed));
  const outOfRange = typed !== null && total > 0 && (!Number.isFinite(typedNumber) || typedNumber! < 1 || typedNumber! > total);
  const unavailable = infoError !== null;

  return (
    <div className={`app-reading-room ${styles.viewer}`}>
      <header className={styles.topbar}>
        <TextLink href={back} kind="back" aria-label={backName} className={styles.back}>
          <span className={styles.long} aria-hidden="true">
            {backName}
          </span>
          <span className={styles.short} aria-hidden="true">
            {from ? "Back to the manga" : "Back to the book"}
          </span>
        </TextLink>
        <p className={styles.counter}>
          {total ? (
            <>
              PDF page {page} <span className={styles.of}>of {total}</span>
            </>
          ) : (
            " "
          )}
        </p>
        <span />
      </header>

      <main id="main" className={styles.stage}>
        {infoError === "missing" ? (
          <div className={styles.state}>
            <Notice tone="needs" role="alert" title="This book's PDF is not available.">
              The manga pages are still on your shelf.
            </Notice>
            <TextLink href={back}>{from ? "Back to the manga" : "Back to the book"}</TextLink>
          </div>
        ) : infoError === "failed" ? (
          <div className={styles.state}>
            <Notice tone="needs" role="alert" title="The PDF could not be loaded.">
              Check that the PanelSummary server is running, then try again.
            </Notice>
            <div className={styles.actions}>
              <Button variant="primary" size="md" onClick={() => setInfoTry((n) => n + 1)}>
                Try again
              </Button>
              <TextLink href={back}>{from ? "Back to the manga" : "Back to the book"}</TextLink>
            </div>
          </div>
        ) : (
          <figure className={styles.figure}>
            {pageState === "loading" ? (
              <div className={styles.loading} role="status">
                <Skeleton shape="block" width="100%" height="100%" />
                <span className={styles.loadingText}>Loading PDF page {page}</span>
              </div>
            ) : null}
            {pageState === "failed" ? (
              <div className={styles.state}>
                <Notice tone="needs" role="alert" title="This page could not be shown.">
                  Try again, or go to another PDF page.
                </Notice>
                <div className={styles.actions}>
                  <Button variant="primary" size="md" onClick={() => setRetry((n) => n + 1)}>
                    Try again
                  </Button>
                  <TextLink href={back}>{from ? "Back to the manga" : "Back to the book"}</TextLink>
                </div>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={imgRef}
                key={`${page}-${retry}`}
                src={retry ? `${pdfPageUrl(bookId, page)}&retry=${retry}` : pdfPageUrl(bookId, page)}
                alt={`Page ${page} of the source PDF${info ? `, ${info.title}` : ""}`}
                className={styles.pdf}
                style={pageState === "loaded" ? undefined : { display: "none" }}
                onLoad={() => setLoad({ page, retry, state: "loaded" })}
                onError={() => setLoad({ page, retry, state: "failed" })}
              />
            )}
          </figure>
        )}
      </main>

      <footer className={styles.bottombar}>
        {unavailable || !total ? null : (
          <>
            {outOfRange ? (
              <p className={styles.range} role="status">
                Choose a PDF page from 1 to {total}.
              </p>
            ) : null}
            <IconButton label="Previous PDF page" icon={<ChevronLeftIcon size={20} />} onClick={() => go(page - 1)} disabled={page <= 1} />
            <NumberField
              className={styles.jump}
              label="Go to PDF page"
              min={1}
              max={total}
              value={typed ?? String(page)}
              invalid={outOfRange}
              suffix={`of ${total}`}
              onChange={(e) => {
                setTyped(e.target.value);
                const n = Math.floor(Number(e.target.value));
                if (e.target.value !== "" && Number.isFinite(n) && n >= 1 && n <= total) setPage(n);
              }}
              onBlur={() => setTyped(null)}
            />
            <IconButton label="Next PDF page" icon={<ChevronRightIcon size={20} />} onClick={() => go(page + 1)} disabled={page >= total} />
            <span className={styles.keys}>Keys: Left and Right, Page Up and Page Down, Home and End</span>
          </>
        )}
      </footer>
    </div>
  );
}

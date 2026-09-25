"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  cancelEdition,
  generateEdition,
  getBook,
  getEdition,
  isActive,
  listEditions,
  loadPage,
  resumeEdition,
  type BookDetail,
  type ClaimDetail,
  type EditionDetail,
} from "@/lib/api";
import { usePoll } from "@/lib/hooks";
import { readPosition } from "@/lib/position";
import { bookFacts, editionSummary, formatTokens, plural, shelfStatus, stageLine } from "@/lib/words";
import { SiteHeader } from "@/components/SiteHeader";
import { Cover, Obi } from "@/components/Paper";
import { CoverSvg } from "@/components/CoverArt";
import { PageThumb } from "@/components/PageThumb";
import { ArrowLeft } from "@/components/Icons";
import styles from "./book.module.css";

export default function BookPage() {
  const { id: bookId } = useParams<{ id: string }>();
  const [book, setBook] = useState<BookDetail | null>(null);
  const [edition, setEdition] = useState<EditionDetail | null>(null);
  const [editionsLoaded, setEditionsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<"generate" | "cancel" | "resume" | null>(null);
  const [coverSvg, setCoverSvg] = useState<string | null>(null);
  const [lastRead, setLastRead] = useState<number | null>(null);
  // The API does not expose cancel_requested yet, so "stopping" is remembered here.
  const [stopRequested, setStopRequested] = useState(false);

  const loadBook = useCallback(async () => {
    try {
      setBook(await getBook(bookId));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError && e.status === 404 ? "This book is not on your shelf." : e instanceof Error ? e.message : "The book could not be loaded.");
    }
  }, [bookId]);

  const loadEdition = useCallback(async (editionId?: string) => {
    const id = editionId ?? (await listEditions(bookId))[0]?.id;
    setEditionsLoaded(true);
    if (!id) return;
    setEdition(await getEdition(id));
  }, [bookId]);

  useEffect(() => {
    loadBook();
    loadEdition().catch(() => setEditionsLoaded(true));
  }, [loadBook, loadEdition]);

  const parsing = book !== null && (book.status === "uploaded" || book.status === "parsing");
  usePoll(loadBook, 2000, parsing);

  const active = isActive(edition?.status);
  usePoll(() => (edition ? loadEdition(edition.id) : undefined), 2000, !!edition && active);
  const stopping = active && (stopRequested || pending === "cancel");
  useEffect(() => {
    if (!active) setStopRequested(false);
  }, [active]);

  const page1 = edition?.pages.find((p) => p.page_number === 1);
  useEffect(() => {
    if (!edition || page1?.status !== "accepted" || coverSvg) return;
    loadPage(edition.id, 1)
      .then((p) => p.svg && setCoverSvg(p.svg))
      .catch(() => undefined);
  }, [edition, page1?.status, coverSvg]);

  useEffect(() => {
    if (edition) setLastRead(readPosition(edition.id));
  }, [edition?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (kind: "generate" | "cancel" | "resume") => {
    setPending(kind);
    setActionError(null);
    try {
      if (kind === "generate") {
        const result = await generateEdition(bookId);
        await loadEdition(result.edition.id);
      } else if (edition) {
        if (kind === "cancel") {
          await cancelEdition(edition.id);
          setStopRequested(true);
        } else await resumeEdition(edition.id);
        await loadEdition(edition.id);
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setPending(null);
    }
  };

  if (loadError && !book) {
    return (
      <>
        <SiteHeader />
        <main id="main" className="page-main">
          <BackLink />
          <div className="notice" role="alert">
            {loadError}
          </div>
        </main>
      </>
    );
  }

  const acceptedCount = edition?.pages.filter((p) => p.status === "accepted").length ?? 0;
  const failedPages = edition?.pages.filter((p) => p.status === "failed") ?? [];
  const canRead = !!edition && (page1?.status === "accepted" || (!isActive(edition.status) && acceptedCount > 0));
  const readHref = edition ? `/books/${bookId}/read?edition=${edition.id}&page=${lastRead ?? 1}` : "#";
  // edition.pages_accepted is only written when a run finishes; count the pages instead
  const status = book
    ? shelfStatus({
        ...book,
        latest_edition: edition
          ? { id: edition.id, status: edition.status, page_total: edition.page_total || edition.pages.length, pages_accepted: acceptedCount }
          : null,
      })
    : null;
  const progress = edition && edition.page_total > 0 && isActive(edition.status) ? acceptedCount / edition.page_total : undefined;

  return (
    <>
      <SiteHeader />
      <main id="main" className="page-main">
        <BackLink />

        <section className={styles.hero} aria-labelledby="book-title">
          <div className={styles.cover}>
            {book ? (
              <Cover
                size="hero"
                title={book.title}
                author={book.author}
                art={coverSvg ? <CoverSvg svg={coverSvg} /> : undefined}
                obi={
                  status && editionsLoaded ? (
                    <Obi tone={status.tone} progress={progress}>
                      {status.text}
                    </Obi>
                  ) : undefined
                }
              />
            ) : (
              <div className={styles.coverPlaceholder} />
            )}
          </div>

          <div className={styles.heroText}>
            <h1 id="book-title" className="page-title">
              {book?.title ?? " "}
            </h1>
            {book?.author ? <p className={styles.author}>{book.author}</p> : null}
            {book ? <p className={styles.facts}>{book.status === "parsed" ? bookFacts(book) : "Reading the PDF"}</p> : null}
            {edition?.book?.logline ? <p className={styles.logline}>{edition.book.logline}</p> : null}

            {book?.status === "failed" ? (
              <div className="notice" role="alert">
                This PDF could not be read. {book.error}
              </div>
            ) : null}

            {book && editionsLoaded ? (
              <div className={styles.console}>
                {edition ? <EditionStatus edition={edition} stopping={stopping} /> : null}

                <div className={styles.actions}>
                  {!edition ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-ink"
                        onClick={() => act("generate")}
                        disabled={book.status !== "parsed" || pending !== null}
                      >
                        {pending === "generate" ? "Starting" : "Generate manga"}
                      </button>
                    </>
                  ) : (
                    <>
                      {canRead ? (
                        <Link href={readHref} className="btn btn-ink">
                          {lastRead && lastRead > 1 ? `Continue from page ${lastRead}` : "Start reading"}
                        </Link>
                      ) : isActive(edition.status) ? (
                        <button type="button" className="btn btn-ink" disabled title="Available when page 1 is drawn">
                          Start reading
                        </button>
                      ) : null}
                      {isActive(edition.status) ? (
                        <button type="button" className="btn" onClick={() => act("cancel")} disabled={pending !== null || stopping}>
                          {stopping ? "Stopping" : "Stop drawing"}
                        </button>
                      ) : null}
                      {edition.status === "cancelled" || edition.status === "failed" ? (
                        <button type="button" className="btn" onClick={() => act("resume")} disabled={pending !== null}>
                          {pending === "resume" ? "Resuming" : "Resume drawing"}
                        </button>
                      ) : null}
                      {edition.status === "completed_with_failures" ? (
                        <button type="button" className="btn btn-redpen" onClick={() => act("resume")} disabled={pending !== null}>
                          {pending === "resume" ? "Retrying" : "Retry failed pages"}
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
                {!edition && book.status === "parsed" ? (
                  <p className={styles.note}>
                    MiniMax reads the book&apos;s text and plans the pages; PanelSummary draws them. Pages appear here as they are
                    drawn, and you can start reading as soon as the first one is ready.
                  </p>
                ) : null}
                {actionError ? (
                  <p className={styles.actionError} role="alert">
                    {actionError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        {edition && edition.pages.length > 0 ? (
          <section className={styles.block} aria-labelledby="pages-title">
            <div className={styles.blockHead}>
              <h2 id="pages-title" className="section-title">
                Pages
              </h2>
              <p className={styles.blockMeta}>{editionSummary(edition)}</p>
            </div>
            {failedPages.length > 0 ? (
              <div className={styles.failures}>
                <p className={styles.failuresTitle}>
                  {failedPages.length === 1 ? `Page ${failedPages[0].page_number} could not be drawn` : `${plural(failedPages.length, "page")} could not be drawn`}
                </p>
                <ul className={styles.failureList}>
                  {failedPages.map((p) => (
                    <li key={p.page_number}>
                      {failedPages.length > 1 ? <span className={styles.failureNum}>Page {p.page_number}. </span> : null}
                      {p.error || "No reason was recorded."}
                    </li>
                  ))}
                </ul>
                {isActive(edition.status) ? (
                  <p className={styles.failuresNote}>
                    {edition.status === "drawing"
                      ? "You can retry failed pages when the rest are drawn."
                      : "Drawing is starting again, and these pages will be tried again."}
                  </p>
                ) : null}
              </div>
            ) : null}
            <ol className={styles.grid}>
              {edition.pages.map((p) => (
                <PageThumb key={p.page_number} bookId={bookId} editionId={edition.id} page={p} />
              ))}
            </ol>
          </section>
        ) : null}

        {book && book.sections.length > 0 ? (
          <section className={styles.block} aria-labelledby="contents-title">
            <div className={styles.blockHead}>
              <h2 id="contents-title" className="section-title">
                Contents
              </h2>
              <p className={styles.blockMeta}>As found in the PDF</p>
            </div>
            <ol className={styles.contents}>
              {book.sections.map((s, i) => (
                <li key={s.id}>
                  <span className={styles.contentsNum}>{i + 1}</span>
                  <span className={styles.contentsTitle}>{s.title}</span>
                  <Link className={`text-link ${styles.contentsPages}`} href={`/books/${bookId}/source?page=${s.page_start}`}>
                    {s.page_start === s.page_end ? `page ${s.page_start}` : `pages ${s.page_start}–${s.page_end}`}
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {edition && !isActive(edition.status) && edition.pages_accepted > 0 ? <About edition={edition} /> : null}
      </main>
    </>
  );
}

function BackLink() {
  return (
    <Link href="/" className={`text-link ${styles.back}`}>
      <ArrowLeft width={18} height={18} /> Your shelf
    </Link>
  );
}

function EditionStatus({ edition, stopping }: { edition: EditionDetail; stopping: boolean }) {
  const total = edition.page_total || edition.pages.length;
  const line = stopping ? "Stopping after the pages in progress" : stageLine(edition.status, edition.pages, total);
  const active = isActive(edition.status);
  return (
    <div className={styles.status}>
      <p className={`${styles.stage} ${active ? styles.stageActive : ""}`} aria-live="polite">
        {line}
      </p>
      {edition.status === "failed" && edition.error ? <p className={styles.stageError}>{edition.error}</p> : null}
      {total > 0 ? (
        <ol className={styles.segments} aria-label={`${edition.pages.filter((p) => p.status === "accepted").length} of ${total} pages drawn`}>
          {Array.from({ length: total }, (_, i) => {
            const p = edition.pages.find((x) => x.page_number === i + 1);
            return <li key={i} className={styles[`seg_${p?.status ?? "pending"}`]} />;
          })}
        </ol>
      ) : active ? (
        <div className={styles.indeterminate} aria-hidden="true">
          <span />
        </div>
      ) : null}
    </div>
  );
}

function About({ edition }: { edition: EditionDetail }) {
  const coverage = edition.coverage ?? {};
  const [lost, setLost] = useState<ClaimDetail[] | null>(null);
  const [open, setOpen] = useState(false);
  const failed = useMemo(() => edition.pages.filter((p) => p.status !== "accepted").map((p) => p.page_number), [edition.pages]);

  useEffect(() => {
    if (!open || lost !== null) return;
    Promise.all(failed.map((n) => loadPage(edition.id, n).catch(() => null)))
      .then((pages) => setLost(pages.flatMap((p) => p?.claim_details ?? [])))
      .catch(() => setLost([]));
  }, [open, lost, failed, edition.id]);

  const policy = edition.policy as Record<string, string | boolean | number | undefined>;
  const models = [...new Set([policy.understanding_model, policy.plan_model, policy.page_model].filter(Boolean))].join(", ");
  const harness = typeof policy.harness === "string" ? policy.harness.replace(/->/g, "→") : null;
  const tokens = edition.totals.input_tokens + edition.totals.output_tokens;
  const conveyed = coverage.conveyed?.length ?? 0;
  const total = coverage.claims_total ?? 0;
  const lostIds = new Set(coverage.lost_to_failed_pages ?? []);
  const lostTexts = (lost ?? []).filter((c) => lostIds.has(c.id));

  return (
    <section className={styles.block}>
      <details className={styles.about} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary className={styles.aboutSummary}>
          <span className="section-title">About this adaptation</span>
        </summary>
        <div className={styles.aboutBody}>
          {total > 0 ? (
            <>
              <p className={styles.aboutLead}>
                The pages convey {conveyed} of the {plural(total, "key point")} PanelSummary found in the book.
              </p>
              <dl className={styles.coverage}>
                {coverage.omitted_by_plan && coverage.omitted_by_plan.length > 0 ? (
                  <div>
                    <dt>Left out on purpose</dt>
                    {coverage.omitted_by_plan.map((o) => (
                      <dd key={o.claim}>{o.reason || "No reason was given."}</dd>
                    ))}
                  </div>
                ) : null}
                {lostIds.size > 0 ? (
                  <div>
                    <dt>Lost with the {failed.length === 1 ? "page" : "pages"} that could not be drawn</dt>
                    {lost === null ? (
                      <dd>{plural(lostIds.size, "key point")}</dd>
                    ) : lostTexts.length > 0 ? (
                      lostTexts.map((c) => <dd key={c.id}>{c.text}</dd>)
                    ) : (
                      <dd>{plural(lostIds.size, "key point")}</dd>
                    )}
                  </div>
                ) : null}
                {coverage.not_planned && coverage.not_planned.length > 0 ? (
                  <div>
                    <dt>Not planned into any page</dt>
                    <dd>{plural(coverage.not_planned.length, "key point")}</dd>
                  </div>
                ) : null}
              </dl>
            </>
          ) : (
            <p className={styles.aboutLead}>Coverage is reported when every page has been attempted.</p>
          )}
          <p className={styles.made}>
            How it was made: {models ? `written and planned by ${models}` : "written by the generator"}
            {harness ? ` through ${harness}` : ""}, drawn by the PanelSummary renderer. Image models: none. {formatTokens(tokens)} tokens.
          </p>
        </div>
      </details>
    </section>
  );
}

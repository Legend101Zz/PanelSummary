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
  getPreflight,
  isActive,
  listEditions,
  loadPage,
  resumeEdition,
  type BookDetail,
  type ClaimDetail,
  type EditionDetail,
  type Preflight,
} from "@/lib/api";
import { useNow, usePoll } from "@/lib/hooks";
import { readPosition } from "@/lib/position";
import { bookFacts, editionSummary, formatElapsed, formatTokens, plainReason, plural, preflightLines, shelfStatus, splitCostBasis, stageLine } from "@/lib/words";
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
  // undefined = not asked yet, null = no preflight (older backend or an error): the panel is hidden
  const [preflight, setPreflight] = useState<Preflight | null | undefined>(undefined);
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
    if (!id) {
      setEditionsLoaded(true);
      return;
    }
    setEdition(await getEdition(id));
    setEditionsLoaded(true);
  }, [bookId]);

  useEffect(() => {
    loadBook();
    loadEdition().catch(() => setEditionsLoaded(true));
  }, [loadBook, loadEdition]);

  const needsPreflight = book?.status === "parsed" && editionsLoaded && !edition;
  useEffect(() => {
    if (!needsPreflight || preflight !== undefined) return;
    let live = true;
    getPreflight(bookId).then((p) => live && setPreflight(p));
    return () => {
      live = false;
    };
  }, [needsPreflight, preflight, bookId]);
  const blocked = !!preflight && !preflight.within_limits;

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
      const reason = e instanceof Error ? e.message : "";
      const what = kind === "generate" ? "Generate did not start." : kind === "cancel" ? "Drawing could not be stopped." : "Drawing could not be resumed.";
      const next = e instanceof ApiError && e.status === 0 ? " Check that the server is running, then try again." : kind === "generate" && e instanceof ApiError && (e.status === 422 || e.status === 400) ? " Nothing was started and nothing was spent. Choose a different book, or change the book and try again." : " Try again in a moment.";
      setActionError(`${what} ${reason ? `${reason.replace(/\.?$/, ".")}` : ""}${next}`.replace(/\s+/g, " "));
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
                {edition ? <EditionStatus edition={edition} stopping={stopping} bookId={bookId} /> : null}
                {!edition && book.status === "parsed" && preflight ? <PreflightPanel preflight={preflight} /> : null}

                <div className={styles.actions}>
                  {!edition ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-ink"
                        onClick={() => act("generate")}
                        disabled={book.status !== "parsed" || pending !== null || blocked}
                        aria-describedby={blocked ? "preflight-blocked" : undefined}
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
                          Page 1 not drawn yet
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
                {!edition && book.status === "parsed" && !blocked ? (
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
              <div className={styles.failures} role="alert">
                <p className={styles.failuresTitle}>
                  {failedPages.length === 1 ? `Page ${failedPages[0].page_number} could not be drawn` : `${plural(failedPages.length, "page")} could not be drawn`}
                </p>
                <ul className={styles.failureList}>
                  {failedPages.map((p) => {
                    const reason = plainReason(p.error);
                    return (
                      <li key={p.page_number}>
                        <Link className={`text-link ${styles.failureNum}`} href={`/books/${bookId}/read?edition=${edition.id}&page=${p.page_number}`}>
                          Page {p.page_number}
                        </Link>
                        {": "}
                        {reason.plain}
                        {reason.detail ? <span className={styles.failureDetail}> Technical detail: {reason.detail}</span> : null}
                      </li>
                    );
                  })}
                </ul>
                {isActive(edition.status) ? (
                  <p className={styles.failuresNote}>
                    {edition.status === "drawing"
                      ? "You can retry failed pages when the rest are drawn."
                      : "Drawing is starting again, and these pages will be tried again."}
                  </p>
                ) : (
                  <p className={styles.failuresNote}>
                    {edition.status === "complete" ? "" : "Choose Retry failed pages above to try them again. The pages that are drawn stay as they are."}
                  </p>
                )}
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

const STEPS: { key: "understanding" | "planning" | "drawing"; label: string }[] = [
  { key: "understanding", label: "Reading the book" },
  { key: "planning", label: "Planning the pages" },
  { key: "drawing", label: "Drawing the pages" },
];

function EditionStatus({ edition, stopping, bookId }: { edition: EditionDetail; stopping: boolean; bookId: string }) {
  const total = edition.page_total || edition.pages.length;
  const active = isActive(edition.status);
  const drawn = edition.pages.filter((p) => p.status === "accepted").length;
  const failed = edition.pages.filter((p) => p.status === "failed").length;
  const line = stopping ? "Stopping after the pages in progress" : stageLine(edition.status, edition.pages, total);
  const now = useNow(1000, active);
  const started = Date.parse(edition.job?.created_at ?? edition.created_at);
  const ended = active ? now : Date.parse(edition.finished_at ?? edition.job?.finished_at ?? "") || now;
  const seconds = Number.isFinite(started) ? (ended - started) / 1000 : null;
  const stepIndex = STEPS.findIndex((x) => x.key === edition.status);
  const page1 = edition.pages.find((p) => p.page_number === 1);
  const finishedBad = edition.status === "completed_with_failures" || edition.status === "failed";
  return (
    <div className={styles.status}>
      <p className={`${styles.stage} ${active ? styles.stageActive : ""} ${finishedBad ? styles.stageBad : ""}`} aria-live="polite">
        {line}
      </p>
      {active ? (
        <ol className={styles.steps} aria-label="Steps">
          {STEPS.map((x, i) => (
            <li key={x.key} className={i < stepIndex ? styles.stepDone : i === stepIndex ? styles.stepNow : styles.stepNext} aria-current={i === stepIndex ? "step" : undefined}>
              {x.label}
            </li>
          ))}
        </ol>
      ) : null}
      {edition.status === "failed" && edition.error ? (
        <p className={styles.stageError}>{plainReason(edition.error).plain}</p>
      ) : null}
      {total > 0 ? (
        <ol className={styles.segments} aria-label={`${drawn} of ${total} pages drawn`}>
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
      {total > 0 ? (
        <p className={styles.counts}>
          {plural(drawn, "page")} drawn of {total}
          {failed ? `, ${failed} could not be drawn` : ""}
        </p>
      ) : null}
      {seconds !== null ? (
        <p className={styles.elapsed}>
          {active ? "Running for " : "Took "}
          <span className={styles.clock}>{formatElapsed(seconds)}</span>
          {active && (edition.status === "understanding" || edition.status === "planning")
            ? ". Reading and planning a long book can take 10 minutes or more. This page updates itself, so you can leave it open."
            : active && !(page1?.status === "accepted")
              ? ". Page 1 comes first. This page updates itself."
              : ""}
        </p>
      ) : null}
      {active && page1?.status === "accepted" ? (
        <p className={styles.ready}>
          <Link className="text-link" href={`/books/${bookId}/read?edition=${edition.id}&page=1`}>
            Page 1 is ready. Read it now
          </Link>{" "}
          while the rest is drawn.
        </p>
      ) : null}
    </div>
  );
}

function PreflightPanel({ preflight }: { preflight: Preflight }) {
  const l = preflightLines(preflight);
  const basis = splitCostBasis(preflight.estimated_cost_usd.basis);
  return (
    <section className={styles.preflight} aria-labelledby="preflight-title">
      <h2 id="preflight-title" className={styles.preflightTitle}>
        Before you start
      </h2>
      {preflight.within_limits ? (
        <>
          <dl className={styles.preflightList}>
            <div>
              <dt>Manga pages</dt>
              <dd>{l.pages}</dd>
            </div>
            <div>
              <dt>Page 1 is ready in</dt>
              <dd>{l.firstPage}</dd>
            </div>
            <div>
              <dt>The whole book is ready in</dt>
              <dd>{l.total}</dd>
            </div>
            <div>
              <dt>Cost (estimate)</dt>
              <dd>{l.cost}</dd>
            </div>
          </dl>
          <p className={styles.preflightBasis}>
            This version adapts books up to {preflight.limits.max_pdf_pages.toLocaleString()} PDF pages and {preflight.limits.max_source_words.toLocaleString()} words. This book is inside the limit.
          </p>
          <p className={styles.preflightBasis}>
            These are estimates. {basis.basis ? `Cost basis: ${basis.basis}. ` : ""}Real times change with how busy the model is.
          </p>
          {basis.modelNote ? (
            <p className={styles.preflightBasis} data-testid="preflight-model-note">
              <strong>Note on the models.</strong> {basis.modelNote}
            </p>
          ) : null}
        </>
      ) : (
        <div className={styles.preflightBlocked} role="alert" id="preflight-blocked">
          <p className={styles.preflightBlockedTitle}>This book is too large to draw</p>
          {preflight.blocking_reasons.length > 0 ? (
            <ul>
              {preflight.blocking_reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : (
            <p>
              The limit is {preflight.limits.max_pdf_pages.toLocaleString()} PDF pages and {preflight.limits.max_source_words.toLocaleString()} words. This book has{" "}
              {preflight.pdf_pages.toLocaleString()} pages and {preflight.source_words.toLocaleString()} words.
            </p>
          )}
          <p>
            Generate is off. <Link className="text-link" href="/upload">Add a shorter book</Link> or go back to your shelf.
          </p>
        </div>
      )}
    </section>
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

"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  approvePlan,
  cancelEdition,
  generateEdition,
  getBook,
  getEdition,
  getPreflight,
  getStatus,
  isActive,
  listEditions,
  loadPage,
  redrawPage,
  resumeEdition,
  type BookDetail,
  type EditionDetail,
  type EditionScope,
  type GenerateBody,
  type Preflight,
  type ServerStatus,
} from "@/lib/api";
import { useMedia, useNow, usePoll } from "@/lib/hooks";
import { continuePage, readPosition } from "@/lib/position";
import { readReviewPlan } from "@/lib/prefs";
import { bookFacts } from "@/lib/words";
import { BottomBar, Button, Card, MomentBand, Notice, Skeleton, StepList, TextLink, PageFrame, RunCard } from "@/components/ui";
import { SvgPage } from "@/components/SvgPage";
import { BookSkeleton } from "@/components/book/BookSkeleton";
import { ChooseSections } from "@/components/book/ChooseSections";
import { EstimateCard } from "@/components/book/EstimateCard";
import { PlanReview, PlanReviewBarButton } from "@/components/book/PlanReview";
import { PagesGrid } from "@/components/book/PagesGrid";
import { About, Contents } from "@/components/book/ContentsAbout";
import { MOMENT_TEXT, RunPanel, WAIT_FOR_PAGE_1, type Pending } from "@/components/book/RunPanel";
import {
  actionErrorText,
  generateOffReason,
  limitState,
  scopeOf,
  usageOf,
  WHOLE_BOOK,
  type ActionKind,
  type Choice,
} from "@/components/book/bookLogic";
import styles from "@/components/book/Book.module.css";

type LoadError = { kind: "notfound" | "error"; offline: boolean } | null;

export default function BookPage() {
  const { id: bookId } = useParams<{ id: string }>();
  const narrow = useMedia("(max-width: 767px)");
  const [book, setBook] = useState<BookDetail | null>(null);
  const [edition, setEdition] = useState<EditionDetail | null>(null);
  const [editionsLoaded, setEditionsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<LoadError>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [redrawing, setRedrawing] = useState<number | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  // undefined = not asked yet; null = no estimate (older backend or an error): the panel is hidden and Generate still works.
  const [whole, setWhole] = useState<Preflight | null | undefined>(undefined);
  const [scoped, setScoped] = useState<Preflight | null | undefined>(undefined);
  const [choice, setChoice] = useState<Choice>(WHOLE_BOOK);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [resultPreflight, setResultPreflight] = useState<Preflight | null>(null);
  const [coverSvg, setCoverSvg] = useState<string | null>(null);
  const [lastRead, setLastRead] = useState<number | null>(null);
  const [localStop, setLocalStop] = useState(false);
  const initialReady = useRef<boolean | null>(null);
  const chose = useRef(false);

  // ---- loading ---------------------------------------------------------------
  const loadBook = useCallback(async () => {
    try {
      setBook(await getBook(bookId));
      setLoadError(null);
    } catch (e) {
      const offline = e instanceof ApiError && e.status === 0;
      setLoadError({ kind: e instanceof ApiError && e.status === 404 ? "notfound" : "error", offline });
    }
  }, [bookId]);

  const loadEdition = useCallback(
    async (editionId?: string) => {
      const id = editionId ?? (await listEditions(bookId))[0]?.id;
      if (!id) {
        setEditionsLoaded(true);
        return;
      }
      const next = await getEdition(id);
      if (initialReady.current === null) initialReady.current = next.pages.some((p) => p.page_number === 1 && p.status === "accepted");
      setEdition(next);
      setEditionsLoaded(true);
    },
    [bookId],
  );

  useEffect(() => {
    loadBook();
    loadEdition().catch(() => setEditionsLoaded(true));
    getStatus().then(setStatus);
  }, [loadBook, loadEdition]);

  useEffect(() => {
    document.title = `${book?.title ?? (loadError?.kind === "notfound" ? "Book not found" : "Book")} | PanelSummary`;
  }, [book?.title, loadError]);

  const parsing = book !== null && (book.status === "uploaded" || book.status === "parsing");
  usePoll(loadBook, 2000, parsing);
  const active = isActive(edition?.status);
  usePoll(() => (edition ? loadEdition(edition.id) : undefined), 2000, !!edition && active);
  // A page opened before Generate (another tab) must notice a run that starts elsewhere: ask for the editions while none is shown.
  const watchForRun = book?.status === "parsed" && editionsLoaded && !edition;
  const lookForRun = useCallback(async () => {
    const first = (await listEditions(bookId))[0];
    if (first) await loadEdition(first.id);
  }, [bookId, loadEdition]);
  usePoll(lookForRun, 5000, watchForRun);
  useEffect(() => {
    if (!watchForRun) return;
    const on = () => lookForRun().catch(() => undefined);
    window.addEventListener("focus", on);
    return () => window.removeEventListener("focus", on);
  }, [watchForRun, lookForRun]);
  const now = useNow(1000, active);
  const stopping = active && (localStop || pending === "cancel" || !!edition?.job?.cancel_requested);
  useEffect(() => {
    if (!active) setLocalStop(false);
  }, [active]);

  // ---- estimate (A) and scope (6A) ------------------------------------------------
  const needsPreflight = book?.status === "parsed" && editionsLoaded && !edition;
  useEffect(() => {
    if (!needsPreflight || whole !== undefined) return;
    let live = true;
    getPreflight(bookId).then((p) => live && setWhole(p));
    return () => {
      live = false;
    };
  }, [needsPreflight, whole, bookId]);

  const limits = whole?.limits ?? status?.limits ?? null;
  const wholeUsage = book ? usageOf(book, null) : null;
  const wholeBlocked = whole ? !whole.within_limits : limits && wholeUsage ? !limitState(wholeUsage, limits).inside : false;

  // A book over the limit: the viewer must choose, so the chooser opens by itself, on sections (or a range when there is one section).
  useEffect(() => {
    if (!book || !wholeBlocked || chose.current) return;
    chose.current = true;
    setChooserOpen(true);
    setChoice({ ...WHOLE_BOOK, mode: book.sections.length > 1 ? "sections" : "range" });
  }, [book, wholeBlocked]);

  const scope: EditionScope | null | undefined = book ? scopeOf(choice, book.page_count) : null;
  const scopeKey = JSON.stringify(scope ?? null);
  useEffect(() => {
    if (!needsPreflight || scope === undefined || scope === null) return;
    let live = true;
    setScoped(undefined);
    const t = setTimeout(() => {
      getPreflight(bookId, scope).then((p) => live && setScoped(p));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsPreflight, scopeKey, bookId]);

  const preflight: Preflight | null | undefined = scope === null ? whole : scope === undefined ? undefined : scoped;
  const usage = book && scope !== undefined ? usageOf(book, scope) : null;
  const overLimit = usage && limits ? !limitState(usage, limits).inside : false;
  const serverRefuses = preflight ? !preflight.within_limits : false;

  // ---- after the run ---------------------------------------------------------
  const terminalWithResult = edition?.status === "complete" || edition?.status === "completed_with_failures";
  useEffect(() => {
    if (!terminalWithResult || resultPreflight || !edition) return;
    let live = true;
    getPreflight(bookId, edition.scope ?? null).then((p) => live && setResultPreflight(p));
    return () => {
      live = false;
    };
  }, [terminalWithResult, resultPreflight, edition, bookId]);

  const page1 = edition?.pages.find((p) => p.page_number === 1);
  useEffect(() => {
    if (!edition || page1?.status !== "accepted" || coverSvg) return;
    loadPage(edition.id, 1)
      .then((p) => p.svg && setCoverSvg(p.svg))
      .catch(() => undefined);
  }, [edition, page1?.status, coverSvg]);

  // "Continue from page N": the saved page, if it is a drawn page of this book. Read again when this tab is shown or
  // focused again, because the reader may have saved a newer page in another tab.
  const readable = edition?.pages.filter((p) => p.status === "accepted" || p.status === "failed").map((p) => p.page_number);
  const readableKey = readable?.join(",") ?? "";
  const editionTotal = edition ? edition.page_total || edition.pages.length : 0;
  useEffect(() => {
    if (!edition) return;
    const read = () => setLastRead(continuePage(readPosition(edition.id), editionTotal, readableKey ? readableKey.split(",").map(Number) : []));
    read();
    const onShow = () => {
      if (document.visibilityState === "visible") read();
    };
    window.addEventListener("focus", read);
    window.addEventListener("pageshow", read);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.removeEventListener("focus", read);
      window.removeEventListener("pageshow", read);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [edition?.id, editionTotal, readableKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- actions -----------------------------------------------------------------
  const run = async (kind: ActionKind, work: () => Promise<void>, page?: number) => {
    setPending(kind);
    setActionError(null);
    setRefusal(null);
    try {
      await work();
    } catch (e) {
      const reason = e instanceof Error ? e.message : "";
      const code = e instanceof ApiError ? e.status : null;
      const text = actionErrorText(kind, reason, code, page);
      if (kind === "generate") setRefusal(text.replace(/^Generate did not start\.\s*/, ""));
      else setActionError(text);
    } finally {
      setPending(null);
    }
  };

  const generate = () =>
    run("generate", async () => {
      const body: GenerateBody = {};
      if (scope && "section_ids" in scope) body.section_ids = scope.section_ids;
      else if (scope) {
        body.pdf_page_from = scope.pdf_page_from;
        body.pdf_page_to = scope.pdf_page_to;
      }
      const review = readReviewPlan() ?? status?.plan_review_default;
      if (review !== undefined && review !== null) body.review_plan = review;
      const result = await generateEdition(bookId, Object.keys(body).length ? body : undefined);
      await loadEdition(result.edition.id);
    });
  const stop = () =>
    run("cancel", async () => {
      if (!edition) return;
      await cancelEdition(edition.id);
      setLocalStop(true);
      await loadEdition(edition.id);
    });
  const resume = (kind: "resume" | "retry") =>
    run(kind, async () => {
      if (!edition) return;
      await resumeEdition(edition.id);
      await loadEdition(edition.id);
    });
  const approve = () =>
    run("approve", async () => {
      if (!edition) return;
      await approvePlan(edition.id);
      await loadEdition(edition.id);
    });
  const redraw = (n: number) => {
    setRedrawing(n);
    return run(
      "redraw",
      async () => {
        if (!edition) return;
        await redrawPage(edition.id, n);
        await loadEdition(edition.id);
      },
      n,
    ).finally(() => setRedrawing(null));
  };
  const stopFromReview = () =>
    run("cancel", async () => {
      if (!edition) return;
      await cancelEdition(edition.id);
      await loadEdition(edition.id);
    });

  const sectionTitles = useMemo(() => Object.fromEntries((book?.sections ?? []).map((s) => [s.id, s.title])), [book?.sections]);

  // ---- whole-page states -------------------------------------------------------------
  if (loadError && !book) {
    if (loadError.kind === "notfound") {
      return (
        <main id="main" className={styles.main}>
          <div className={styles.missing}>
            <h1 className={styles.missingTitle}>This book is not on your shelf.</h1>
            <p>Check the link, or open the book from your shelf.</p>
            <Button variant="primary" size="md" href="/">
              Go to your shelf
            </Button>
          </div>
        </main>
      );
    }
    return (
      <main id="main" className={styles.main}>
        <div className={styles.backRow}>
          <TextLink href="/" kind="back">Your shelf</TextLink>
        </div>
        <div className={styles.loadError}>
          <Notice tone="needs" role="alert" title="The book could not be loaded.">
            {loadError.offline
              ? "Can’t reach the PanelSummary server. Check that it is running (./start.sh), then try again."
              : "Check that the PanelSummary server is running (./start.sh), then try again."}
          </Notice>
          <div className={styles.buttonRow}>
            <Button variant="primary" size="md" onClick={() => { setLoadError(null); loadBook(); loadEdition().catch(() => setEditionsLoaded(true)); }}>
              Try again
            </Button>
            <TextLink href="/">Back to your shelf</TextLink>
          </div>
        </div>
      </main>
    );
  }
  if (!book) return <BookSkeleton />;

  // ---- derived ---------------------------------------------------------------------
  const acceptedCount = edition?.pages.filter((p) => p.status === "accepted").length ?? 0;
  const canRead = !!edition && (page1?.status === "accepted" || (!isActive(edition.status) && acceptedCount > 0));
  const readHref = edition ? `/books/${bookId}/read?edition=${edition.id}&page=${lastRead ?? 1}` : "#";
  const readLabel = lastRead && lastRead > 1 ? `Continue from page ${lastRead}` : "Start reading";
  const awaiting = edition?.status === "awaiting_plan_review";
  const unreadable = book.status === "failed";
  const reading = book.status === "uploaded" || book.status === "parsing";
  const showEstimate = book.status === "parsed" && editionsLoaded && !edition;
  const choiceIncomplete = scope === undefined;
  const offReason = generateOffReason({
    bookStatus: book.status,
    blocked: wholeBlocked && scope === null,
    choiceIncomplete,
    overLimit: !!overLimit || (scope !== null && serverRefuses),
  });
  const generateOff = offReason !== null;

  const generateButton = (
    <Button
      key="gen"
      variant="primary"
      size="lg"
      fullWidth={narrow}
      loading={pending === "generate"}
      accessibleName={pending === "generate" ? "Generate manga: starting" : undefined}
      disabled={generateOff}
      why={generateOff ? offReason : undefined}
      onClick={generate}
    >
      {pending === "generate" ? "Starting" : "Generate manga"}
    </Button>
  );

  const showBar = narrow && (showEstimate || unreadable || reading || awaiting || (!!edition && active));
  const pageConcurrency = status?.limits.page_concurrency ?? null;
  const page1Ready = page1?.status === "accepted";

  return (
    <main id="main" className={styles.main}>
      <div className={styles.backRow}>
        <TextLink href="/" kind="back">Your shelf</TextLink>
      </div>

      <div className={styles.top} data-live={!!edition && active && !awaiting ? "true" : undefined}>
        <div className={styles.text}>
          <h1 className={styles.title}>{book.title}</h1>
          {book.author ? <p className={styles.author}>{book.author}</p> : null}
          <p className={styles.facts}>{book.status === "parsed" ? bookFacts(book) : book.status === "failed" ? "PDF: no text found" : "Reading the PDF"}</p>
        </div>
        {edition?.book?.logline ? <p className={styles.logline}>{edition.book.logline}</p> : null}

        <div className={styles.cover}>
          <PageFrame state={coverSvg ? "drawn" : "blank"} variant="cover">
            {coverSvg ? <SvgPage svg={coverSvg} decorative /> : null}
          </PageFrame>
          {reading ? <p className={styles.coverBand}>Reading the PDF</p> : null}
          {unreadable ? <p className={styles.coverBandNeeds}>Couldn&apos;t read this PDF</p> : null}
        </div>

        <div className={styles.console}>
          {!editionsLoaded && book.status === "parsed" ? (
            <Card as="section">
              <div className={styles.skRows}>
                <Skeleton shape="line" width="40%" height={30} />
                <Skeleton shape="line" width="100%" height={20} />
                <Skeleton shape="line" width="100%" height={20} />
              </div>
            </Card>
          ) : null}

          {reading ? (
            <RunCard
              headline="Reading the PDF"
              steps={
                <StepList
                  steps={[
                    { label: "Uploaded" },
                    { label: "Read the text and find the sections", detail: book.status === "parsing" ? "This can take a minute for a long book." : undefined },
                    { label: "Open the book" },
                  ]}
                  current={1}
                />
              }
              actions={narrow ? undefined : generateButton}
              notes={<p>The estimate and Generate are ready when the PDF is read. This page updates itself.</p>}
            />
          ) : null}

          {unreadable || showEstimate ? (
            <EstimateCard
              book={book}
              preflight={preflight}
              scope={scope}
              limits={limits}
              wholeBlocked={wholeBlocked && scope === null}
              chooserOpen={chooserOpen}
              unreadable={unreadable}
              refusal={refusal}
              button={narrow ? null : generateButton}
              chooser={
                unreadable ? null : chooserOpen ? (
                  <ChooseSections
                    book={book}
                    choice={choice}
                    onChange={setChoice}
                    limits={limits}
                    wholeBlocked={wholeBlocked}
                    leadText={
                      wholeBlocked && limits && whole
                        ? `This book has ${book.page_count.toLocaleString()} PDF pages and ${book.word_count.toLocaleString()} words. One run can take up to ${limits.max_pdf_pages.toLocaleString()} PDF pages and ${limits.max_source_words.toLocaleString()} words, so choose a part of it.`
                        : undefined
                    }
                  />
                ) : (
                  <div className={styles.chooseToggle}>
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => {
                        chose.current = true;
                        setChooserOpen(true);
                        setChoice({ ...WHOLE_BOOK, mode: book.sections.length > 1 ? "sections" : "range" });
                      }}
                    >
                      Draw only part of the book
                    </Button>
                  </div>
                )
              }
            />
          ) : null}

          {edition && awaiting ? (
            <PlanReview book={book} edition={edition} pending={pending} actionError={actionError} narrow={narrow} onApprove={approve} onStop={stopFromReview} />
          ) : null}

          {edition && !awaiting ? (
            <RunPanel
              bookId={bookId}
              book={book}
              edition={edition}
              now={now}
              stopping={stopping}
              pending={pending}
              readHref={readHref}
              readLabel={readLabel}
              canRead={canRead}
              animateMoment={initialReady.current === false}
              narrow={narrow}
              resultPreflight={resultPreflight}
              actionError={actionError}
              pageConcurrency={pageConcurrency}
              onStop={stop}
              onResume={() => resume("resume")}
              onRetry={() => resume("retry")}
            />
          ) : null}

          {!edition && actionError ? (
            <Notice tone="needs" role="alert">
              {actionError}
            </Notice>
          ) : null}
        </div>
      </div>

      {edition ? (
        <PagesGrid
          bookId={bookId}
          edition={edition}
          sectionTitles={sectionTitles}
          canRedraw={!active && !awaiting}
          redrawing={redrawing}
          onRedraw={redraw}
        />
      ) : null}

      <div className={styles.lower}>
        <Contents bookId={bookId} book={book} edition={edition} />
        {edition && !active && !awaiting && edition.pages_accepted + edition.pages_failed > 0 ? <About edition={edition} /> : null}
      </div>

      {showBar ? (
        <>
          <BottomBar reserveSpace={false}>
            {reading || unreadable || showEstimate ? (
              generateButton
            ) : awaiting ? (
              <PlanReviewBarButton pending={pending} onApprove={approve} />
            ) : page1Ready && canRead ? (
              <MomentBandSlot href={readHref} label={readLabel} animate={initialReady.current === false} stopping={stopping} onStop={stop} />
            ) : (
              <>
                <p className={styles.barText}>{WAIT_FOR_PAGE_1}</p>
                <Button variant="primary" size="lg" fullWidth disabled>
                  Page 1 not drawn yet
                </Button>
              </>
            )}
          </BottomBar>
          <div className={styles.barSpacer} aria-hidden="true" />
        </>
      ) : null}
    </main>
  );
}

function MomentBandSlot({ href, label, animate, stopping, onStop }: { href: string; label: string; animate: boolean; stopping: boolean; onStop: () => void }) {
  return (
    <MomentBand
      animate={animate}
      actions={
        <div className={styles.barActions}>
          <Button variant="primary" size="sm" fullWidth href={href}>
            {label}
          </Button>
          <Button variant="secondary" size="sm" fullWidth onClick={onStop} disabled={stopping}>
            {stopping ? "Stopping" : "Stop drawing"}
          </Button>
        </div>
      }
    >
      {MOMENT_TEXT}
    </MomentBand>
  );
}

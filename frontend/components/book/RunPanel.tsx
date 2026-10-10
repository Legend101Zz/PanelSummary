"use client";

import type { ReactNode } from "react";
import type { BookDetail, EditionDetail, Preflight } from "@/lib/api";
import { isActive } from "@/lib/api";
import { failedStageLine, plainReason, plural, providerStopHeadline, providerStopLines, scopeLabel, stageLine } from "@/lib/words";
import {
  Button,
  Disclosure,
  MomentBand,
  Notice,
  PageFrame,
  ResultLine,
  RunCard,
  StepList,
  TextLink,
  ToneStrip,
  Tooltip,
  formatDuration,
  formatUsd,
  segmentsFromPages,
} from "@/components/ui";
import { failedStage, firstPageSeconds, pageCounts, runningSeconds, tookSeconds } from "./bookLogic";
import styles from "./Book.module.css";

export type Pending = "generate" | "cancel" | "resume" | "retry" | "approve" | "redraw" | null;

export const MOMENT_TEXT = "Page 1 is ready. Read it now while the rest is drawn.";
export const WAIT_FOR_PAGE_1 = "Page 1 comes first. This page updates itself.";

const WORDS = ["zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];
const concurrencyLine = (n: number | null | undefined) => (n && n > 1 ? `${WORDS[n] ?? n} pages are drawn at the same time.` : null);

export interface RunPanelProps {
  bookId: string;
  book: BookDetail;
  edition: EditionDetail;
  now: number;
  stopping: boolean;
  pending: Pending;
  readHref: string;
  readLabel: string;
  canRead: boolean;
  /** Animate the page 1 band: true only when page 1 became ready while this page was open. */
  animateMoment: boolean;
  narrow: boolean;
  /** The estimate before the run, for the result line. */
  resultPreflight: Preflight | null;
  actionError: string | null;
  pageConcurrency: number | null;
  onStop: () => void;
  onResume: () => void;
  onRetry: () => void;
}

/** The run card: what is happening (B), and how it ended (C). It holds the page logic; RunCard only lays out. */
export function RunPanel(p: RunPanelProps) {
  const { edition: e } = p;
  const active = isActive(e.status);
  const total = e.page_total || e.pages.length;
  const counts = pageCounts(e.pages, total);
  const segments = segmentsFromPages(e.pages, total);
  const page1Ready = e.pages.some((x) => x.page_number === 1 && x.status === "accepted");
  const stop = e.status === "failed" ? e.provider_stop : null;
  const reviewOn = e.policy?.review_plan === true;
  const missing = e.pages.filter((x) => x.status !== "accepted").length;
  const cov = e.coverage ?? {};
  const keyPointsLeft = (cov.core_not_conveyed?.length ?? 0) || (cov.required_not_planned?.length ?? 0);
  const gaps = e.status === "completed_with_failures" && missing === 0;

  // --- headline -------------------------------------------------------------
  let headline: string;
  if (p.stopping) headline = "Stopping after the pages in progress";
  else if (stop) headline = providerStopHeadline(stop.code);
  else if (e.status === "failed") headline = failedStageLine(failedStage(e));
  else headline = stageLine(e.status, e.pages, total, { keyPointsLeftOut: keyPointsLeft });

  // --- steps ----------------------------------------------------------------
  const stepLabels = reviewOn
    ? ["Reading the book", "Planning the pages", "Checking the plan", "Drawing the pages"]
    : ["Reading the book", "Planning the pages", "Drawing the pages"];
  const drawIdx = stepLabels.length - 1;
  let current = 0;
  if (e.status === "planning") current = 1;
  else if (e.status === "drawing") current = drawIdx;
  else if (e.status === "queued") current = e.has_plan ? drawIdx : 0;
  const showSteps = active;

  // --- time -----------------------------------------------------------------
  const secs = active ? runningSeconds(e, p.now) : tookSeconds(e);
  const timeBits: ReactNode[] = [];
  if (total > 0) {
    timeBits.push(
      <strong key="c">
        {plural(counts.drawn, "page")} drawn of {total}
        {counts.failed ? `, ${counts.failed} could not be drawn` : ""}
      </strong>,
    );
  }
  if (secs !== null && (active || e.status === "completed_with_failures")) {
    timeBits.push(
      <span key="t">
        {active ? "Running for " : "Took "}
        <span className={styles.clock}>{formatDuration(secs)}</span>
      </span>,
    );
  }
  const timeLine =
    timeBits.length > 0 ? (
      <>
        {timeBits.map((b, i) => (
          <span key={i}>
            {i > 0 ? " · " : ""}
            {b}
          </span>
        ))}
      </>
    ) : null;

  // --- notes ----------------------------------------------------------------
  const notes: ReactNode[] = [];
  if (active && (e.status === "understanding" || e.status === "planning" || e.status === "queued")) {
    notes.push(<p key="n1">Reading and planning a long book can take 10 minutes or more. This page updates itself, so you can leave it open.</p>);
  } else if (active && !page1Ready) {
    notes.push(<p key="n1">{WAIT_FOR_PAGE_1}</p>);
  } else if (active) {
    notes.push(<p key="n1">This page updates itself, so you can leave it open.</p>);
  }
  if (active && e.status === "drawing" && concurrencyLine(p.pageConcurrency)) notes.push(<p key="n2">{concurrencyLine(p.pageConcurrency)}</p>);

  // --- actions --------------------------------------------------------------
  const read = (variant: "primary" | "secondary") => (
    <Button key="read" variant={variant} size="md" href={p.readHref} iconEnd={<span aria-hidden="true">{"→"}</span>}>
      {p.readLabel}
    </Button>
  );
  const stopBtn = (
    <Button key="stop" variant="secondary" size="md" onClick={p.onStop} disabled={p.stopping || p.pending === "cancel"}>
      {p.stopping || p.pending === "cancel" ? "Stopping" : "Stop drawing"}
    </Button>
  );
  const resumeBtn = (variant: "primary" | "secondary") => (
    <Button key="resume" variant={variant} size="md" onClick={p.onResume} loading={p.pending === "resume"}>
      {p.pending === "resume" ? "Resuming" : "Resume drawing"}
    </Button>
  );
  const actions: ReactNode[] = [];
  let band: ReactNode = null;
  if (active) {
    if (page1Ready && p.canRead) {
      if (!p.narrow) {
        band = (
          <MomentBand animate={p.animateMoment} actions={<>{read("primary")}{stopBtn}</>}>
            {MOMENT_TEXT}
          </MomentBand>
        );
      }
      // On a phone the band and Stop sit together in the bottom bar (see the page).
    } else {
      actions.push(
        <Tooltip key="wait" text="Available when page 1 is drawn">
          <Button variant="primary" size="md" disabled>
            Page 1 not drawn yet
          </Button>
        </Tooltip>,
        stopBtn,
      );
    }
  } else if (e.status === "complete") {
    if (p.canRead) actions.push(read("primary"));
  } else if (e.status === "completed_with_failures") {
    if (missing > 0) {
      actions.push(
        <Button
          key="retry"
          variant="primary"
          size="md"
          onClick={p.onRetry}
          loading={p.pending === "retry"}
          accessibleName={p.pending === "retry" ? "Retry failed pages: retrying" : undefined}
        >
          {p.pending === "retry" ? "Retrying" : "Retry failed pages"}
        </Button>,
      );
      if (p.canRead) actions.push(read("secondary"));
    } else if (p.canRead) actions.push(read("primary"));
  } else if (e.status === "cancelled" || e.status === "failed") {
    actions.push(resumeBtn("primary"));
    if (p.canRead) actions.push(read("secondary"));
  }

  // --- notice (coral) -------------------------------------------------------
  const notices: ReactNode[] = [];
  if (stop) {
    const lines = providerStopLines(stop, e.pages.filter((x) => x.status === "pending").length);
    notices.push(
      <Notice key="stop" tone="needs" inCard role="alert" title={p.narrow ? undefined : lines.title} detail={lines.detail ?? undefined}>
        <p>{lines.plain}</p>
        <p>{lines.next}</p>
      </Notice>,
    );
  } else if (e.status === "failed") {
    const known = plainReason(e.error);
    const stage = failedStage(e);
    const generic = `The model could not finish ${stage === "reading" ? "reading the book" : stage === "planning" ? "planning the pages" : "drawing the pages"}.`;
    // A reason the words file knows is said plainly. An unknown one is said in one generic sentence; the raw text stays behind "Technical detail".
    const r = known.detail !== null || !e.error ? known : { plain: generic, detail: e.error };
    notices.push(
      <Notice key="err" tone="needs" inCard role="alert" title={r.plain} detail={r.detail ?? undefined}>
        <p>The pages already drawn stay as they are. Press Resume drawing to try again.</p>
      </Notice>,
    );
  }
  if (p.actionError) {
    notices.push(
      <Notice key="act" tone="needs" inCard role="alert">
        {p.actionError}
      </Notice>,
    );
  }

  // --- strip ----------------------------------------------------------------
  const strip = (
    <ToneStrip segments={segments} indeterminate={total === 0} legend={total > 0 && e.status !== "complete"} />
  );

  // --- result (complete) ----------------------------------------------------
  let result: ReactNode = null;
  if (e.status === "complete" || gaps) {
    result = <Result edition={e} preflight={p.resultPreflight} gaps={gaps} keyPointsLeft={keyPointsLeft} />;
  }

  // --- failures (cwf) -------------------------------------------------------
  const failedPages = e.pages.filter((x) => x.status === "failed");
  const failures =
    failedPages.length > 0 ? (
      <div className={styles.failures}>
        <h3 className={styles.failuresTitle}>{failedPages.length === 1 ? `Page ${failedPages[0].page_number} could not be drawn` : `${plural(failedPages.length, "page")} could not be drawn`}</h3>
        <ul>
          {failedPages.map((pg) => {
            const r = plainReason(pg.error);
            return (
              <li key={pg.page_number} className={styles.failureRow}>
                <span className={styles.failureThumb}>
                  <PageFrame state="failed" />
                </span>
                <div>
                  <TextLink href={`/books/${p.bookId}/read?edition=${e.id}&page=${pg.page_number}`}>Page {pg.page_number} could not be drawn</TextLink>
                  <p>{r.plain}</p>
                  {r.detail ? (
                    <Disclosure label="Technical detail">
                      <p className={styles.mono}>{r.detail}</p>
                    </Disclosure>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;

  let footnote: ReactNode = null;
  if (e.status === "completed_with_failures" && missing > 0) {
    footnote = <p>Choose Retry failed pages above to try them again. The pages that are drawn stay as they are.</p>;
  } else if (active && counts.failed > 0) {
    footnote = <p>{e.status === "drawing" ? "You can retry failed pages when the rest are drawn." : "Drawing is starting again, and these pages will be tried again."}</p>;
  }
  if (p.pending === "retry") footnote = <p>Drawing is starting again, and these pages will be tried again.</p>;

  const noteNodes = (
    <>
      {stop ? (
        <>
          {strip}
          {timeLine ? <p className={styles.timeBelow}>{timeLine}</p> : null}
        </>
      ) : null}
      {failures}
      {footnote}
      {notes}
    </>
  );

  return (
    <>
      <RunCard
        eyebrow={scopeLabel(e.scope, p.book.sections.length) ?? undefined}
        headline={headline}
        notice={notices.length ? <>{notices}</> : undefined}
        steps={showSteps ? <StepList steps={stepLabels.map((label) => ({ label }))} current={current} /> : undefined}
        strip={stop || (!active && total === 0) ? undefined : strip}
        time={stop ? undefined : timeLine ?? undefined}
        actions={actions.length ? <>{actions}</> : undefined}
        notes={stop || failures || footnote || notes.length ? noteNodes : undefined}
      >
        {result}
      </RunCard>
      {band}
    </>
  );
}

function Result({ edition: e, preflight, gaps, keyPointsLeft }: { edition: EditionDetail; preflight: Preflight | null; gaps: boolean; keyPointsLeft: number }) {
  const took = tookSeconds(e);
  const first = firstPageSeconds(e);
  const cost = e.totals.cost_usd;
  const firstText = first
    ? first.exact
      ? `Page 1 was ready after ${formatDuration(first.seconds)}.`
      : `The first page was drawn after ${formatDuration(first.seconds)}.`
    : null;
  const range = preflight?.estimated_minutes.total;
  const costRange = preflight?.estimated_cost_usd;
  const lowS = range ? range.low * 60 : null;
  const highS = range ? range.high * 60 : null;
  return (
    <div className={styles.result}>
      {gaps ? (
        <p className={styles.gapsNote}>
          Every page is drawn. The page checks left {plural(keyPointsLeft || 1, "key point")} out. See About this adaptation below.
        </p>
      ) : null}
      {took !== null && lowS !== null && highS !== null && costRange ? (
        <>
          <div className={styles.resultPair}>
            <ResultLine
              title={`Took ${formatDuration(took)}`}
              actual={took}
              low={lowS}
              high={highS}
              actualLabel={formatDuration(took)}
              lowLabel={formatDuration(lowS)}
              highLabel={formatDuration(highS)}
            />
            {cost > 0 ? (
              <ResultLine
                title={`About ${formatUsd(cost)}, not a bill`}
                actual={cost}
                low={costRange.low}
                high={costRange.high}
                actualLabel={formatUsd(cost)}
                lowLabel={formatUsd(costRange.low)}
                highLabel={formatUsd(costRange.high)}
              />
            ) : null}
          </div>
          <p className={styles.resultNote}>
            {firstText} The grey band is the estimate from before the run.
          </p>
        </>
      ) : (
        <p className={styles.resultNote}>
          {took !== null ? `Took ${formatDuration(took)}. ` : ""}
          {firstText ? `${firstText} ` : ""}
          {cost > 0 ? `Estimated cost ${formatUsd(cost)}. Not a bill.` : "The cost was not recorded."}
        </p>
      )}
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import type { BookDetail, EditionScope, Preflight } from "@/lib/api";
import { preflightLines } from "@/lib/words";
import { Card, EstimatePanel, Notice, TextLink, formatCount } from "@/components/ui";
import { drawsLine } from "./bookLogic";
import styles from "./Book.module.css";

export const GENERATE_LINE =
  "MiniMax reads the book’s text and plans the pages; PanelSummary draws them. Pages appear here as they are drawn, and you can start reading as soon as the first one is ready.";

/** The detail behind "How the estimate is made": the long basis text from the server, in plain words. */
function basisDetail(basis: string | undefined) {
  const text = (basis ?? "").trim();
  if (!text) return null;
  return <p>{text.replace(/^Pi catalog estimate, not a bill\.\s*/i, "These are estimates, not a bill. ")}</p>;
}

/**
 * State A: parsed, not drawn yet. The estimate (A), the limit note and the line under Generate.
 * `chooser` is the 6A control, shown above the estimate. `button` is the ONE Generate button (null on a phone: it sits in the bottom bar).
 */
export function EstimateCard({
  book,
  preflight,
  scope,
  limits,
  chooser,
  button,
  refusal,
  wholeBlocked,
  chooserOpen,
  unreadable,
}: {
  book: BookDetail;
  /** undefined = not asked yet; null = no estimate for this book (the panel is hidden, Generate still works). */
  preflight: Preflight | null | undefined;
  scope: EditionScope | null | undefined;
  limits: { max_pdf_pages: number; max_source_words: number } | null;
  chooser: ReactNode;
  button: ReactNode;
  refusal: string | null;
  wholeBlocked: boolean;
  chooserOpen: boolean;
  unreadable: boolean;
}) {
  const l = preflight ? preflightLines(preflight) : null;
  const scoped = scope !== null && scope !== undefined;
  const rows = l
    ? [
        { label: "Manga pages", value: l.pages },
        { label: "Page 1 is ready in", value: l.firstPage },
        { label: scoped ? "The chosen pages are ready in" : "The whole book is ready in", value: l.total },
        { label: "Cost (estimate)", value: l.cost },
      ]
    : [];
  const inside = preflight?.within_limits !== false;

  if (unreadable) {
    return (
      <Card as="section">
        <h2 className={styles.cardTitle}>This PDF could not be read</h2>
        <Notice tone="needs" title="This PDF could not be read." role="alert">
          {book.error ?? "The PDF has no extractable text."} Use a PDF with selectable text.
        </Notice>
        <div className={styles.buttonRow}>
          {button}
          <TextLink href="/upload" kind="inline">Add a different PDF</TextLink>
          <TextLink href="/" kind="secondary">Back to your shelf</TextLink>
        </div>
      </Card>
    );
  }

  return (
    <Card as="section" className={styles.estimateCard}>
      {chooserOpen ? chooser : null}
      <div className={styles.estimateBody}>
        <div className={styles.estLeft}>
        {l && inside ? (
          <>
            <h2 className={styles.cardTitle}>Before you start</h2>
            <EstimatePanel
              rows={rows}
              basis={preflight?.estimated_cost_usd.basis_short ?? "Estimates, not a bill."}
              detail={basisDetail(preflight?.estimated_cost_usd.basis)}
            />
            {limits && !wholeBlocked && !scoped ? (
              <p className={styles.limitNote}>
                This version adapts books up to {formatCount(limits.max_pdf_pages)} PDF pages and {formatCount(limits.max_source_words)} words. This book is inside the limit.
              </p>
            ) : null}
            {scoped ? <p className={styles.drawsLine}>{drawsLine(book, scope)}</p> : null}
          </>
        ) : preflight === null ? (
          <>
            <h2 className={styles.cardTitle}>Ready to draw</h2>
            <p className={styles.limitNote}>There is no estimate for this book, so the time and the cost are known only after the run.</p>
          </>
        ) : l && !inside && scoped ? (
          <>
            <h2 className={styles.cardTitle}>Before you start</h2>
            <p className={styles.limitNote}>{preflight?.blocking_reasons.join(" ")}</p>
          </>
        ) : null}

        {wholeBlocked && !scoped ? (
          <p className={styles.limitNote}>
            You can still read the PDF here. <TextLink href="/upload">Add a shorter book</TextLink> or go back to your <TextLink href="/">shelf</TextLink>.
          </p>
        ) : null}

        </div>

        <div className={styles.estRight}>
          <div className={styles.buttonRow}>{button}</div>
          {!wholeBlocked ? <p className={styles.generateLine}>{GENERATE_LINE}</p> : null}
        </div>

        {refusal ? (
          <Notice tone="needs" title="Generate did not start." role="alert" className={styles.refusal}>
            {refusal}
          </Notice>
        ) : null}
      </div>
      {chooserOpen ? null : chooser}
    </Card>
  );
}

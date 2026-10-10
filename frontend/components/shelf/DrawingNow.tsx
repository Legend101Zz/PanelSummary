"use client";

import { useState } from "react";
import { ApiError, resumeEdition, type EditionDetail, type LibraryBook } from "@/lib/api";
import { ArrowRightIcon, Button, Notice, RetryIcon, TextLink, ToneStrip, segmentsFromPages } from "@/components/ui";
import { plural, providerStopShort, shelfStatus } from "@/lib/words";
import { drawingNowKind, type DrawingNowRun } from "./drawingNowLogic";
import styles from "./drawingNow.module.css";

/**
 * "Drawing now": one card above the grid for a book whose run is active or stopped (Shelf.html).
 * Title, the tone strip, one line in words, "Start reading" when page 1 exists, "See progress", and
 * "Resume drawing" when the run stopped. The numbers come from the shelf's own polling.
 */
export function DrawingNowCard({ run, onChanged }: { run: DrawingNowRun; onChanged: () => void }) {
  const { book, detail } = run;
  const kind = drawingNowKind(book.latest_edition?.status);
  const e = detail ?? book.latest_edition;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!e || !book.latest_edition || !kind) return null;
  const total = detail?.page_total || detail?.pages.length || book.latest_edition.page_total;
  const accepted = detail ? detail.pages.filter((p) => p.status === "accepted").length : book.latest_edition.pages_accepted;
  const hasPage1 = !!detail?.pages.some((p) => p.page_number === 1 && p.status === "accepted");
  const segments = detail && total > 0 ? segmentsFromPages(detail.pages, total) : [];
  const stopped = kind === "stopped";
  const stop = book.latest_edition.provider_stop;
  const headingId = `dn-${book.id}`;
  const line = stopped
    ? `${stop ? `${providerStopShort(stop.code)}. ` : ""}${total ? `${accepted} of ${plural(total, "page")} drawn.` : "Nothing was drawn."}`
    : total
      ? `${accepted} of ${total} drawn`
      : shelfStatus(book).text;
  const readHref = `/books/${book.id}/read?edition=${book.latest_edition.id}&page=1`;

  async function resume() {
    setPending(true);
    setError(null);
    try {
      await resumeEdition(book.latest_edition!.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Drawing could not be resumed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <div className={styles.head}>
        <p className={styles.eyebrow}>{stopped ? "Drawing stopped" : "Drawing now"}</p>
        <h2 id={headingId} className={styles.title}>
          {book.title}
        </h2>
      </div>
      <div className={styles.mid}>
        <ToneStrip segments={segments} indeterminate={segments.length === 0} legend={false} />
        <p className={styles.line} aria-live="polite">
          {line}
        </p>
      </div>
      <div className={styles.actions}>
        {stopped ? (
          <Button variant="primary" size="md" loading={pending} accessibleName={pending ? "Resume drawing: resuming" : undefined} iconStart={<RetryIcon size={20} />} onClick={resume}>
            {pending ? "Resuming" : "Resume drawing"}
          </Button>
        ) : null}
        {hasPage1 ? (
          <Button variant={stopped ? "secondary" : "primary"} size="md" href={readHref} iconEnd={<ArrowRightIcon size={20} />}>
            Start reading
          </Button>
        ) : null}
        <TextLink href={`/books/${book.id}`}>See progress</TextLink>
      </div>
      {error ? (
        <div className={styles.error}>
          <Notice tone="needs" role="alert" title="Drawing could not be resumed.">
            {error}
          </Notice>
        </div>
      ) : null}
    </section>
  );
}

export type { EditionDetail, LibraryBook };

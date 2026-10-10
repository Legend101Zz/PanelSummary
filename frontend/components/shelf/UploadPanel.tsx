"use client";

import { useEffect, useState, type Ref } from "react";
import { ArrowRightIcon, Button, Card, CheckIcon, CloseIcon, DropZone, Meter, Notice, PageFrame, RetryIcon, StepList, cx, formatPercent } from "@/components/ui";
import { CoverSvg, useFirstPage } from "@/components/CoverArt";
import { listBooks, type LibraryBook } from "@/lib/api";
import { useNow } from "@/lib/hooks";
import { ALREADY_ON_SHELF, UPLOAD_SLOW_TEXT, limitChips, plural, type LimitValues } from "@/lib/words";
import type { UploadFlow } from "./useUploadFlow";
import styles from "./shelf.module.css";

/** The drop zone while nothing runs. While a file goes up, it is the three-step progress card with a cancel. */
export function UploadPanel({ flow, limits, title, className }: { flow: UploadFlow; limits?: LimitValues; title?: string; className?: string }) {
  const { phase } = flow;
  if (phase.kind === "idle" || phase.kind === "error") {
    const failed = phase.kind === "error" ? phase.failed : null;
    return (
      <DropZone
        // the zone stays dashed in the error state (a solid card would read as another screen)
        className={cx(styles.zoneDashed, className)}
        title={title}
        subtitle="or choose it from your computer"
        // the offline sentence is shown once, by the OfflineGate banner of the screen
        error={
          phase.kind === "error" && !phase.offline ? (
            <>
              <span className={styles.errTitle}>{phase.message}</span>
              {phase.next ? <span className={styles.errNext}>{phase.next}</span> : null}
            </>
          ) : undefined
        }
        errorActions={
          phase.kind === "error" && !phase.offline && phase.retry ? (
            <Button variant="primary" size="md" iconStart={<RetryIcon size={20} />} onClick={flow.again}>
              Try again
            </Button>
          ) : undefined
        }
        onFile={(file) => flow.start(file)}
        hint={
          <span className={cx(styles.limits, phase.kind === "error" && !phase.offline ? styles.limitsLeft : undefined)}>
            {limitChips(limits, failed).map((c) => (
              <span key={c.text} className={c.failed ? styles.chipFailed : styles.chip}>
                {c.failed ? <CloseIcon size={14} /> : <CheckIcon size={14} />}
                {c.text}
              </span>
            ))}
          </span>
        }
      />
    );
  }
  if (phase.kind === "done" && phase.already) return <AlreadyOnShelf bookId={phase.bookId} onOther={flow.reset} className={className} />;
  return <Progress flow={flow} className={className} />;
}

/** "Already on the shelf": one short line, the cover and "Open the book". No silent move. */
function AlreadyOnShelf({ bookId, onOther, className }: { bookId: string; onOther: () => void; className?: string }) {
  const [book, setBook] = useState<LibraryBook | null>(null);
  useEffect(() => {
    let alive = true;
    listBooks()
      .then((list) => alive && setBook(list.find((b) => b.id === bookId) ?? null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [bookId]);
  const edition = book?.latest_edition;
  const { ref, svg } = useFirstPage(edition?.id, !!edition && edition.pages_accepted > 0);
  return (
    <Card className={className}>
      <div className={styles.already} ref={ref as unknown as Ref<HTMLDivElement>}>
        <p className={styles.alreadyLine}>{ALREADY_ON_SHELF}</p>
        <div className={styles.alreadyRow}>
          <div className={styles.alreadyCover}>
            <PageFrame state={svg ? "drawn" : "blank"} variant="cover">
              {svg ? <CoverSvg svg={svg} /> : null}
            </PageFrame>
          </div>
          <div className={styles.alreadyText}>
            <p className={styles.alreadyTitle}>{book?.title ?? "Your book"}</p>
            {book?.author ? <p className={styles.alreadyMeta}>{book.author}</p> : null}
            {edition?.page_total ? <p className={styles.alreadyMeta}>{plural(edition.page_total, "manga page")}</p> : null}
          </div>
        </div>
        <div className={styles.alreadyActions}>
          <Button variant="primary" size="md" href={`/books/${bookId}`} iconEnd={<ArrowRightIcon size={20} />}>
            Open the book
          </Button>
          <button type="button" className={styles.otherLink} onClick={onOther}>
            Choose a different PDF
          </button>
        </div>
      </div>
    </Card>
  );
}

function Progress({ flow, className }: { flow: UploadFlow; className?: string }) {
  const phase = flow.phase;
  const now = useNow(1000, phase.kind === "reading");
  if (phase.kind === "idle" || phase.kind === "error") return null;
  const reading = phase.kind === "reading";
  const size = `${(phase.file.size / 1048576).toFixed(1)} MB`;
  const waiting = reading && (!phase.job || phase.job.status === "queued");
  const slow = reading && waiting && now - phase.since > 20000;
  const pct = phase.kind === "uploading" ? formatPercent(phase.fraction) : "";
  const steps = [
    {
      label: phase.kind === "uploading" ? `Uploading, ${pct}` : "Uploaded",
      detail: phase.kind === "uploading" ? <Meter label="Upload" valueText={`${pct} of ${size}`} fraction={phase.fraction} /> : undefined,
    },
    {
      label: phase.kind === "done" ? phase.summary : reading ? (waiting ? "Waiting to read the PDF" : phase.job?.message || "Reading the PDF") : "Read the text and find the sections",
      detail: slow ? <Notice tone="wait">{UPLOAD_SLOW_TEXT}</Notice> : undefined,
    },
    { label: phase.kind === "done" ? "Opening the book" : "Open the book" },
  ];
  const current = phase.kind === "uploading" ? 0 : reading ? 1 : 2;
  return (
    <Card className={className}>
      <div className={styles.progress} aria-live="polite">
        <p className={styles.fileName}>{phase.file.name}</p>
        <p className={styles.fileSize}>{size}</p>
        <StepList steps={steps} current={current} numbered />
        {phase.kind === "uploading" ? (
          <Button variant="quiet" size="sm" onClick={flow.cancel}>
            Cancel upload
          </Button>
        ) : (
          <p className={styles.leave}>{phase.kind === "reading" ? "You can leave this page. The book stays on your shelf." : ""}</p>
        )}
      </div>
    </Card>
  );
}

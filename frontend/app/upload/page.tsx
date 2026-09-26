"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getBook, getJob, uploadPdf, type Job } from "@/lib/api";
import { usePoll } from "@/lib/hooks";
import { SiteHeader } from "@/components/SiteHeader";
import { ManuscriptGuides } from "@/components/Paper";
import { ArrowLeft, Upload } from "@/components/Icons";
import styles from "./upload.module.css";

const MAX_MB = 60;

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; file: File; fraction: number }
  | { kind: "reading"; file: File; bookId: string; jobId: string; job?: Job; since: number }
  | { kind: "done"; file: File; bookId: string; message: string }
  | { kind: "error"; file?: File; message: string };

export default function UploadPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = useCallback(
    async (file: File) => {
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
        setPhase({ kind: "error", file, message: `${file.name} is not a PDF. Choose a .pdf file.` });
        return;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        setPhase({ kind: "error", file, message: `${file.name} is ${(file.size / 1048576).toFixed(0)} MB. The limit is ${MAX_MB} MB.` });
        return;
      }
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      setPhase({ kind: "uploading", file, fraction: 0 });
      try {
        const result = await uploadPdf(file, (fraction) => setPhase({ kind: "uploading", file, fraction }), abort.signal);
        if (result.book.status === "parsed") {
          setPhase({ kind: "done", file, bookId: result.book.id, message: "This book is already on your shelf." });
          router.push(`/books/${result.book.id}`);
          return;
        }
        if (!result.job_id) {
          setPhase({ kind: "error", file, message: "The server accepted the file but did not start reading it." });
          return;
        }
        setPhase({ kind: "reading", file, bookId: result.book.id, jobId: result.job_id, since: Date.now() });
      } catch (e) {
        if (abort.signal.aborted) return;
        setPhase({ kind: "error", file, message: e instanceof ApiError ? e.message : "The upload failed." });
      }
    },
    [router],
  );

  const poll = useCallback(async () => {
    if (phase.kind !== "reading") return;
    const job = await getJob(phase.jobId);
    if (job.status === "succeeded") {
      setPhase({ kind: "done", file: phase.file, bookId: phase.bookId, message: job.message });
      router.push(`/books/${phase.bookId}`);
    } else if (job.status === "failed" || job.status === "cancelled" || job.status === "completed_with_failures") {
      const book = await getBook(phase.bookId).catch(() => null);
      setPhase({ kind: "error", file: phase.file, message: book?.error || job.error || job.message || "The PDF could not be read." });
    } else {
      setPhase((p) => (p.kind === "reading" ? { ...p, job } : p));
    }
  }, [phase, router]);
  usePoll(poll, 1500, phase.kind === "reading");
  useEffect(() => {
    if (phase.kind === "reading" && !phase.job) poll().catch(() => undefined);
  }, [phase, poll]);

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) start(file);
  };

  const busy = phase.kind === "uploading" || phase.kind === "reading" || phase.kind === "done";

  return (
    <>
      <SiteHeader />
      <main id="main" className="page-main">
        <Link href="/" className={`text-link ${styles.back}`}>
          <ArrowLeft width={18} height={18} /> Your shelf
        </Link>
        <div className={styles.layout}>
          <div className={styles.copy}>
            <h1 className="page-title">Add a book</h1>
            <p className={styles.lede}>
              Choose a PDF with selectable text, up to {MAX_MB} MB. It is uploaded to your PanelSummary server, which reads its
              text and finds its chapters.
            </p>
            <p className="muted">Nothing is drawn yet. You start the manga from the book&apos;s page when you are ready.</p>
          </div>

          <div
            className={`${styles.drop} ${dragging ? styles.dragging : ""} ${busy ? styles.dropBusy : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => (busy ? e.preventDefault() : onDrop(e))}
          >
            <ManuscriptGuides tone={phase.kind === "error" ? "redpen" : "pencil"} />
            <div className={styles.dropInner}>
              {phase.kind === "idle" || phase.kind === "error" ? (
                <>
                  <Upload width={28} height={28} className={styles.dropIcon} />
                  <p className={styles.dropTitle}>Drop a PDF here</p>
                  <button type="button" className="btn btn-ink" onClick={() => inputRef.current?.click()}>
                    Choose a PDF
                  </button>
                  {phase.kind === "error" ? (
                    <p className={styles.error} role="alert">
                      {phase.message}
                    </p>
                  ) : null}
                </>
              ) : (
                <Progress phase={phase} />
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose a PDF"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) start(file);
              }}
            />
          </div>
        </div>
      </main>
    </>
  );
}

function Progress({ phase }: { phase: Exclude<Phase, { kind: "idle" } | { kind: "error" }> }) {
  const size = `${(phase.file.size / 1048576).toFixed(1)} MB`;
  const uploaded = phase.kind !== "uploading";
  const read = phase.kind === "done";
  const waiting = phase.kind === "reading" && (!phase.job || phase.job.status === "queued");
  const slow = phase.kind === "reading" && waiting && Date.now() - phase.since > 20000;
  return (
    <div className={styles.progress} aria-live="polite">
      <p className={styles.fileName}>{phase.file.name}</p>
      <p className={styles.fileSize}>{size}</p>
      <ol className={styles.steps}>
        <li className={uploaded ? styles.stepDone : styles.stepNow}>
          <span className={styles.stepMark} aria-hidden="true" />
          <span>
            {phase.kind === "uploading" ? `Uploading, ${Math.round(phase.fraction * 100)}%` : "Uploaded"}
            {phase.kind === "uploading" ? (
              <span className={styles.bar} aria-hidden="true">
                <span style={{ width: `${Math.max(2, phase.fraction * 100)}%` }} />
              </span>
            ) : null}
          </span>
        </li>
        <li className={read ? styles.stepDone : uploaded ? styles.stepNow : styles.stepLater}>
          <span className={styles.stepMark} aria-hidden="true" />
          <span>
            {read
              ? phase.message
              : phase.kind === "reading"
                ? waiting
                  ? "Waiting to read the PDF"
                  : phase.job?.message || "Reading the PDF"
                : "Read the text and chapters"}
            {slow ? (
              <span className={styles.hint}>
                Still waiting. The PDF is read by the PanelSummary job runner; check that it is running.
              </span>
            ) : null}
          </span>
        </li>
        <li className={read ? styles.stepNow : styles.stepLater}>
          <span className={styles.stepMark} aria-hidden="true" />
          <span>{read ? "Opening the book" : "Open the book"}</span>
        </li>
      </ol>
    </div>
  );
}

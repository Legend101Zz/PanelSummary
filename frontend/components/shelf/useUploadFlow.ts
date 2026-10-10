"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getBook, getJob, uploadPdf, type Job } from "@/lib/api";
import { usePoll } from "@/lib/hooks";
import { ALREADY_ON_SHELF, FALLBACK_LIMITS, NO_JOB_NEXT, notPdfText, OFFLINE_SENTENCE, readSummary, serverAnsweredText, splitNextStep, tooLargeNext, tooLargeText, TRY_AGAIN_NEXT, withNextStep, type FailedLimit } from "@/lib/words";

export type UploadPhase =
  | { kind: "idle" }
  | { kind: "uploading"; file: File; fraction: number }
  | { kind: "reading"; file: File; bookId: string; jobId: string; job?: Job; since: number }
  | { kind: "done"; file: File; bookId: string; summary: string; already: boolean }
  | { kind: "error"; file?: File; message: string; /** The next step, when the text has one. */ next: string | null; offline: boolean; /** The limit this file failed, for its chip. */ failed: FailedLimit | null; /** A server problem that may pass by itself: "Try again" shows beside "Choose a PDF". */ retry: boolean };

/** One error phase from a text. The next step is split off so the screen can show it on its own line. */
function errorPhase(file: File | undefined, text: string, extra: { offline?: boolean; failed?: FailedLimit | null; retry?: boolean; next?: string } = {}): UploadPhase {
  const parts = splitNextStep(text);
  return { kind: "error", file, message: parts.title, next: extra.next ?? parts.next, offline: extra.offline ?? false, failed: extra.failed ?? null, retry: extra.retry ?? false };
}
const mb = (bytes: number) => Math.ceil(bytes / 1048576);

/**
 * The upload of a PDF, in one place for the first run, Add a book and the landing.
 * Upload with byte progress (XHR, so it can be cancelled), then wait for the parse job, then open /books/{id}.
 */
export function useUploadFlow(maxMb: number = FALLBACK_LIMITS.max_pdf_size_mb) {
  const router = useRouter();
  const [phase, setPhase] = useState<UploadPhase>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = useCallback(
    async (file: File) => {
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
        setPhase(errorPhase(file, notPdfText(file.name)));
        return;
      }
      if (file.size > maxMb * 1024 * 1024) {
        setPhase(errorPhase(file, tooLargeText(file.name, file.size, maxMb), { next: tooLargeNext(maxMb), failed: { limit: "size", fileMb: mb(file.size) } }));
        return;
      }
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      setPhase({ kind: "uploading", file, fraction: 0 });
      try {
        const result = await uploadPdf(file, (fraction) => setPhase({ kind: "uploading", file, fraction }), abort.signal);
        if (result.book.status === "parsed") {
          setPhase({ kind: "done", file, bookId: result.book.id, summary: ALREADY_ON_SHELF, already: true });
          // no automatic move: the screen says it and offers "Open the book"
          return;
        }
        if (!result.job_id) {
          setPhase(errorPhase(file, "The server accepted the file but did not start reading it.", { next: NO_JOB_NEXT, retry: true }));
          return;
        }
        setPhase({ kind: "reading", file, bookId: result.book.id, jobId: result.job_id, since: Date.now() });
      } catch (e) {
        if (abort.signal.aborted) return;
        if (e instanceof ApiError && e.status === 0) setPhase(errorPhase(file, OFFLINE_SENTENCE, { offline: true, retry: true }));
        else if (e instanceof ApiError && e.status === 413) setPhase(errorPhase(file, tooLargeText(file.name, file.size, maxMb), { next: tooLargeNext(maxMb), failed: { limit: "size", fileMb: mb(file.size) } }));
        else if (e instanceof ApiError && e.status >= 500) setPhase(errorPhase(file, /^The server answered \d+$/.test(e.message) ? serverAnsweredText(e.status) : e.message, { next: TRY_AGAIN_NEXT, retry: true }));
        else if (e instanceof ApiError) {
          const text = withNextStep(e.message);
          setPhase(errorPhase(file, text, { failed: /selectable text/i.test(text) ? { limit: "scan" } : null }));
        } else setPhase(errorPhase(file, "The upload failed.", { next: TRY_AGAIN_NEXT, retry: true }));
      }
    },
    [router, maxMb],
  );

  /** Stops the upload. Only the upload can be cancelled: the book is already on the server once the bytes are there. */
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setPhase({ kind: "idle" });
  }, []);

  const reset = useCallback(() => setPhase({ kind: "idle" }), []);

  /** Uploads the same file again ("Try again" after a server problem). */
  const again = useCallback(() => {
    if (phase.kind === "error" && phase.file) void start(phase.file);
    else setPhase({ kind: "idle" });
  }, [phase, start]);

  const poll = useCallback(async () => {
    if (phase.kind !== "reading") return;
    const job = await getJob(phase.jobId);
    if (job.status === "succeeded") {
      setPhase({ kind: "done", file: phase.file, bookId: phase.bookId, summary: readSummary(job.message), already: false });
      router.push(`/books/${phase.bookId}`);
    } else if (job.status === "failed" || job.status === "cancelled" || job.status === "completed_with_failures") {
      const book = await getBook(phase.bookId).catch(() => null);
      const text = withNextStep(book?.error || job.error || job.message || "The PDF could not be read.");
      setPhase(errorPhase(phase.file, text, { failed: /selectable text/i.test(text) ? { limit: "scan" } : null }));
    } else {
      setPhase((p) => (p.kind === "reading" ? { ...p, job } : p));
    }
  }, [phase, router]);
  usePoll(poll, 1500, phase.kind === "reading");
  useEffect(() => {
    if (phase.kind === "reading" && !phase.job) poll().catch(() => undefined);
  }, [phase, poll]);

  return { phase, start, cancel, reset, again, busy: phase.kind === "uploading" || phase.kind === "reading" || phase.kind === "done" };
}

export type UploadFlow = ReturnType<typeof useUploadFlow>;

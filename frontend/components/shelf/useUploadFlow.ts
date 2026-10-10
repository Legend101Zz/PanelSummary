"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getBook, getJob, uploadPdf, type Job } from "@/lib/api";
import { usePoll } from "@/lib/hooks";
import { FALLBACK_LIMITS, notPdfText, OFFLINE_SENTENCE, readSummary, tooLargeText, withNextStep } from "@/lib/words";

export type UploadPhase =
  | { kind: "idle" }
  | { kind: "uploading"; file: File; fraction: number }
  | { kind: "reading"; file: File; bookId: string; jobId: string; job?: Job; since: number }
  | { kind: "done"; file: File; bookId: string; summary: string; already: boolean }
  | { kind: "error"; file?: File; message: string; offline: boolean };

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
        setPhase({ kind: "error", file, message: notPdfText(file.name), offline: false });
        return;
      }
      if (file.size > maxMb * 1024 * 1024) {
        setPhase({ kind: "error", file, message: tooLargeText(file.name, file.size, maxMb), offline: false });
        return;
      }
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      setPhase({ kind: "uploading", file, fraction: 0 });
      try {
        const result = await uploadPdf(file, (fraction) => setPhase({ kind: "uploading", file, fraction }), abort.signal);
        if (result.book.status === "parsed") {
          setPhase({ kind: "done", file, bookId: result.book.id, summary: "This book is already on your shelf.", already: true });
          window.setTimeout(() => router.push(`/books/${result.book.id}`), 1200);
          return;
        }
        if (!result.job_id) {
          setPhase({ kind: "error", file, message: "The server accepted the file but did not start reading it.", offline: false });
          return;
        }
        setPhase({ kind: "reading", file, bookId: result.book.id, jobId: result.job_id, since: Date.now() });
      } catch (e) {
        if (abort.signal.aborted) return;
        if (e instanceof ApiError && e.status === 0) setPhase({ kind: "error", file, message: OFFLINE_SENTENCE, offline: true });
        else setPhase({ kind: "error", file, message: e instanceof ApiError ? withNextStep(e.message) : "The upload failed.", offline: false });
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

  const poll = useCallback(async () => {
    if (phase.kind !== "reading") return;
    const job = await getJob(phase.jobId);
    if (job.status === "succeeded") {
      setPhase({ kind: "done", file: phase.file, bookId: phase.bookId, summary: readSummary(job.message), already: false });
      router.push(`/books/${phase.bookId}`);
    } else if (job.status === "failed" || job.status === "cancelled" || job.status === "completed_with_failures") {
      const book = await getBook(phase.bookId).catch(() => null);
      setPhase({ kind: "error", file: phase.file, message: withNextStep(book?.error || job.error || job.message || "The PDF could not be read."), offline: false });
    } else {
      setPhase((p) => (p.kind === "reading" ? { ...p, job } : p));
    }
  }, [phase, router]);
  usePoll(poll, 1500, phase.kind === "reading");
  useEffect(() => {
    if (phase.kind === "reading" && !phase.job) poll().catch(() => undefined);
  }, [phase, poll]);

  return { phase, start, cancel, reset, busy: phase.kind === "uploading" || phase.kind === "reading" || phase.kind === "done" };
}

export type UploadFlow = ReturnType<typeof useUploadFlow>;

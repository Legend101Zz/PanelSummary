"use client";

import { Button, Card, DropZone, Meter, Notice, StepList, formatPercent } from "@/components/ui";
import { useNow } from "@/lib/hooks";
import { UPLOAD_SLOW_TEXT, limitItems, type LimitValues } from "@/lib/words";
import type { UploadFlow } from "./useUploadFlow";
import styles from "./shelf.module.css";

/** The drop zone while nothing runs. While a file goes up, it is the three-step progress card with a cancel. */
export function UploadPanel({ flow, limits, title, className }: { flow: UploadFlow; limits?: LimitValues; title?: string; className?: string }) {
  const { phase } = flow;
  if (phase.kind === "idle" || phase.kind === "error") {
    return (
      <DropZone
        className={className}
        title={title}
        error={phase.kind === "error" ? phase.message : undefined}
        onFile={(file) => flow.start(file)}
        hint={
          <span className={styles.limits}>
            {limitItems(limits).map((t) => (
              <span key={t}>{t}</span>
            ))}
          </span>
        }
      />
    );
  }
  return <Progress flow={flow} className={className} />;
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

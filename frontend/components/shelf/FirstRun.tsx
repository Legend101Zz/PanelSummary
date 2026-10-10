"use client";

import { Button, Notice, StatusLine, CheckIcon, ProblemIcon } from "@/components/ui";
import type { ServerStatus } from "@/lib/api";
import { FIRST_RUN_LEDE, sampleEstimateSentence, sampleRealSentence } from "@/lib/words";
import { OfflineGate } from "./OfflineGate";
import { SampleCard } from "./SampleCard";
import { UploadPanel } from "./UploadPanel";
import { useSample } from "./useSample";
import { useUploadFlow } from "./useUploadFlow";
import styles from "./shelf.module.css";

/**
 * The first run: ONE screen that replaces the empty shelf at /. Not a wizard and not a redirect.
 * Server status in one line (a full block only when something is wrong), the drop zone with every limit,
 * one sentence on cost and time of the sample run, and "Or read the sample first".
 */
export function FirstRun({ status, onRefresh }: { status: ServerStatus | null | undefined; onRefresh: () => void }) {
  const limits = status?.limits;
  const flow = useUploadFlow(limits?.max_pdf_size_mb);
  const sample = useSample();
  const estimate = sampleEstimateSentence(sample.facts);
  return (
    <main id="main" className={styles.main}>
      <StatusSummary status={status} onRefresh={onRefresh} />
      <h1 className={styles.h1}>Your shelf</h1>
      <p className={styles.lede}>{FIRST_RUN_LEDE}</p>
      <div className={styles.firstGrid}>
        <div className={styles.firstMain}>
          <UploadPanel flow={flow} limits={limits} />
          <p className={styles.costLine}>
            For the sample book ({sample.book.pdfPages} PDF pages): {estimate ? `${estimate.charAt(0).toLowerCase()}${estimate.slice(1)} ` : ""}{sampleRealSentence(sample.facts)}
          </p>
        </div>
        <SampleCard sample={sample} />
      </div>
    </main>
  );
}

/** One line: the server, the job runner and the key. A full block only for "not reachable" and "no key". */
function StatusSummary({ status, onRefresh }: { status: ServerStatus | null | undefined; onRefresh: () => void }) {
  if (status === undefined) return <StatusLine tone="wait">Checking the PanelSummary server</StatusLine>;
  if (status === null) return <OfflineGate onRetry={onRefresh} />;
  const items: { ok: boolean; text: string }[] = [
    { ok: true, text: "PanelSummary server reachable" },
    { ok: status.runner.running, text: status.runner.running ? "Job runner running" : "Job runner not running" },
    { ok: status.worker.reachable && status.worker.key_set, text: !status.worker.reachable ? "Drawing service not reachable" : status.worker.key_set ? "MiniMax key set" : "MiniMax key not set" },
  ];
  return (
    <>
      <ul className={styles.statusLine} aria-label="Server status">
        {items.map((i) => (
          <li key={i.text} className={i.ok ? undefined : styles.statusBad}>
            {i.ok ? <CheckIcon size={16} /> : <ProblemIcon size={16} />}
            {i.text}
          </li>
        ))}
      </ul>
      {status.worker.reachable && !status.worker.key_set ? (
        <div className={styles.block}>
          <Notice tone="needs" role="alert" title="PanelSummary has no MiniMax key.">
            Put MINIMAX_API_KEY in backend/.env, or in the macOS Keychain item minimax_api_key. Then run ./stop.sh and ./start.sh.
          </Notice>
          <Button variant="secondary" size="sm" onClick={onRefresh}>
            Check again
          </Button>
        </div>
      ) : null}
    </>
  );
}

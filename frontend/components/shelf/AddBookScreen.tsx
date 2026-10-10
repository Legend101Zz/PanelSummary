"use client";

import { TextLink } from "@/components/ui";
import { ADD_BOOK_NOTE, addBookLede } from "@/lib/words";
import { FALLBACK_LIMITS } from "@/lib/words";
import { OfflineGate } from "./OfflineGate";
import { UploadPanel } from "./UploadPanel";
import { useServerStatus } from "./useServerStatus";
import { useUploadFlow } from "./useUploadFlow";
import styles from "./add.module.css";

/** Add a book at /upload. Every limit is shown before the upload (#49). A real <input type="file"> is in the drop zone. */
export function AddBookScreen() {
  const { status, refresh } = useServerStatus();
  const limits = status?.limits;
  const flow = useUploadFlow(limits?.max_pdf_size_mb);
  const maxMb = limits?.max_pdf_size_mb ?? FALLBACK_LIMITS.max_pdf_size_mb;
  return (
    <main id="main" className={styles.main}>
      {status === null || (flow.phase.kind === "error" && flow.phase.offline) ? <OfflineGate onRetry={() => { flow.reset(); refresh(); }} /> : null}
      <TextLink href="/" kind="back">
        Your shelf
      </TextLink>
      <div className={styles.layout}>
        <div className={styles.copy}>
          <h1 className={styles.h1}>Add a book</h1>
          <p className={styles.lede}>{addBookLede(maxMb)}</p>
          <p className={styles.note}>{ADD_BOOK_NOTE}</p>
        </div>
        <UploadPanel flow={flow} limits={limits} />
      </div>
    </main>
  );
}

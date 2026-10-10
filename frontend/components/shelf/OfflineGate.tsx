"use client";

import { Button, OfflineBanner, RetryIcon } from "@/components/ui";
import styles from "./shelf.module.css";

/**
 * "Server not reachable" for any app screen: the coral band with the one sentence and "Try again".
 * Use it where a request failed (an ApiError with status 0), and drop it when the next request works.
 * Show it at the top of the screen's <main>. The page under it keeps what it last showed.
 */
export function OfflineGate({ onRetry, checkAgain = false }: { onRetry: () => void; checkAgain?: boolean }) {
  return (
    <div className={styles.offline}>
      <OfflineBanner />
      {checkAgain ? (
        // the first run (FirstRun.html, Not reachable): a visible secondary button with the refresh icon
        <Button variant="secondary" size="sm" iconStart={<RetryIcon size={20} />} onClick={onRetry}>
          Check again
        </Button>
      ) : (
        <Button variant="quiet" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

import type { ReactNode } from "react";
import { ProblemIcon } from "./icons";
import styles from "./OfflineBanner.module.css";

export const OFFLINE_TEXT = "Can't reach the PanelSummary server. Check that it is running (./start.sh).";

/** A full-width coral band at the top of any screen when the server does not answer. */
export function OfflineBanner({ children = OFFLINE_TEXT }: { children?: ReactNode }) {
  return (
    <div className={styles.banner} role="alert">
      <ProblemIcon size={20} />
      <span>{children}</span>
    </div>
  );
}

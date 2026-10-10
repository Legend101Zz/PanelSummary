import type { ReactNode } from "react";
import { ClockIcon, ProblemIcon } from "./icons";
import { cx } from "./cx";
import styles from "./StatusLine.module.css";

export interface StatusLineProps {
  children: ReactNode;
  /** default: plain text. wait: with a clock. needs: bold with a problem icon (text colour, not coral: coral is for fills). */
  tone?: "default" | "wait" | "needs";
  /** A polite live region (for a line that changes while a run goes on). Default false. */
  live?: boolean;
  className?: string;
}

/** One line of status in words, no controls. */
export function StatusLine({ children, tone = "default", live = false, className }: StatusLineProps) {
  return (
    <p className={cx(styles.line, tone === "needs" && styles.needs, className)} aria-live={live ? "polite" : undefined}>
      {tone === "wait" ? <ClockIcon className={styles.icon} size={18} /> : null}
      {tone === "needs" ? <ProblemIcon className={styles.icon} size={18} /> : null}
      <span>{children}</span>
    </p>
  );
}

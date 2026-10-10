import type { ReactNode } from "react";
import { cx } from "./cx";
import styles from "./BottomBar.module.css";

export interface BottomBarProps {
  /** The one primary action (full width). */
  children: ReactNode;
  /** Only on a narrow screen (below 768 px). Default true. */
  narrowOnly?: boolean;
  /** Also render a spacer of the same height at the end of the page, so the bar covers no content. Default true. */
  reserveSpace?: boolean;
}

/** The fixed bar for 390 px, with the safe-area padding of a phone. Its slot holds one primary action, so the action stays on the first screen. */
export function BottomBar({ children, narrowOnly = true, reserveSpace = true }: BottomBarProps) {
  return (
    <>
      {reserveSpace ? <div className={cx(styles.spacer, narrowOnly && styles.narrowOnly)} aria-hidden="true" /> : null}
      <div className={cx(styles.bar, narrowOnly && styles.narrowOnly)}>{children}</div>
    </>
  );
}

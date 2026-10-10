"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { cx } from "./cx";
import styles from "./MomentBand.module.css";

export interface MomentBandProps {
  /** The line, for example "Page 1 is ready. Read it now while the rest is drawn." */
  children: ReactNode;
  /** Buttons. The Start reading button here is the one primary button of the view. */
  actions?: ReactNode;
  /** false: no grow, the band is full at once (a band that is already there on load). Default true. */
  animate?: boolean;
  className?: string;
}

const reducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The page 1 moment: yellow, shown once, when page 1 is drawn. The fill grows from the left,
 * scaleX(0) to 1, 400 ms, cubic-bezier(0.16, 1, 0.3, 1). With prefers-reduced-motion the band
 * is full at once (tokens.css removes the transition). It is a polite live region.
 */
export function MomentBand({ children, actions, animate = true, className }: MomentBandProps) {
  // With prefers-reduced-motion the band is filled from the first frame (no empty yellow frame before the jump).
  const [phase, setPhase] = useState<"before" | "after">(() => (animate && !reducedMotion() ? "before" : "after"));
  useEffect(() => {
    if (!animate) return;
    // two frames: the browser must paint scaleX(0) before it sees scaleX(1)
    let b = 0;
    const a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => setPhase("after"));
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [animate]);
  return (
    <div className={cx("app-moment", styles.band, className)}>
      <span className={cx("app-moment__fill", styles.fill)} data-phase={phase} aria-hidden="true" suppressHydrationWarning />
      {/* Only the line is announced. The buttons are not part of the live region. */}
      <p className={styles.text} role="status" aria-live="polite">
        {children}
      </p>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}

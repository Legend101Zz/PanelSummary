import type { ReactNode } from "react";
import { ProblemIcon } from "./icons";
import { cx } from "./cx";
import styles from "./PageFrame.module.css";

export type PageFrameState = "drawn" | "drawing" | "waiting" | "failed" | "blank";

export interface PageFrameProps {
  /**
   * drawn: the art (children), 1 px page edge on light, none on graphite.
   * drawing: dense screentone in a 3 px action frame. waiting: fine screentone in a 1.5 px edge.
   * failed: coral with an on-fill diagonal and a problem icon.
   * blank: a cover with no art: a plain sheet, solid 1 px edge, no text, no screentone.
   */
  state: PageFrameState;
  /** drawn: the page art (an <svg> or <img> that fills the frame). Never restyle it. */
  children?: ReactNode;
  /** cover (shelf, 160 px and up) or thumbnail (Pages grid, 96 px and up). The shape is the same; the name is for the contract. */
  variant?: "cover" | "thumbnail";
  /** A text name for the frame, for example "Page 7, drawing". Without it the frame is hidden from assistive technology: the caption beside it says the state. */
  label?: string;
  className?: string;
}

/** The frame is as wide as its container: set the width on the container. Always 2:3. */
export function PageFrame({ state, children, variant = "thumbnail", label, className }: PageFrameProps) {
  return (
    <span
      className={cx(styles.frame, styles[state], className)}
      data-variant={variant}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {state === "drawn" ? <span className={styles.art}>{children}</span> : null}
      {state === "failed" ? (
        <>
          <svg className={styles.diag} viewBox="0 0 10 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <path d="M0 10L10 0" />
          </svg>
          <ProblemIcon size={24} />
        </>
      ) : null}
    </span>
  );
}

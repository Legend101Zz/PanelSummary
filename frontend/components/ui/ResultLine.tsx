import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";
import { rangePosition } from "./format";
import styles from "./ResultLine.module.css";

export interface ResultLineProps {
  /** The line in words, for example "Took 7 min 08 s" or "About $0.46, not a bill". */
  title: string;
  /** The actual value and the estimate range, in the same unit (numbers). */
  actual: number;
  low: number;
  high: number;
  /** The same three values as text, for the labels: "7 min 08 s", "5 min", "58 min". */
  actualLabel: string;
  lowLabel: string;
  highLabel: string;
  /** A line under the bar, for example "The grey band is the estimate from before the run." */
  note?: ReactNode;
  className?: string;
}

/**
 * The range strip: the estimate range as a pale bar with a 1 px edge, the actual value as an action-colour mark with its label above.
 * Under 20% of the range the label starts at the mark, over 80% it ends at the mark, between it is centred.
 * The range ends sit below the bar, so the label never covers them. The words in `title` say the same thing.
 */
export function ResultLine({ title, actual, low, high, actualLabel, lowLabel, highLabel, note, className }: ResultLineProps) {
  const { fraction, align } = rangePosition(actual, low, high);
  const pos = `${fraction * 100}%`;
  const labelStyle: CSSProperties =
    align === "start" ? { left: `calc(${pos} - 2px)` } : align === "end" ? { right: `calc(${(1 - fraction) * 100}% - 2px)` } : { left: pos, transform: "translateX(-50%)" };
  return (
    <div className={cx(styles.root, className)}>
      <p className={styles.title}>{title}</p>
      <div className={styles.rng}>
        <span className={styles.av} style={labelStyle}>
          {actualLabel}
        </span>
        <span className={styles.bar} aria-hidden="true" />
        <span className={styles.mark} style={{ left: pos }} aria-hidden="true" />
        <span className={styles.lo}>{lowLabel}</span>
        <span className={styles.hi}>{highLabel}</span>
        <span className="sr-only">{`Estimate before the run: ${lowLabel} to ${highLabel}.`}</span>
      </div>
      {note ? <p className={styles.note}>{note}</p> : null}
    </div>
  );
}

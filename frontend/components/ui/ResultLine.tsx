import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";
import { rangePosition, rangeSide } from "./format";
import styles from "./ResultLine.module.css";

/** The words for a value outside the estimate range (the mark is held inside the strip, so the words carry the fact). */
export const OUTSIDE_BELOW = "Faster than the estimate";
export const OUTSIDE_ABOVE = "Slower than the estimate";
export const OUTSIDE_COST = { below: "Lower than the estimate", above: "Higher than the estimate" } as const;
/** Half the width of the mark plus the bar edge, so the whole mark is inside the bar. */
const MARK_INSET = 3;

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
  /** The words for a value under or over the range. Default: time ("Faster than the estimate"). */
  outsideWords?: { below: string; above: string };
  className?: string;
}

/**
 * The range strip: the estimate range as a pale bar with a 1 px edge, the actual value as an action-colour mark with its label above.
 * Under 20% of the range the label starts at the mark, over 80% it ends at the mark, between it is centred.
 * A value outside the range is held at the near end of the strip and said in words ("Faster than the estimate").
 * The range ends sit below the bar, so the label never covers them. The words in `title` say the same thing.
 */
export function ResultLine({ title, actual, low, high, actualLabel, lowLabel, highLabel, note, outsideWords, className }: ResultLineProps) {
  const { fraction, align } = rangePosition(actual, low, high);
  const side = rangeSide(actual, low, high);
  const words = outsideWords ?? { below: OUTSIDE_BELOW, above: OUTSIDE_ABOVE };
  const outside = side === "within" ? null : side === "below" ? words.below : words.above;
  const pos = `${fraction * 100}%`;
  // The mark and its label stay inside the strip: a value outside the range sits at the near end, never past it.
  const markLeft = `clamp(${MARK_INSET}px, ${pos}, calc(100% - ${MARK_INSET}px))`;
  const labelStyle: CSSProperties =
    align === "start"
      ? { left: `max(0px, calc(${pos} - 2px))` }
      : align === "end"
        ? { right: `max(0px, calc(${(1 - fraction) * 100}% - 2px))` }
        : { left: pos, transform: "translateX(-50%)" };
  return (
    <div className={cx(styles.root, className)}>
      <p className={styles.title}>{title}</p>
      <div className={styles.rng}>
        <span className={styles.av} style={labelStyle}>
          {actualLabel}
          {outside ? <span className={styles.outside}>{` · ${outside}`}</span> : null}
        </span>
        <span className={styles.bar} aria-hidden="true" />
        <span className={styles.mark} style={{ left: markLeft }} aria-hidden="true" />
        <span className={styles.lo}>{lowLabel}</span>
        <span className={styles.hi}>{highLabel}</span>
        <span className="sr-only">{`Estimate before the run: ${lowLabel} to ${highLabel}.${outside ? ` This run was ${outside.toLowerCase()}.` : ""}`}</span>
      </div>
      {note ? <p className={styles.note}>{note}</p> : null}
    </div>
  );
}

import type { CSSProperties } from "react";
import { cx } from "./cx";
import { describeSegments, stripColumns, summaryLine } from "./toneStripLogic";
import type { SegmentState } from "./toneStripLogic";
import styles from "./ToneStrip.module.css";

export interface ToneStripProps {
  /** One state per planned page, in order (see segmentsFromPages in toneStrip.ts). Leave empty with `indeterminate` before the plan exists. */
  segments: readonly SegmentState[];
  /** Before the plan exists: one long segment of fine tone and "The number of pages is not known yet". */
  indeterminate?: boolean;
  /** Show the legend that names every state in words. Default true. */
  legend?: boolean;
  /** Show the line in words under the strip. Default false: the caption of the run card says it. */
  showSummary?: boolean;
  /** Replaces the text alternative of the picture. */
  label?: string;
  className?: string;
}

const LEGEND: Array<{ state: SegmentState; text: string }> = [
  { state: "drawn", text: "Drawn" },
  { state: "drawing", text: "Drawing now" },
  { state: "waiting", text: "Waiting" },
  { state: "failed", text: "Could not be drawn" },
];

function Diagonal() {
  return (
    <svg viewBox="0 0 10 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 10L10 0" />
    </svg>
  );
}

/**
 * One segment per planned page. A picture with a text alternative: the Pages grid holds the page links.
 * drawn = solid ink, drawing now = dense tone in a 3 px action frame, waiting = fine tone in an edge,
 * could not be drawn = coral with a diagonal. Rows of 20 on a phone; the drawing and failed segments stay easy to find at 60 pages.
 */
export function ToneStrip({ segments, indeterminate = false, legend = true, showSummary = false, label, className }: ToneStripProps) {
  const unknown = indeterminate || segments.length === 0;
  const cols = stripColumns(segments.length);
  // A strip of a few pages keeps each segment a sensible width instead of stretching to the card.
  const style = { "--cols-narrow": unknown ? 1 : cols.narrow, "--cols-wide": unknown ? 1 : cols.wide, maxWidth: !unknown && segments.length < 8 ? `${segments.length * 76}px` : undefined } as CSSProperties;
  const alt = label ?? describeSegments(unknown ? [] : segments);
  return (
    <div className={cx(styles.root, className)}>
      <div className={cx(styles.strip, segments.length > 20 && styles.dense)} style={style} role="img" aria-label={alt}>
        {unknown ? (
          <span className={cx(styles.seg, styles.waiting, styles.indeterminate)} />
        ) : (
          segments.map((s, i) => (
            <span key={i} className={cx(styles.seg, styles[s])}>
              {s === "failed" ? <Diagonal /> : null}
            </span>
          ))
        )}
      </div>
      {showSummary ? <p className={styles.summary}>{summaryLine(unknown ? [] : segments)}</p> : null}
      {legend && !unknown ? (
        <ul className={styles.legend} aria-hidden="true">
          {LEGEND.map((l) => (
            <li key={l.state}>
              <span className={cx(styles.key, styles.seg, styles[l.state])}>{l.state === "failed" ? <Diagonal /> : null}</span>
              {l.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

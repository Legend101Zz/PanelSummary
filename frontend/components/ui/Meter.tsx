import type { ReactNode } from "react";
import { cx } from "./cx";
import { clamp01, meterParts } from "./format";
import styles from "./Meter.module.css";

export interface MeterProps {
  /** What is measured, for example "Words in this choice". */
  label: string;
  /** The value in words, for example "5,794 of 17,500". Always shown. */
  valueText: string;
  /** Meter: the value and its limit. The part over the limit is coral. */
  value?: number;
  limit?: number;
  /** Progress: a fraction 0..1 (no limit). Use for an upload. */
  fraction?: number;
  /** A line in words under the bar, for example "Inside the limit." or "3,500 words over the limit." */
  note?: ReactNode;
  className?: string;
}

/** An ink fill on a grey track, with the value in words. The part over a limit is coral behind a 2 px edge. */
export function Meter({ label, valueText, value, limit, fraction, note, className }: MeterProps) {
  const isProgress = fraction !== undefined;
  const parts = !isProgress && value !== undefined && limit !== undefined ? meterParts(value, limit) : { fill: clamp01(fraction ?? 0), over: 0, overBy: 0, isOver: false };
  return (
    <div className={cx(styles.root, isProgress && styles.progress, className)}>
      <div className={styles.head}>
        <span>{label}</span>
        <span className={styles.value}>{valueText}</span>
      </div>
      <div
        className={styles.track}
        role={isProgress ? "progressbar" : undefined}
        aria-label={isProgress ? label : undefined}
        aria-valuemin={isProgress ? 0 : undefined}
        aria-valuemax={isProgress ? 100 : undefined}
        aria-valuenow={isProgress ? Math.round(parts.fill * 100) : undefined}
        aria-hidden={isProgress ? undefined : true}
      >
        <span className={styles.fill} style={{ width: `${parts.fill * 100}%` }} />
        {parts.isOver ? <span className={styles.over} style={{ width: `${parts.over * 100}%` }} /> : null}
      </div>
      {note ? <p className={cx(styles.note, parts.isOver && styles.noteOver)}>{note}</p> : null}
    </div>
  );
}

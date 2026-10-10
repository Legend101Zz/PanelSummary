import type { ReactNode } from "react";
import { Disclosure } from "./Disclosure";
import { cx } from "./cx";
import styles from "./EstimatePanel.module.css";

export interface EstimateRow {
  label: string;
  value: string;
}

export interface EstimatePanelProps {
  /** Labelled rows: "Manga pages", "Page 1 is ready in", "The whole book is ready in", "Cost (estimate)". The labels can change. */
  rows: readonly EstimateRow[];
  /** One short line: "Estimate at MiniMax-M3 rates, not a bill." */
  basis?: ReactNode;
  /** The long explanation, behind a disclosure. */
  detail?: ReactNode;
  detailLabel?: string;
  className?: string;
}

/** The estimate before a run, as a labelled list. A description list, so a screen reader reads label and value together. */
export function EstimatePanel({ rows, basis, detail, detailLabel = "How the estimate is made", className }: EstimatePanelProps) {
  return (
    <div className={cx(styles.root, className)}>
      <dl className={styles.list}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "contents" }}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
      {basis ? <p className={styles.basis}>{basis}</p> : null}
      {detail ? (
        <div className={styles.detail}>
          <Disclosure label={detailLabel}>{detail}</Disclosure>
        </div>
      ) : null}
    </div>
  );
}

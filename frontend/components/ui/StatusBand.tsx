import { CheckIcon, ProblemIcon } from "./icons";
import { cx } from "./cx";
import { clamp01 } from "./format";
import { splitNumberGroup } from "./statusBandLogic";
import type { BandFamily } from "./statusBandLogic";
import styles from "./StatusBand.module.css";

export interface StatusBandProps {
  /** drawn: solid band with a check. progress: outlined thin line (filled or dashed). needs: coral with a problem icon. outline: outlined band (not started, or stopped by you). */
  family: BandFamily;
  /** The state in words (13 px or more, two lines at most in a 160 px cover). */
  text: string;
  /** progress only: 0..1 fills the line. Leave it out for "before the plan exists" (dashes). */
  fraction?: number;
  className?: string;
}

/**
 * The band under a cover. Presentational: the state is already decided (see statusBand.ts).
 * Each family has its own shape as well as its own colour. It never sits over the page art.
 */
export function StatusBand({ family, text, fraction, className }: StatusBandProps) {
  if (family === "progress") {
    return (
      <div className={cx(styles.band, styles.progress, className)}>
        <span className={styles.text}>{text}</span>
        <span className={styles.line} aria-hidden="true">
          {fraction === undefined ? <span className={styles.lineIndet} /> : <span className={styles.lineFill} style={{ width: `${clamp01(fraction) * 100}%` }} />}
        </span>
      </div>
    );
  }
  if (family === "outline") {
    return <div className={cx(styles.band, styles.outline, className)}>{text}</div>;
  }
  const icon = family === "drawn" ? <CheckIcon size={14} className={styles.icon} /> : <ProblemIcon size={14} className={styles.icon} />;
  const [lead, tail] = splitNumberGroup(text);
  return (
    <div className={cx(styles.band, styles.fill, family === "drawn" ? styles.drawn : styles.needs, className)}>
      {lead ? (
        <span>
          {lead}{" "}
          <span className={styles.nowrap}>
            {icon}
            {tail}
          </span>
        </span>
      ) : (
        <span>
          {icon}
          {tail}
        </span>
      )}
    </div>
  );
}

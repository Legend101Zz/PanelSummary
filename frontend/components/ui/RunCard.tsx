import type { ReactNode } from "react";
import { Card } from "./Card";
import { cx } from "./cx";
import styles from "./RunCard.module.css";

export interface RunCardProps {
  /** A small line above the headline (optional). */
  eyebrow?: ReactNode;
  /** What is happening, in a sentence. This slot is a polite live region. */
  headline: ReactNode;
  headingLevel?: 2 | 3;
  /** A Notice, full width inside the card (use `<Notice tone="needs" inCard>`). */
  notice?: ReactNode;
  /** The step list. */
  steps?: ReactNode;
  /** The tone strip, or the estimate panel, or the result lines. */
  strip?: ReactNode;
  /** Free content between the strip and the time line. */
  children?: ReactNode;
  /** The time line: "0 pages drawn of 16 · Running for 3 min 12 s." */
  time?: ReactNode;
  /** Buttons. One primary button at most. */
  actions?: ReactNode;
  /** Small notes under the actions. */
  notes?: ReactNode;
  className?: string;
}

/** The run card: a layout shell with slots. It holds no state and no logic: the book page decides what goes in each slot. */
export function RunCard({ eyebrow, headline, headingLevel = 2, notice, steps, strip, children, time, actions, notes, className }: RunCardProps) {
  const H = `h${headingLevel}` as "h2" | "h3";
  return (
    <Card as="section" className={className}>
      <div aria-live="polite" aria-atomic="true">
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <H className={styles.headline}>{headline}</H>
      </div>
      {notice ? <div className={styles.notice}>{notice}</div> : null}
      {steps ? <div className={styles.slot}>{steps}</div> : null}
      {strip ? <div className={styles.slot}>{strip}</div> : null}
      {children ? <div className={styles.slot}>{children}</div> : null}
      {time ? <p className={styles.time}>{time}</p> : null}
      {actions ? <div className={cx(styles.actions)}>{actions}</div> : null}
      {notes ? <div className={styles.notes}>{notes}</div> : null}
    </Card>
  );
}

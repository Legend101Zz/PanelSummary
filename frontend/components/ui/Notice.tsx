import type { ReactNode } from "react";
import { Disclosure } from "./Disclosure";
import { ClockIcon, InfoIcon, ProblemIcon } from "./icons";
import { cx } from "./cx";
import styles from "./Notice.module.css";

/** needs: something needs the person (coral, problem icon). note: calm fact (ink block). info and wait: raised grey with an icon. */
export type NoticeTone = "needs" | "note" | "info" | "wait";

export interface NoticeProps {
  tone: NoticeTone;
  /** The first line, bold: what happened. */
  title?: ReactNode;
  /** The next lines: what to do. */
  children?: ReactNode;
  /** Technical detail: shown behind a "Technical detail" disclosure. */
  detail?: ReactNode;
  /** Inside a card: full width, square corners (RunCard does this for its `notice` slot). */
  inCard?: boolean;
  role?: "alert" | "status";
  className?: string;
}

export function Notice({ tone, title, children, detail, inCard = false, role, className }: NoticeProps) {
  const icon = tone === "needs" ? <ProblemIcon size={20} /> : tone === "info" ? <InfoIcon size={20} /> : tone === "wait" ? <ClockIcon size={20} /> : null;
  return (
    <div className={cx(styles.notice, styles[tone], inCard && styles.inCard, className)} role={role}>
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      <div className={styles.body}>
        {title ? <p className={styles.title}>{title}</p> : null}
        {children ? <div className={styles.text}>{children}</div> : null}
        {detail ? (
          <div className={styles.detail}>
            <Disclosure label="Technical detail">{detail}</Disclosure>
          </div>
        ) : null}
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import { CheckIcon, StepNextIcon, StepNowIcon } from "./icons";
import { cx } from "./cx";
import { STEP_WORD, stepStates } from "./steps";
import styles from "./StepList.module.css";

export interface StepItem {
  label: string;
  /** Under the label of the step, for example a Meter for an upload. */
  detail?: ReactNode;
}

export interface StepListProps {
  steps: readonly StepItem[];
  /** Index of the current step. Use steps.length when every step is done. */
  current: number;
  /** Show 1., 2., 3. before the labels. The list is always an ordered list. */
  numbered?: boolean;
  className?: string;
}

/** Done, now and next, each said by a word and an icon as well as by weight. Used for the run (Reading the book, Planning the pages, Drawing the pages) and for the upload. */
export function StepList({ steps, current, numbered = false, className }: StepListProps) {
  const states = stepStates(steps.length, current);
  return (
    <ol className={cx(styles.list, className)}>
      {steps.map((s, i) => {
        const st = states[i];
        return (
          <li key={s.label} className={cx(styles.step, styles[st])} aria-current={st === "current" ? "step" : undefined}>
            <span className={styles.mark}>{st === "done" ? <CheckIcon size={20} /> : st === "current" ? <StepNowIcon size={20} /> : <StepNextIcon size={20} />}</span>
            <span className={styles.body}>
              <span className={styles.row}>
                <span className={styles.label}>
                  {numbered ? <span className={styles.num}>{i + 1}. </span> : null}
                  {s.label}
                </span>
                <span className={styles.word}>{STEP_WORD[st]}</span>
              </span>
              {s.detail ? <div className={styles.detail}>{s.detail}</div> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

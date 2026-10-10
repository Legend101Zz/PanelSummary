import type { InputHTMLAttributes, ReactNode } from "react";
import { CheckIcon } from "./icons";
import { cx } from "./cx";
import styles from "./Checkbox.module.css";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> {
  /** The visible label. */
  label: ReactNode;
  /** A small value at the right, for example "2,323 words". */
  extra?: ReactNode;
}

/** A real checkbox, 24 px box, the whole row is the 44 px target. */
export function Checkbox({ label, extra, className, ...rest }: CheckboxProps) {
  return (
    <label className={cx(styles.root, className)}>
      <input {...rest} type="checkbox" className={styles.input} />
      <span className={styles.box} aria-hidden="true">
        <CheckIcon size={16} strokeWidth={3} />
      </span>
      <span className={styles.text}>{label}</span>
      {extra ? <span className={styles.extra}>{extra}</span> : null}
    </label>
  );
}

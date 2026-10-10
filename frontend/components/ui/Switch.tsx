import type { InputHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import styles from "./Switch.module.css";

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children" | "role"> {
  label: ReactNode;
}

/** An on or off setting. A real checkbox input with role="switch". The row is the 44 px target. */
export function Switch({ label, className, ...rest }: SwitchProps) {
  return (
    <label className={cx(styles.root, className)}>
      <input {...rest} type="checkbox" role="switch" className={styles.input} />
      <span className={styles.track} aria-hidden="true">
        <span className={styles.knob} />
      </span>
      <span>{label}</span>
    </label>
  );
}

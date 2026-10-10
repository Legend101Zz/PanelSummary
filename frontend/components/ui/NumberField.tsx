import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import styles from "./NumberField.module.css";

export interface NumberFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "children"> {
  label: string;
  /** A hint in words below the box. With `invalid` it says what is wrong. */
  hint?: ReactNode;
  invalid?: boolean;
  /** Text after the box, for example "to 40". */
  suffix?: ReactNode;
}

/** An 88 x 48 px number box. An invalid box has a 2.5 px coral edge AND a written hint: never colour alone. */
export function NumberField({ label, hint, invalid = false, suffix, id, className, ...rest }: NumberFieldProps) {
  const uid = useId();
  const inputId = id ?? `${uid}-in`;
  const hintId = `${uid}-hint`;
  return (
    <div className={cx(styles.root, className)}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <span className={styles.line}>
        <input {...rest} id={inputId} type="number" inputMode="numeric" className={styles.input} aria-invalid={invalid || undefined} aria-describedby={hint ? hintId : undefined} />
        {suffix ? <span className={styles.suffix}>{suffix}</span> : null}
      </span>
      {hint ? (
        <span id={hintId} className={cx(styles.hint, !invalid && styles.hintPlain)}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

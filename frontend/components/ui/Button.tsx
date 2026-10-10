import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import { DotsIcon } from "./icons";
import { cx } from "./cx";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
/** lg = 52 px, md = 48 px, sm = 44 px. */
export type ButtonSize = "lg" | "md" | "sm";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** The visible label. Labels never wrap. */
  children: ReactNode;
  /**
   * The accessible name, when it must differ from the visible label.
   * A busy button shows "Starting" and is named "Generate manga: starting".
   */
  accessibleName?: string;
  /** Renders a link (an anchor) that looks like the button. */
  href?: string;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  /** Busy: three still dots before the label (the label is a verb such as "Starting"). The button is off. */
  loading?: boolean;
  /** Off, with a reason. The reason is written beside the button, in words. Needs `disabled`. */
  why?: ReactNode;
  fullWidth?: boolean;
}

/** Four variants, three sizes. One primary button for each view. Errors never show on the button: use a Notice. */
export function Button({
  variant = "secondary",
  size = "md",
  children,
  accessibleName,
  href,
  iconStart,
  iconEnd,
  loading = false,
  disabled = false,
  why,
  fullWidth = false,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  const whyId = useId();
  const off = disabled || loading;
  const cls = cx(styles.btn, styles[variant], styles[size], fullWidth && styles.full, off && styles.off, className);
  const inner = (
    <>
      {loading ? <DotsIcon size={20} /> : iconStart}
      <span>{children}</span>
      {!loading && iconEnd}
    </>
  );
  let el: ReactNode;
  if (href && !off) {
    el = (
      <Link href={href} className={cls} aria-label={accessibleName}>
        {inner}
      </Link>
    );
  } else {
    el = (
      <button
        {...rest}
        type={type}
        className={cls}
        disabled={off}
        aria-busy={loading || undefined}
        aria-label={accessibleName}
        aria-describedby={why ? whyId : rest["aria-describedby"]}
      >
        {inner}
      </button>
    );
  }
  if (!why) return <>{el}</>;
  return (
    <span className={styles.wrap}>
      {el}
      <span id={whyId} className={styles.why}>
        {why}
      </span>
    </span>
  );
}

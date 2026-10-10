import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import styles from "./IconButton.module.css";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> {
  /** The accessible name. Required: the button has no visible text. */
  label: string;
  /** The icon (an element from icons.tsx). */
  icon: ReactNode;
  /** A toggle: true = on (filled). Sets aria-pressed. */
  pressed?: boolean;
  /** A button that opens a menu or a panel. Sets aria-expanded. */
  expanded?: boolean;
}

/** 44 x 44 px square with a 2 px edge. */
export function IconButton({ label, icon, pressed, expanded, className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button {...rest} type={type} className={cx(styles.btn, className)} aria-label={label} aria-pressed={pressed} aria-expanded={expanded}>
      {icon}
    </button>
  );
}

"use client";

import { cloneElement, isValidElement, useId, useState } from "react";
import type { ReactElement } from "react";
import styles from "./Tooltip.module.css";

export interface TooltipProps {
  /** The reason, in words. The same words also sit beside the control (see Button `why`): a tooltip is never the only place. */
  text: string;
  /** One control. It gets aria-describedby. */
  children: ReactElement<{ "aria-describedby"?: string }>;
}

/** Shows on hover and on keyboard focus. Escape hides it. Use it for a control that is off. */
export function Tooltip({ text, children }: TooltipProps) {
  const id = useId();
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const show = (hover || focus) && !dismissed;
  const child = isValidElement(children) ? cloneElement(children, { "aria-describedby": id }) : children;
  return (
    <span
      className={styles.root}
      onMouseEnter={() => {
        setHover(true);
        setDismissed(false);
      }}
      onMouseLeave={() => setHover(false)}
      onFocus={() => {
        setFocus(true);
        setDismissed(false);
      }}
      onBlur={() => setFocus(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setDismissed(true);
      }}
    >
      {child}
      <span id={id} role="tooltip" className={styles.tip} hidden={!show}>
        {text}
      </span>
    </span>
  );
}

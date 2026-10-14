"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { cx } from "./cx";
import styles from "./BottomBar.module.css";

export interface BottomBarProps {
  /** The one primary action (full width). */
  children: ReactNode;
  /** Only on a narrow screen (below 768 px). Default true. */
  narrowOnly?: boolean;
  /** Add bottom padding to the whole app frame (content and footer) as high as the bar is now, so the bar covers nothing at the end of the page. Default true. */
  reserveSpace?: boolean;
}

/** The custom property that the app frame (`app/(app)/frame.module.css`) uses as its bottom padding. */
export const BAR_HEIGHT_VAR = "--app-bar-h";

/**
 * The fixed bar for 390 px, with the safe-area padding of a phone. Its slot holds one primary action, so the action stays on the first screen.
 * It measures its own height (a bar with the page 1 band and two buttons is taller than a bar with one button) and sets `--app-bar-h` on the
 * document. The app frame pads its bottom by that value, so at the end of the page no content, and not the footer, is under the bar.
 * Above 768 px the bar is hidden, its height is 0 and so is the padding.
 */
export function BottomBar({ children, narrowOnly = true, reserveSpace = true }: BottomBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el || !reserveSpace) return;
    const root = document.documentElement;
    const measure = () => root.style.setProperty(BAR_HEIGHT_VAR, `${Math.ceil(el.getBoundingClientRect().height)}px`);
    measure();
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
      root.style.removeProperty(BAR_HEIGHT_VAR);
    };
  }, [reserveSpace]);
  return (
    <div ref={barRef} className={cx(styles.bar, narrowOnly && styles.narrowOnly)}>
      {children}
    </div>
  );
}

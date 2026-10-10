import type { CSSProperties } from "react";
import { cx } from "./cx";
import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  /** cover: 2:3 page shape with 12 px corners. line: a text line. block: a free box (set width and height). */
  shape?: "cover" | "line" | "block";
  width?: number | string;
  height?: number | string;
  className?: string;
}

/** A loading placeholder. Hidden from assistive technology (the page says "Loading" in words elsewhere). It looks different from a blank cover: no edge, no text. */
export function Skeleton({ shape = "block", width, height, className }: SkeletonProps) {
  const style: CSSProperties = { width, height };
  return <span aria-hidden="true" className={cx(styles.sk, styles[shape], className)} style={style} />;
}

import type { ElementType, ReactNode } from "react";
import { cx } from "./cx";
import styles from "./Card.module.css";

export interface CardProps {
  children: ReactNode;
  as?: ElementType;
  /** Always the narrow padding (18 px). Cards go narrow by themselves below 768 px. */
  narrow?: boolean;
  className?: string;
}

/** A card holds one task: surface ground, 2 px line, 22 px corners, 28 x 32 px padding (18 px narrow). */
export function Card({ children, as: Tag = "div", narrow = false, className }: CardProps) {
  return <Tag className={cx(styles.card, narrow && styles.narrow, className)}>{children}</Tag>;
}

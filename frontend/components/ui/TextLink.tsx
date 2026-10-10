import Link from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { ArrowLeftIcon } from "./icons";
import { cx } from "./cx";
import styles from "./TextLink.module.css";

export type TextLinkKind = "inline" | "nav" | "back" | "secondary";

export interface TextLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children"> {
  href: string;
  children: ReactNode;
  /**
   * inline: underlined label. nav: plain, the current page is bold with a 2 px underline.
   * back: leads with the back arrow. secondary: quieter text colour (footer).
   */
  kind?: TextLinkKind;
  /** nav only: this link is the current page (sets aria-current="page"). */
  current?: boolean;
  /** nav only: the taller row used in the phone menu. */
  menuRow?: boolean;
}

export function TextLink({ href, children, kind = "inline", current = false, menuRow = false, className, ...rest }: TextLinkProps) {
  return (
    <Link
      href={href}
      {...rest}
      aria-current={kind === "nav" && current ? "page" : rest["aria-current"]}
      className={cx(styles.link, kind === "nav" && styles.nav, kind === "nav" && menuRow && styles.navMenu, kind === "secondary" && styles.secondary, className)}
    >
      {kind === "back" ? <ArrowLeftIcon size={20} /> : null}
      <span className={styles.label}>{children}</span>
    </Link>
  );
}

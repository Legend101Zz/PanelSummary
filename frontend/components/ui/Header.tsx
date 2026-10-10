"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { TextLink } from "./TextLink";
import { CloseIcon, MenuIcon, MoonFilledIcon, MoonIcon, PanelMark } from "./icons";
import { useTheme } from "@/lib/useTheme";
import styles from "./Header.module.css";

/** Which nav link is the current page. The shelf covers /, /books/... ; Settings covers /settings. */
export function currentNav(pathname: string | null): "shelf" | "settings" | null {
  if (!pathname) return null;
  if (pathname === "/" || pathname.startsWith("/books")) return "shelf";
  if (pathname.startsWith("/settings")) return "settings";
  return null;
}

/** The theme button: switches between Light and Dark and keeps the choice. aria-pressed = dark is on. */
export function ThemeButton() {
  const { resolved, toggle } = useTheme();
  const dark = resolved === "dark";
  return <IconButton label="Dark theme" pressed={dark} onClick={toggle} icon={dark ? <MoonFilledIcon size={20} /> : <MoonIcon size={20} />} />;
}

function Wordmark() {
  return (
    <Link href="/" className={styles.mark} aria-label="PanelSummary, your shelf">
      <span className={styles.tile} aria-hidden="true">
        <PanelMark width={14} height={20} />
      </span>
      <span className={styles.word}>PanelSummary</span>
    </Link>
  );
}

/**
 * The app header. Wide: wordmark, Shelf and Settings links, "Add a book" (the only button), the theme button.
 * Phone (below 768 px): wordmark, theme button and a menu button. The menu holds the links and "Add a book",
 * dims the page behind it and makes the page inert while it is open. Escape closes it.
 */
export function Header() {
  const pathname = usePathname();
  const cur = currentNav(pathname);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const btnRef = useRef<HTMLDivElement>(null);

  // close when the page changes
  useEffect(() => setOpen(false), [pathname]);

  // the page behind the menu is inert while it is open
  useEffect(() => {
    const content = document.getElementById("app-content");
    if (!content) return;
    content.toggleAttribute("inert", open);
    return () => content.removeAttribute("inert");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        (btnRef.current?.querySelector("button[aria-expanded]") as HTMLButtonElement | null)?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Wordmark />
        <nav className={styles.nav} aria-label="Main">
          <TextLink href="/" kind="nav" current={cur === "shelf"}>
            Shelf
          </TextLink>
          <TextLink href="/settings" kind="nav" current={cur === "settings"}>
            Settings
          </TextLink>
          <Button href="/upload" size="sm" variant="secondary">
            Add a book
          </Button>
          <ThemeButton />
        </nav>
        <div className={styles.phone}>
          <ThemeButton />
          <div ref={btnRef}>
            <IconButton label="Menu" expanded={open} aria-controls={menuId} onClick={() => setOpen((o) => !o)} icon={open ? <CloseIcon size={20} /> : <MenuIcon size={20} />} />
          </div>
        </div>
      </div>
      <nav id={menuId} className={styles.menu} aria-label="Main (menu)" hidden={!open}>
        <ul>
          <li>
            <TextLink href="/" kind="nav" menuRow current={cur === "shelf"}>
              Shelf
            </TextLink>
          </li>
          <li>
            <TextLink href="/settings" kind="nav" menuRow current={cur === "settings"}>
              Settings
            </TextLink>
          </li>
        </ul>
        <div className={styles.menuAction}>
          <Button href="/upload" variant="secondary" fullWidth>
            Add a book
          </Button>
        </div>
      </nav>
      {open ? <div className={styles.scrim} aria-hidden="true" onClick={() => setOpen(false)} /> : null}
    </header>
  );
}

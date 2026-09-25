/**
 * Paper objects: the manuscript sheet (pencil-blue guides and crop marks, used
 * for anything not inked yet), the book cover, and its obi band.
 */
import type { ReactNode } from "react";
import type { Tone } from "@/lib/words";
import styles from "./Paper.module.css";

/** Manga manuscript paper: inner frame, trim line and crop marks in non-photo blue. */
export function ManuscriptGuides({ tone = "pencil" }: { tone?: "pencil" | "redpen" }) {
  const c = (x: number, y: number, dx: number, dy: number) => `M${x} ${y - dy * 10}V${y}M${x - dx * 10} ${y}H${x}`;
  const marks = [c(14, 14, 1, 1), c(186, 14, -1, 1), c(14, 286, 1, -1), c(186, 286, -1, -1)].join("");
  const centres = "M100 3V11M96 7H104M100 289V297M96 293H104M3 150H11M7 146V154M189 150H197M193 146V154";
  return (
    <svg className={`${styles.guides} ${tone === "redpen" ? styles.guidesRedpen : ""}`} viewBox="0 0 200 300" preserveAspectRatio="none" aria-hidden="true">
      <path d={marks + centres} />
      <rect x="26" y="32" width="148" height="236" className={styles.innerFrame} />
    </svg>
  );
}

export function Sheet({
  children,
  tone = "pencil",
  className = "",
  busy = false,
}: {
  children?: ReactNode;
  tone?: "pencil" | "redpen";
  className?: string;
  busy?: boolean;
}) {
  return (
    <div data-tone={tone} className={`${styles.sheet} ${tone === "redpen" ? styles.sheetRedpen : ""} ${busy ? styles.busy : ""} ${className}`}>
      <ManuscriptGuides tone={tone} />
      {children ? <div className={styles.sheetContent}>{children}</div> : null}
    </div>
  );
}

export function Obi({ tone, children, progress }: { tone: Tone; children: ReactNode; progress?: number }) {
  return (
    <div className={`${styles.obi} ${styles[`obi_${tone}`]}`}>
      <span className={styles.obiText}>{children}</span>
      {progress !== undefined ? (
        <span className={styles.obiTrack} aria-hidden="true">
          <span className={styles.obiFill} style={{ width: `${Math.max(3, Math.min(100, progress * 100))}%` }} />
        </span>
      ) : null}
    </div>
  );
}

/** A book cover: the real first page when one is drawn, else a manuscript sheet with the title. */
export function Cover({
  art,
  title,
  author,
  obi,
  size = "shelf",
}: {
  art?: ReactNode;
  title: string;
  author?: string;
  obi?: ReactNode;
  size?: "shelf" | "hero";
}) {
  return (
    <div className={`${styles.cover} ${size === "hero" ? styles.coverHero : ""}`}>
      {art ?? (
        <div className={styles.blank}>
          <ManuscriptGuides />
          <div className={styles.blankTitle}>
            <span className={styles.blankTitleText}>{title}</span>
            {author ? <span className={styles.blankAuthor}>{author}</span> : null}
          </div>
        </div>
      )}
      {obi}
    </div>
  );
}

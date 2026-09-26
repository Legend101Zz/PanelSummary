"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadPage, type EditionPageSummary } from "@/lib/api";
import { useNearViewport } from "@/lib/hooks";
import { Sheet } from "./Paper";
import { SvgPage } from "./SvgPage";
import styles from "./PageThumb.module.css";

/** One page in the book page's grid: inked when accepted, pencil while waiting, red pen when it failed. */
export function PageThumb({ bookId, editionId, page }: { bookId: string; editionId: string; page: EditionPageSummary }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [ref, near] = useNearViewport<HTMLLIElement>("400px");
  const accepted = page.status === "accepted";

  useEffect(() => {
    if (!accepted || !near || svg) return;
    let live = true;
    loadPage(editionId, page.page_number)
      .then((p) => live && p.svg && setSvg(p.svg))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [accepted, near, svg, editionId, page.page_number]);

  const href = `/books/${bookId}/read?edition=${editionId}&page=${page.page_number}`;
  let body: React.ReactNode;
  let caption: string;
  if (accepted) {
    caption = `Page ${page.page_number}`;
    body = svg ? <SvgPage svg={svg} decorative className={styles.art} /> : <div className={styles.loading} />;
  } else if (page.status === "failed") {
    caption = `Page ${page.page_number} could not be drawn`;
    body = (
      <Sheet tone="redpen">
        <span className={styles.stateTitle}>Could not be drawn</span>
      </Sheet>
    );
  } else if (page.status === "drawing") {
    caption = `Page ${page.page_number} is being drawn`;
    body = (
      <Sheet busy>
        <span className={styles.stateTitle}>Drawing</span>
      </Sheet>
    );
  } else {
    caption = `Page ${page.page_number} is waiting to be drawn`;
    body = (
      <Sheet>
        <span className={styles.stateTitle}>Waiting</span>
      </Sheet>
    );
  }

  const linked = accepted || page.status === "failed";
  return (
    <li ref={ref} className={styles.item}>
      {linked ? (
        <Link href={href} className={styles.frame} aria-label={caption}>
          {body}
        </Link>
      ) : (
        <div className={styles.frame} aria-label={caption} role="img">
          {body}
        </div>
      )}
      <span className={`${styles.num} ${page.status === "failed" ? styles.numRedpen : accepted ? "" : styles.numPencil}`} aria-hidden="true">
        {page.page_number}
      </span>
    </li>
  );
}

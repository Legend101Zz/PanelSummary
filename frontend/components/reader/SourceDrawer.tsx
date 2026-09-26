"use client";

import Link from "next/link";
import { forwardRef, useEffect, useRef } from "react";
import type { EditionPage, Fidelity, SourceRef } from "@/lib/api";
import { FIDELITY_HINT, FIDELITY_LABEL, voiceLabel } from "@/lib/words";
import { Close } from "@/components/Icons";
import { transcript, uniquePages } from "./transcript";
import styles from "./reader.module.css";

interface Props {
  page: EditionPage | null;
  pageNumber: number;
  bookId: string;
  /** The reader URL to come back to from the source viewer. */
  from: string;
  activePanel: string | null;
  debug: boolean;
  onClose: () => void;
}

export const SourceDrawer = forwardRef<HTMLHeadingElement, Props>(function SourceDrawer(
  { page, pageNumber, bookId, from, activePanel, debug, onClose },
  headingRef,
) {
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!activePanel || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-panel="${CSS.escape(activePanel)}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [activePanel]);

  const sourceHref = (p: number) => `/books/${bookId}/source?page=${p}&from=${encodeURIComponent(from)}`;
  const PageLinks = ({ refs }: { refs: SourceRef[] }) => {
    const pages = uniquePages(refs);
    if (!pages.length) return null;
    return (
      <span className={styles.srcLinks}>
        {pages.length === 1 ? "PDF page " : "PDF pages "}
        {pages.map((p, i) => (
          <span key={p}>
            {i > 0 ? (i === pages.length - 1 ? " and " : ", ") : null}
            <Link href={sourceHref(p)} className={styles.srcLink}>
              {p}
            </Link>
          </span>
        ))}
      </span>
    );
  };

  const panels = page?.status === "accepted" ? transcript(page) : [];

  return (
    <div className={styles.drawerInner}>
      <div className={styles.drawerHead}>
        <h2 className={styles.drawerTitle} tabIndex={-1} ref={headingRef}>
          Sources for page {pageNumber}
        </h2>
        <button type="button" className={styles.iconBtnLight} onClick={onClose} aria-label="Close sources">
          <Close />
        </button>
      </div>

      {!page ? <p className={styles.drawerNote}>Loading…</p> : null}

      {page && page.status !== "accepted" ? (
        <p className={styles.drawerNote}>
          {page.status === "failed" ? "This page could not be drawn, so it has no lettering." : "This page has not been drawn yet."}
        </p>
      ) : null}

      {page && page.claim_details.length > 0 ? (
        <section className={styles.drawerSection}>
          <h3 className={styles.drawerH3}>{page.status === "accepted" ? "What this page conveys" : "What this page was meant to convey"}</h3>
          <ul className={styles.claims}>
            {page.claim_details.map((c) => (
              <li key={c.id}>
                <p>{c.text}</p>
                <PageLinks refs={c.source} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {panels.length > 0 ? (
        <section className={styles.drawerSection}>
          <h3 className={styles.drawerH3}>Panel by panel</h3>
          <ol className={styles.panels} ref={listRef}>
            {panels.map(({ panel, number, texts, sources }) => (
              <li key={panel.id} data-panel={panel.id} className={panel.id === activePanel ? styles.panelActive : undefined} aria-current={panel.id === activePanel ? "step" : undefined}>
                <div className={styles.panelHead}>
                  <span className={styles.panelNum}>Panel {number}</span>
                  <PageLinks refs={sources} />
                </div>
                {texts.length === 0 ? (
                  <p className={styles.noText}>No lettering</p>
                ) : (
                  <ul className={styles.lines}>
                    {texts.map((t) => (
                      <li key={t.index} className={`${styles.line} ${styles[`fid_${t.fidelity}`] ?? ""}`}>
                        <span className={styles.lineMeta}>
                          <span className={styles.voice}>{voiceLabel(t.kind, t.speaker, page?.speakers ?? {})}</span>
                          <span className={styles.fidelity}>{FIDELITY_LABEL[t.fidelity as Fidelity] ?? t.fidelity}</span>
                        </span>
                        <span className={t.kind === "sfx" ? styles.lineSfx : styles.lineText}>{t.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {panels.length > 0 ? (
        <details className={styles.legend}>
          <summary>How lines are marked</summary>
          <dl>
            {(Object.keys(FIDELITY_LABEL) as Fidelity[]).map((f) => (
              <div key={f} className={`${styles.line} ${styles[`fid_${f}`]}`}>
                <dt className={styles.fidelity}>{FIDELITY_LABEL[f]}</dt>
                <dd>{FIDELITY_HINT[f]}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}

      {debug && page ? (
        <p className={styles.debug}>
          {page.renderer_version ?? "no renderer"}
          <br />
          {page.svg_hash ?? "no svg"}
        </p>
      ) : null}
    </div>
  );
});

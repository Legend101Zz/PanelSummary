"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { columns, moveIndex, pageLabel, type PickerGroup } from "./picker";
import styles from "./picker.module.css";

/**
 * "All pages": every page as a 44 px number button, grouped by section. Opens
 * on demand over the bottom of the screen (never over the page while reading);
 * closes on Escape, on a choice, on the close button and on a click outside.
 * One tab stop; arrow keys, Home and End move between pages (roving focus).
 */
export function PagePicker({
  groups,
  current,
  total,
  onSelect,
  onClose,
}: {
  groups: PickerGroup[];
  current: number;
  total: number;
  onSelect: (n: number) => void;
  onClose: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState(Math.min(Math.max(current, 1), Math.max(total, 1)) - 1);
  const [cols, setCols] = useState(6);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setCols(columns(el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // focus the current page on open, and scroll it into view
  useEffect(() => {
    const b = buttons.current[active];
    b?.focus();
    b?.scrollIntoView?.({ block: "nearest" });
    // only on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusAt = (i: number) => {
    setActive(i);
    const b = buttons.current[i];
    b?.focus();
    b?.scrollIntoView?.({ block: "nearest" });
  };

  /** Up and down follow what is drawn: the button in the next row nearest in x. */
  const vertical = (from: number, dir: 1 | -1): number | null => {
    const here = buttons.current[from]?.getBoundingClientRect();
    if (!here) return moveIndex(from, dir === 1 ? "ArrowDown" : "ArrowUp", cols, total);
    let best: number | null = null;
    let bestRow = Infinity;
    let bestDx = Infinity;
    buttons.current.forEach((b, i) => {
      if (!b) return;
      const r = b.getBoundingClientRect();
      const dy = (r.top - here.top) * dir;
      if (dy < 4) return;
      const dx = Math.abs(r.left - here.left);
      if (dy < bestRow - 4 || (Math.abs(dy - bestRow) <= 4 && dx < bestDx)) {
        bestRow = dy;
        bestDx = dx;
        best = i;
      }
    });
    return best;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    let next: number | null = null;
    if (e.key === "ArrowDown") next = vertical(active, 1);
    else if (e.key === "ArrowUp") next = vertical(active, -1);
    else next = moveIndex(active, e.key, cols, total);
    // the reader's own keys (turn page, scroll) must not also run
    if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", " "].includes(e.key)) e.preventDefault();
    if (next !== null) focusAt(next);
  };

  let index = -1;
  return (
    <>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <div className={styles.panel} role="dialog" aria-label="All pages" onKeyDown={onKeyDown}>
        <div className={styles.head}>
          <h2 className={styles.title}>
            All pages <span className={styles.count}>· {total}</span>
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close all pages">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className={styles.body} ref={bodyRef}>
          {groups.map((g) => (
            <section key={`${g.id}:${g.from}`} className={styles.group} aria-label={g.title ?? "Pages"}>
              {g.title ? (
                <h3 className={styles.groupTitle}>
                  {g.title} <span className={styles.count}>· pages {g.from}–{g.to}</span>
                </h3>
              ) : null}
              <ol className={styles.grid}>
                {g.pages.map(({ n, status }) => {
                  index += 1;
                  const i = index;
                  return (
                    <li key={n}>
                      <button
                        type="button"
                        ref={(el) => {
                          buttons.current[i] = el;
                        }}
                        className={`${styles.cell} ${styles[`cell_${status === "failed" || status === "accepted" ? status : "waiting"}`]}`}
                        aria-label={pageLabel(n, status)}
                        aria-current={n === current ? "page" : undefined}
                        tabIndex={i === active ? 0 : -1}
                        onFocus={() => setActive(i)}
                        onClick={() => onSelect(n)}
                      >
                        {n}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
        <div className={styles.legend} aria-hidden="true">
          <span className={styles.key}>
            <i className={`${styles.swatch} ${styles.swatchNow}`} /> This page
          </span>
          <span className={styles.key}>
            <i className={`${styles.swatch} ${styles.swatchFailed}`} /> Could not be drawn
          </span>
          <span className={styles.key}>
            <i className={`${styles.swatch} ${styles.swatchWaiting}`} /> Not drawn yet
          </span>
        </div>
      </div>
    </>
  );
}
